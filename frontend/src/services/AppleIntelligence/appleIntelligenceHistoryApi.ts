import { fetchAuthSession } from 'aws-amplify/auth'
import type { AppleIntelligenceMessage, HundredTargetApp } from './appleIntelligenceApi'

const apiOrigin = import.meta.env.VITE_CREATIVE_IA_API_ORIGIN ??
  (import.meta.env.DEV ? 'http://localhost:8787' : 'https://apps-api.yamahit.com')

export type AppleIntelligenceChatSummary = {
  id: string
  appId: HundredTargetApp
  route: string
  title: string
  createdAt: number
  updatedAt: number
}

export type AppleIntelligenceStoredMessage = AppleIntelligenceMessage & {
  id: string
  filesRead: string[]
  createdAt: number
}

export type AppleIntelligenceStoredChat = AppleIntelligenceChatSummary & {
  messages: AppleIntelligenceStoredMessage[]
}

async function requestHistoryApi<T>(path: string, options: RequestInit = {}) {
  const session = await fetchAuthSession()
  const accessToken = session.tokens?.accessToken?.toString()
  if (!accessToken) throw new Error('AUTH_REQUIRED')
  const response = await fetch(new URL(path, apiOrigin), {
    ...options,
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, ...options.headers },
  })
  const body = await response.json().catch(() => null) as ({ error?: unknown } & T) | null
  if (!response.ok) {
    if (response.status === 401) throw new Error('AUTH_REQUIRED')
    throw new Error(typeof body?.error === 'string' ? body.error : 'チャット履歴を処理できませんでした')
  }
  return body as T
}

export function listAppleIntelligenceChats() {
  return requestHistoryApi<{ chats: AppleIntelligenceChatSummary[] }>('/api/apple-intelligence/chats')
}

export function createAppleIntelligenceChat(appId: HundredTargetApp, route: string) {
  return requestHistoryApi<{ chat: AppleIntelligenceChatSummary }>('/api/apple-intelligence/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, route }),
  })
}

export function getAppleIntelligenceChat(chatId: string) {
  return requestHistoryApi<{ chat: AppleIntelligenceStoredChat }>(`/api/apple-intelligence/chats/${encodeURIComponent(chatId)}`)
}

export function appendAppleIntelligenceChatMessage(chatId: string, message: AppleIntelligenceMessage, filesRead: string[] = []) {
  return requestHistoryApi<{ message: AppleIntelligenceStoredMessage; title: string }>(`/api/apple-intelligence/chats/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...message, filesRead }),
  })
}
