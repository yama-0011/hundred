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
  evolutionStartedAt: number | null
  evolutionThresholdPercent: number
  evolutionHoldSeconds: number
  evolutionProgressPercent: number
  evolutionRemainingSeconds: number | null
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

export type AnigramGrowthHistoryEvent = {
  id: string
  source: string
  reactionType: string | null
  appliedTarget: 'hatch' | 'fullness' | 'ignored'
  requestedPoints: number
  appliedPoints: number
  occurredAt: number
  appliedAt: number
}

export type AnigramStateHistoryEvent = {
  id: string
  eventType: string
  previousValue: string | null
  nextValue: string | null
  reason: string
  occurredAt: number
}

export type AnigramHistory = {
  pet: Omit<AnigramPetState, 'canManageValidation'>
  today: {
    startedAt: number
    instagramReactions: number
    requestedPoints: number
    appliedPoints: number
    eventCount: number
  }
  growthEvents: AnigramGrowthHistoryEvent[]
  stateEvents: AnigramStateHistoryEvent[]
}

export type AnigramAdminSettings = {
  species: string
  displayName: string
  hatchRequiredPoints: number
  initialFullnessPoints: number
  maxFullnessPoints: number
  fullnessStorageLimitPercent: number
  fullnessDecayPercentPerHour: number
  starvationGraceSeconds: number
  evolutionFullnessThresholdPercent: number
  evolutionHoldSeconds: number
  nextEvolutionStage: string
  updatedAt: number
}

export type AnigramSettingsHistory = {
  id: string
  species: string
  updatedByUserId: string
  previousSettings: unknown
  nextSettings: unknown
  updatedAt: number
}

export type AnigramAdministrator = {
  userId: string
  registeredByUserId: string | null
  createdAt: number
}

export type AnigramInstagramDeliverySettings = {
  enabled: boolean
  species: string
  deliveryTime: string
  timezone: string
  reactionSyncEnabled: boolean
  syncPauseReason: string | null
  syncPausedByUserId: string | null
  syncPausedAt: number | null
  lastSyncAt: number | null
  lastSyncStatus: 'success' | 'partial' | 'failed' | null
  updatedByUserId: string | null
  updatedAt: number
}

export type AnigramInstagramSyncFailure = {
  accountUsername: string | null
  code: string
  stage: 'stories' | 'interactions' | null
  providerCode: string | null
  message: string | null
}

export type AnigramInstagramSyncRun = {
  id: string
  triggerType: 'cron' | 'manual'
  triggeredByUserId: string | null
  status: 'success' | 'partial' | 'failed'
  processedConnections: number
  succeededConnections: number
  failedConnections: number
  storiesChecked: number
  reactionIncrease: number
  appliedPoints: number
  failures: AnigramInstagramSyncFailure[]
  startedAt: number
  completedAt: number
}

export type AnigramStoryPublication = {
  id: string
  renderId: string | null
  status: 'processing' | 'published' | 'failed'
  containerId: string | null
  instagramMediaId: string | null
  providerErrorCode: string | null
  createdAt: number
  updatedAt: number
  publishedAt: number | null
}

export type AnigramStoryRender = {
  id: string
  imageUrl: string
  imageContentType: string
  width: number
  height: number
  snapshot: {
    capturedAt: number
    species: string
    displayName: string
    status: AnigramLifeStatus
    lifeStage: AnigramLifeStage
    evolutionStage: string
    hatchProgressPercent: number | null
    fullnessPercent: number | null
  }
  browserMsUsed: number | null
  createdAt: number
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
    const body = (await response.json().catch(() => null)) as {
      error?: unknown
    } | null
    const error = new Error(
      response.status === 401
        ? 'AUTH_REQUIRED'
        : response.status === 403
          ? 'ADMIN_REQUIRED'
          : 'API_FAILED',
    ) as Error & { responseMessage?: string; status?: number }
    error.status = response.status
    if (typeof body?.error === 'string') error.responseMessage = body.error
    throw error
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function requestPublicAnigramApi<T>(path: string) {
  const response = await fetch(new URL(path, anigramApiOrigin), {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('API_FAILED')
  return (await response.json()) as T
}

async function requestOptionalAuthAnigramApi<T>(path: string) {
  const headers = new Headers({ Accept: 'application/json' })
  try {
    headers.set('Authorization', `Bearer ${await getAccessToken()}`)
  } catch {
    // ゲストは認証ヘッダーなしで共有情報を取得する。
  }

  const response = await fetch(new URL(path, anigramApiOrigin), { headers })
  if (!response.ok) throw new Error('API_FAILED')
  return (await response.json()) as T
}

export async function getAnigramPet() {
  const response = await requestOptionalAuthAnigramApi<{
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

export async function getAnigramHistory() {
  return requestPublicAnigramApi<AnigramHistory>(
    '/api/anigram/history?limit=50',
  )
}

export async function getAnigramAdminSettings() {
  return requestPublicAnigramApi<{
    settings: AnigramAdminSettings[]
    history: AnigramSettingsHistory[]
    administrators: AnigramAdministrator[]
    instagramDelivery: AnigramInstagramDeliverySettings
  }>('/api/anigram/admin/settings')
}

export async function getAnigramAdminAccess() {
  return requestAnigramApi<{ allowed: boolean }>('/api/anigram/admin/access')
}

export async function getAnigramInstagramSyncRuns(limit = 20) {
  const response = await requestAnigramApi<{
    runs: AnigramInstagramSyncRun[]
  }>(`/api/anigram/admin/instagram/sync-runs?limit=${limit}`)
  return response.runs
}

export async function runAnigramInstagramSync() {
  const response = await requestAnigramApi<{
    run: AnigramInstagramSyncRun
  }>('/api/anigram/admin/instagram/sync', { method: 'POST' })
  return response.run
}

export async function deleteAnigramInstagramSyncHistory(id?: string) {
  const response = await requestAnigramApi<{
    result: { deletedCount: number }
  }>('/api/anigram/admin/instagram/sync-runs', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(id ? { id } : { all: true }),
  })
  return response.result
}

export async function deleteAnigramSettingsHistory(id?: string) {
  const response = await requestAnigramApi<{
    result: { deletedCount: number }
  }>('/api/anigram/admin/settings-history', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(id ? { id } : { all: true }),
  })
  return response.result
}

export async function registerAnigramAdministrator(userId: string) {
  const response = await requestAnigramApi<{
    administrator: AnigramAdministrator
  }>('/api/anigram/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  return response.administrator
}

export async function removeAnigramAdministrator(userId: string) {
  await requestAnigramApi<void>('/api/anigram/admin/users', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
}

export async function updateAnigramInstagramDeliverySettings(settings: {
  enabled: boolean
  species: string
  deliveryTime: string
  reactionSyncEnabled: boolean
  syncPauseReason: string | null
}) {
  const response = await requestAnigramApi<{
    instagramDelivery: AnigramInstagramDeliverySettings
  }>('/api/anigram/admin/instagram', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return response.instagramDelivery
}

export async function publishAnigramTestStory(image: Blob) {
  return requestAnigramApi<{
    story: AnigramStoryPublication
    accountUsername: string
    accountUrl: string
  }>('/api/anigram/admin/instagram/story/test?confirmed=true', {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: image,
  })
}

export async function generateAnigramStoryRender() {
  const response = await requestAnigramApi<{ render: AnigramStoryRender }>(
    '/api/anigram/admin/instagram/story/render-test',
    { method: 'POST' },
  )
  return response.render
}

export async function generateAndPublishAnigramStory() {
  return requestAnigramApi<{
    render: AnigramStoryRender
    story: AnigramStoryPublication
    accountUsername: string
    accountUrl: string
  }>('/api/anigram/admin/instagram/story/generate-and-publish?confirmed=true', {
    method: 'POST',
  })
}

export async function updateAnigramAdminSettings(
  species: string,
  settings: Omit<AnigramAdminSettings, 'species' | 'displayName' | 'updatedAt'>,
) {
  const response = await requestAnigramApi<{ settings: AnigramAdminSettings }>(
    `/api/anigram/admin/settings/${encodeURIComponent(species)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    },
  )
  return response.settings
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

export type AnigramEvolutionValidationAction = 'prepare' | 'advance_hold'

/** 管理者向け。満腹状態の開始・維持期間経過・成体表示を段階的に検証する。 */
export async function runAnigramEvolutionValidation(
  action: AnigramEvolutionValidationAction,
) {
  const response = await requestAnigramApi<{
    pet: Omit<AnigramPetState, 'canManageValidation'>
  }>('/api/anigram/pet/evolution/validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  return { ...response.pet, canManageValidation: true }
}
