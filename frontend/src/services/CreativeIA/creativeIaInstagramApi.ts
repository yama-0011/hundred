import {
  disconnectInstagram,
  getInstagramAuthorizationUrl,
  getInstagramConnectionStatus,
  getInstagramStoryInsights,
  requestInstagramApi,
  type InstagramConnectionStatus,
  type InstagramPetState,
  type InstagramStoryInsight,
} from '../Instagram/instagramConnectionApi'

export type CreativeIAInstagramStatus = InstagramConnectionStatus
export type CreativeIAInstagramStoryInsight = InstagramStoryInsight
export type CreativeIAInstagramPetState = InstagramPetState

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

export function getCreativeIAInstagramStatus() {
  return getInstagramConnectionStatus('creativeIa')
}

export function getCreativeIAInstagramStoryInsights() {
  return getInstagramStoryInsights('creativeIa')
}

export function disconnectCreativeIAInstagram() {
  return disconnectInstagram('creativeIa')
}

export function getCreativeIAInstagramAuthorizationUrl() {
  return getInstagramAuthorizationUrl(
    '/creative-ia/settings/instagram',
    'creativeIa',
  )
}

export function getCreativeIAInstagramPublication(chatId: string) {
  return requestInstagramApi<{
    publication: CreativeIAInstagramPublication | null
  }>(
    `/api/creative-ia/chats/${encodeURIComponent(chatId)}/instagram/publication`,
  )
}

export function uploadCreativeIAInstagramFeedImage(
  chatId: string,
  image: File,
) {
  return requestInstagramApi<CreativeIAInstagramPublication>(
    `/api/creative-ia/chats/${encodeURIComponent(chatId)}/instagram/publication`,
    {
      method: 'PUT',
      headers: { 'Content-Type': image.type },
      body: image,
    },
  )
}

export function publishCreativeIAInstagramFeed(chatId: string) {
  return requestInstagramApi<CreativeIAInstagramPublication>(
    `/api/creative-ia/chats/${encodeURIComponent(chatId)}/instagram/publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true }),
    },
  )
}
