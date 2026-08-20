import { fetchAuthSession } from 'aws-amplify/auth'

const creativeIaApiOrigin =
  import.meta.env.VITE_CREATIVE_IA_API_ORIGIN ?? 'https://apps-api.yamahit.com'

export type CreativeIAWordPressStatus = {
  connected: boolean
  selectedSite: {
    id: string | null
    url: string | null
    name: string | null
  } | null
}

export type CreativeIAWordPressDraft = {
  postId: string
  postUrl: string | null
  status: 'draft'
  duplicate: boolean
}

export type CreativeIAGeneratedArticle = {
  title: string
  content: string
  excerpt: string
  warnings: string[]
  model: string
}

/** HundredのCognitoセッションからWorkerへ送信するAccess Tokenを取得する。 */
async function getCreativeIAAccessToken() {
  const session = await fetchAuthSession()
  const accessToken = session.tokens?.accessToken?.toString()

  if (!accessToken) {
    throw new Error('AUTH_REQUIRED')
  }

  return accessToken
}

/** Creative IA Workerの認証必須APIを呼び出す。 */
async function requestCreativeIAApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const accessToken = await getCreativeIAAccessToken()
  const response = await fetch(new URL(path, creativeIaApiOrigin), {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? 'AUTH_REQUIRED'
        : response.status === 429
          ? 'RATE_LIMITED'
          : response.status === 503
            ? 'SERVICE_BUSY'
          : 'API_FAILED',
    )
  }

  return (await response.json()) as T
}

/** 入力したテーマと要点をGeminiへ送り、編集可能な日本語の記事案を生成する。 */
export function generateCreativeIAArticle(input: {
  topic: string
  keyPoints: string
  audience: string
  tone: 'friendly' | 'professional' | 'casual'
}) {
  return requestCreativeIAApi<CreativeIAGeneratedArticle>(
    '/api/creative-ia/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}

/** 接続済みWordPress.comサイトへ、利用者が確認した内容を下書き保存する。 */
export function createCreativeIAWordPressDraft(input: {
  title: string
  content: string
}, idempotencyKey: string) {
  return requestCreativeIAApi<CreativeIAWordPressDraft>(
    '/api/creative-ia/wordpress/posts',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  )
}

/** 現在の利用者に紐づくWordPress.com接続状態を取得する。 */
export function getCreativeIAWordPressStatus() {
  return requestCreativeIAApi<CreativeIAWordPressStatus>(
    '/api/creative-ia/wordpress/status',
  )
}

/** WordPress.comの認可画面へ移動するためのURLを発行する。 */
export async function getCreativeIAWordPressAuthorizationUrl() {
  const response = await requestCreativeIAApi<{ authorizationUrl?: unknown }>(
    '/api/creative-ia/wordpress/oauth/start?returnTo=/creative-ia',
  )

  if (typeof response.authorizationUrl !== 'string') {
    throw new Error('API_RESPONSE_INVALID')
  }

  const authorizationUrl = new URL(response.authorizationUrl)

  if (
    authorizationUrl.origin !== 'https://public-api.wordpress.com' ||
    authorizationUrl.pathname !== '/oauth2/authorize'
  ) {
    throw new Error('AUTHORIZATION_URL_INVALID')
  }

  return authorizationUrl.toString()
}
