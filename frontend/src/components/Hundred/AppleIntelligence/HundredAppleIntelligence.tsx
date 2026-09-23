import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { getAppleIntelligenceStatus, sendHundredAppleIntelligenceMessage, type AppleIntelligenceMessage, type HundredTargetApp } from '../../../services/AppleIntelligence/appleIntelligenceApi'
import { appendAppleIntelligenceChatMessage, createAppleIntelligenceChat, getAppleIntelligenceChat, listAppleIntelligenceChats, type AppleIntelligenceChatSummary, type AppleIntelligenceStoredMessage } from '../../../services/AppleIntelligence/appleIntelligenceHistoryApi'
import { HundredAppleIntelligenceContext } from './HundredAppleIntelligenceContext'
import AppleIntelligenceMark from './AppleIntelligenceMark'
import '../../../styles/Hundred/hundred-apple-intelligence.css'

const appOptions: Array<{ id: HundredTargetApp; label: string }> = [
  { id: 'hundred', label: 'Hundred' },
  { id: 'ai-desktop', label: 'AI Desktop' },
  { id: 'creative-ia', label: 'Creative IA' },
  { id: 'anigram', label: 'Anigram' },
  { id: 'card-home', label: 'カードホーム' },
  { id: 'record-hub', label: 'Record Hub' },
]

function appFromPath(pathname: string): HundredTargetApp {
  if (pathname.startsWith('/ai-desktop')) return 'ai-desktop'
  if (pathname.startsWith('/creative-ia')) return 'creative-ia'
  if (pathname.startsWith('/anigram')) return 'anigram'
  return 'hundred'
}

function appLabel(appId: HundredTargetApp) {
  return appOptions.find((app) => app.id === appId)?.label ?? appId
}

function readableError(error: unknown) {
  if (!(error instanceof Error)) return '処理に失敗しました。'
  if (error.message === 'AUTH_REQUIRED') return 'チャット履歴の保存にはHundredへのサインインが必要です。'
  if (error.message === 'Failed to fetch') return 'サーバーへ接続できません。'
  if (error.message.startsWith('APPLE_')) return 'Apple Intelligenceから回答を取得できませんでした。'
  return error.message
}

function formattedDate(value: number) {
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value)
}

export function HundredAppleIntelligenceProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const routeApp = appFromPath(location.pathname)
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [view, setView] = useState<'home' | 'new' | 'chat'>('home')
  const [draftApp, setDraftApp] = useState<HundredTargetApp>(routeApp)
  const [activeChat, setActiveChat] = useState<AppleIntelligenceChatSummary | null>(null)
  const [history, setHistory] = useState<AppleIntelligenceChatSummary[]>([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [connection, setConnection] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [messages, setMessages] = useState<AppleIntelligenceStoredMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const checkConnection = async () => {
    setConnection('checking')
    try {
      const status = await getAppleIntelligenceStatus()
      setConnection(status.connected ? 'connected' : 'disconnected')
    } catch {
      setConnection('disconnected')
    }
  }

  const refreshHistory = async () => {
    setHistoryBusy(true)
    try {
      const result = await listAppleIntelligenceChats()
      setHistory(result.chats)
      setNotice('')
    } catch (error) {
      setNotice(readableError(error))
    } finally {
      setHistoryBusy(false)
    }
  }

  const openAppleIntelligence = (appId?: HundredTargetApp) => {
    setDraftApp(appId ?? routeApp)
    setOpen(true)
    setMinimized(false)
    setPosition((current) => current ?? { x: Math.max(12, window.innerWidth - 570), y: Math.max(12, window.innerHeight - 720) })
    void Promise.all([checkConnection(), refreshHistory()])
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, notice, busy])

  const contextValue = { openAppleIntelligence }

  const beginNewChat = async () => {
    setHistoryBusy(true)
    setNotice('')
    try {
      const result = await createAppleIntelligenceChat(draftApp, location.pathname)
      setActiveChat(result.chat)
      setMessages([])
      setInput('')
      setView('chat')
      setHistory((current) => [result.chat, ...current])
    } catch (error) {
      setNotice(readableError(error))
    } finally {
      setHistoryBusy(false)
    }
  }

  const openStoredChat = async (chat: AppleIntelligenceChatSummary) => {
    setHistoryBusy(true)
    setNotice('')
    try {
      const result = await getAppleIntelligenceChat(chat.id)
      setActiveChat(result.chat)
      setMessages(result.chat.messages)
      setView('chat')
    } catch (error) {
      setNotice(readableError(error))
    } finally {
      setHistoryBusy(false)
    }
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const content = input.trim()
    if (!content || busy || connection !== 'connected' || !activeChat) return
    setInput('')
    setNotice('')
    setBusy(true)
    try {
      const savedUser = await appendAppleIntelligenceChatMessage(activeChat.id, { role: 'user', content })
      const nextMessages = [...messages, savedUser.message]
      const updatedChat = { ...activeChat, title: savedUser.title, updatedAt: savedUser.message.createdAt }
      setMessages(nextMessages)
      setActiveChat(updatedChat)
      setHistory((current) => [updatedChat, ...current.filter((chat) => chat.id !== updatedChat.id)])
      const contextMessages: AppleIntelligenceMessage[] = nextMessages.slice(-30).map(({ role, content: text }) => ({ role, content: text }))
      const result = await sendHundredAppleIntelligenceMessage({ appId: activeChat.appId, route: activeChat.route }, contextMessages)
      const savedAssistant = await appendAppleIntelligenceChatMessage(activeChat.id, { role: 'assistant', content: result.reply }, result.filesRead)
      setMessages([...nextMessages, savedAssistant.message])
      const completedChat = { ...updatedChat, updatedAt: savedAssistant.message.createdAt }
      setActiveChat(completedChat)
      setHistory((current) => [completedChat, ...current.filter((chat) => chat.id !== completedChat.id)])
    } catch (error) {
      setNotice(readableError(error))
    } finally {
      setBusy(false)
    }
  }

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button,select')) return
    const current = position ?? { x: 20, y: 20 }
    const startX = event.clientX
    const startY = event.clientY
    const move = (moveEvent: PointerEvent) => setPosition({ x: Math.max(0, Math.min(window.innerWidth - 280, current.x + moveEvent.clientX - startX)), y: Math.max(0, Math.min(window.innerHeight - 56, current.y + moveEvent.clientY - startY)) })
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return <HundredAppleIntelligenceContext.Provider value={contextValue}>
    {children}
    {open && <aside className={`hundred-apple-window ${minimized ? 'minimized' : ''}`} style={position ? { left: position.x, top: position.y } : undefined} aria-label="Apple Intelligenceチャット">
      <header onPointerDown={startDrag}><div><AppleIntelligenceMark compact /><span><strong>Apple Intelligence</strong><small>{connection === 'connected' ? '接続済み' : connection === 'checking' ? '接続確認中' : '未接続'}</small></span></div><nav><button type="button" aria-label={minimized ? '元のサイズに戻す' : '最小化'} onClick={() => setMinimized((current) => !current)}>{minimized ? '□' : '—'}</button><button type="button" aria-label="閉じる" onClick={() => setOpen(false)}>×</button></nav></header>
      {!minimized && <>
        {view === 'home' && <section className="hundred-apple-history"><div className="hundred-apple-history-heading"><div><strong>過去のチャット</strong><small>対象アプリごとに会話を保存します</small></div><button type="button" onClick={() => { setDraftApp(routeApp); setNotice(''); setView('new') }}>＋ 新規チャット</button></div><div className="hundred-apple-history-list">{historyBusy && history.length === 0 && <p>読み込んでいます…</p>}{!historyBusy && history.length === 0 && <div className="hundred-apple-history-empty"><AppleIntelligenceMark /><strong>保存済みのチャットはありません</strong><span>新規チャットから会話を始めてください。</span></div>}{history.map((chat) => <button type="button" key={chat.id} onClick={() => void openStoredChat(chat)}><span><strong>{chat.title}</strong><small>{appLabel(chat.appId)}</small></span><time>{formattedDate(chat.updatedAt)}</time></button>)}</div>{notice && <p className="hundred-apple-error">{notice}</p>}</section>}
        {view === 'new' && <section className="hundred-apple-new"><button className="hundred-apple-back" type="button" onClick={() => { setNotice(''); setView('home') }}>← 過去のチャット</button><div><AppleIntelligenceMark /><strong>新しいチャット</strong><p>この会話で扱うアプリを選択してください。開始後は固定されます。</p></div><label><span>対象アプリ</span><select value={draftApp} onChange={(event) => setDraftApp(event.target.value as HundredTargetApp)}>{appOptions.map((app) => <option value={app.id} key={app.id}>{app.label}</option>)}</select></label>{notice && <p className="hundred-apple-error">{notice}</p>}<button className="hundred-apple-primary" type="button" disabled={historyBusy} onClick={() => void beginNewChat()}>{historyBusy ? '作成中…' : 'チャットを開始'}</button></section>}
        {view === 'chat' && activeChat && <><section className="hundred-apple-context"><button className="hundred-apple-back" type="button" onClick={() => { setNotice(''); setView('home'); void refreshHistory() }}>← 履歴</button><div><span>{appLabel(activeChat.appId)}</span><small>{activeChat.title}</small></div><button className="hundred-apple-new-button" type="button" onClick={() => { setDraftApp(routeApp); setNotice(''); setView('new') }}>＋ 新規</button><div className={`hundred-apple-connection ${connection}`}><i />{connection === 'connected' ? 'ローカルAI' : connection === 'checking' ? '確認中' : <button type="button" onClick={() => void checkConnection()}>再接続</button>}</div></section><section className="hundred-apple-chat">{messages.length === 0 && <div className="hundred-apple-empty"><AppleIntelligenceMark /><strong>{appLabel(activeChat.appId)}について相談できます</strong><p>必要に応じて、対象アプリのHundred内ファイルを読み取ります。</p></div>}{messages.map((message) => <article className={message.role} key={message.id}><small>{message.role === 'user' ? 'あなた' : 'Apple Intelligence'}</small><p>{message.content}</p>{message.filesRead.length > 0 && <details><summary>{message.filesRead.length}件のファイルを参照</summary>{message.filesRead.map((file) => <code key={file}>{file}</code>)}</details>}</article>)}{busy && <article className="assistant pending"><small>Apple Intelligence</small><p>確認しています…</p></article>}{notice && <p className="hundred-apple-error">{notice}</p>}<div ref={endRef} /></section><form onSubmit={(event) => void send(event)}><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={`${appLabel(activeChat.appId)}について質問`} disabled={busy || connection !== 'connected'} /><button type="submit" disabled={busy || connection !== 'connected' || !input.trim()}>送信</button></form></>}
      </>}
    </aside>}
  </HundredAppleIntelligenceContext.Provider>
}

