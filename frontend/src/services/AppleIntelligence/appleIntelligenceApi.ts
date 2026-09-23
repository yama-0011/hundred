const localAgentOrigin = import.meta.env.VITE_HUNDRED_LOCAL_AGENT_ORIGIN ?? 'http://127.0.0.1:11435'

export type AppleIntelligenceTarget = {
  serviceId: 'chatgpt' | 'codex' | 'claude' | 'ai-desktop'
  categoryId: string
  contentId: string
  source: 'published' | 'draft'
  databaseTarget: 'local' | 'remote'
}

export type AppleIntelligenceMessage = { role: 'user' | 'assistant'; content: string }
export type HundredTargetApp = 'hundred' | 'ai-desktop' | 'creative-ia' | 'anigram' | 'card-home' | 'record-hub'
export type AppleIntelligenceProposal = {
  tool: 'ai_desktop.content.save_draft'
  environment: 'local' | 'remote'
  target: AppleIntelligenceTarget
  content: Record<string, unknown>
}

async function requestLocalAgent<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(new URL(path, localAgentOrigin), {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  })
  const body = await response.json().catch(() => null) as ({ error?: unknown } & T) | null
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Hundred Local Agentへ接続できませんでした')
  return body as T
}

export function getAppleIntelligenceStatus() {
  return requestLocalAgent<{ connected: boolean; endpoint: string; status: number | null }>('/health')
}

export function sendAppleIntelligenceMessage(target: AppleIntelligenceTarget, messages: AppleIntelligenceMessage[], currentContent?: unknown) {
  return requestLocalAgent<{ reply: string; proposal: AppleIntelligenceProposal | null }>('/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, messages, currentContent }),
  })
}

export function sendHundredAppleIntelligenceMessage(context: { appId: HundredTargetApp; route: string }, messages: AppleIntelligenceMessage[]) {
  return requestLocalAgent<{ reply: string; filesRead: string[] }>('/v1/chat/general', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, messages }),
  })
}

export function executeAppleIntelligenceProposal(proposal: AppleIntelligenceProposal) {
  return requestLocalAgent<{ ok: true; tool: string; environment: 'local' | 'remote'; revision: number }>('/v1/tools/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proposal),
  })
}
