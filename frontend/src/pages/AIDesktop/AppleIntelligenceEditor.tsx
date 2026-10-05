import { useEffect, useRef, useState, type FormEvent } from 'react'
import { executeAppleIntelligenceProposal, getAppleIntelligenceStatus, sendAppleIntelligenceMessage, type AppleIntelligenceMessage, type AppleIntelligenceProposal, type AppleIntelligenceTarget } from '../../services/AppleIntelligence/appleIntelligenceApi'
import { confirmAIDesktop } from './aiDesktopConfirmBus'

type Props = {
  target: AppleIntelligenceTarget
  contentTitle: string
  initialContent: unknown
  onClose: () => void
  onDraftSaved: (result: { revision: number }) => void | Promise<void>
}

function readableError(error: unknown) {
  if (!(error instanceof Error)) return '処理に失敗しました。'
  if (error.message === 'Failed to fetch') return 'Hundred Local Agentへ接続できません。起動状態を確認してください。'
  if (error.message.startsWith('APPLE_')) return 'Apple Intelligenceから回答を取得できませんでした。'
  return error.message
}

function AppleIntelligenceEditor({ target, contentTitle, initialContent, onClose, onDraftSaved }: Props) {
  const [workingTarget, setWorkingTarget] = useState(target)
  const [connection, setConnection] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [messages, setMessages] = useState<AppleIntelligenceMessage[]>([])
  const [input, setInput] = useState('')
  const [proposal, setProposal] = useState<AppleIntelligenceProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
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

  useEffect(() => {
    let active = true
    void getAppleIntelligenceStatus().then((status) => { if (active) setConnection(status.connected ? 'connected' : 'disconnected') }).catch(() => { if (active) setConnection('disconnected') })
    return () => { active = false }
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, proposal, notice])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const content = input.trim()
    if (!content || busy || connection !== 'connected') return
    const nextMessages = [...messages, { role: 'user' as const, content }]
    setMessages(nextMessages)
    setInput('')
    setProposal(null)
    setNotice('')
    setBusy(true)
    try {
      const result = await sendAppleIntelligenceMessage(workingTarget, nextMessages, workingTarget.source === 'published' ? initialContent : undefined)
      setMessages([...nextMessages, { role: 'assistant', content: result.reply }])
      setProposal(result.proposal)
    } catch (error) {
      setNotice(readableError(error))
    } finally {
      setBusy(false)
    }
  }

  const saveProposal = async () => {
    if (!proposal || busy) return
    const environment = proposal.environment === 'remote' ? '本番D1' : 'ローカルD1'
    if (!(await confirmAIDesktop({ title: `Apple Intelligenceの修正案を${environment}の下書きと履歴へ登録しますか？`, message: '正式公開データは変更されません。', confirmLabel: '登録' }))) return
    setBusy(true)
    setNotice('')
    try {
      const result = await executeAppleIntelligenceProposal(proposal)
      setNotice(`${environment}へ第${result.revision}版として登録しました。`)
      setProposal(null)
      setWorkingTarget((current) => ({ ...current, source: 'draft' }))
      await onDraftSaved({ revision: result.revision })
    } catch (error) {
      setNotice(readableError(error))
    } finally {
      setBusy(false)
    }
  }

  return <div className="ad-apple-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}><section className="ad-apple-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-apple-title"><header><div><span>APPLE INTELLIGENCE · {target.databaseTarget === 'remote' ? '本番D1' : 'ローカルD1'}</span><h2 id="ad-apple-title">Apple Intelligenceで編集</h2><p>{contentTitle}</p></div><button type="button" aria-label="Apple Intelligenceを閉じる" disabled={busy} onClick={onClose}>×</button></header><div className="ad-apple-status"><i className={connection} />{connection === 'checking' ? '接続を確認しています…' : connection === 'connected' ? <><span>Apple Intelligenceに接続済み</span><small>{workingTarget.source === 'draft' ? '直前のAI下書きを編集中' : '公開中の資料を編集中'}</small></> : <><span>未接続です。`apple-intelligence serve` とLocal Agentを起動してください。</span><button type="button" onClick={() => void checkConnection()}>再接続</button></>}</div><div className="ad-apple-messages">{messages.length === 0 && <div className="ad-apple-empty"><strong>この資料をどう変更しますか？</strong><p>現在の公開JSONを自動取得し、修正案を下書きとして登録できます。</p><button type="button" onClick={() => setInput('初心者にも分かりやすい内容に改善してください。')}>初心者向けに改善</button><button type="button" onClick={() => setInput('内容の不足や分かりにくい点を確認してください。')}>内容をレビュー</button></div>}{messages.map((message, index) => <article className={message.role} key={`${message.role}-${index}`}><small>{message.role === 'user' ? 'あなた' : 'Apple Intelligence'}</small><p>{message.content}</p></article>)}{busy && <article className="assistant pending"><small>Apple Intelligence</small><p>処理しています…</p></article>}{proposal && <aside className="ad-apple-proposal"><div><span>下書き更新案</span><strong>{proposal.content.navTitle as string || contentTitle}</strong><small>{proposal.environment === 'remote' ? '本番D1' : 'ローカルD1'}のAI下書き履歴へ登録します</small></div><button type="button" disabled={busy} onClick={() => void saveProposal()}>下書き保存してプレビュー</button></aside>}{notice && <p className="ad-apple-notice">{notice}</p>}<div ref={endRef} /></div><form onSubmit={(event) => void send(event)}><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="例: この資料を初心者向けに書き直してください" disabled={busy || connection !== 'connected'} /><button type="submit" disabled={busy || connection !== 'connected' || !input.trim()}>送信</button></form></section></div>
}

export default AppleIntelligenceEditor
