import { fetchAuthSession } from 'aws-amplify/auth'

const creativeIaApiOrigin =
  import.meta.env.VITE_CREATIVE_IA_API_ORIGIN ?? 'https://apps-api.yamahit.com'

export type CreativeIAWordPressStatus = {
  connected: boolean
  authType: 'wordpress_com' | 'application_password' | null
  wordpressUsername: string | null
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
  usedReferences: CreativeIAUsedReference[]
}

export type CreativeIAAssistantResponse = {
  action: 'chat' | 'clarify' | 'update_article'
  message: string
  article: CreativeIAGeneratedArticle | null
}

export type CreativeIAUsedReference = {
  id: string
  category: 'product' | 'service' | 'organization' | 'contact'
  name: string
  updatedAt: number
}

export type CreativeIAChatMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
  createdAt?: number
}

export type CreativeIAProductionMemo = {
  id: string
  label: string
  value: string
}

export type CreativeIAChat = {
  id: string
  title: string
  messages: CreativeIAChatMessage[]
  article: CreativeIAGeneratedArticle | null
  draftTitle: string
  draftContent: string
  savedDraft: CreativeIAWordPressDraft | null
  productionMemos: CreativeIAProductionMemo[]
  appliedRuleIds: string[]
  createdAt?: number
  updatedAt: number
}

export type CreativeIAReferenceProduct = {
  id: string
  name: string
  brand: string
  category: string
  sourceUrl: string | null
  description: string
  features: string
  price: string
  capacity: string
  specifications: string
  usage: string
  cautions: string
  aiNotes: string
  aiEnabled: boolean
  createdAt: number
  updatedAt: number
}

export type CreativeIAReferenceProductInput = Omit<
  CreativeIAReferenceProduct,
  'id' | 'createdAt' | 'updatedAt'
>

export type CreativeIAReferenceService = {
  id: string
  name: string
  category: string
  sourceUrl: string | null
  description: string
  features: string
  price: string
  duration: string
  target: string
  process: string
  cautions: string
  aiNotes: string
  aiEnabled: boolean
  createdAt: number
  updatedAt: number
}

export type CreativeIAReferenceServiceInput = Omit<
  CreativeIAReferenceService,
  'id' | 'createdAt' | 'updatedAt'
>

export type CreativeIAReferenceOrganization = {
  id: string
  name: string
  organizationType: 'company' | 'store'
  parentCompanyId: string | null
  parentCompanyName: string | null
  sourceUrl: string | null
  description: string
  address: string
  phone: string
  businessHours: string
  features: string
  aiNotes: string
  aiEnabled: boolean
  createdAt: number
  updatedAt: number
  stores?: { id: string; name: string }[]
  contacts?: { id: string; name: string }[]
}

export type CreativeIAReferenceOrganizationInput = Omit<
  CreativeIAReferenceOrganization,
  'id' | 'createdAt' | 'updatedAt' | 'parentCompanyName' | 'stores' | 'contacts'
>

export type CreativeIAReferenceContact = {
  id: string
  name: string
  organizationId: string
  organizationName: string
  department: string
  role: string
  description: string
  specialties: string
  aiNotes: string
  aiEnabled: boolean
  createdAt: number
  updatedAt: number
}

export type CreativeIAReferenceContactInput = Omit<
  CreativeIAReferenceContact,
  'id' | 'createdAt' | 'updatedAt' | 'organizationName'
>

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
            : response.status === 422
              ? 'WORDPRESS_AUTH_FAILED'
              : response.status === 403
              ? 'WORDPRESS_PERMISSION_DENIED'
              : response.status === 409
                ? 'CONFLICT'
                : response.status === 404
                  ? 'NOT_FOUND'
              : response.status === 400
                  ? 'INVALID_INPUT'
                  : 'API_FAILED',
    )
  }

  return (await response.json()) as T
}

/** D1に永続保存された現在の利用者のChatを取得する。 */
export function getCreativeIAChats() {
  return requestCreativeIAApi<{ chats: CreativeIAChat[]; limit: number }>(
    '/api/creative-ia/chats',
  )
}

/** 新しいChatをD1へ作成する。 */
export function createCreativeIAChat() {
  return requestCreativeIAApi<CreativeIAChat>('/api/creative-ia/chats', {
    method: 'POST',
  })
}

/** Chatの記事・制作メモ・適用ルールの現在状態をD1へ保存する。 */
export function updateCreativeIAChat(chat: CreativeIAChat) {
  return requestCreativeIAApi<{ updated: boolean }>(
    `/api/creative-ia/chats/${encodeURIComponent(chat.id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: chat.title,
        article: chat.article
          ? {
              ...chat.article,
              title: chat.draftTitle,
              content: chat.draftContent,
            }
          : null,
        productionMemos: chat.productionMemos,
        appliedRuleIds: chat.appliedRuleIds,
        savedDraft: chat.savedDraft,
      }),
    },
  )
}

/** Chatの会話をD1へ追記する。 */
export function appendCreativeIAChatMessage(
  chatId: string,
  message: CreativeIAChatMessage,
) {
  return requestCreativeIAApi<{ created: boolean; createdAt: number }>(
    `/api/creative-ia/chats/${encodeURIComponent(chatId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    },
  )
}

/** D1へ保存済みの会話を基に、通常会話・確認質問・記事更新の応答を取得する。 */
export function respondCreativeIAChat(chatId: string) {
  return requestCreativeIAApi<CreativeIAAssistantResponse>(
    `/api/creative-ia/chats/${encodeURIComponent(chatId)}/respond`,
    { method: 'POST' },
  )
}

/** Chatと子メッセージをD1から削除する。 */
export function deleteCreativeIAChat(chatId: string) {
  return requestCreativeIAApi<{ deleted: boolean }>(
    `/api/creative-ia/chats/${encodeURIComponent(chatId)}`,
    { method: 'DELETE' },
  )
}

/** D1に保存された商品参照データを取得する。 */
export function getCreativeIAReferenceProducts() {
  return requestCreativeIAApi<{
    products: CreativeIAReferenceProduct[]
    count: number
  }>('/api/creative-ia/references/products')
}

/** 商品参照データをD1へ登録する。 */
export function createCreativeIAReferenceProduct(
  product: CreativeIAReferenceProductInput,
) {
  return requestCreativeIAApi<CreativeIAReferenceProduct>(
    '/api/creative-ia/references/products',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    },
  )
}

/** 商品参照データを更新する。 */
export function updateCreativeIAReferenceProduct(
  productId: string,
  product: CreativeIAReferenceProductInput,
) {
  return requestCreativeIAApi<CreativeIAReferenceProduct>(
    `/api/creative-ia/references/products/${encodeURIComponent(productId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    },
  )
}

/** 商品参照データを削除する。 */
export function deleteCreativeIAReferenceProduct(productId: string) {
  return requestCreativeIAApi<{ deleted: boolean }>(
    `/api/creative-ia/references/products/${encodeURIComponent(productId)}`,
    { method: 'DELETE' },
  )
}

export function getCreativeIAReferenceServices() {
  return requestCreativeIAApi<{
    services: CreativeIAReferenceService[]
    count: number
  }>('/api/creative-ia/references/services')
}

export function createCreativeIAReferenceService(
  service: CreativeIAReferenceServiceInput,
) {
  return requestCreativeIAApi<CreativeIAReferenceService>(
    '/api/creative-ia/references/services',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(service),
    },
  )
}

export function updateCreativeIAReferenceService(
  serviceId: string,
  service: CreativeIAReferenceServiceInput,
) {
  return requestCreativeIAApi<CreativeIAReferenceService>(
    `/api/creative-ia/references/services/${encodeURIComponent(serviceId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(service),
    },
  )
}

export function deleteCreativeIAReferenceService(serviceId: string) {
  return requestCreativeIAApi<{ deleted: boolean }>(
    `/api/creative-ia/references/services/${encodeURIComponent(serviceId)}`,
    { method: 'DELETE' },
  )
}

export function getCreativeIAReferenceOrganizations() {
  return requestCreativeIAApi<{ organizations: CreativeIAReferenceOrganization[]; count: number }>(
    '/api/creative-ia/references/organizations',
  )
}
export function createCreativeIAReferenceOrganization(input: CreativeIAReferenceOrganizationInput) {
  return requestCreativeIAApi<CreativeIAReferenceOrganization>('/api/creative-ia/references/organizations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
}
export function updateCreativeIAReferenceOrganization(id: string, input: CreativeIAReferenceOrganizationInput) {
  return requestCreativeIAApi<CreativeIAReferenceOrganization>(`/api/creative-ia/references/organizations/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
}
export function deleteCreativeIAReferenceOrganization(id: string) {
  return requestCreativeIAApi<{ deleted: boolean }>(`/api/creative-ia/references/organizations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getCreativeIAReferenceContacts() {
  return requestCreativeIAApi<{ contacts: CreativeIAReferenceContact[]; count: number }>(
    '/api/creative-ia/references/contacts',
  )
}
export function createCreativeIAReferenceContact(input: CreativeIAReferenceContactInput) {
  return requestCreativeIAApi<CreativeIAReferenceContact>('/api/creative-ia/references/contacts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
}
export function updateCreativeIAReferenceContact(id: string, input: CreativeIAReferenceContactInput) {
  return requestCreativeIAApi<CreativeIAReferenceContact>(`/api/creative-ia/references/contacts/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
}
export function deleteCreativeIAReferenceContact(id: string) {
  return requestCreativeIAApi<{ deleted: boolean }>(`/api/creative-ia/references/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** 独自ドメインWordPressのApplication Passwordを認証確認後に暗号化保存する。 */
export function connectCreativeIAWordPressWithApplicationPassword(input: {
  siteUrl: string
  username: string
  applicationPassword: string
}) {
  return requestCreativeIAApi<CreativeIAWordPressStatus>(
    '/api/creative-ia/wordpress/application-password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}

/** 現在の利用者に紐づくWordPress認証情報をWorker側から削除する。 */
export function disconnectCreativeIAWordPress() {
  return requestCreativeIAApi<{ disconnected: boolean }>(
    '/api/creative-ia/wordpress/connection',
    { method: 'DELETE' },
  )
}

/** 入力したテーマと要点をGeminiへ送り、編集可能な日本語の記事案を生成する。 */
export function generateCreativeIAArticle(input: {
  topic: string
  keyPoints: string
  audience: string
  tone: 'friendly' | 'professional' | 'casual'
  referenceIds?: string[]
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
