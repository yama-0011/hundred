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
async function requestCreativeIAApi<T>(path: string): Promise<T> {
  const accessToken = await getCreativeIAAccessToken()
  const response = await fetch(new URL(path, creativeIaApiOrigin), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(response.status === 401 ? 'AUTH_REQUIRED' : 'API_FAILED')
  }

  return (await response.json()) as T
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
