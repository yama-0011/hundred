import { fetchAuthSession } from 'aws-amplify/auth'

const aiDesktopApiOrigin = import.meta.env.VITE_CREATIVE_IA_API_ORIGIN ??
  (import.meta.env.DEV ? 'http://localhost:8787' : 'https://apps-api.yamahit.com')

async function requestAIDesktopApi<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(new URL(path, aiDesktopApiOrigin), {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null
    const message = typeof body?.error === 'string' ? body.error : response.status === 401 ? 'Hundredへのサインインが必要です' : 'AI Desktop APIでエラーが発生しました'
    const error = new Error(message) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return (await response.json()) as T
}

async function requestAuthenticatedAIDesktopApi<T>(path: string, options: RequestInit = {}) {
  const session = await fetchAuthSession()
  const accessToken = session.tokens?.accessToken?.toString()
  if (!accessToken) throw new Error('AUTH_REQUIRED')
  return requestAIDesktopApi<T>(path, { ...options, headers: { Authorization: `Bearer ${accessToken}`, ...options.headers } })
}

export function getAIDesktopCatalogs<T>() {
  return requestAIDesktopApi<{ catalogs: Partial<Record<string, T>>; updatedAt: number }>(
    '/api/ai-desktop/catalogs',
  )
}

export function saveAIDesktopCatalog<T>(serviceId: string, catalog: T) {
  return requestAuthenticatedAIDesktopApi<{ catalog: T; updatedAt: number }>(
    `/api/ai-desktop/catalogs/${encodeURIComponent(serviceId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(catalog),
    },
  )
}

export function uploadAIDesktopImage(file: File, folder?: 'chatgpt' | 'codex' | 'claude' | 'ai-desktop') {
  const formData = new FormData()
  formData.set('file', file)
  if (folder) formData.set('folder', folder)
  return requestAuthenticatedAIDesktopApi<{
    id: string
    url: string
    contentType: string
    size: number
  }>('/api/ai-desktop/images', { method: 'POST', body: formData })
}

export async function deleteAIDesktopImage(id: string) {
  const session = await fetchAuthSession()
  const accessToken = session.tokens?.accessToken?.toString()
  if (!accessToken) throw new Error('AUTH_REQUIRED')
  const response = await fetch(
    new URL(`/api/ai-desktop/images/${encodeURIComponent(id)}`, aiDesktopApiOrigin),
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!response.ok && response.status !== 404) {
    throw new Error('AI_DESKTOP_IMAGE_DELETE_FAILED')
  }
}

export type AIDesktopImageAsset = { id: string; url: string; name: string; size: number; uploadedAt: number; references: string[]; folders: string[] }

export type AIDesktopCustomApp = {
  id: string
  name: string
  url: string
  mark: string
  color: string
}

export function listAIDesktopImages() {
  return requestAuthenticatedAIDesktopApi<{ images: AIDesktopImageAsset[]; truncated: boolean }>('/api/ai-desktop/images')
}

export type AIDesktopSharedState = {
  iconPositions: Record<'chatgpt' | 'codex' | 'claude' | 'ai-desktop' | 'explorer' | 'settings', { x: number; y: number }>
  taskbarVisible: boolean
  theme: 'light' | 'dark'
  customApps?: AIDesktopCustomApp[]
  desktopAppVisibility?: Record<string, boolean>
}

export function getAIDesktopState() {
  return requestAIDesktopApi<{ state: AIDesktopSharedState | null; updatedAt: number; updatedBy: string | null }>('/api/ai-desktop/state')
}

export function saveAIDesktopState(state: AIDesktopSharedState) {
  return requestAuthenticatedAIDesktopApi<{ state: AIDesktopSharedState; updatedAt: number; updatedBy: string }>(
    '/api/ai-desktop/state',
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) },
  )
}

export type AIDesktopContentDraft<T> = { scope: 'category' | 'content'; serviceId: string; categoryId: string; contentId: string | null; payload: T; revision: number; status: 'editing' | 'review' | 'applied'; updatedBy: string; createdAt: number; updatedAt: number }

const draftPath = (scope: 'category' | 'content', serviceId: string, categoryId: string, contentId?: string) => `/api/ai-desktop/drafts/${scope}/${encodeURIComponent(serviceId)}/${encodeURIComponent(categoryId)}${scope === 'content' && contentId ? `/${encodeURIComponent(contentId)}` : ''}`

export function getAIDesktopContentDraft<T>(scope: 'category' | 'content', serviceId: string, categoryId: string, contentId?: string) {
  return requestAuthenticatedAIDesktopApi<{ draft: AIDesktopContentDraft<T> | null }>(draftPath(scope, serviceId, categoryId, contentId))
}

export function saveAIDesktopContentDraft<T>(scope: 'category' | 'content', serviceId: string, categoryId: string, payload: T, contentId?: string, expectedRevision?: number) {
  return requestAuthenticatedAIDesktopApi<{ draft: AIDesktopContentDraft<T> }>(draftPath(scope, serviceId, categoryId, contentId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, expectedRevision }) })
}

export type AIDesktopDraftHistoryEntry = { id: number; contentId: string; contentTitle: string; revision: number; savedBy: string; savedAt: number; hasPreview: boolean }

export function listAIDesktopContentDraftHistory(serviceId: string, categoryId: string, contentId: string) {
  return requestAuthenticatedAIDesktopApi<{ history: AIDesktopDraftHistoryEntry[] }>(`/api/ai-desktop/drafts/history/${encodeURIComponent(serviceId)}/${encodeURIComponent(categoryId)}?contentId=${encodeURIComponent(contentId)}`)
}

export function getAIDesktopContentDraftHistory<T>(serviceId: string, categoryId: string, historyId: number) {
  return requestAuthenticatedAIDesktopApi<{ history: AIDesktopDraftHistoryEntry & { payload: T | null } }>(`/api/ai-desktop/drafts/history/${encodeURIComponent(serviceId)}/${encodeURIComponent(categoryId)}/${historyId}`)
}

export function deleteAIDesktopContentDraftHistory(serviceId: string, categoryId: string, contentId: string) {
  return requestAuthenticatedAIDesktopApi<{ deleted: number; revision: 0 }>(`/api/ai-desktop/drafts/history/${encodeURIComponent(serviceId)}/${encodeURIComponent(categoryId)}?contentId=${encodeURIComponent(contentId)}`, { method: 'DELETE' })
}
