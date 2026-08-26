import { fetchAuthSession } from 'aws-amplify/auth'

const creativeIaApiOrigin =
  import.meta.env.VITE_CREATIVE_IA_API_ORIGIN ?? 'https://apps-api.yamahit.com'

export type CreativeIAInstagramStatus = {
  connected: boolean
  tokenExpired: boolean
  account: {
    id: string
    username: string
  } | null
  connectedAt: number | null
  tokenExpiresAt: number | null
  grantedScopes: string[]
}

export type CreativeIAInstagramPublication = {
  id: string
  imageUrl: string
  imageContentType: 'image/jpeg'
  status: 'draft' | 'processing' | 'published' | 'failed'
  instagramMediaId: string | null
  providerErrorCode: string | null
  updatedAt: number
  publishedAt: number | null
  duplicate?: boolean
  accountUrl?: string
}

export type CreativeIAInstagramStoryInsight = {
  id: string
  mediaType: string | null
  timestamp: string | null
  likes: number | null
}

async function getCreativeIAAccessToken() {
  const session = await fetchAuthSession()
  const accessToken = session.tokens?.accessToken?.toString()
  if (!accessToken) throw new Error('AUTH_REQUIRED')
  return accessToken
}

async function requestCreativeIAInstagramApi<T>(
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
    const body = (await response.json().catch(() => null)) as {
      providerCode?: unknown
      providerStage?: unknown
      providerMessage?: unknown
    } | null
    const error = new Error(
      response.status === 401
        ? 'AUTH_REQUIRED'
        : response.status === 409
          ? 'CONFLICT'
          : response.status === 400
            ? 'INVALID_INPUT'
            : response.status === 502
              ? 'PROVIDER_FAILED'
              : 'API_FAILED',
    ) as Error & {
      providerCode?: string
      providerStage?: string
      providerMessage?: string
    }
    if (typeof body?.providerCode === 'string') {
      error.providerCode = body.providerCode
    }
    if (typeof body?.providerStage === 'string') {
      error.providerStage = body.providerStage
    }
    if (typeof body?.providerMessage === 'string') {
      error.providerMessage = body.providerMessage
    }
    throw error
  }
  return (await response.json()) as T
}

export function getCreativeIAInstagramStatus() {
  return requestCreativeIAInstagramApi<CreativeIAInstagramStatus>(
    '/api/creative-ia/instagram/status',
  )
}

export function getCreativeIAInstagramStoryInsights() {
  return requestCreativeIAInstagramApi<{
    stories: CreativeIAInstagramStoryInsight[]
  }>('/api/creative-ia/instagram/stories')
}

export function disconnectCreativeIAInstagram() {
  return requestCreativeIAInstagramApi<{ disconnected: boolean }>(
    '/api/creative-ia/instagram/connection',
    { method: 'DELETE' },
  )
}

export async function getCreativeIAInstagramAuthorizationUrl() {
  const response = await requestCreativeIAInstagramApi<{
    authorizationUrl?: unknown
  }>(
    '/api/creative-ia/instagram/oauth/start?returnTo=/creative-ia/settings/instagram',
  )

  if (typeof response.authorizationUrl !== 'string') {
    throw new Error('API_RESPONSE_INVALID')
  }

  const authorizationUrl = new URL(response.authorizationUrl)
  if (
    authorizationUrl.origin !== 'https://www.instagram.com' ||
    authorizationUrl.pathname.replace(/\/+$/u, '') !== '/oauth/authorize'
  ) {
    throw new Error('AUTHORIZATION_URL_INVALID')
  }
  return authorizationUrl.toString()
}

export function getCreativeIAInstagramPublication(chatId: string) {
  return requestCreativeIAInstagramApi<{
    publication: CreativeIAInstagramPublication | null
  }>(
    `/api/creative-ia/chats/${encodeURIComponent(chatId)}/instagram/publication`,
  )
}

export function uploadCreativeIAInstagramFeedImage(
  chatId: string,
  image: File,
) {
  return requestCreativeIAInstagramApi<CreativeIAInstagramPublication>(
    `/api/creative-ia/chats/${encodeURIComponent(chatId)}/instagram/publication`,
    {
      method: 'PUT',
      headers: { 'Content-Type': image.type },
      body: image,
    },
  )
}

export function publishCreativeIAInstagramFeed(chatId: string) {
  return requestCreativeIAInstagramApi<CreativeIAInstagramPublication>(
    `/api/creative-ia/chats/${encodeURIComponent(chatId)}/instagram/publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true }),
    },
  )
}
