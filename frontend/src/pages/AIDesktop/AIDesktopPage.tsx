import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { endHundredGuestSession } from '../../components/Hundred/Auth/hundredGuestSession'
import { useHundredAppleIntelligence } from '../../components/Hundred/AppleIntelligence/HundredAppleIntelligenceContext'
import AppleIntelligenceMark from '../../components/Hundred/AppleIntelligence/AppleIntelligenceMark'
import { deleteAIDesktopContentDraftHistory, getAIDesktopCatalogs, getAIDesktopContentDraftHistory, getAIDesktopState, listAIDesktopContentDraftHistory, saveAIDesktopCatalog, saveAIDesktopContentDraft, saveAIDesktopState, type AIDesktopCustomApp, type AIDesktopDraftHistoryEntry } from '../../services/AIDesktop/aiDesktopApi'
import { BlockRenderer, ContentCanvas, ContentTableOfContents, createCategoryGroups, createContent, normalizeServiceConfig, type Category, type CategoryGroup, type ContentBlock, type ContentItem, type GlossaryEntry, type LeafBlock, type ServiceConfig } from './contentBlocks'
import { createContentBlockCatalog } from './contentBlockCatalog'
import { copyArticleImage } from './copyArticleImage'
import { diagramKindMatchesSource, validateMermaidSource, type DiagramKind } from './mermaidDiagramValidation'
import ImageExplorer from './ImageExplorer'
import { AI_DESKTOP_MESSAGES, localizedErrorMessage } from './aiDesktopMessages'
import AIDesktopNotifications from './AIDesktopNotifications'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import '../../styles/AIDesktop/ai-desktop.css'
import '../../styles/Hundred/hundred-login-status.css'

type AppId = 'codex' | 'chatgpt' | 'claude' | 'ai-desktop' | 'explorer' | 'settings'
type ServiceId = Extract<AppId, 'codex' | 'chatgpt' | 'claude' | 'ai-desktop'>
type WindowState = { id: AppId; x: number; y: number; width: number; height: number; minimized: boolean; maximized: boolean; z: number }
type ServiceNavigation = { categoryId: string | null; contentId: string | null }
type ServiceMode = 'view' | 'edit'
type DesktopIconPosition = { x: number; y: number }

const apps = [
  { id: 'chatgpt' as const, name: 'ChatGPT', mark: '◎', color: '#10a37f' },
  { id: 'codex' as const, name: 'Codex', mark: '⌘', color: '#171717' },
  { id: 'claude' as const, name: 'Claude Code', mark: 'C', color: '#d97757' },
  { id: 'ai-desktop' as const, name: 'AI Desktop', mark: '▦', color: '#3975cf' },
  { id: 'explorer' as const, name: 'Explorer', mark: '▰', color: '#e6a700' },
  { id: 'settings' as const, name: 'Settings', mark: '⚙', color: '#5277d8' },
]

const defaultDesktopIconPositions: Record<AppId, DesktopIconPosition> = { chatgpt: { x: 18, y: 18 }, codex: { x: 18, y: 110 }, claude: { x: 18, y: 202 }, 'ai-desktop': { x: 18, y: 294 }, explorer: { x: 18, y: 386 }, settings: { x: 18, y: 478 } }

const content = createContent
const commonDevelopment: Category[] = [
  { id: 'basics', title: '基本知識', description: '仕組みとできること', icon: '◫', items: [
    content('overview', '概要', 'サービスの特徴と役割を最初に確認します。', '得意なこと、苦手なこと、人が確認すべきことを理解すると、適切な場面で使えるようになります。', ['目的を明確にする', '必要な背景を共有する', '結果を自分で確認する']),
    content('strengths', '得意なこと', 'AIが力を発揮しやすい作業を学びます。', '調査、整理、下書き、反復的な修正など、明確な材料と評価基準がある作業を得意とします。', ['作業を具体化する', '参考例を示す', '完成条件を決める']),
    content('safety', '安全な使い方', '重要な判断は人が最終確認します。', '機密情報、外部への変更、事実の正確性など、影響が大きい項目ほど慎重に確認します。', ['機密情報を扱わない', '外部変更を確認する', '根拠を確かめる']),
  ]},
  { id: 'workflow', title: '活用フロー', description: '調査・実行・確認', icon: '↗', items: [
    content('plan', '計画する', '目的を実行可能な作業へ分解します。', '不確実な部分を先に確認し、依存関係を考慮した順序で進めると手戻りを減らせます。', ['目的を整理する', '制約を確認する', '順番を決める']),
    content('execute', '実行する', '小さく結果を作りながら前へ進みます。', '最初の結果をたたき台にして、良い部分を残しながら段階的に完成度を上げます。', ['小さく始める', '途中結果を見る', '具体的に修正する']),
    content('review', '確認する', '結果が目的と条件を満たすか確認します。', '見た目や動作だけでなく、事実、例外時の挙動、将来の使いやすさも確認します。', ['目的との一致', '事実の正確さ', '利用時の分かりやすさ']),
  ]},
  { id: 'features', title: '機能・連携', description: 'ツールと外部サービス', icon: '⌘', items: [
    content('tools', 'ツール', '目的に合うツールを組み合わせます。', '検索、ファイル、コード実行などを使うことで、会話だけでは難しい作業も進められます。', ['必要性を確認する', '権限を限定する', '実行結果を見る']),
    content('files', 'ファイル', '資料やコードを文脈として利用します。', '対象ファイルと確認したい観点を伝えると、必要な情報を効率よく抽出できます。', ['対象を指定する', '観点を伝える', '出力形式を決める']),
    content('automation', '自動化', '定型作業を繰り返し実行します。', '判断基準が明確な作業は自動化し、人は重要な確認や意思決定に集中できます。', ['成功条件を決める', '失敗時を考える', '結果を記録する']),
  ]},
]

const serviceCatalog: Record<ServiceId, ServiceConfig> = {
  'ai-desktop': { schemaVersion: 3, name: 'AI Desktop', eyebrow: 'DOCUMENT WORKSPACE', introduction: 'AIと資料を作成・管理するためのデスクトップ環境です。', categoryGroups: createCategoryGroups([
    { id: 'basics', title: 'AI Desktop', description: '資料管理と編集の基本', icon: '▦', items: [
      content('overview', '概要', 'AI Desktopで資料を整理・編集する方法を確認します。', 'アプリごとの資料をフォルダー形式で管理し、閲覧、編集、AI下書き、正式反映までをひとつの環境で行えます。', ['資料をフォルダーから探す', '編集内容を下書きで確認する', '確認後に正式反映する']),
    ]},
  ])},
  chatgpt: { schemaVersion: 3, name: 'ChatGPT', eyebrow: 'CONVERSATION GUIDE', introduction: '会話・調査・制作を目的に合わせて使い分ける方法を学べます。', categoryGroups: createCategoryGroups([
    ...commonDevelopment,
    { id: 'prompting', title: 'プロンプト', description: '伝わる依頼の作り方', icon: '✦', items: [
      content('structure', '依頼の基本構造', '目的、背景、条件、出力形式を順に伝えます。', '誰が何に使うのかまで伝えることで、語彙や情報量を用途に合わせられます。', ['達成したい目的', '読み手や利用者', '守る条件と形式']),
      content('examples', '例を見せる', '理想に近い例は意図を正確に伝えます。', '文章の調子や形式など、説明しにくい条件は短い例で示すと効果的です。', ['良い例を示す', '避けたい例を示す', '真似る範囲を伝える']),
      content('iteration', '改善を重ねる', '回答を評価し、具体的な修正を返します。', '残す部分と変える部分を分けて伝えると、効率よく完成形へ近づけられます。', ['良い部分を残す', '不足を指摘する', '用途に合わせる']),
    ]},
  ])},
  codex: { schemaVersion: 3, name: 'Codex', eyebrow: 'AI DEVELOPMENT GUIDE', introduction: '', categoryGroups: createCategoryGroups([
    ...commonDevelopment,
    { id: 'environment', title: '開発環境', description: 'Local / IDE / Cloud', icon: '⌨', items: [
      content('local', 'ローカル環境', '手元のリポジトリを調査し、ファイルを編集します。', '実際の構成や設定を読み取れるため、プロジェクトの文脈に沿った変更ができます。', ['作業場所を確認する', '既存ルールを読む', '差分を確認する']),
      content('ide', 'IDEで使う', 'エディタの作業と会話をつなぎます。', '選択中のコードや開いているファイルを起点に、質問、修正、説明を依頼できます。', ['対象を小さくする', 'エラーを共有する', '完成条件を伝える']),
      content('cloud', 'Cloudタスク', '時間のかかる作業を隔離環境で進めます。', '複数の調査や実装をバックグラウンドで進め、完了後に差分を確認できます。', ['依頼を自己完結させる', '権限を確認する', '成果物をレビューする']),
    ]},
    { id: 'models', title: 'モデル', description: '選択と推論レベル', icon: '◇', items: [
      content('choose', 'モデルを選ぶ', '複雑さと応答速度からモデルを選びます。', '単純な編集には軽快なモデル、設計や大規模調査には推論力の高いモデルが向いています。', ['タスクの複雑さ', '必要な応答速度', '利用できる予算']),
      content('reasoning', '推論レベル', '難しい作業ほど考える時間を長くします。', '調査の深さや検討量に影響するため、作業の難しさに合わせて調整します。', ['単純な変更は低め', '設計判断は中〜高', '難しい調査は高め']),
      content('context', 'コンテキスト', '必要な情報を絞ると判断が安定します。', '関連ファイル、要件、過去の判断を適切に共有すると、固有の文脈を反映できます。', ['関連資料を指定する', '古い情報を除く', '要点を保つ']),
    ]},
    { id: 'usage', title: '料金・利用量', description: 'Credit・制限', icon: '◴', items: [
      content('overview', 'Overview', 'プランと使用量の全体像を確認します。', '契約中のプラン、利用できる機能、現在の使用状況を最初に把握します。', ['契約プラン', '更新日', '現在の利用状況']),
      content('credits', 'Credits', 'タスク実行時に消費される利用枠です。', '大きなリポジトリを調査して変更するタスクは、簡単な質問より多くのCreditを使用します。', ['タスクの複雑さ', '調査範囲', '実行時間']),
      content('limits', 'Limits', '利用上限と更新タイミングを確認します。', '上限に近づいた場合の挙動や、利用枠が更新される日時を把握しておきます。', ['上限の通知', '更新タイミング', '追加利用の扱い']),
    ]},
  ])},
  claude: { schemaVersion: 3, name: 'Claude Code', eyebrow: 'AGENTIC CODING GUIDE', introduction: 'ターミナルでコードを理解し、変更を進める方法を学べます。', categoryGroups: createCategoryGroups([
    ...commonDevelopment,
    { id: 'terminal', title: 'ターミナル', description: 'コマンドと権限管理', icon: '>_', items: [
      content('commands', 'コマンド実行', '目的と影響を理解してコマンドを実行します。', '調査、編集、検証に必要なコマンドを使い分け、結果を次の判断につなげます。', ['目的を確認する', '対象を限定する', '出力を読む']),
      content('permissions', '権限と安全性', '影響がある操作は対象を確認して許可します。', 'ファイル変更や外部アクセスでは、操作の範囲と必要性を確認することが重要です。', ['対象範囲を見る', '必要性を確認する', '重要な操作を慎重に扱う']),
      content('instructions', 'プロジェクト指示', '固有のルールを継続的に参照させます。', 'コーディング規約や確認方法を指示ファイルにまとめると、作業が安定します。', ['規約を簡潔にする', '必須確認を書く', '古い指示を更新する']),
    ]},
  ])},
}

const isServiceId = (id: AppId): id is ServiceId => id === 'codex' || id === 'chatgpt' || id === 'claude' || id === 'ai-desktop'

function resolveAccountName(cognitoUsername: string, name?: string, preferredUsername?: string, email?: string) {
  const normalizedName = name?.trim()
  if (normalizedName) return normalizedName
  const normalizedPreferredUsername = preferredUsername?.trim()
  if (normalizedPreferredUsername) return normalizedPreferredUsername
  return email?.split('@', 1)[0]?.trim() || cognitoUsername
}

function AppIcon({ id, size = 'large' }: { id: AppId; size?: 'small' | 'large' }) {
  const app = apps.find((candidate) => candidate.id === id)!
  return <span className={`ad-app-icon ${size}`} style={{ '--app-color': app.color } as CSSProperties}>{app.mark}</span>
}

const allCategories = (service: ServiceConfig) => service.categoryGroups.flatMap((group) => group.categories)
const withCategoryGlossary = (blocks: ContentBlock[], glossary: GlossaryEntry[] = []): ContentBlock[] => glossary.length ? [...blocks, { id: 'category-glossary', type: 'glossary', data: { entries: glossary } }] : blocks
const collectLegacyGlossary = (blocks: ContentBlock[]): GlossaryEntry[] => blocks.flatMap((block) => block.type === 'glossary' ? block.data.entries : block.type === 'columns' ? collectLegacyGlossary([...block.data.left, ...block.data.right]) : [])
const withoutLeafGlossary = (blocks: LeafBlock[]): LeafBlock[] => blocks.filter((block) => block.type !== 'glossary')
const withoutPageGlossary = (blocks: ContentBlock[]): ContentBlock[] => blocks.flatMap((block): ContentBlock[] => block.type === 'glossary' ? [] : block.type === 'columns' ? [{ ...block, data: { left: withoutLeafGlossary(block.data.left), right: withoutLeafGlossary(block.data.right) } }] : [block])
const normalizeTableWidths = (blocks: ContentBlock[]): ContentBlock[] => blocks.map((block): ContentBlock => block.type === 'table' ? { ...block, data: { ...block.data, columns: block.data.columns.map((column) => ({ ...column, width: Math.min(100, Math.max(10, Math.round(column.width))) })) } } : block.type === 'columns' ? { ...block, data: { left: normalizeTableWidths(block.data.left) as LeafBlock[], right: normalizeTableWidths(block.data.right) as LeafBlock[] } } : block)
const withAutomaticPageLayout = (item: ContentItem): ContentItem => { const next = { ...item }; delete next.pageWidth; return next }
const initialCategoryGlossary = (category: Category): GlossaryEntry[] => [...new Map([...(category.glossary ?? []), ...category.items.flatMap((item) => collectLegacyGlossary(item.blocks))].map((entry) => [entry.id, entry])).values()]
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const validGlossaryEntries = (value: unknown) => Array.isArray(value) && value.every((entry) => isRecord(entry) && typeof entry.id === 'string' && typeof entry.term === 'string' && typeof entry.description === 'string')
const badgeTones = new Set(['neutral', 'info', 'success', 'warning', 'danger'])
const diagramKinds = new Set(['flowchart', 'sequence', 'architecture', 'er', 'state'])
const validBadges = (value: unknown, max: number) => value === undefined || (Array.isArray(value) && value.length <= max && value.every((badge) => isRecord(badge) && typeof badge.id === 'string' && typeof badge.label === 'string' && badgeTones.has(String(badge.tone))))
const importedGlossary = (value: unknown): GlossaryEntry[] | null => {
  if (!Array.isArray(value) || !value.every((entry) => isRecord(entry) && (entry.id === undefined || typeof entry.id === 'string') && typeof entry.term === 'string' && typeof entry.description === 'string')) return null
  const importedAt = Date.now()
  return value.map((entry, index) => {
    const record = entry as Record<string, unknown>
    const id = typeof record.id === 'string' && record.id.trim() ? record.id : `term-import-${importedAt}-${index + 1}`
    return { id, term: String(record.term), description: String(record.description) }
  })
}
const validImportedBlocks = (value: unknown, nested = false): value is ContentBlock[] => Array.isArray(value) && value.every((candidate) => {
  if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.type !== 'string' || !isRecord(candidate.data)) return false
  const data = candidate.data
  switch (candidate.type) {
    case 'heading': return typeof data.text === 'string' && (data.level === 1 || data.level === 2 || data.level === 3)
    case 'text': return typeof data.text === 'string'
    case 'image': return typeof data.imageId === 'string' && typeof data.url === 'string' && typeof data.alt === 'string' && typeof data.caption === 'string'
    case 'code': return typeof data.code === 'string' && typeof data.language === 'string'
    case 'checklist': return Array.isArray(data.items) && data.items.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.text === 'string')
    case 'callout': return typeof data.text === 'string' && (data.tone === 'info' || data.tone === 'warning' || data.tone === 'tip')
    case 'divider': case 'toc': return true
    case 'link': return typeof data.label === 'string' && typeof data.url === 'string'
    case 'glossary': return validGlossaryEntries(data.entries)
    case 'card': return (data.columns === 1 || data.columns === 2 || data.columns === 3) && Array.isArray(data.items) && data.items.length <= 12 && data.items.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.description === 'string' && validBadges(item.badges, 4) && (item.link === undefined || (isRecord(item.link) && typeof item.link.label === 'string' && typeof item.link.url === 'string')))
    case 'steps': return Array.isArray(data.items) && data.items.length <= 20 && data.items.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.text === 'string' && validBadges(item.badges, 3))
    case 'diagram': return !nested && diagramKinds.has(String(data.kind)) && typeof data.title === 'string' && typeof data.source === 'string' && diagramKindMatchesSource(String(data.kind) as DiagramKind, data.source) && (data.caption === undefined || typeof data.caption === 'string')
    case 'table': { const columns = data.columns; const rows = data.rows; return Array.isArray(columns) && columns.length > 0 && columns.every((column) => isRecord(column) && typeof column.id === 'string' && typeof column.label === 'string' && typeof column.width === 'number' && Number.isFinite(column.width) && column.width > 0) && Array.isArray(rows) && rows.every((row) => isRecord(row) && typeof row.id === 'string' && Array.isArray(row.cells) && row.cells.length === columns.length && row.cells.every((cell) => typeof cell === 'string')) && (data.rowHeight === 'compact' || data.rowHeight === 'standard' || data.rowHeight === 'comfortable') && (data.tableWidth === undefined || (typeof data.tableWidth === 'number' && data.tableWidth >= 100 && data.tableWidth <= 300)) }
    case 'columns': return !nested && validImportedBlocks(data.left, true) && validImportedBlocks(data.right, true)
    default: return false
  }
})
const importedContent = (value: unknown): ContentItem | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.navTitle !== 'string' || (value.pageWidth !== undefined && value.pageWidth !== 'standard' && value.pageWidth !== 'wide' && value.pageWidth !== 'compact') || !validImportedBlocks(value.blocks)) return null
  return value as unknown as ContentItem
}
const validateContentDiagrams = async (blocks: ContentBlock[]): Promise<boolean> => {
  for (const block of blocks) {
    if (block.type === 'diagram' && !await validateMermaidSource(block.data.kind as DiagramKind, block.data.source)) return false
    if (block.type === 'columns' && !await validateContentDiagrams([...block.data.left, ...block.data.right])) return false
  }
  return true
}

function ServiceHome({ service, mode, canEdit, onMode, onCategory, onAddCategory, onUpdateService }: { service: ServiceConfig; mode: ServiceMode; canEdit: boolean; onMode: (mode: ServiceMode) => void; onCategory: (id: string) => void; onAddCategory: (groupId: string) => void; onUpdateService: (service: ServiceConfig) => void }) {
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ groupId: string; categoryId: string | null } | null>(null)
  const longPressRef = useRef<{ timer: number; categoryId: string } | null>(null)
  const dragRef = useRef<string | null>(null)
  const dropTargetRef = useRef<{ groupId: string; categoryId: string | null } | null>(null)
  const suppressClickRef = useRef(false)
  useEffect(() => () => { if (longPressRef.current) window.clearTimeout(longPressRef.current.timer); document.body.classList.remove('ad-category-dragging') }, [])
  const updateGroup = (groupId: string, changes: Partial<CategoryGroup>) => onUpdateService({ ...service, categoryGroups: service.categoryGroups.map((group) => group.id === groupId ? { ...group, ...changes } : group) })
  const editGroup = (group: CategoryGroup) => { const title = window.prompt('グループ名', group.title); if (title === null || !title.trim()) return; const description = window.prompt('グループの説明', group.description); if (description === null) return; updateGroup(group.id, { title: title.trim(), description: description.trim() }) }
  const addGroup = () => { const title = window.prompt('新しいグループ名', '新しいグループ'); if (!title?.trim()) return; const description = window.prompt('グループの説明', ''); if (description === null) return; onUpdateService({ ...service, categoryGroups: [...service.categoryGroups, { id: `group-${Date.now()}`, title: title.trim(), description: description.trim(), categories: [] }] }) }
  const deleteGroup = (group: CategoryGroup) => { if (group.categories.length > 0) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.groupNotEmpty); return } if (window.confirm(`「${group.title}」を削除しますか？`)) onUpdateService({ ...service, categoryGroups: service.categoryGroups.filter((candidate) => candidate.id !== group.id) }) }
  const moveGroup = (index: number, direction: -1 | 1) => { const destination = index + direction; if (destination < 0 || destination >= service.categoryGroups.length) return; const groups = [...service.categoryGroups]; [groups[index], groups[destination]] = [groups[destination], groups[index]]; onUpdateService({ ...service, categoryGroups: groups }) }
  const finishCategoryDrag = () => { const categoryId = dragRef.current; const target = dropTargetRef.current; if (longPressRef.current) window.clearTimeout(longPressRef.current.timer); longPressRef.current = null; dragRef.current = null; setDraggedCategoryId(null); setDropTarget(null); dropTargetRef.current = null; document.body.classList.remove('ad-category-dragging'); if (categoryId) { suppressClickRef.current = true; window.setTimeout(() => { suppressClickRef.current = false }, 0) } if (!categoryId || !target || categoryId === target.categoryId) return; let movingCategory: Category | undefined; const groupsWithoutMoving = service.categoryGroups.map((group) => ({ ...group, categories: group.categories.filter((category) => { if (category.id === categoryId) { movingCategory = category; return false } return true }) })); if (!movingCategory) return; const nextGroups = groupsWithoutMoving.map((group) => { if (group.id !== target.groupId) return group; const categories = [...group.categories]; const targetIndex = target.categoryId ? categories.findIndex((category) => category.id === target.categoryId) : -1; categories.splice(targetIndex < 0 ? categories.length : targetIndex, 0, movingCategory!); return { ...group, categories } }); onUpdateService({ ...service, categoryGroups: nextGroups }) }
  const startCategoryPress = (event: React.PointerEvent, categoryId: string) => { if (mode !== 'edit' || !canEdit || event.button !== 0) return; const element = event.currentTarget as HTMLElement; element.setPointerCapture(event.pointerId); const timer = window.setTimeout(() => { dragRef.current = categoryId; setDraggedCategoryId(categoryId); document.body.classList.add('ad-category-dragging') }, 400); longPressRef.current = { timer, categoryId } }
  const moveCategoryPointer = (event: React.PointerEvent) => { if (!dragRef.current) return; event.preventDefault(); const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null; const categoryElement = element?.closest<HTMLElement>('[data-category-id]'); const groupElement = element?.closest<HTMLElement>('[data-group-id]'); const groupId = categoryElement?.dataset.groupId ?? groupElement?.dataset.groupId; if (groupId) { const target = { groupId, categoryId: categoryElement?.dataset.categoryId ?? null }; dropTargetRef.current = target; setDropTarget(target) } }
  const cancelPendingPress = () => { if (longPressRef.current && !dragRef.current) { window.clearTimeout(longPressRef.current.timer); longPressRef.current = null } }
  const openCategory = (categoryId: string) => { if (suppressClickRef.current) return; onCategory(categoryId) }
  return <div className="ad-app-content"><header className="ad-content-head"><div><p className="ad-eyebrow">{service.eyebrow}</p><h1>{service.name}</h1></div><div className="ad-home-controls">{canEdit && <div className="ad-mode-switch" aria-label="表示モード"><button className={mode === 'view' ? 'active' : ''} onClick={() => onMode('view')}>閲覧</button><button className={mode === 'edit' ? 'active' : ''} onClick={() => onMode('edit')}>編集</button></div>}{mode === 'view' && <label className="ad-search"><span>⌕</span><input aria-label={`${service.name}内を検索`} placeholder={`${service.name}内を検索`} /></label>}</div></header>{mode === 'edit' && canEdit && <div className="ad-edit-notice"><span>✎</span><div><strong>グループ・カテゴリ編集モード</strong><p>グループを整理し、カテゴリを長押しして移動・並び替えできます。</p></div><button onClick={addGroup}>＋ グループを追加</button></div>}<div className="ad-category-groups">{service.categoryGroups.map((group, groupIndex) => <section className={`ad-category-group ${dropTarget?.groupId === group.id && !dropTarget.categoryId ? 'drop-target' : ''}`} key={group.id} data-group-id={group.id}><header><div><span>{String(groupIndex + 1).padStart(2, '0')}</span><h2>{group.title}</h2><p>{group.description}</p></div>{mode === 'edit' && canEdit && <nav><button disabled={groupIndex === 0} onClick={() => moveGroup(groupIndex, -1)} aria-label="グループを上へ">↑</button><button disabled={groupIndex === service.categoryGroups.length - 1} onClick={() => moveGroup(groupIndex, 1)} aria-label="グループを下へ">↓</button><button onClick={() => editGroup(group)}>編集</button><button className="danger" onClick={() => deleteGroup(group)}>削除</button></nav>}</header><div className={`ad-category-grid ${mode === 'edit' && canEdit ? 'editing' : ''}`}>{group.categories.map((category) => <button className={`ad-category ${draggedCategoryId === category.id ? 'dragging' : ''} ${dropTarget?.categoryId === category.id && draggedCategoryId !== category.id ? 'drop-before' : ''}`} key={category.id} data-category-id={category.id} data-group-id={group.id} onPointerDown={(event) => startCategoryPress(event, category.id)} onPointerMove={moveCategoryPointer} onPointerUp={finishCategoryDrag} onPointerCancel={() => { cancelPendingPress(); finishCategoryDrag() }} onPointerLeave={cancelPendingPress} onClick={() => openCategory(category.id)}><span className="ad-category-icon">{category.icon}</span><span><strong>{category.title}</strong><small>{category.description}</small></span><span className="ad-arrow">{mode === 'edit' && canEdit ? '✎' : '›'}</span></button>)}{mode === 'edit' && canEdit && <button className="ad-category ad-category-add" onClick={() => onAddCategory(group.id)}><span className="ad-category-icon">＋</span><span><strong>カテゴリを追加</strong><small>{group.title}に新しいテーマを作成</small></span></button>}</div></section>)}</div></div>
}

function CategoryEditor({ serviceId, service, category, groupId, initialSelectedItemId, onBack, onView, onSave, onDelete }: { serviceId: ServiceId; service: ServiceConfig; category: Category; groupId: string; initialSelectedItemId: string | null; onBack: () => void; onView: (contentId: string | null) => void; onSave: (category: Category, targetGroupId: string) => Promise<void>; onDelete: () => void }) {
  const initialItemsRef = useRef(category.items.map((item) => withAutomaticPageLayout({ ...item, blocks: withoutPageGlossary(item.blocks) })))
  const initialGlossaryRef = useRef(initialCategoryGlossary(category))
  const initialItems = initialItemsRef.current
  const [title, setTitle] = useState(category.title)
  const [description, setDescription] = useState(category.description)
  const [icon, setIcon] = useState(category.icon)
  const [targetGroupId, setTargetGroupId] = useState(groupId)
  const [categorySettingsOpen, setCategorySettingsOpen] = useState(false)
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const [pageEditorOpen, setPageEditorOpen] = useState(true)
  const [glossary, setGlossary] = useState<GlossaryEntry[]>(initialGlossaryRef.current)
  const [items, setItems] = useState(initialItems)
  const itemsRef = useRef(initialItems)
  const savedSnapshotRef = useRef(JSON.stringify({ title: category.title, description: category.description, icon: category.icon, targetGroupId: groupId, glossary: initialGlossaryRef.current, items: initialItems }))
  const [selectedItemId, setSelectedItemId] = useState<string | null>(category.items.some((item) => item.id === initialSelectedItemId) ? initialSelectedItemId : category.items[0]?.id ?? null)
  const [saveState, setSaveState] = useState<'idle' | 'saving'>('idle')
  const [contentDraftRevisions, setContentDraftRevisions] = useState<Record<string, number>>({})
  const [draftDialogOpen, setDraftDialogOpen] = useState(false)
  const [draftHistory, setDraftHistory] = useState<AIDesktopDraftHistoryEntry[]>([])
  const [selectedDraftHistoryId, setSelectedDraftHistoryId] = useState<number | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftPreview, setDraftPreview] = useState<{ item: ContentItem; glossary: GlossaryEntry[] | null; contentId: string; revision: number; savedAt: number } | null>(null)
  const [includeAiPrompt, setIncludeAiPrompt] = useState(false)
  const selectedItem = items.find((candidate) => candidate.id === selectedItemId) ?? null
  const canSave = title.trim().length > 0
  const currentSnapshot = JSON.stringify({ title, description, icon, targetGroupId, glossary, items })
  const hasUnsavedChanges = currentSnapshot !== savedSnapshotRef.current
  const confirmLeave = () => !hasUnsavedChanges || window.confirm('変更内容が保存されていません。保存せずに移動しますか？')
  const backToCategories = () => { if (confirmLeave()) onBack() }
  const switchToView = () => { if (confirmLeave()) onView(selectedItemId) }
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasUnsavedChanges])
  const commitItems = (next: ContentItem[]) => { itemsRef.current = next; setItems(next) }
  const addItem = () => { const id = `item-${Date.now()}`; const nextItem = createContent(id, '新しいコンテンツ'); commitItems([...itemsRef.current, nextItem]); setSelectedItemId(id) }
  const updateItem = (nextItem: ContentItem) => commitItems(itemsRef.current.map((candidate) => candidate.id === nextItem.id ? nextItem : candidate))
  const deleteItem = () => { if (!selectedItemId || !window.confirm('このコンテンツを削除しますか？')) return; const currentItems = itemsRef.current; const index = currentItems.findIndex((candidate) => candidate.id === selectedItemId); const nextItems = currentItems.filter((candidate) => candidate.id !== selectedItemId); commitItems(nextItems); setSelectedItemId(nextItems[Math.min(index, nextItems.length - 1)]?.id ?? null) }
  const updateGlossary = (index: number, changes: Partial<GlossaryEntry>) => setGlossary((current) => current.map((entry, candidateIndex) => candidateIndex === index ? { ...entry, ...changes } : entry))
  const addGlossaryEntry = () => { setGlossary((current) => [...current, { id: `term-${Date.now()}`, term: '', description: '' }]); setGlossaryOpen(true) }
  const currentContentPayload = () => selectedItem ? { format: 'hundred-ai-desktop-content', version: 1, target: { serviceId, categoryId: category.id, contentId: selectedItem.id, source: 'published', databaseTarget: import.meta.env.DEV ? 'local' : 'remote' }, instructions: ['content内の文章とブロックを編集し、id・type・data構造を維持してください。', 'glossaryはカテゴリ共通の用語一覧です。必要な用語の追加・編集・削除ができます。各用語は重複しないid、term、descriptionを維持してください。', 'カテゴリ名、説明、所属グループ、アイコンなどのカテゴリ設定は変更しないでください。', 'ページ幅はウィンドウに合わせて自動調整されます。pageWidthは設定しないでください。', 'calloutのtoneはinfo・warning・tip、表の列widthは10〜100です。'], glossary, content: withAutomaticPageLayout({ ...selectedItem, blocks: normalizeTableWidths(withoutPageGlossary(selectedItem.blocks)) }) } : null
  const refreshDraftHistory = async () => { if (!selectedItem) { setDraftHistory([]); setSelectedDraftHistoryId(null); return [] } const { history } = await listAIDesktopContentDraftHistory(serviceId, category.id, selectedItem.id); setDraftHistory(history); setSelectedDraftHistoryId((current) => history.some((entry) => entry.id === current && entry.hasPreview) ? current : history.find((entry) => entry.hasPreview)?.id ?? null); return history }
  const openDraftDialog = async () => { setDraftDialogOpen(true); setDraftBusy(true); try { await refreshDraftHistory() } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.draft.historyLoadFailed)) } finally { setDraftBusy(false) } }
  const saveContentDraft = async () => { const payload = currentContentPayload(); if (!selectedItem || !payload) return; setDraftBusy(true); try { if (!await validateContentDiagrams(selectedItem.blocks)) throw new Error('Mermaid構文が正しくない技術図があります。構文プレビューを確認してください。'); const { draft } = await saveAIDesktopContentDraft('content', serviceId, category.id, payload, selectedItem.id, contentDraftRevisions[selectedItem.id] || undefined); setContentDraftRevisions((current) => ({ ...current, [selectedItem.id]: draft.revision })); await refreshDraftHistory(); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.draft.saved(draft.revision)) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.draft.saveFailed)) } finally { setDraftBusy(false) } }
  const readDraftHistory = async (entry: AIDesktopDraftHistoryEntry) => { const { history } = await getAIDesktopContentDraftHistory<unknown>(serviceId, category.id, entry.id); if (!isRecord(history.payload) || history.payload.format !== 'hundred-ai-desktop-content' || history.payload.version !== 1) throw new Error('FORMAT'); const item = importedContent(history.payload.content); if (!item) throw new Error('CONTENT'); const previewGlossary = history.payload.glossary === undefined ? null : importedGlossary(history.payload.glossary); if (history.payload.glossary !== undefined && !previewGlossary) throw new Error('GLOSSARY'); return { item: { ...item, blocks: normalizeTableWidths(withoutPageGlossary(item.blocks)) }, glossary: previewGlossary, contentId: history.contentId, revision: history.revision, savedAt: history.savedAt } }
  const previewDraftHistory = async (entry: AIDesktopDraftHistoryEntry) => { if (!entry.hasPreview) return; setSelectedDraftHistoryId(entry.id); setDraftBusy(true); try { setDraftPreview(await readDraftHistory(entry)) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.draft.previewFailed)) } finally { setDraftBusy(false) } }
  const applyDraft = (draft: { item: ContentItem; glossary: GlossaryEntry[] | null; contentId: string; revision: number; savedAt: number }) => { updateItem({ ...draft.item, id: draft.contentId }); if (draft.glossary) setGlossary(draft.glossary); setSelectedItemId(draft.contentId); setContentDraftRevisions((current) => ({ ...current, [draft.contentId]: draft.revision })); setDraftPreview(null); setDraftDialogOpen(false); setPageEditorOpen(true); setSaveState('idle'); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.draft.applied(Boolean(draft.glossary))) }
  const applyDraftPreview = () => { if (draftPreview) applyDraft(draftPreview) }
  const applySelectedDraftHistory = async () => { const entry = draftHistory.find((candidate) => candidate.id === selectedDraftHistoryId && candidate.hasPreview); if (!entry) return; setDraftBusy(true); try { applyDraft(await readDraftHistory(entry)) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.draft.loadFailed)) } finally { setDraftBusy(false) } }
  const deleteDraftHistory = async () => { if (!selectedItem || !draftHistory.length || !window.confirm(`「${selectedItem.navTitle || '名称未設定'}」の下書き履歴をすべて削除しますか？\n現在の下書きは残り、次回の保存は第1版になります。`)) return; const contentId = selectedItem.id; setDraftBusy(true); try { await deleteAIDesktopContentDraftHistory(serviceId, category.id, contentId); setDraftHistory([]); setSelectedDraftHistoryId(null); setContentDraftRevisions((current) => ({ ...current, [contentId]: 0 })); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.draft.historyDeleted) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.draft.historyDeleteFailed)) } finally { setDraftBusy(false) } }
  const downloadContentTemplate = () => {
    if (!selectedItem) return
    const payload = { format: 'hundred-ai-desktop-content', version: 1, target: { serviceId, categoryId: category.id, contentId: selectedItem.id, source: 'published', databaseTarget: import.meta.env.DEV ? 'local' : 'remote' }, instructions: ['content内の文章やブロックを編集してください。', 'glossaryはカテゴリ共通の用語一覧です。必要な用語の追加・編集・削除ができます。各用語には重複しないidと、term、descriptionを必ず設定してください。', 'カテゴリ名、説明、所属グループ、アイコンなどのカテゴリ設定は変更しないでください。', 'ページ幅はウィンドウに合わせて自動調整されます。pageWidthは設定しないでください。', 'content.blocksへブロックを追加する場合はblockCatalog.templatesの構造見本を利用してください。', '使用できるtypeはblockCatalog.allowedTypesのみです。2カラム内ではblockCatalog.nestedAllowedTypesのみ使用できます。', 'blockCatalogのexample-で始まる見本IDは、重複しない新しいIDへ変更してください。2カラム内ではblockCatalog.nestedAllowedTypesだけを使用してください。', 'blockCatalogは参照情報であり、本文としてはインポートされません。', 'id、type、dataの構造は変更しないでください。', 'calloutのtoneは補足=info、注意=warning、ヒント=tipです。titleには内容固有の短い見出しを設定してください。', 'badgeは独立ブロックではありません。cardまたはstepsのitems内へ設定し、toneはneutral・info・success・warning・dangerから選んでください。', 'diagram.sourceにはdiagram.kindと一致する有効なMermaid構文を設定してください。diagramは2カラム内に配置できません。', '表の各列widthは10から100の範囲で設定してください。', '完成後、このJSONファイルをそのままインポートしてください。'], glossary, blockCatalog: createContentBlockCatalog(), content: withAutomaticPageLayout({ ...selectedItem, blocks: withoutPageGlossary(selectedItem.blocks) }) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${selectedItem.navTitle.trim().replace(/[\\/:*?"<>|]/g, '-') || 'content'}-template.json`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  const copyContentTarget = async () => {
    if (!selectedItem) return
    const targetJson = JSON.stringify({ target: { serviceId, categoryId: category.id, contentId: selectedItem.id, source: 'published', databaseTarget: import.meta.env.DEV ? 'local' : 'remote' } }, null, 2)
    const value = includeAiPrompt
      ? `HundredのAI Desktop資料を編集してください。

次の資料情報を使って、選択中コンテンツとカテゴリ共通の用語一覧（glossary）をDBから取得し、私の依頼に沿って編集してください。
取得したJSONのblockCatalogを参照し、blockCatalog.allowedTypesに含まれるブロックだけを使用してください。
ブロックを追加する場合はblockCatalog.templatesの構造を複製し、example-で始まる見本IDを重複しない新しいIDへ変更してください。2カラム内ではblockCatalog.nestedAllowedTypesだけを使用してください。
カテゴリ名、説明、所属グループ、アイコンなどのカテゴリ設定は変更しないでください。
用語はglossaryへ登録し、本文中の難しい語句と対応する説明を設定してください。
編集後はJSON、ブロック、glossaryの構造を検証し、正式公開データを直接変更せず、AI下書き履歴へ保存してください。
保存が完了したら、対象コンテンツ、用語の変更内容、保存した版数を報告してください。

${targetJson}

依頼内容:
（ここに作成・修正内容を記入してください）`
      : targetJson
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const textarea = document.createElement('textarea'); textarea.value = value; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove()
    }
    showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.content.targetCopied)
  }
  const importContentTemplate = () => {
    if (!selectedItem) return
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'application/json,.json'
    picker.onchange = () => {
      const file = picker.files?.[0]
      if (!file) return
      void file.text().then(async (text) => {
        const payload = JSON.parse(text) as unknown
        if (!isRecord(payload) || payload.format !== 'hundred-ai-desktop-content' || payload.version !== 1) throw new Error('FORMAT')
        const target = payload.target
        if (target !== undefined && (!isRecord(target) || typeof target.serviceId !== 'string' || typeof target.categoryId !== 'string' || typeof target.contentId !== 'string')) throw new Error('TARGET_FORMAT')
        if (isRecord(target) && (target.serviceId !== serviceId || target.categoryId !== category.id)) throw new Error(`TARGET_SCOPE:${target.serviceId}/${target.categoryId}`)
        const imported = importedContent(payload.content)
        if (!imported) throw new Error('CONTENT')
        if (!await validateContentDiagrams(imported.blocks)) throw new Error('MERMAID')
        const targetId = selectedItem.id
        const nextGlossary = payload.glossary === undefined ? null : importedGlossary(payload.glossary)
        if (payload.glossary !== undefined && !nextGlossary) throw new Error('GLOSSARY')
        const next = withAutomaticPageLayout({ ...imported, id: targetId, blocks: normalizeTableWidths(withoutPageGlossary(imported.blocks)) })
        updateItem(next)
        setSelectedItemId(targetId)
        if (nextGlossary) setGlossary(nextGlossary)
        setSaveState('idle')
        showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.draft.applied(Boolean(nextGlossary)))
      }).catch((error) => {
        if (error instanceof Error && error.message.startsWith('TARGET_SCOPE:')) {
          const actual = error.message.slice('TARGET_SCOPE:'.length)
          showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.differentTarget(actual, `${serviceId}/${category.id}`))
          return
        }
        showAIDesktopNotification('error', error instanceof Error && error.message === 'TARGET_FORMAT' ? AI_DESKTOP_MESSAGES.content.invalidTarget : error instanceof Error && error.message === 'MERMAID' ? AI_DESKTOP_MESSAGES.content.mermaidImportInvalid : AI_DESKTOP_MESSAGES.content.invalidTemplate)
      })
    }
    picker.click()
  }
  const save = async () => {
    setSaveState('saving')
    try {
      for (const item of itemsRef.current) if (!await validateContentDiagrams(item.blocks)) throw new Error('MERMAID')
      const nextGlossary = glossary.filter((entry) => entry.term.trim() || entry.description.trim())
      const nextItems = itemsRef.current.map((item) => withAutomaticPageLayout({ ...item, navTitle: item.navTitle.trim() || '名称未設定', blocks: normalizeTableWidths(withoutPageGlossary(item.blocks)) }))
      const nextCategory = { ...category, title: title.trim(), description: description.trim(), icon: icon.trim() || '◫', glossary: nextGlossary, items: nextItems }
      await onSave(nextCategory, targetGroupId)
      setTitle(nextCategory.title)
      setDescription(nextCategory.description)
      setIcon(nextCategory.icon)
      setGlossary(nextGlossary)
      commitItems(nextItems)
      savedSnapshotRef.current = JSON.stringify({ title: nextCategory.title, description: nextCategory.description, icon: nextCategory.icon, targetGroupId, glossary: nextGlossary, items: nextItems })
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.content.saved)
    } catch (error) {
      if (error instanceof Error && error.message === 'MERMAID') showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.content.mermaidInvalid)
    } finally {
      setSaveState('idle')
    }
  }
  return <div className="ad-category-editor"><header className="ad-content-head ad-category-editor-head"><div><p className="ad-eyebrow">{service.name.toUpperCase()} / PAGE EDITOR</p><h1>カテゴリを編集</h1></div><div className="ad-home-controls"><div className="ad-mode-switch" aria-label="詳細カテゴリの表示モード"><button type="button" onClick={switchToView}>閲覧</button><button type="button" className="active" aria-current="page">編集</button></div><button type="button" className="ad-editor-header-back" onClick={backToCategories}>一覧へ戻る</button><button type="button" className="ad-editor-header-delete" onClick={onDelete}>カテゴリを削除</button><button type="button" className="ad-editor-header-save" disabled={!canSave || saveState === 'saving'} onClick={() => void save()}>{saveState === 'saving' ? '保存中…' : 'DBへ保存'}</button></div></header><section className={`ad-category-settings ${categorySettingsOpen ? 'open' : ''}`}><button type="button" className="ad-category-settings-toggle" aria-expanded={categorySettingsOpen} onClick={() => setCategorySettingsOpen((current) => !current)}><span><strong>カテゴリ設定</strong><small>{title.trim() || 'カテゴリ名未設定'} ・ {service.categoryGroups.find((group) => group.id === targetGroupId)?.title ?? '所属グループ未設定'}</small></span><i>{categorySettingsOpen ? '−' : '＋'}</i></button>{categorySettingsOpen && <div className="ad-editor-grid"><section className="ad-editor-form"><label><span>カテゴリ名</span><input value={title} maxLength={32} onChange={(event) => setTitle(event.target.value)} /></label><label><span>短い説明</span><input value={description} maxLength={60} onChange={(event) => setDescription(event.target.value)} /></label><label><span>所属グループ</span><select value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)}>{service.categoryGroups.map((group) => <option value={group.id} key={group.id}>{group.title}</option>)}</select></label><label><span>アイコン</span><input value={icon} maxLength={3} onChange={(event) => setIcon(event.target.value)} /></label></section><aside className="ad-editor-preview"><span>カテゴリプレビュー</span><div className="ad-category"><i className="ad-category-icon">{icon || '◫'}</i><div><strong>{title || 'カテゴリ名'}</strong><small>{description || 'カテゴリの説明'}</small></div><b className="ad-arrow">✎</b></div><p>詳細画面には {items.length} 件のコンテンツが表示されます。</p></aside></div>}</section><section className={`ad-category-settings ad-category-glossary-settings ${glossaryOpen ? 'open' : ''}`}><button type="button" className="ad-category-settings-toggle" aria-expanded={glossaryOpen} onClick={() => setGlossaryOpen((current) => !current)}><span><strong>用語編集</strong><small>{glossary.length ? `${glossary.length}件の用語` : '用語は登録されていません'}</small></span><i>{glossaryOpen ? '−' : '＋'}</i></button>{glossaryOpen && <div className="ad-category-glossary-editor"><p>カテゴリ内の全ページで用語を自動リンクします。</p>{glossary.map((entry, index) => <div className="ad-category-glossary-row" key={entry.id}><label><span>用語</span><input value={entry.term} placeholder="例: SDK" onChange={(event) => updateGlossary(index, { term: event.target.value })} /></label><label><span>説明</span><textarea value={entry.description} placeholder="用語の説明を入力してください。" onChange={(event) => updateGlossary(index, { description: event.target.value })} /></label><button type="button" aria-label={`${entry.term || '用語'}を削除`} onClick={() => setGlossary((current) => current.filter((_, candidateIndex) => candidateIndex !== index))}>×</button></div>)}<button type="button" className="ad-glossary-add" onClick={addGlossaryEntry}>＋ 用語を追加</button></div>}</section><section className={`ad-item-editor ${pageEditorOpen ? 'open' : ''}`}><header><button type="button" className="ad-item-editor-toggle" aria-expanded={pageEditorOpen} onClick={() => setPageEditorOpen((current) => !current)}><span><h2>ページ編集</h2><p>{pageEditorOpen ? 'ブロックの追加、編集、削除、並び替えができます。' : `${items.length}件のコンテンツ`}</p></span><i>{pageEditorOpen ? '−' : '＋'}</i></button>{pageEditorOpen && selectedItem && <div className="ad-content-exchange ad-content-exchange--header"><button type="button" className="draft-save" disabled={draftBusy} onClick={() => void saveContentDraft()}>AI下書きに保存</button><button type="button" className="draft-history" disabled={draftBusy} onClick={() => void openDraftDialog()}>AI下書きを開く</button><details className="ad-draft-help"><summary aria-label="AI下書きについて">?</summary><div><strong>AI下書きとは</strong><p>正式公開前の編集内容を、版ごとに保存して確認・復元する機能です。「DBへ保存」を押すまで公開内容は変更されません。</p></div></details><div className={`ad-copy-content-control ${includeAiPrompt ? 'with-prompt' : ''}`} role="group" aria-label="資料情報のコピー"><label><input type="checkbox" checked={includeAiPrompt} onChange={(event) => setIncludeAiPrompt(event.target.checked)} /><span>AI用プロンプト付き</span></label><button type="button" onClick={() => void copyContentTarget()}>資料情報をコピー<span aria-hidden="true">⧉</span></button></div><button type="button" onClick={downloadContentTemplate}>雛形をダウンロード</button><button type="button" onClick={importContentTemplate}>JSONをインポート</button></div>}{pageEditorOpen && <button type="button" className="ad-add-content" onClick={addItem}>＋ コンテンツを追加</button>}</header>{pageEditorOpen && <div className="ad-item-editor-grid"><div className="ad-item-list">{items.length === 0 ? <p>コンテンツがありません。</p> : items.map((candidate, index) => <button key={candidate.id} className={candidate.id === selectedItemId ? 'active' : ''} onClick={() => setSelectedItemId(candidate.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{candidate.navTitle || '名称未設定'}</strong><i>›</i></button>)}</div><div className="ad-item-fields">{selectedItem ? <><ContentCanvas item={selectedItem} onChange={updateItem} /><div className="ad-item-meta"><span>識別子</span><code>{selectedItem.id}</code></div><button className="danger" onClick={deleteItem}>このコンテンツを削除</button></> : <div className="ad-item-empty"><span>＋</span><p>コンテンツを追加すると、ここでページを編集できます。</p></div>}</div></div>}</section>{draftDialogOpen && <div className="ad-draft-dialog-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !draftBusy) setDraftDialogOpen(false) }}><section className="ad-draft-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-draft-dialog-title"><header><div><span>AI DRAFT</span><h2 id="ad-draft-dialog-title">AI下書き</h2><p>対象: {selectedItem?.navTitle || 'コンテンツ未選択'}</p></div><button type="button" aria-label="閉じる" disabled={draftBusy} onClick={() => setDraftDialogOpen(false)}>×</button></header><div className="ad-draft-history"><div className="ad-draft-history-heading"><strong>直近の保存履歴</strong><button type="button" disabled={draftBusy || draftHistory.length === 0} onClick={() => void deleteDraftHistory()}>履歴をすべて削除</button></div>{draftBusy && draftHistory.length === 0 ? <p>読み込み中…</p> : draftHistory.length === 0 ? <p>下書き保存の履歴はありません。</p> : <ol>{draftHistory.map((entry) => <li className={entry.id === selectedDraftHistoryId ? 'selected' : ''} key={entry.id}><button type="button" className="ad-draft-history-preview" aria-pressed={entry.id === selectedDraftHistoryId} disabled={draftBusy || !entry.hasPreview} onClick={() => void previewDraftHistory(entry)}><time>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(entry.savedAt)}</time><span>{entry.contentTitle}</span><small>{entry.hasPreview ? entry.id === selectedDraftHistoryId ? `選択中・第${entry.revision}版` : `第${entry.revision}版をプレビュー ›` : 'プレビュー情報なし'}</small></button></li>)}</ol>}</div><footer><button type="button" className="load" disabled={draftBusy || !selectedDraftHistoryId} onClick={() => void applySelectedDraftHistory()}>編集画面に反映</button></footer></section></div>}{draftPreview && <div className="ad-content-preview-overlay ad-draft-preview-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setDraftPreview(null) }}><section className="ad-content-preview-dialog ad-draft-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-draft-preview-title"><header><div><span>DRAFT HISTORY · 第{draftPreview.revision}版 · {new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(draftPreview.savedAt)}</span><h2 id="ad-draft-preview-title">{draftPreview.item.navTitle || '名称未設定'}</h2></div><button type="button" aria-label="履歴プレビューを閉じる" onClick={() => setDraftPreview(null)}>×</button></header><div className="ad-draft-preview-body"><div className="ad-article-stage"><article className="ad-article"><p className="ad-breadcrumb">{service.name} / {title.trim() || 'カテゴリ名'} / 保存履歴</p>{draftPreview.item.blocks.length ? draftPreview.item.blocks.map((block) => <BlockRenderer block={block} pageBlocks={withCategoryGlossary(draftPreview.item.blocks, draftPreview.glossary ?? glossary)} key={block.id} />) : <div className="ad-empty-page"><p>この履歴にはブロックがありません。</p></div>}</article><ContentTableOfContents blocks={withCategoryGlossary(draftPreview.item.blocks, draftPreview.glossary ?? glossary)} /></div></div><footer className="ad-draft-preview-actions"><p>コンテンツと用語を反映した後、編集画面の「DBへ保存」で正式反映できます。</p><button type="button" onClick={() => setDraftPreview(null)}>閉じる</button><button type="button" className="apply" onClick={applyDraftPreview}>編集画面へ反映</button></footer></section></div>}</div>
}

function CategoryDetail({ service, category, selectedId, canEdit, onBack, onSelect, onMode }: { service: ServiceConfig; category: Category; selectedId: string; canEdit: boolean; onBack: () => void; onSelect: (id: string) => void; onMode: (mode: ServiceMode) => void }) {
  const selected = category.items.find((candidate) => candidate.id === selectedId) ?? category.items[0]
  const articleStageRef = useRef<HTMLDivElement>(null)
  const [imageCopyState, setImageCopyState] = useState<'idle' | 'copying'>('idle')
  const copyPageImage = async () => {
    if (!selected || !articleStageRef.current || imageCopyState === 'copying') return
    setImageCopyState('copying')
    try {
      await copyArticleImage(articleStageRef.current)
      setImageCopyState('idle')
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.content.imageCopied)
    } catch (error) {
      setImageCopyState('idle')
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.content.imageCopyFailed))
    }
  }
  if (!selected) return <div className="ad-article-layout"><aside className="ad-sidebar"><button className="ad-back" onClick={onBack}>← カテゴリ一覧へ戻る</button>{canEdit && <div className="ad-mode-switch ad-detail-view-switch" aria-label="詳細カテゴリの表示モード"><button type="button" className="active" aria-current="page">閲覧</button><button type="button" onClick={() => onMode('edit')}>編集</button></div>}<p className="ad-sidebar-service">{service.name}</p><h2>{category.title}</h2></aside><section className="ad-content-empty"><span>□</span><h1>コンテンツがありません</h1><p>編集モードでコンテンツを追加してください。</p><button onClick={onBack}>カテゴリ一覧へ</button></section></div>
  return <div className="ad-article-layout"><aside className="ad-sidebar"><button className="ad-back" onClick={onBack}>← カテゴリ一覧へ戻る</button>{canEdit && <div className="ad-mode-switch ad-detail-view-switch" aria-label="詳細カテゴリの表示モード"><button type="button" className="active" aria-current="page">閲覧</button><button type="button" onClick={() => onMode('edit')}>編集</button></div>}<button type="button" className="ad-copy-page-image" disabled={imageCopyState === 'copying'} onClick={() => void copyPageImage()}>{imageCopyState === 'copying' ? '画像を作成中…' : 'ページを画像コピー'}<span aria-hidden="true">⧉</span></button><p className="ad-sidebar-service">{service.name}</p><h2>{category.title}</h2><nav>{category.items.map((candidate) => <button key={candidate.id} className={candidate.id === selected.id ? 'active' : ''} aria-current={candidate.id === selected.id ? 'page' : undefined} onClick={() => onSelect(candidate.id)}>{candidate.navTitle}{candidate.id === selected.id && <span>●</span>}</button>)}</nav></aside><div ref={articleStageRef} className="ad-article-stage" key={selected.id}><article className="ad-article"><p className="ad-breadcrumb">{service.name} / {category.title}</p>{selected.blocks.length ? selected.blocks.map((block) => <BlockRenderer block={block} pageBlocks={withCategoryGlossary(selected.blocks, category.glossary)} key={block.id} />) : <div className="ad-empty-page"><p>このページにはまだブロックがありません。</p></div>}<div className="ad-learning-nav"><button onClick={onBack}>カテゴリ一覧へ</button><span>{category.items.findIndex((candidate) => candidate.id === selected.id) + 1} / {category.items.length}</span></div></article><ContentTableOfContents blocks={withCategoryGlossary(selected.blocks, category.glossary)} /></div></div>
}

function ServiceContent({ serviceId, service, mode, canEdit, navigation, onMode, onChange, onAddCategory, onUpdateService, onSaveCategory, onDelete }: { serviceId: ServiceId; service: ServiceConfig; mode: ServiceMode; canEdit: boolean; navigation: ServiceNavigation; onMode: (mode: ServiceMode) => void; onChange: (next: ServiceNavigation) => void; onAddCategory: (groupId: string) => void; onUpdateService: (service: ServiceConfig) => void; onSaveCategory: (category: Category, sourceGroupId: string, targetGroupId: string) => Promise<void>; onDelete: (categoryId: string) => void }) {
  const categories = allCategories(service)
  const category = categories.find((candidate) => candidate.id === navigation.categoryId)
  const group = service.categoryGroups.find((candidate) => candidate.categories.some((item) => item.id === navigation.categoryId))
  if (!category || !group) return <ServiceHome service={service} mode={canEdit ? mode : 'view'} canEdit={canEdit} onMode={onMode} onAddCategory={onAddCategory} onUpdateService={onUpdateService} onCategory={(categoryId) => { const next = categories.find((candidate) => candidate.id === categoryId)!; onChange({ categoryId, contentId: mode === 'view' || !canEdit ? next.items[0]?.id ?? null : null }) }} />
  if (mode === 'edit' && canEdit) return <CategoryEditor key={category.id} serviceId={serviceId} service={service} category={category} groupId={group.id} initialSelectedItemId={navigation.contentId} onBack={() => onChange({ categoryId: null, contentId: null })} onView={(contentId) => { onChange({ categoryId: category.id, contentId }); onMode('view') }} onSave={(next, targetGroupId) => onSaveCategory(next, group.id, targetGroupId)} onDelete={() => onDelete(category.id)} />
  return <CategoryDetail service={service} category={category} selectedId={navigation.contentId ?? category.items[0]?.id ?? ''} canEdit={canEdit} onMode={onMode} onBack={() => onChange({ categoryId: null, contentId: null })} onSelect={(contentId) => onChange({ categoryId: category.id, contentId })} />
}

function GenericContent({ id, canEdit, customApps, visibility, onTheme, onSaveApps }: { id: Exclude<AppId, ServiceId>; canEdit: boolean; customApps: AIDesktopCustomApp[]; visibility: Record<string, boolean>; onTheme: () => void; onSaveApps: (apps: AIDesktopCustomApp[], visibility: Record<string, boolean>) => void }) {
  if (id === 'settings') return <div className="ad-generic"><p className="ad-eyebrow">PERSONALIZE</p><h1>設定</h1><div className="ad-setting-row"><div><strong>カラーモード</strong><p>デスクトップとウィンドウの表示を切り替え、DBへ保存します。</p></div><button onClick={onTheme}>ライト / ダークを切り替え</button></div><div className="ad-setting-row"><div><strong>壁紙</strong><p>現在の壁紙: Aurora</p></div><span className="ad-wallpaper-chip" /></div></div>
  return <ImageExplorer canManage={canEdit} builtInApps={apps} customApps={customApps} visibility={visibility} onSaveApps={onSaveApps} />
}

function AIDesktopPage() {
  const navigate = useNavigate()
  const { openAppleIntelligence } = useHundredAppleIntelligence()
  const [windows, setWindows] = useState<WindowState[]>([])
  const [active, setActive] = useState<AppId | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [taskbarVisible, setTaskbarVisible] = useState(true)
  const [taskbarPeekOpen, setTaskbarPeekOpen] = useState(false)
  const [layoutEditing, setLayoutEditing] = useState(false)
  const [desktopIconPositions, setDesktopIconPositions] = useState<Record<AppId, DesktopIconPosition>>(defaultDesktopIconPositions)
  const [customApps, setCustomApps] = useState<AIDesktopCustomApp[]>([])
  const [desktopAppVisibility, setDesktopAppVisibility] = useState<Record<string, boolean>>({})
  const [dark, setDark] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [accountName, setAccountName] = useState('Guest User')
  const [catalog, setCatalog] = useState<Record<ServiceId, ServiceConfig>>(serviceCatalog)
  const [serviceModes, setServiceModes] = useState<Record<ServiceId, ServiceMode>>({ codex: 'view', chatgpt: 'view', claude: 'view', 'ai-desktop': 'view' })
  const [serviceNavigation, setServiceNavigation] = useState<Record<ServiceId, ServiceNavigation>>({ codex: { categoryId: null, contentId: null }, chatgpt: { categoryId: null, contentId: null }, claude: { categoryId: null, contentId: null }, 'ai-desktop': { categoryId: null, contentId: null } })
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [changingAccount, setChangingAccount] = useState(false)
  const zRef = useRef(2)
  const draggedDesktopIconRef = useRef<AppId | null>(null)
  const hiddenTaskbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => { let active = true; const syncAccount = async () => { try { const [user, session] = await Promise.all([getCurrentUser(), fetchAuthSession()]); const claims = session.tokens?.idToken?.payload; const name = typeof claims?.name === 'string' ? claims.name : undefined; const preferredUsername = typeof claims?.preferred_username === 'string' ? claims.preferred_username : undefined; const email = typeof claims?.email === 'string' ? claims.email : undefined; if (!active) return; setCanEdit(Boolean(session.tokens?.accessToken)); setAccountName(resolveAccountName(user.username, name, preferredUsername, email)) } catch { if (!active) return; setCanEdit(false); setAccountName('Guest User') } }; void syncAccount(); return () => { active = false } }, [])
  useEffect(() => { if (!accountDialogOpen) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !changingAccount) setAccountDialogOpen(false) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [accountDialogOpen, changingAccount])
  useEffect(() => {
    if (!taskbarPeekOpen) return
    const closePeek = (event: PointerEvent) => { if (!hiddenTaskbarRef.current?.contains(event.target as Node)) setTaskbarPeekOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setTaskbarPeekOpen(false) }
    document.addEventListener('pointerdown', closePeek, true)
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closePeek, true); window.removeEventListener('keydown', closeOnEscape) }
  }, [taskbarPeekOpen])
  useEffect(() => { let active = true; void getAIDesktopCatalogs<unknown>().then(({ catalogs }) => { if (!active) return; setCatalog((current) => ({ chatgpt: normalizeServiceConfig(catalogs.chatgpt, current.chatgpt), codex: normalizeServiceConfig(catalogs.codex, current.codex), claude: normalizeServiceConfig(catalogs.claude, current.claude), 'ai-desktop': normalizeServiceConfig(catalogs['ai-desktop'], current['ai-desktop']) })) }).catch(() => { /* Local API未起動時は初期データを表示する。 */ }); return () => { active = false } }, [])
  useEffect(() => { let active = true; void getAIDesktopState().then(({ state }) => { if (!active || !state) return; const saved = state.iconPositions as Partial<Record<AppId, DesktopIconPosition>>; const positions = { ...defaultDesktopIconPositions, ...saved }; if (!saved['ai-desktop'] && saved.explorer?.x === 18 && saved.explorer.y === 294 && saved.settings?.x === 18 && saved.settings.y === 386) { positions.explorer = defaultDesktopIconPositions.explorer; positions.settings = defaultDesktopIconPositions.settings } setDesktopIconPositions(positions); setTaskbarVisible(state.taskbarVisible); setDark(state.theme === 'dark'); setCustomApps(state.customApps ?? []); setDesktopAppVisibility(state.desktopAppVisibility ?? {}) }).catch(() => { /* マイグレーション前は既定配置を使用する。 */ }); return () => { active = false } }, [])
  const appById = useMemo(() => Object.fromEntries(apps.map((app) => [app.id, app])), [])

  const goToSignIn = async () => { setChangingAccount(true); try { try { await signOut() } catch { /* Guest session */ } endHundredGuestSession(); navigate('/', { replace: true }) } finally { setChangingAccount(false) } }
  const openApp = (id: AppId) => { zRef.current += 1; setWindows((current) => { const existing = current.find((win) => win.id === id); if (existing) return current.map((win) => win.id === id ? { ...win, minimized: false, z: zRef.current } : win); const offset = current.length * 28; return [...current, { id, x: 110 + offset, y: 62 + offset, width: Math.min(940, window.innerWidth - 150), height: Math.min(650, window.innerHeight - 120), minimized: false, maximized: false, z: zRef.current }] }); setActive(id); setStartOpen(false) }
  const focus = (id: AppId) => { zRef.current += 1; setActive(id); setWindows((current) => current.map((win) => win.id === id ? { ...win, z: zRef.current } : win)) }
  const update = (id: AppId, next: Partial<WindowState>) => setWindows((current) => current.map((win) => win.id === id ? { ...win, ...next } : win))
  const close = (id: AppId) => { setWindows((current) => current.filter((win) => win.id !== id)); if (active === id) setActive(null) }
  const persistService = async (id: ServiceId, next: ServiceConfig, afterSave?: () => void) => { try { await saveAIDesktopCatalog(id, next); setCatalog((current) => ({ ...current, [id]: next })); afterSave?.() } catch (error: unknown) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.content.saveFailed)); throw error } }
  const addCategory = (id: AppId, groupId: string) => { if (!isServiceId(id)) return; const categoryId = `category-${Date.now()}`; const nextCategory: Category = { id: categoryId, title: '新しいカテゴリ', description: 'カテゴリの説明を入力', icon: '＋', items: [content(`overview-${Date.now()}`, '概要', 'このカテゴリの概要です。')] }; setCatalog((current) => ({ ...current, [id]: { ...current[id], categoryGroups: current[id].categoryGroups.map((group) => group.id === groupId ? { ...group, categories: [...group.categories, nextCategory] } : group) } })); setServiceNavigation((current) => ({ ...current, [id]: { categoryId, contentId: null } })) }
  const updateService = (id: AppId, next: ServiceConfig) => { if (!isServiceId(id)) return; void persistService(id, next).catch(() => undefined) }
  const saveCategory = (id: AppId, category: Category, sourceGroupId: string, targetGroupId: string): Promise<void> => { if (!isServiceId(id)) return Promise.reject(new Error('INVALID_SERVICE')); const next = { ...catalog[id], categoryGroups: catalog[id].categoryGroups.map((group) => { const withoutCategory = group.categories.filter((candidate) => candidate.id !== category.id); return group.id === targetGroupId ? { ...group, categories: [...withoutCategory, category] } : group.id === sourceGroupId ? { ...group, categories: withoutCategory } : group }) }; return persistService(id, next) }
  const deleteCategory = (id: AppId, categoryId: string) => { if (!isServiceId(id) || !window.confirm('このカテゴリを削除しますか？')) return; const next = { ...catalog[id], categoryGroups: catalog[id].categoryGroups.map((group) => ({ ...group, categories: group.categories.filter((candidate) => candidate.id !== categoryId) })) }; void persistService(id, next, () => setServiceNavigation((current) => ({ ...current, [id]: { categoryId: null, contentId: null } }))).catch(() => undefined) }

  const persistDesktopState = (iconPositions: Record<AppId, DesktopIconPosition>, visible: boolean, theme: 'light' | 'dark' = dark ? 'dark' : 'light', nextCustomApps = customApps, nextVisibility = desktopAppVisibility) => { if (!canEdit) return; void saveAIDesktopState({ iconPositions, taskbarVisible: visible, theme, customApps: nextCustomApps, desktopAppVisibility: nextVisibility }).catch((error: unknown) => showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.app.settingsSaveFailed))) }
  const saveApps = (nextApps: AIDesktopCustomApp[], nextVisibility: Record<string, boolean>) => { setCustomApps(nextApps); setDesktopAppVisibility(nextVisibility); persistDesktopState(desktopIconPositions, taskbarVisible, dark ? 'dark' : 'light', nextApps, nextVisibility) }
  const openCustomApp = (app: AIDesktopCustomApp) => { window.open(app.url, '_blank', 'noopener,noreferrer'); setStartOpen(false) }
  const showDesktop = () => { setWindows((current) => current.map((win) => ({ ...win, minimized: true }))); setActive(null); setStartOpen(false) }
  const handleStart = () => { if (windows.some((win) => !win.minimized)) { showDesktop(); return } setStartOpen((current) => !current) }
  const hideTaskbar = () => { setTaskbarPeekOpen(false); setTaskbarVisible(false); persistDesktopState(desktopIconPositions, false) }
  const activatePeekApp = (win: WindowState) => { if (win.minimized) openApp(win.id); else focus(win.id); setTaskbarPeekOpen(false) }
  const toggleTheme = () => { const next = dark ? 'light' : 'dark'; setDark(next === 'dark'); persistDesktopState(desktopIconPositions, taskbarVisible, next) }
  const startDesktopIconDrag = (event: React.PointerEvent<HTMLButtonElement>, id: AppId) => { if (event.button !== 0 || window.innerWidth <= 760 || !canEdit || !layoutEditing) return; event.stopPropagation(); const startX = event.clientX; const startY = event.clientY; const origin = desktopIconPositions[id]; let moved = false; let latest = origin; const move = (moveEvent: PointerEvent) => { const deltaX = moveEvent.clientX - startX; const deltaY = moveEvent.clientY - startY; if (!moved && Math.hypot(deltaX, deltaY) < 4) return; moved = true; latest = { x: Math.max(0, Math.min(window.innerWidth - 92, origin.x + deltaX)), y: Math.max(0, Math.min(window.innerHeight - (taskbarVisible ? 48 : 0) - 84, origin.y + deltaY)) }; setDesktopIconPositions((current) => ({ ...current, [id]: latest })) }; const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); if (moved) { draggedDesktopIconRef.current = id; persistDesktopState({ ...desktopIconPositions, [id]: latest }, taskbarVisible) } }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop) }
  const selectDesktopIcon = (id: AppId) => { if (draggedDesktopIconRef.current === id) { draggedDesktopIconRef.current = null; return } setActive(id) }

  const startDrag = (event: React.PointerEvent, win: WindowState) => { if (win.maximized || (event.target as HTMLElement).closest('button')) return; focus(win.id); const startX = event.clientX; const startY = event.clientY; const originX = win.x; const originY = win.y; const move = (moveEvent: PointerEvent) => update(win.id, { x: Math.max(0, originX + moveEvent.clientX - startX), y: Math.max(0, originY + moveEvent.clientY - startY) }); const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop) }

  return <main className={`ai-desktop ${dark ? 'dark' : ''} ${taskbarVisible ? '' : 'taskbar-hidden'} ${layoutEditing ? 'layout-editing' : ''}`} onPointerDown={() => setStartOpen(false)}><AIDesktopNotifications /><div className="ad-wallpaper-orb one" /><div className="ad-wallpaper-orb two" /><section className="ad-desktop-icons" aria-label="デスクトップのアプリ">{apps.filter((app) => desktopAppVisibility[app.id] !== false).map((app) => <button key={app.id} style={{ left: desktopIconPositions[app.id].x, top: desktopIconPositions[app.id].y }} onPointerDown={(event) => startDesktopIconDrag(event, app.id)} onDoubleClick={() => { if (draggedDesktopIconRef.current !== app.id) openApp(app.id) }} onClick={() => selectDesktopIcon(app.id)} className={active === app.id ? 'selected' : ''}><AppIcon id={app.id} /><span>{app.name}</span></button>)}{customApps.filter((app) => desktopAppVisibility[app.id] !== false).map((app, index) => <button key={app.id} style={{ left: 110 + Math.floor(index / 6) * 92, top: 18 + (index % 6) * 92 }} onDoubleClick={() => openCustomApp(app)}><span className="ad-app-icon large" style={{ '--app-color': app.color } as CSSProperties}>{app.mark}</span><span>{app.name}</span></button>)}</section>
    {windows.filter((win) => !win.minimized).map((win) => <section key={win.id} className={`ad-window ${active === win.id ? 'active' : ''} ${win.maximized ? 'maximized' : ''}`} style={win.maximized ? { zIndex: win.z } : { left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.z }} onPointerDown={(event) => { event.stopPropagation(); focus(win.id) }}><header className="ad-titlebar" onPointerDown={(event) => startDrag(event, win)} onDoubleClick={() => update(win.id, { maximized: !win.maximized })}><div><AppIcon id={win.id} size="small" /><strong>{appById[win.id].name}</strong></div><nav><button aria-label="最小化" onClick={() => update(win.id, { minimized: true })}>—</button><button aria-label="最大化" onClick={() => update(win.id, { maximized: !win.maximized })}>□</button><button aria-label="閉じる" className="close" onClick={() => close(win.id)}>×</button></nav></header><div className="ad-window-body">{isServiceId(win.id) ? <ServiceContent serviceId={win.id} service={catalog[win.id]} mode={serviceModes[win.id]} canEdit={canEdit} navigation={serviceNavigation[win.id]} onMode={(mode) => setServiceModes((current) => ({ ...current, [win.id]: mode }))} onChange={(next) => setServiceNavigation((current) => ({ ...current, [win.id]: next }))} onAddCategory={(groupId) => addCategory(win.id, groupId)} onUpdateService={(next) => updateService(win.id, next)} onSaveCategory={(category, sourceGroupId, targetGroupId) => saveCategory(win.id, category, sourceGroupId, targetGroupId)} onDelete={(categoryId) => deleteCategory(win.id, categoryId)} /> : <GenericContent id={win.id} canEdit={canEdit} customApps={customApps} visibility={desktopAppVisibility} onTheme={toggleTheme} onSaveApps={saveApps} />}</div></section>)}
    {startOpen && <section className="ad-start" onPointerDown={(event) => event.stopPropagation()}><label className="ad-start-search">⌕ <input autoFocus placeholder="アプリ、設定、コンテンツを検索" /></label><div className="ad-start-label"><strong>ピン留め済み</strong><button>すべてのアプリ ›</button></div><div className="ad-pinned">{apps.map((app) => <button key={app.id} onClick={() => openApp(app.id)}><AppIcon id={app.id} /><span>{app.name}</span></button>)}{customApps.map((app) => <button key={app.id} onClick={() => openCustomApp(app)}><span className="ad-app-icon large" style={{ '--app-color': app.color } as CSSProperties}>{app.mark}</span><span>{app.name}</span></button>)}</div><div className="ad-recommended"><strong>おすすめ</strong><button onClick={() => openApp('codex')}><span>✦</span><div><b>Codexをはじめる</b><small>基本知識・最初の8分</small></div></button></div><footer><button className="ad-account" type="button" title={accountName} onClick={() => { setStartOpen(false); setAccountDialogOpen(true) }}><span className="ad-user">{accountName.charAt(0).toUpperCase() || 'H'}</span><strong>{accountName}</strong></button><button className="ad-start-apple" type="button" aria-label="Apple Intelligenceを開く" title="Apple Intelligence" onClick={() => { setStartOpen(false); openAppleIntelligence('ai-desktop') }}><AppleIntelligenceMark compact /></button><button className="ad-home-link" type="button" onClick={() => navigate('/')}><span>‹</span> Hundred Home</button></footer></section>}
    {accountDialogOpen && <div className="hundred-login-confirm ad-account-confirm" role="presentation" onPointerDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget && !changingAccount) setAccountDialogOpen(false) }}><section className="hundred-login-confirm__panel" role="dialog" aria-modal="true" aria-labelledby="ad-account-confirm-title"><p>ACCOUNT</p><h2 id="ad-account-confirm-title">{canEdit ? 'サインアウトしますか？' : 'サインイン画面へ移動しますか？'}</h2><p>{canEdit ? <><strong>{accountName}</strong>からサインアウトし、サインイン画面へ戻ります。</> : <>現在は<strong>ゲスト</strong>として利用しています。移動するとゲスト利用を終了し、Hundredのサインイン画面を表示します。</>}</p><div className="hundred-login-confirm__actions"><button type="button" onClick={() => setAccountDialogOpen(false)} disabled={changingAccount} autoFocus>キャンセル</button><button type="button" data-primary="true" onClick={() => void goToSignIn()} disabled={changingAccount}>{changingAccount ? '移動中…' : canEdit ? 'サインアウト' : 'サインイン画面へ'}</button></div></section></div>}
    {!taskbarVisible && <div ref={hiddenTaskbarRef} className={`ad-hidden-taskbar-launcher ${taskbarPeekOpen ? 'open' : ''}`} onPointerDown={(event) => event.stopPropagation()} onMouseEnter={() => setTaskbarPeekOpen(true)}>{taskbarPeekOpen && <section className="ad-running-apps" aria-label="起動中のアプリ"><strong>起動中のアプリ</strong>{windows.length ? <nav>{windows.map((win) => <div className="ad-running-app-row" key={win.id}><button type="button" className={active === win.id && !win.minimized ? 'active' : ''} onClick={() => activatePeekApp(win)}><AppIcon id={win.id} size="small" /><span><b>{appById[win.id].name}</b><small>{win.minimized ? '最小化中' : active === win.id ? '表示中' : '起動中'}</small></span></button><button type="button" className="ad-running-app-close" aria-label={`${appById[win.id].name}を閉じる`} title="閉じる" onClick={(event) => { event.stopPropagation(); close(win.id) }}>×</button></div>)}</nav> : <p>起動中のアプリはありません。</p>}</section>}<button type="button" className="ad-show-taskbar" aria-label="タスクバーを表示" title="ホバーで起動中のアプリを表示" aria-expanded={taskbarPeekOpen} onFocus={() => setTaskbarPeekOpen(true)} onClick={() => { setTaskbarPeekOpen(false); setTaskbarVisible(true); persistDesktopState(desktopIconPositions, true) }}>↑</button></div>}
    {taskbarVisible && <footer className="ad-taskbar" onPointerDown={(event) => event.stopPropagation()}><div className="ad-taskbar-spacer" /><nav><button className={startOpen ? 'active' : ''} onClick={handleStart} aria-label="スタート"><span className="ad-windows-logo">◆</span></button>{windows.map((win) => <div className="ad-taskbar-app" key={win.id}><button className={active === win.id && !win.minimized ? 'running active' : 'running'} aria-label={appById[win.id].name} onClick={() => win.minimized ? openApp(win.id) : (active === win.id ? update(win.id, { minimized: true }) : focus(win.id))}><AppIcon id={win.id} size="small" /></button><button type="button" className="ad-taskbar-close" aria-label={`${appById[win.id].name}を閉じる`} title="閉じる" onClick={(event) => { event.stopPropagation(); close(win.id) }}>×</button></div>)}</nav><div className="ad-tray"><button type="button" className={`ad-layout-edit ${layoutEditing ? 'active' : ''}`} aria-label={layoutEditing ? '配置変更を終了' : '配置変更'} title={canEdit ? layoutEditing ? '配置変更を終了' : 'デスクトップアイコンの配置を変更' : '配置変更にはサインインが必要です'} disabled={!canEdit} onClick={() => setLayoutEditing((current) => !current)}>✥</button><button type="button" className="ad-hide-taskbar" aria-label="タスクバーを非表示" title="タスクバーを非表示" onClick={hideTaskbar}>⌄</button></div></footer>}<p className={`ad-hint ${layoutEditing ? 'editing' : ''}`}>{layoutEditing ? 'アイコンをドラッグして配置を変更' : 'アイコンをダブルクリックして起動'}</p></main>
}

export default AIDesktopPage
