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
    throw new Error(response.status === 401 ? 'AUTH_REQUIRED' : 'API_FAILED')
  }
  return (await response.json()) as T
}

export function getCreativeIAInstagramStatus() {
  return requestCreativeIAInstagramApi<CreativeIAInstagramStatus>(
    '/api/creative-ia/instagram/status',
  )
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
