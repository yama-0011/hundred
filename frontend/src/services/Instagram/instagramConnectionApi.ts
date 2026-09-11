import { fetchAuthSession } from 'aws-amplify/auth'

const appsApiOrigin =
  import.meta.env.VITE_CREATIVE_IA_API_ORIGIN ?? 'https://apps-api.yamahit.com'

export type InstagramConnectionStatus = {
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

export type InstagramStoryInsight = {
  id: string
  mediaType: string | null
  timestamp: string | null
  interactions: number | null
  foodAwarded: number
  totalFoodAwarded: number
  maxInteractions: number
  foodLimit: number
}

export type InstagramPetState = {
  species: string
  status: 'alive' | 'dead' | 'evolved'
  fullness: number
  lastFedAt: number | null
}

export type InstagramConnectionScope =
  | 'shared'
  | 'creativeIa'
  | 'anigramAdmin'

function connectionPath(scope: InstagramConnectionScope, suffix: string) {
  const prefix = {
    shared: '/api/instagram',
    creativeIa: '/api/creative-ia/instagram',
    anigramAdmin: '/api/anigram/admin/instagram',
  }[scope]
  return `${prefix}${suffix}`
}

async function getAccessToken() {
  const session = await fetchAuthSession()
  const accessToken = session.tokens?.accessToken?.toString()
  if (!accessToken) throw new Error('AUTH_REQUIRED')
  return accessToken
}

export async function requestInstagramApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const accessToken = await getAccessToken()
  const response = await fetch(new URL(path, appsApiOrigin), {
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

export function getInstagramConnectionStatus(
  scope: InstagramConnectionScope = 'shared',
) {
  return requestInstagramApi<InstagramConnectionStatus>(
    connectionPath(scope, '/status'),
  )
}

export function getInstagramStoryInsights(
  scope: InstagramConnectionScope = 'shared',
) {
  return requestInstagramApi<{
    stories: InstagramStoryInsight[]
    pet: InstagramPetState | null
  }>(connectionPath(scope, '/stories'))
}

export function disconnectInstagram(
  scope: InstagramConnectionScope = 'shared',
) {
  return requestInstagramApi<{ disconnected: boolean }>(
    connectionPath(scope, '/connection'),
    { method: 'DELETE' },
  )
}

export async function getInstagramAuthorizationUrl(
  returnTo: string,
  scope: InstagramConnectionScope = 'shared',
) {
  const response = await requestInstagramApi<{ authorizationUrl?: unknown }>(
    `${connectionPath(scope, '/oauth/start')}?returnTo=${encodeURIComponent(returnTo)}`,
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
