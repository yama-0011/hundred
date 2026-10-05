import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createAIDesktopDesignDelivery,
  deleteAIDesktopDesignDelivery,
  getAIDesktopDesignDelivery,
  listAIDesktopDesignDeliveries,
  updateAIDesktopDesignDelivery,
  type AIDesktopDesignDelivery,
  type AIDesktopDesignDeliveryInput,
  type AIDesktopDesignDeliveryStatus,
  type AIDesktopDesignDeliverySummary,
  type AIDesktopDesignDomain,
  type AIDesktopDesignDocumentSummary,
  type AIDesktopDesignPhase,
  type AIDesktopProjectSummary,
  designDeliveryStateLabels,
} from '../../services/AIDesktop/aiDesktopApi'
import { AI_DESKTOP_MESSAGES, localizedErrorMessage } from './aiDesktopMessages'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import { confirmAIDesktop } from './aiDesktopConfirmBus'

const statusLabels: Record<AIDesktopDesignDeliveryStatus, string> = {
  preparing: '準備中',
  exported: '出力済み',
  submitted: '提出済み',
  resubmission: '再提出',
  completed: '納品完了',
}

const domainLabels = { common: 'プロジェクト共通', application: 'アプリ', infrastructure: 'インフラ' } as const
const phaseLabels = { common: '設計判断（ADR）', planning: '企画', requirements: '要件定義', 'basic-design': '基本設計', 'detailed-design': '詳細設計', implementation: '実装', test: 'テスト', release: 'リリース', operation: '運用', research: '調査' } as const
const scopePhases = {
  common: ['planning', 'requirements', 'basic-design', 'implementation', 'release', 'operation', 'research', 'common'],
  application: ['basic-design', 'detailed-design', 'test'],
  infrastructure: ['basic-design', 'detailed-design', 'operation'],
} as const

const packageName = (projectName: string, domain: keyof typeof domainLabels, phase: keyof typeof phaseLabels) => `${projectName}_${domainLabels[domain]}${phaseLabels[phase]}_v1`

const emptyInput = (projectId: string, projectName: string): AIDesktopDesignDeliveryInput => ({
  projectId,
  name: packageName(projectName, 'application', 'basic-design'),
  scopeDomain: 'application',
  scopePhase: 'basic-design',
  status: 'preparing',
  recipient: '',
  deliveryMethod: '',
  submittedAt: null,
  receivedAt: null,
  inspectionAt: null,
  notes: '',
  documentIds: [],
})

const dateLabel = (value: number | null) => value ? new Intl.DateTimeFormat('ja-JP').format(value) : '未記録'
const dateInput = (value: number | null) => {
  if (!value) return ''
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const dateValue = (value: string) => value ? new Date(`${value}T00:00:00`).getTime() : null

const inputFromDelivery = (delivery: AIDesktopDesignDelivery): AIDesktopDesignDeliveryInput => ({
  projectId: delivery.projectId,
  name: delivery.name,
  scopeDomain: delivery.scopeDomain,
  scopePhase: delivery.scopePhase,
  status: delivery.status,
  recipient: delivery.recipient,
  deliveryMethod: delivery.deliveryMethod,
  submittedAt: delivery.submittedAt,
  receivedAt: delivery.receivedAt,
  inspectionAt: delivery.inspectionAt,
  notes: delivery.notes,
  documentIds: delivery.items.flatMap((item) => item.designDocumentId ? [item.designDocumentId] : []),
})

export default function DesignDeliverables({ project, documents, header, onCreateFromDocuments, initialDocumentIds = [] }: { project: AIDesktopProjectSummary; documents: AIDesktopDesignDocumentSummary[]; header: ReactNode; onCreateFromDocuments: () => void; initialDocumentIds?: string[] }) {
  const initialInput = () => {
    const input = emptyInput(project.id, project.name)
    const selectedDocuments = documents.filter((document) => initialDocumentIds.includes(document.id))
    const first = selectedDocuments[0]
    if (first) {
      input.scopeDomain = first.domain
      input.scopePhase = first.phase
      input.name = packageName(project.name, first.domain, first.phase)
      input.documentIds = selectedDocuments.map((document) => document.id)
    }
    return input
  }
  const [deliveries, setDeliveries] = useState<AIDesktopDesignDeliverySummary[]>([])
  const [selected, setSelected] = useState<AIDesktopDesignDelivery | null>(null)
  const [draft, setDraft] = useState<AIDesktopDesignDeliveryInput>(initialInput)
  const [creating, setCreating] = useState(initialDocumentIds.length > 0)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const projectDocuments = useMemo(() => documents.filter((document) => document.projectId === project.id), [documents, project.id])

  const refresh = async () => {
    const result = await listAIDesktopDesignDeliveries()
    setDeliveries(result.deliveries.filter((delivery) => delivery.projectId === project.id))
  }

  useEffect(() => {
    let active = true
    void listAIDesktopDesignDeliveries().then((result) => {
      if (active) setDeliveries(result.deliveries.filter((delivery) => delivery.projectId === project.id))
    }).catch((error) => showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDelivery.listFailed)))
    return () => { active = false }
  }, [project.id])

  const openDelivery = async (id: string) => {
    setBusy(true)
    try {
      const result = await getAIDesktopDesignDelivery(id)
      setSelected(result.delivery)
      setDraft(inputFromDelivery(result.delivery))
      setEditing(false)
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDelivery.loadFailed))
    } finally {
      setBusy(false)
    }
  }

  const createDelivery = async () => {
    if (!draft.name.trim() || !draft.documentIds.length) return
    setBusy(true)
    try {
      const result = await createAIDesktopDesignDelivery(draft)
      await refresh()
      setSelected(result.delivery)
      setCreating(false)
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDelivery.created)
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDelivery.createFailed))
    } finally {
      setBusy(false)
    }
  }

  const saveDelivery = async () => {
    if (!selected || !draft.name.trim()) return
    setBusy(true)
    try {
      const result = await updateAIDesktopDesignDelivery(selected.id, draft)
      setSelected(result.delivery)
      await refresh()
      setEditing(false)
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDelivery.saved)
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDelivery.saveFailed))
    } finally {
      setBusy(false)
    }
  }

  const removeDelivery = async () => {
    if (!selected || !(await confirmAIDesktop({ title: `「${selected.name}」を削除しますか？`, confirmLabel: '削除', tone: 'danger' }))) return
    setBusy(true)
    try {
      await deleteAIDesktopDesignDelivery(selected.id)
      await refresh()
      setSelected(null)
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDelivery.deleted)
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDelivery.deleteFailed))
    } finally {
      setBusy(false)
    }
  }

  const downloadDelivery = () => {
    if (!selected) return
    const payload = { schemaVersion: 1, exportedAt: Date.now(), project: { id: project.id, name: project.name }, delivery: selected }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${selected.name.replace(/[\\/:*?"<>|]/gu, '_')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDelivery.downloaded)
  }

  if (selected) return <div className="ad-delivery-page"><header><div><small>{project.name} / 成果物・納品</small><h1>{selected.name}</h1><p>追加時点のドキュメントを固定して、提出と検収の記録を管理します。</p></div><nav className="ad-design-toolbar"><button onClick={() => setSelected(null)}>← 成果物一覧</button><button onClick={downloadDelivery}>JSON出力</button>{selected.canEdit && !editing && <button onClick={() => { setDraft(inputFromDelivery(selected)); setEditing(true) }}>編集</button>}{selected.canEdit && editing && <><button onClick={() => { setDraft(inputFromDelivery(selected)); setEditing(false) }}>キャンセル</button><button className="primary" disabled={busy || !draft.name.trim()} onClick={() => void saveDelivery()}>保存</button></>}{selected.canEdit && selected.status === 'preparing' && <button className="danger" disabled={busy} onClick={() => void removeDelivery()}>削除</button>}</nav></header><section className="ad-delivery-summary"><div><span>納品範囲</span><strong>{domainLabels[selected.scopeDomain]} ・ {phaseLabels[selected.scopePhase]}</strong></div><div><span>状態</span><strong className={`status ${selected.status}`}>{statusLabels[selected.status]}</strong></div><div><span>ドキュメント</span><strong>{selected.itemCount}件</strong></div><div><span>提出先</span><strong>{selected.recipient || '未設定'}</strong></div><div><span>提出日</span><strong>{dateLabel(selected.submittedAt)}</strong></div><div><span>検収日</span><strong>{dateLabel(selected.inspectionAt)}</strong></div></section>{editing ? <DeliveryForm input={draft} onChange={setDraft} documents={projectDocuments} documentsLocked={selected.status !== 'preparing'} /> : <><section className="ad-delivery-record"><div><span>納品方法</span><p>{selected.deliveryMethod || '未設定'}</p></div><div><span>受領確認日</span><p>{dateLabel(selected.receivedAt)}</p></div><div className="wide"><span>備考</span><p>{selected.notes || '記録はありません。'}</p></div></section><section className="ad-delivery-items"><header><div><small>FROZEN DOCUMENTS</small><h2>固定されたドキュメント</h2></div><span>{selected.items.length}件</span></header>{selected.items.map((item) => <article key={item.id}><div><strong>{item.documentTitle}</strong><small>{domainLabels[item.domain]} ・ {phaseLabels[item.phase]}</small></div><div><span>固定日時</span><time>{dateLabel(item.addedAt)}</time></div><div><span>元ドキュメントの更新日</span><time>{dateLabel(item.sourceUpdatedAt)}</time></div></article>)}</section></>}</div>

  return <div className="ad-delivery-page ad-design-project-section-page">{header}<div className="ad-design-list-tools"><span>{deliveries.length}件</span>{project.canEdit && <div className="ad-design-list-actions"><button className="primary" onClick={onCreateFromDocuments}>ドキュメントを選択</button></div>}</div><section className="ad-delivery-list"><div className="head"><span>成果物名</span><span>納品範囲</span><span>状態</span><span>ドキュメント</span><span>提出先</span><span>提出日</span></div>{deliveries.map((delivery) => <button key={delivery.id} disabled={busy} onClick={() => void openDelivery(delivery.id)}><strong>{delivery.name}</strong><span>{domainLabels[delivery.scopeDomain]} ・ {phaseLabels[delivery.scopePhase]}</span><span className={`status ${delivery.status}`}>{statusLabels[delivery.status]}</span><span>{delivery.itemCount}件</span><span>{delivery.recipient || '未設定'}</span><time>{dateLabel(delivery.submittedAt)}</time></button>)}{!deliveries.length && <div className="empty"><span>▣</span><strong>成果物はまだありません</strong><p>「ドキュメントを選択」から、成果物に含めるドキュメントをチェックしてください。</p></div>}</section>{creating && <div className="ad-design-create-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) setCreating(false) }}><section className="ad-delivery-dialog" role="dialog" aria-modal="true"><header><div><small>NEW DELIVERABLE</small><h2>成果物を作成</h2><p>含めるドキュメントを選択してください。追加した時点の内容で固定されます。</p></div><button onClick={() => setCreating(false)}>×</button></header><DeliveryForm input={draft} onChange={setDraft} documents={projectDocuments} documentsLocked={false} projectName={project.name} /><footer><button onClick={() => setCreating(false)}>キャンセル</button><button className="primary" disabled={busy || !draft.name.trim() || !draft.documentIds.length} onClick={() => void createDelivery()}>作成して固定</button></footer></section></div>}</div>
}

function DeliveryForm({ input, onChange, documents, documentsLocked, projectName }: { input: AIDesktopDesignDeliveryInput; onChange: (value: AIDesktopDesignDeliveryInput) => void; documents: AIDesktopDesignDocumentSummary[]; documentsLocked: boolean; projectName?: string }) {
  const set = <K extends keyof AIDesktopDesignDeliveryInput>(key: K, value: AIDesktopDesignDeliveryInput[K]) => onChange({ ...input, [key]: value })
  const toggle = (id: string) => set('documentIds', input.documentIds.includes(id) ? input.documentIds.filter((value) => value !== id) : [...input.documentIds, id])
  const phases = scopePhases[input.scopeDomain] as readonly AIDesktopDesignPhase[]
  const scopedDocuments = documents.filter((document) => document.domain === input.scopeDomain && document.phase === input.scopePhase)
  const changeScope = (domain: AIDesktopDesignDomain, requestedPhase: AIDesktopDesignPhase) => {
    const available = scopePhases[domain] as readonly AIDesktopDesignPhase[]
    const phase = available.includes(requestedPhase) ? requestedPhase : available[0]
    const documentIds = documents.filter((document) => document.domain === domain && document.phase === phase).map((document) => document.id)
    onChange({ ...input, scopeDomain: domain, scopePhase: phase, documentIds, name: projectName ? packageName(projectName, domain, phase) : input.name })
  }
  return <div className="ad-delivery-form"><div className="fields"><label><span>設計対象</span><select value={input.scopeDomain} disabled={documentsLocked} onChange={(event) => changeScope(event.target.value as AIDesktopDesignDomain, input.scopePhase)}>{Object.entries(domainLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>工程</span><select value={input.scopePhase} disabled={documentsLocked} onChange={(event) => changeScope(input.scopeDomain, event.target.value as AIDesktopDesignPhase)}>{phases.map((phase) => <option value={phase} key={phase}>{phaseLabels[phase]}</option>)}</select></label><label><span>成果物名</span><input value={input.name} onChange={(event) => set('name', event.target.value)} /></label><label><span>状態</span><select value={input.status} onChange={(event) => set('status', event.target.value as AIDesktopDesignDeliveryStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>提出先</span><input value={input.recipient} onChange={(event) => set('recipient', event.target.value)} placeholder="会社名・担当者名" /></label><label><span>納品方法</span><input value={input.deliveryMethod} onChange={(event) => set('deliveryMethod', event.target.value)} placeholder="メール、共有ストレージなど" /></label><label><span>提出日</span><input type="date" value={dateInput(input.submittedAt)} onChange={(event) => set('submittedAt', dateValue(event.target.value))} /></label><label><span>受領確認日</span><input type="date" value={dateInput(input.receivedAt)} onChange={(event) => set('receivedAt', dateValue(event.target.value))} /></label><label><span>検収日</span><input type="date" value={dateInput(input.inspectionAt)} onChange={(event) => set('inspectionAt', dateValue(event.target.value))} /></label><label className="notes"><span>備考</span><textarea value={input.notes} onChange={(event) => set('notes', event.target.value)} /></label></div><section className="documents"><header><div><strong>パッケージ内容</strong><small>{documentsLocked ? '提出処理を開始したため、納品範囲とドキュメントの構成は固定されています。' : '選択した工程のドキュメントを自動でまとめます。'}</small></div><span>{input.documentIds.length}件</span></header><div className="ad-delivery-auto-selection"><div><strong>{domainLabels[input.scopeDomain]} ・ {phaseLabels[input.scopePhase]}</strong><span>{scopedDocuments.length}件を自動選択</span></div>{scopedDocuments.length === 0 && <p>この範囲にはドキュメントがありません。</p>}</div><details><summary>ドキュメントを確認・調整</summary><div>{documents.map((document) => <label className={input.documentIds.includes(document.id) ? 'selected' : ''} key={document.id}><input type="checkbox" checked={input.documentIds.includes(document.id)} disabled={documentsLocked} onChange={() => toggle(document.id)} /><span><strong>{document.title}</strong><small>{domainLabels[document.domain]} ・ {phaseLabels[document.phase]} ・ 更新 {dateLabel(document.updatedAt)}{designDeliveryStateLabels[document.deliveryState] ? ` ・ ${designDeliveryStateLabels[document.deliveryState]}` : ''}</small></span></label>)}</div></details></section></div>
}
