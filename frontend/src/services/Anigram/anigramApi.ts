import { fetchAuthSession } from 'aws-amplify/auth'

const anigramApiOrigin =
  import.meta.env.VITE_CREATIVE_IA_API_ORIGIN ?? 'https://apps-api.yamahit.com'

export type AnigramLifeStage = 'egg' | 'hatching' | 'baby' | 'adult'
export type AnigramLifeStatus = 'alive' | 'dead'

export type AnigramPetState = {
  id: string
  species: string
  displayName: string
  status: AnigramLifeStatus
  lifeStage: AnigramLifeStage
  evolutionStage: string
  hatchPoints: number | null
  hatchRequiredPoints: number | null
  hatchProgressPercent: number | null
  fullnessPoints: number | null
  maxFullnessPoints: number | null
  fullnessPercent: number | null
  lastFedAt: number | null
  hatchingStartedAt: number | null
  hatchingProgressPercent: number | null
  hatchingRemainingSeconds: number | null
  hatchedAt: number | null
  zeroStartedAt: number | null
  starvationGraceSeconds: number
  starvationRemainingSeconds: number | null
  diedAt: number | null
  updatedAt: number
  canManageValidation: boolean
  displayState: {
    species: string
    status: AnigramLifeStatus
    lifeStage: AnigramLifeStage
    evolutionStage: string
    hatchProgressPercent: number | null
    hatchingProgressPercent: number | null
    fullnessPercent: number | null
    motion: 'egg_idle' | 'hatching' | 'idle' | 'dead'
  }
}

async function getAccessToken() {
  const session = await fetchAuthSession()
  const accessToken = session.tokens?.accessToken?.toString()
  if (!accessToken) throw new Error('AUTH_REQUIRED')
  return accessToken
}

async function requestAnigramApi<T>(path: string, options: RequestInit = {}) {
  const accessToken = await getAccessToken()
  const response = await fetch(new URL(path, anigramApiOrigin), {
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
        : response.status === 403
          ? 'ADMIN_REQUIRED'
          : 'API_FAILED',
    )
  }
  return (await response.json()) as T
}

export async function getAnigramPet() {
  const response = await requestAnigramApi<{
    pet: Omit<AnigramPetState, 'canManageValidation'>
    validation?: { allowed: boolean }
  }>(
    '/api/anigram/pet',
  )
  return {
    ...response.pet,
    canManageValidation: response.validation?.allowed ?? false,
  }
}

/** Phase 1の動作確認専用。公開版では通常の餌獲得導線へ置き換える。 */
export async function addAnigramValidationGrowthEvent() {
  const response = await requestAnigramApi<{
    duplicate: boolean
    appliedPoints: number
    pet: AnigramPetState
  }>('/api/anigram/pet/growth-events/validation', { method: 'POST' })
  return { ...response.pet, canManageValidation: true }
}

/** Phase 1の孵化検証専用。成長履歴を残したまま現在のペットを卵へ戻す。 */
export async function resetAnigramPetForValidation() {
  const response = await requestAnigramApi<{ pet: AnigramPetState }>(
    '/api/anigram/pet/reset/validation',
    { method: 'POST' },
  )
  return { ...response.pet, canManageValidation: true }
}

export type AnigramStarvationValidationAction =
  | 'prepare'
  | 'advance_to_zero'
  | 'advance_grace'

/** 管理者向け。満腹度低下・死亡猶予・死亡表示を段階的に検証する。 */
export async function runAnigramStarvationValidation(
  action: AnigramStarvationValidationAction,
) {
  const response = await requestAnigramApi<{
    pet: Omit<AnigramPetState, 'canManageValidation'>
  }>('/api/anigram/pet/starvation/validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  return { ...response.pet, canManageValidation: true }
}
