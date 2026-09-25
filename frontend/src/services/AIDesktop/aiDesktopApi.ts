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
  return requestAIDesktopApi<{ catalogs: Partial<Record<string, T>>; publications: Record<string, AIDesktopCatalogPublication>; updatedAt: number }>(
    '/api/ai-desktop/catalogs',
  )
}

export function getManageableAIDesktopCatalogs<T>() {
  return requestAuthenticatedAIDesktopApi<{ catalogs: Partial<Record<string, T>>; publications: Record<string, AIDesktopCatalogPublication>; updatedAt: number }>('/api/ai-desktop/catalogs/manage')
}

export type AIDesktopCatalogPublication = { status: 'draft' | 'published' | 'unpublished'; ownerId: string; createdBy: string; updatedBy: string; publishedBy: string | null; createdAt: number; updatedAt: number; publishedAt: number | null }

export function createAIDesktopCatalog(name: string, eyebrow: string, introduction: string) {
  return requestAuthenticatedAIDesktopApi<{ serviceId: string; catalog: unknown; publication: AIDesktopCatalogPublication }>('/api/ai-desktop/catalogs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, eyebrow, introduction }) })
}

export function setAIDesktopCatalogPublication(serviceId: string, published: boolean) {
  return requestAuthenticatedAIDesktopApi<{ publication: Partial<AIDesktopCatalogPublication> & Pick<AIDesktopCatalogPublication, 'status'> }>(`/api/ai-desktop/catalogs/${encodeURIComponent(serviceId)}/publication`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ published }) })
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

export type AIDesktopDocument = {
  serviceId: string
  serviceName: string
  categoryId: string
  categoryTitle: string
  contentId: string
  title: string
  status: 'draft' | 'published' | 'unpublished'
  visibility: 'private' | 'team' | 'link'
  ownerId: string
  createdBy: string
  updatedBy: string
  publishedBy: string | null
  createdAt: number
  updatedAt: number
  publishedAt: number | null
}

export function listAIDesktopDocuments(manage = false) {
  return manage
    ? requestAuthenticatedAIDesktopApi<{ documents: AIDesktopDocument[] }>('/api/ai-desktop/documents/manage')
    : requestAIDesktopApi<{ documents: AIDesktopDocument[] }>('/api/ai-desktop/documents')
}

export function createAIDesktopDocument(serviceId: AIDesktopDocument['serviceId'], categoryId: string, title: string) {
  return requestAuthenticatedAIDesktopApi<{
    document: Pick<AIDesktopDocument, 'serviceId' | 'categoryId' | 'contentId' | 'title' | 'status' | 'visibility' | 'ownerId' | 'createdBy' | 'updatedBy' | 'publishedBy' | 'createdAt' | 'updatedAt' | 'publishedAt'>
    catalog: unknown
  }>('/api/ai-desktop/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceId, categoryId, title }) })
}

export function uploadAIDesktopImage(file: File, folder?: string) {
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
  iconPositions: Record<'my-documents' | 'documents' | 'projects' | 'explorer' | 'settings', { x: number; y: number }>
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

export type AIDesktopProjectStatus = 'planning' | 'proposal' | 'design' | 'development' | 'review' | 'completed' | 'on-hold'
export type AIDesktopProjectDevelopmentMode = 'personal' | 'team'

export type AIDesktopProjectDocument = {
  serviceId: string
  categoryId: string
  contentId: string
  title: string
  phase?: string
  documentType?: string
  note?: string
  sortOrder?: number
}

export type AIDesktopProjectDetail = {
  name: string
  description: string
  category?: string
  ddl?: string
}

export type AIDesktopProjectEnvironment = {
  summary: {
    os: string
    runtime: string
    packageManager: string
    frontend: string
    worker: string
  }
  prerequisites: Array<{ name: string; version: string; required: boolean; description: string }>
  services: Array<{ name: string; endpoint: string; command: string }>
  steps: Array<{ title: string; description: string; command: string }>
  variables: Array<{ name: string; location: string; required: boolean; description: string }>
  checks: Array<{ label: string }>
}

export type AIDesktopProjectCommand = AIDesktopProjectDetail & {
  directory: string
  command: string
  environment: string
  category?: string
  pinned?: boolean
}

export type AIDesktopProjectLink = AIDesktopProjectDetail & {
  type: string
  url: string
}

export type AIDesktopProjectRule = AIDesktopProjectDetail & {
  importance?: 'required' | 'recommended'
}

export type AIDesktopProjectMember = {
  userId: string
  displayName: string
  role: 'owner' | 'member'
}

export type AIDesktopUserSearchResult = {
  userId: string
  displayName: string
  isCurrentUser: boolean
}

export type AIDesktopProjectInput = {
  name: string
  customerName: string
  summary: string
  objective: string
  status: AIDesktopProjectStatus
  developmentMode: AIDesktopProjectDevelopmentMode
  systemDiagramSource: string
  fileStructure: string
  technologyStack: AIDesktopProjectDetail[]
  databaseInfo: AIDesktopProjectDetail[]
  environmentSetup: AIDesktopProjectEnvironment
  commands: AIDesktopProjectCommand[]
  links: AIDesktopProjectLink[]
  projectRules: AIDesktopProjectRule[]
  designNotes: string
  developmentNotes: string
  relatedDocuments: AIDesktopProjectDocument[]
  memberUserIds: string[]
}

export type AIDesktopProject = AIDesktopProjectInput & {
  id: string
  members: AIDesktopProjectMember[]
  canEdit: boolean
  createdBy: string
  updatedBy: string
  createdAt: number
  updatedAt: number
}

export type AIDesktopProjectSummary = Pick<AIDesktopProject, 'id' | 'name' | 'customerName' | 'summary' | 'status' | 'developmentMode' | 'canEdit' | 'updatedBy' | 'createdAt' | 'updatedAt'>

export function searchAIDesktopUsers(query: string) {
  return requestAuthenticatedAIDesktopApi<{ users: AIDesktopUserSearchResult[] }>(`/api/ai-desktop/users?query=${encodeURIComponent(query)}`)
}

export function syncAIDesktopUserProfile(displayName: string) {
  return requestAuthenticatedAIDesktopApi<{ user: { userId: string; displayName: string } }>('/api/ai-desktop/users/me', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName }),
  })
}

export function listAIDesktopProjects() {
  return requestAuthenticatedAIDesktopApi<{ projects: AIDesktopProjectSummary[] }>('/api/ai-desktop/projects')
}

export function getAIDesktopProject(projectId: string) {
  return requestAuthenticatedAIDesktopApi<{ project: AIDesktopProject }>(`/api/ai-desktop/projects/${encodeURIComponent(projectId)}`)
}

export function createAIDesktopProject(project: AIDesktopProjectInput) {
  return requestAuthenticatedAIDesktopApi<{ project: AIDesktopProject }>('/api/ai-desktop/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) })
}

export function updateAIDesktopProject(projectId: string, project: AIDesktopProjectInput) {
  return requestAuthenticatedAIDesktopApi<{ project: AIDesktopProject }>(`/api/ai-desktop/projects/${encodeURIComponent(projectId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) })
}

export function deleteAIDesktopProject(projectId: string) {
  return requestAuthenticatedAIDesktopApi<{ deleted: true; projectId: string }>(`/api/ai-desktop/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' })
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
