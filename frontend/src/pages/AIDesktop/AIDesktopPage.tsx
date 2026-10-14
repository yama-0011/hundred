import { fetchAuthSession, fetchUserAttributes, getCurrentUser, signOut } from 'aws-amplify/auth'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { endHundredGuestSession } from '../../components/Hundred/Auth/hundredGuestSession'
import { useHundredAppleIntelligence } from '../../components/Hundred/AppleIntelligence/HundredAppleIntelligenceContext'
import AppleIntelligenceMark from '../../components/Hundred/AppleIntelligence/AppleIntelligenceMark'
import { createAIDesktopCatalog, deleteAIDesktopContentDraftHistory, getAIDesktopCatalogs, getAIDesktopContentDraftHistory, getAIDesktopState, getManageableAIDesktopCatalogs, listAIDesktopContentDraftHistory, listAIDesktopDocuments, saveAIDesktopCatalog, saveAIDesktopContentDraft, saveAIDesktopState, setAIDesktopCatalogPublication, syncAIDesktopUserProfile, type AIDesktopCatalogPublication, type AIDesktopCustomApp, type AIDesktopDocument, type AIDesktopDraftHistoryEntry, type AIDesktopProjectDocument, type AIDesktopTaskbarPosition } from '../../services/AIDesktop/aiDesktopApi'
import { BlockRenderer, ContentCanvas, ContentTableOfContents, createContent, normalizeServiceConfig, type Category, type CategoryGroup, type ContentBlock, type ContentItem, type GlossaryEntry, type LeafBlock, type ServiceConfig } from './contentBlocks'
import { createContentBlockCatalog } from './contentBlockCatalog'
import { copyArticleImage } from './copyArticleImage'
import { diagramKindMatchesSource, validateMermaidSource, type DiagramKind } from './mermaidDiagramValidation'
import { categoryKindOf, containsScreenMapBlock, createScreenMapContent, isScreenMapData, screenMapBlockOf } from './screenMap'
import ScreenMapEditor from './ScreenMapEditor'
import ScreenMapOverview from './ScreenMapOverview'
import ImageExplorer from './ImageExplorer'
import ProjectsApp from './ProjectsApp'
import DesignDocumentsApp, { type DesignDocumentsProjectRequest } from './DesignDocumentsApp'
import { AI_DESKTOP_MESSAGES, localizedErrorMessage } from './aiDesktopMessages'
import AIDesktopNotifications from './AIDesktopNotifications'
import AIDesktopConfirmDialog from './AIDesktopConfirmDialog'
import { AppContent, AppHeader, AppShell } from './AppLayout'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import { contentWorkspacePath, readContentWorkspace, selectContentWorkspaceFolder, supportsContentWorkspaceFolder, writeContentWorkspace, type ContentWorkspaceTarget, type ScreenMapImageEntry } from './contentWorkspaceFolder'
import { isWorkspaceJsonFileCancelled } from './workspaceJsonFile'
import '../../styles/AIDesktop/ai-desktop.css'
import '../../styles/AIDesktop/ai-desktop-projects.css'
import '../../styles/AIDesktop/ai-desktop-app-layout.css'
// Screen Mapの見出し・表示設定・空表示はキャンバス（遅延読み込み）より先に出るため、CSSは本体と一緒に読み込む。
import '@xyflow/react/dist/style.css'
import '../../styles/AIDesktop/ai-desktop-screen-map.css'
import '../../styles/Hundred/hundred-login-status.css'
import { confirmAIDesktop } from './aiDesktopConfirmBus'
import { isRecordValue, readAIDesktopSessionState, useAIDesktopSessionStateSaver } from './aiDesktopSessionState'

type AppId = 'my-documents' | 'documents' | 'projects' | 'design-documents' | 'explorer' | 'settings'
type ServiceId = string
type WindowState = { id: AppId; x: number; y: number; width: number; height: number; minimized: boolean; maximized: boolean; z: number }
type ServiceNavigation = { categoryId: string | null; contentId: string | null }
type ServiceMode = 'view' | 'edit'
type DesktopIconPosition = { x: number; y: number }
type SharedContentTarget = { serviceId: ServiceId; categoryId: string; contentId: string }

const apps = [
  { id: 'my-documents' as const, name: 'マイ資料', mark: '✎', color: '#2878c8' },
  { id: 'documents' as const, name: '公開資料', mark: '▤', color: '#16876d' },
  { id: 'projects' as const, name: 'プロジェクト', mark: '◆', color: '#7657c8' },
  { id: 'design-documents' as const, name: 'ドキュメント', mark: '▧', color: '#b4527f' },
  { id: 'explorer' as const, name: 'Explorer', mark: '▰', color: '#e6a700' },
  { id: 'settings' as const, name: '設定', mark: '⚙', color: '#5277d8' },
]

// リロードしても同じウィンドウと画面に戻れるよう、表示状態だけをタブ単位で保つ。
type DesktopSession = { windows: WindowState[]; active: AppId | null; personalServiceId: ServiceId | null; publishedServiceId: ServiceId | null; serviceNavigation: Record<ServiceId, ServiceNavigation> }
const isAppId = (value: unknown): value is AppId => apps.some((app) => app.id === value)
const isWindowState = (value: unknown): value is WindowState => isRecordValue(value) && isAppId(value.id) && ['x', 'y', 'width', 'height', 'z'].every((key) => typeof value[key] === 'number') && typeof value.minimized === 'boolean' && typeof value.maximized === 'boolean'
const isDesktopSession = (value: unknown): value is DesktopSession => isRecordValue(value) && Array.isArray(value.windows) && value.windows.every(isWindowState) && (value.active === null || isAppId(value.active)) && isRecordValue(value.serviceNavigation)
const restoredWindows = (session: DesktopSession | null) => (session?.windows ?? []).map((win) => ({ ...win, x: Math.min(win.x, Math.max(0, window.innerWidth - 160)), y: Math.min(win.y, Math.max(0, window.innerHeight - 120)) }))

const defaultDesktopIconPositions: Record<AppId, DesktopIconPosition> = { 'my-documents': { x: 18, y: 18 }, documents: { x: 18, y: 110 }, projects: { x: 18, y: 202 }, 'design-documents': { x: 18, y: 294 }, explorer: { x: 18, y: 386 }, settings: { x: 18, y: 478 } }

const content = createContent
const isServiceId = (id: unknown): id is ServiceId => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(id)

const sharedContentTarget = (search: string): SharedContentTarget | null => {
  const params = new URLSearchParams(search)
  const serviceId = params.get('service')
  const categoryId = params.get('category')?.trim()
  const contentId = params.get('content')?.trim()
  return isServiceId(serviceId) && categoryId && contentId ? { serviceId, categoryId, contentId } : null
}

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
    case 'screenMap': return !nested && isScreenMapData(data)
    case 'columns': return !nested && validImportedBlocks(data.left, true) && validImportedBlocks(data.right, true)
    default: return false
  }
})
const importedContent = (value: unknown): ContentItem | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.navTitle !== 'string' || (value.pageWidth !== undefined && value.pageWidth !== 'standard' && value.pageWidth !== 'wide' && value.pageWidth !== 'compact') || !validImportedBlocks(value.blocks)) return null
  return value as unknown as ContentItem
}
// Screen MapのページはScreen Mapブロック1つだけを持ち、通常のページにはScreen Mapブロックを置かない。
const contentMatchesPage = (item: ContentItem, isScreenMapPage: boolean) => isScreenMapPage ? Boolean(screenMapBlockOf(item)) : !containsScreenMapBlock(item.blocks)
const validateContentDiagrams = async (blocks: ContentBlock[]): Promise<boolean> => {
  for (const block of blocks) {
    if (block.type === 'diagram' && !await validateMermaidSource(block.data.kind as DiagramKind, block.data.source)) return false
    if (block.type === 'columns' && !await validateContentDiagrams([...block.data.left, ...block.data.right])) return false
  }
  return true
}

const contentTemplateGuide = {
  purpose: 'Hundredの選択中コンテンツを作成・編集するためのJSONテンプレートです。実際に反映されるのはdata.contentとdata.glossaryです。guideとreferenceは説明用です。',
  prerequisites: ['Hundredで資料、カテゴリ、コンテンツを作成し、編集したいコンテンツを選択してください。'],
  steps: [
    'reference.exampleとreference.blockTemplatesを参考にdata.content.navTitleとdata.content.blocksを編集します。',
    '必要な用語がある場合はdata.glossaryへ追加します。',
    'format、version、resourceType、target、dataのキー名とid・type・data構造を維持してJSONを保存します。',
    'Hundredのコンテンツ編集画面で「JSONをインポート」または「JSONから読み込む」を実行します。',
    '編集画面へ反映された内容を確認し、「DBへ保存」を押して資料へ反映します。',
  ],
  requiredFields: ['data.content.id', 'data.content.navTitle', 'data.content.blocks', '各blockのid・type・data'],
  optionalFields: ['data.glossary'],
  screenOnlyFields: ['資料名', 'カテゴリ名', '所属グループ', 'アイコン', '公開・非公開設定'],
  cautions: ['data以外は本文として読み込まれません。', '新しいブロックのidは重複しない値に変更してください。', 'targetのserviceIdとcategoryIdは変更しないでください。'],
}

const contentTemplateExample = {
  glossary: [{ id: 'term-api', term: 'API', description: 'アプリケーション同士が情報をやり取りするための仕組みです。' }],
  content: {
    id: 'example-content',
    navTitle: 'Webアプリケーションの基本',
    blocks: [
      { id: 'heading-overview', type: 'heading', data: { text: 'Webアプリケーションの基本', level: 1 } },
      { id: 'text-overview', type: 'text', data: { text: 'ブラウザから利用できるアプリケーションの構成と役割を説明します。' } },
      { id: 'callout-point', type: 'callout', data: { tone: 'tip', title: 'ポイント', text: '利用者、画面、API、データベースの流れで整理すると理解しやすくなります。' } },
      { id: 'diagram-system', type: 'diagram', data: { kind: 'flowchart', title: '基本構成', source: 'flowchart LR\n  User[利用者] --> Frontend[画面]\n  Frontend --> API[API]\n  API --> DB[(Database)]', caption: '一般的なWebアプリケーションの構成例' } },
    ],
  },
}

// ワークスペースへ書き出すScreen MapのJSONに入れる、AIへの指示。ai-desktop:pull の指示と揃える。
const screenMapWorkspaceInstructions = [
  'このページはScreen Mapです。contentのScreen Mapブロック1つのdataだけを編集し、ブロックの追加・削除はしないでください。',
  'dataの形と各項目の意味はblockCatalog.screenMapを参照してください。',
  'グループ・画面・遷移のidは英小文字・数字・ハイフンで重複しない値にし、groupId・stateOf・from・toには存在するidを設定してください。',
  'AIが追加・変更した画面と遷移のverificationはai-inferredにしてください。',
  'カテゴリ名、説明、所属グループ、アイコン、カテゴリの種類などのカテゴリ設定は変更対象外です。',
  '画面のスクリーンショットはscreenImagesのパスにあります。質問に答えるのに必要な画面の画像だけを開いてください。maskedがtrueの画像は、黒い四角の部分を意図的に隠しています。画像の追加・変更はしないでください。',
  '編集後は ai-desktop:push で下書きDBと履歴へ登録するか、Hundredの編集画面で「JSONから読み込む」を実行してください。',
]
// ai-desktop:pull のファイル名と同じ規則にする。
const safeContentFileName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-')

const screenMapTemplateGuide = {
  purpose: 'HundredのScreen Map（画面と画面遷移の図）を作成・編集するためのJSONテンプレートです。実際に反映されるのはdata.contentです。guideとreferenceは説明用です。',
  steps: [
    'data.content.blocksにあるScreen Mapブロック1つのdataを編集します。ブロックを追加・削除しないでください。',
    'reference.screenMapTemplateとreference.fieldDefinitionsを参考に、groups・screens・transitionsを追加・編集します。',
    'AIが追加・変更した画面と遷移のverificationはai-inferredにします。',
    '画面のスクリーンショットは、screenImagesのパスにあります。質問に答えるのに必要な画面の画像だけを開いてください。画像の追加・変更はしないでください。',
    'Hundredの編集画面で「JSONから読み込む」または「JSONをインポート」を実行し、内容を確認してから「DBへ保存」を押します。',
  ],
  requiredFields: ['data.content.id', 'data.content.navTitle', 'data.content.blocks（Screen Mapブロック1つ）'],
  screenOnlyFields: ['資料名', 'カテゴリ名', '所属グループ', 'アイコン', 'カテゴリの種類', '公開・非公開設定'],
  cautions: ['グループ・画面・遷移のidは英小文字・数字・ハイフンで、それぞれ重複しない値にしてください。', 'groupId・stateOf・from・toには、存在するidを設定してください。', '画像はAI Desktopにアップロードしたものだけを設定できます。', 'targetのserviceIdとcategoryIdは変更しないでください。'],
}

function ServiceHome({ service, mode, canEdit, publicationStatus, publicationBusy, onMaterialList, onPublication, onMode, onCategory, onAddCategory, onUpdateService }: { service: ServiceConfig; mode: ServiceMode; canEdit: boolean; publicationStatus?: 'draft' | 'published' | 'unpublished'; publicationBusy?: boolean; onMaterialList: () => void; onPublication?: () => void; onMode: (mode: ServiceMode) => void; onCategory: (id: string) => void; onAddCategory: (groupId: string) => void; onUpdateService: (service: ServiceConfig) => void }) {
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
  const deleteGroup = async (group: CategoryGroup) => { if (group.categories.length > 0) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.groupNotEmpty); return } if (await confirmAIDesktop({ title: `「${group.title}」を削除しますか？`, confirmLabel: '削除', tone: 'danger' })) onUpdateService({ ...service, categoryGroups: service.categoryGroups.filter((candidate) => candidate.id !== group.id) }) }
  const moveGroup = (index: number, direction: -1 | 1) => { const destination = index + direction; if (destination < 0 || destination >= service.categoryGroups.length) return; const groups = [...service.categoryGroups]; [groups[index], groups[destination]] = [groups[destination], groups[index]]; onUpdateService({ ...service, categoryGroups: groups }) }
  const finishCategoryDrag = () => { const categoryId = dragRef.current; const target = dropTargetRef.current; if (longPressRef.current) window.clearTimeout(longPressRef.current.timer); longPressRef.current = null; dragRef.current = null; setDraggedCategoryId(null); setDropTarget(null); dropTargetRef.current = null; document.body.classList.remove('ad-category-dragging'); if (categoryId) { suppressClickRef.current = true; window.setTimeout(() => { suppressClickRef.current = false }, 0) } if (!categoryId || !target || categoryId === target.categoryId) return; let movingCategory: Category | undefined; const groupsWithoutMoving = service.categoryGroups.map((group) => ({ ...group, categories: group.categories.filter((category) => { if (category.id === categoryId) { movingCategory = category; return false } return true }) })); if (!movingCategory) return; const nextGroups = groupsWithoutMoving.map((group) => { if (group.id !== target.groupId) return group; const categories = [...group.categories]; const targetIndex = target.categoryId ? categories.findIndex((category) => category.id === target.categoryId) : -1; categories.splice(targetIndex < 0 ? categories.length : targetIndex, 0, movingCategory!); return { ...group, categories } }); onUpdateService({ ...service, categoryGroups: nextGroups }) }
  const startCategoryPress = (event: React.PointerEvent, categoryId: string) => { if (mode !== 'edit' || !canEdit || event.button !== 0) return; const element = event.currentTarget as HTMLElement; element.setPointerCapture(event.pointerId); const timer = window.setTimeout(() => { dragRef.current = categoryId; setDraggedCategoryId(categoryId); document.body.classList.add('ad-category-dragging') }, 400); longPressRef.current = { timer, categoryId } }
  const moveCategoryPointer = (event: React.PointerEvent) => { if (!dragRef.current) return; event.preventDefault(); const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null; const categoryElement = element?.closest<HTMLElement>('[data-category-id]'); const groupElement = element?.closest<HTMLElement>('[data-group-id]'); const groupId = categoryElement?.dataset.groupId ?? groupElement?.dataset.groupId; if (groupId) { const target = { groupId, categoryId: categoryElement?.dataset.categoryId ?? null }; dropTargetRef.current = target; setDropTarget(target) } }
  const cancelPendingPress = () => { if (longPressRef.current && !dragRef.current) { window.clearTimeout(longPressRef.current.timer); longPressRef.current = null } }
  const openCategory = (categoryId: string) => { if (suppressClickRef.current) return; onCategory(categoryId) }
  return <div className="ad-app-content"><header className="ad-content-head"><div><p className="ad-eyebrow">{service.eyebrow}</p><h1>{service.name}</h1></div><div className="ad-home-controls"><button type="button" className="ad-material-list-back" onClick={onMaterialList}>← 資料一覧へ</button>{canEdit && publicationStatus && onPublication && <div className="ad-material-publication-control"><span className={publicationStatus}>{publicationStatus === 'published' ? '公開中' : publicationStatus === 'draft' ? '下書き' : '非公開'}</span><button type="button" disabled={publicationBusy} onClick={onPublication}>{publicationStatus === 'published' ? '非公開にする' : '公開する'}</button></div>}{canEdit && <div className="ad-mode-switch" aria-label="表示モード"><button className={mode === 'view' ? 'active' : ''} onClick={() => onMode('view')}>閲覧</button><button className={mode === 'edit' ? 'active' : ''} onClick={() => onMode('edit')}>編集</button></div>}{mode === 'view' && <label className="ad-search"><span>⌕</span><input aria-label={`${service.name}内を検索`} placeholder={`${service.name}内を検索`} /></label>}</div></header>{mode === 'edit' && canEdit && <div className="ad-edit-notice"><span>✎</span><div><strong>グループ・カテゴリ編集モード</strong><p>グループを整理し、カテゴリを長押しして移動・並び替えできます。</p></div><button onClick={addGroup}>＋ グループを追加</button></div>}<div className="ad-category-groups">{service.categoryGroups.map((group, groupIndex) => <section className={`ad-category-group ${dropTarget?.groupId === group.id && !dropTarget.categoryId ? 'drop-target' : ''}`} key={group.id} data-group-id={group.id}><header><div><span>{String(groupIndex + 1).padStart(2, '0')}</span><h2>{group.title}</h2><p>{group.description}</p></div>{mode === 'edit' && canEdit && <nav><button disabled={groupIndex === 0} onClick={() => moveGroup(groupIndex, -1)} aria-label="グループを上へ">↑</button><button disabled={groupIndex === service.categoryGroups.length - 1} onClick={() => moveGroup(groupIndex, 1)} aria-label="グループを下へ">↓</button><button onClick={() => editGroup(group)}>編集</button><button className="danger" onClick={() => deleteGroup(group)}>削除</button></nav>}</header><div className={`ad-category-grid ${mode === 'edit' && canEdit ? 'editing' : ''}`}>{group.categories.map((category) => <button className={`ad-category ${draggedCategoryId === category.id ? 'dragging' : ''} ${dropTarget?.categoryId === category.id && draggedCategoryId !== category.id ? 'drop-before' : ''}`} key={category.id} data-category-id={category.id} data-group-id={group.id} onPointerDown={(event) => startCategoryPress(event, category.id)} onPointerMove={moveCategoryPointer} onPointerUp={finishCategoryDrag} onPointerCancel={() => { cancelPendingPress(); finishCategoryDrag() }} onPointerLeave={cancelPendingPress} onClick={() => openCategory(category.id)}><span className="ad-category-icon">{category.icon}</span><span><strong>{category.title}</strong><small>{category.description}</small></span><span className="ad-arrow">{mode === 'edit' && canEdit ? '✎' : '›'}</span></button>)}{mode === 'edit' && canEdit && <button className="ad-category ad-category-add" onClick={() => onAddCategory(group.id)}><span className="ad-category-icon">＋</span><span><strong>カテゴリを追加</strong><small>{group.title}に新しいテーマを作成</small></span></button>}</div></section>)}</div></div>
}

function CategoryEditor({ serviceId, service, category, groupId, initialSelectedItemId, onBack, onView, onSave, onDelete }: { serviceId: ServiceId; service: ServiceConfig; category: Category; groupId: string; initialSelectedItemId: string | null; onBack: () => void; onView: (contentId: string | null) => void; onSave: (category: Category, targetGroupId: string, contentId: string | null) => Promise<void>; onDelete: () => void }) {
  const [initialItems] = useState(() => category.items.map((item) => withAutomaticPageLayout({ ...item, blocks: withoutPageGlossary(item.blocks) })))
  const [initialGlossary] = useState(() => initialCategoryGlossary(category))
  const [title, setTitle] = useState(category.title)
  const [description, setDescription] = useState(category.description)
  const [icon, setIcon] = useState(category.icon)
  const [targetGroupId, setTargetGroupId] = useState(groupId)
  const [categorySettingsOpen, setCategorySettingsOpen] = useState(false)
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const [pageEditorOpen, setPageEditorOpen] = useState(true)
  // Screen Mapは広い場所で編集できるよう、ページ編集とは別の画面（ウィンドウ全体）で開く。
  const [screenMapPageOpen, setScreenMapPageOpen] = useState(false)
  const [glossary, setGlossary] = useState<GlossaryEntry[]>(initialGlossary)
  const [items, setItems] = useState(initialItems)
  const itemsRef = useRef(initialItems)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({ title: category.title, description: category.description, icon: category.icon, targetGroupId: groupId, glossary: initialGlossary, items: initialItems }))
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
  // カテゴリはScreen Mapのページを1つまで（先頭）持てる。JSON連携やAI下書きは、選んでいるページがScreen Mapかどうかで扱いを変える。
  const usesScreenMap = items.some((item) => screenMapBlockOf(item))
  const screenMapBlock = screenMapBlockOf(selectedItem ?? undefined)
  const selectedIsScreenMap = Boolean(screenMapBlock)
  const hasUnsavedChanges = currentSnapshot !== savedSnapshot
  const confirmLeave = async () => !hasUnsavedChanges || await confirmAIDesktop({ title: '変更内容が保存されていません', message: '保存せずに移動すると、変更内容は破棄されます。', confirmLabel: '破棄して移動', tone: 'danger' })
  const backToCategories = async () => { if (await confirmLeave()) onBack() }
  const switchToView = async () => { if (await confirmLeave()) onView(selectedItemId) }
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasUnsavedChanges])
  const commitItems = (next: ContentItem[]) => { itemsRef.current = next; setItems(next) }
  const addItem = () => { const id = `item-${Date.now()}`; const nextItem = createContent(id, '新しいコンテンツ'); commitItems([...itemsRef.current, nextItem]); setSelectedItemId(id) }
  const updateItem = (nextItem: ContentItem) => commitItems(itemsRef.current.map((candidate) => candidate.id === nextItem.id ? nextItem : candidate))
  const deleteItem = async () => { if (!selectedItemId || !(await confirmAIDesktop({ title: 'このコンテンツを削除しますか？', confirmLabel: '削除', tone: 'danger' }))) return; const currentItems = itemsRef.current; const index = currentItems.findIndex((candidate) => candidate.id === selectedItemId); const nextItems = currentItems.filter((candidate) => candidate.id !== selectedItemId); commitItems(nextItems); setSelectedItemId(nextItems[Math.min(index, nextItems.length - 1)]?.id ?? null) }
  const updateGlossary = (index: number, changes: Partial<GlossaryEntry>) => setGlossary((current) => current.map((entry, candidateIndex) => candidateIndex === index ? { ...entry, ...changes } : entry))
  const toggleScreenMap = async (enabled: boolean) => {
    if (enabled === usesScreenMap) return
    if (enabled) {
      const page = createScreenMapContent('Screen Map')
      commitItems([page, ...itemsRef.current])
      setSelectedItemId(page.id)
      setScreenMapPageOpen(true)
      return
    }
    if (!(await confirmAIDesktop({ title: 'Screen Mapを使わない設定にしますか？', message: 'Screen Mapのページ（画面と遷移）を削除します。ほかのページは残ります。「DBへ保存」を押すまでは保存されません。', confirmLabel: '削除する', tone: 'danger' }))) return
    const rest = itemsRef.current.filter((item) => !screenMapBlockOf(item))
    const nextItems = rest.length ? rest : [createContent(`item-${Date.now()}`, '新しいコンテンツ')]
    commitItems(nextItems)
    setSelectedItemId(nextItems[0].id)
  }
  const addGlossaryEntry = () => { setGlossary((current) => [...current, { id: `term-${Date.now()}`, term: '', description: '' }]); setGlossaryOpen(true) }
  const currentContentPayload = () => selectedItem ? { format: 'hundred-ai-desktop-content', version: 1, target: { serviceId, categoryId: category.id, contentId: selectedItem.id, source: 'published', databaseTarget: import.meta.env.DEV ? 'local' : 'remote' }, instructions: ['content内の文章とブロックを編集し、id・type・data構造を維持してください。', 'glossaryはカテゴリ共通の用語一覧です。必要な用語の追加・編集・削除ができます。各用語は重複しないid、term、descriptionを維持してください。', 'カテゴリ名、説明、所属グループ、アイコンなどのカテゴリ設定は変更しないでください。', 'ページ幅はウィンドウに合わせて自動調整されます。pageWidthは設定しないでください。', 'calloutのtoneはinfo・warning・tip、表の列widthは10〜100です。'], glossary, content: withAutomaticPageLayout({ ...selectedItem, blocks: normalizeTableWidths(withoutPageGlossary(selectedItem.blocks)) }) } : null
  const contentJsonData = () => selectedItem ? { glossary, content: withAutomaticPageLayout({ ...selectedItem, blocks: normalizeTableWidths(withoutPageGlossary(selectedItem.blocks)) }) } : null
  const contentExportPayload = () => {
    const data = contentJsonData()
    return data ? { format: 'hundred-ai-desktop', version: 1, resourceType: 'content', target: { serviceId, categoryId: category.id, contentId: selectedItem!.id, source: 'published', databaseTarget: import.meta.env.DEV ? 'local' : 'remote' }, data } : null
  }
  const refreshDraftHistory = async () => { if (!selectedItem) { setDraftHistory([]); setSelectedDraftHistoryId(null); return [] } const { history } = await listAIDesktopContentDraftHistory(serviceId, category.id, selectedItem.id); setDraftHistory(history); setSelectedDraftHistoryId((current) => history.some((entry) => entry.id === current && entry.hasPreview) ? current : history.find((entry) => entry.hasPreview)?.id ?? null); return history }
  const openDraftDialog = async () => { setDraftDialogOpen(true); setDraftBusy(true); try { await refreshDraftHistory() } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.draft.historyLoadFailed)) } finally { setDraftBusy(false) } }
  const saveContentDraft = async () => { const payload = currentContentPayload(); if (!selectedItem || !payload || !(await confirmAIDesktop({ title: `「${selectedItem.navTitle || '名称未設定'}」を下書きとして保存しますか？`, message: '正式な資料にはまだ反映されません。', confirmLabel: '下書きに保存' }))) return; setDraftBusy(true); try { if (!await validateContentDiagrams(selectedItem.blocks)) throw new Error('Mermaid構文が正しくない技術図があります。構文プレビューを確認してください。'); const { draft } = await saveAIDesktopContentDraft('content', serviceId, category.id, payload, selectedItem.id, contentDraftRevisions[selectedItem.id] || undefined); setContentDraftRevisions((current) => ({ ...current, [selectedItem.id]: draft.revision })); await refreshDraftHistory(); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.draft.saved(draft.revision)) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.draft.saveFailed)) } finally { setDraftBusy(false) } }
  const readDraftHistory = async (entry: AIDesktopDraftHistoryEntry) => { const { history } = await getAIDesktopContentDraftHistory<unknown>(serviceId, category.id, entry.id); if (!isRecord(history.payload) || history.payload.format !== 'hundred-ai-desktop-content' || history.payload.version !== 1) throw new Error('FORMAT'); const item = importedContent(history.payload.content); if (!item) throw new Error('CONTENT'); const previewGlossary = history.payload.glossary === undefined ? null : importedGlossary(history.payload.glossary); if (history.payload.glossary !== undefined && !previewGlossary) throw new Error('GLOSSARY'); return { item: { ...item, blocks: normalizeTableWidths(withoutPageGlossary(item.blocks)) }, glossary: previewGlossary, contentId: history.contentId, revision: history.revision, savedAt: history.savedAt } }
  const previewDraftHistory = async (entry: AIDesktopDraftHistoryEntry) => { if (!entry.hasPreview) return; setSelectedDraftHistoryId(entry.id); setDraftBusy(true); try { setDraftPreview(await readDraftHistory(entry)) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.draft.previewFailed)) } finally { setDraftBusy(false) } }
  const applyDraft = (draft: { item: ContentItem; glossary: GlossaryEntry[] | null; contentId: string; revision: number; savedAt: number }) => { if (!contentMatchesPage(draft.item, Boolean(screenMapBlockOf(itemsRef.current.find((item) => item.id === draft.contentId))))) { showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.content.kindMismatch); return } updateItem({ ...draft.item, id: draft.contentId }); if (draft.glossary) setGlossary(draft.glossary); setSelectedItemId(draft.contentId); setContentDraftRevisions((current) => ({ ...current, [draft.contentId]: draft.revision })); setDraftPreview(null); setDraftDialogOpen(false); setPageEditorOpen(true); setSaveState('idle'); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.draft.applied(Boolean(draft.glossary))) }
  const applyDraftPreview = () => { if (draftPreview) applyDraft(draftPreview) }
  const applySelectedDraftHistory = async () => { const entry = draftHistory.find((candidate) => candidate.id === selectedDraftHistoryId && candidate.hasPreview); if (!entry) return; setDraftBusy(true); try { applyDraft(await readDraftHistory(entry)) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.draft.loadFailed)) } finally { setDraftBusy(false) } }
  const deleteDraftHistory = async () => { if (!selectedItem || !draftHistory.length || !(await confirmAIDesktop({ title: `「${selectedItem.navTitle || '名称未設定'}」の下書き履歴をすべて削除しますか？`, message: '現在の下書きは残り、次回の保存は第1版になります。', confirmLabel: '削除', tone: 'danger' }))) return; const contentId = selectedItem.id; setDraftBusy(true); try { await deleteAIDesktopContentDraftHistory(serviceId, category.id, contentId); setDraftHistory([]); setSelectedDraftHistoryId(null); setContentDraftRevisions((current) => ({ ...current, [contentId]: 0 })); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.draft.historyDeleted) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.draft.historyDeleteFailed)) } finally { setDraftBusy(false) } }
  const contentEditingTemplate = () => {
    const payload = contentExportPayload()
    if (!payload) return null
    const catalog = createContentBlockCatalog()
    if (selectedIsScreenMap) return {
      ...payload,
      guide: screenMapTemplateGuide,
      reference: {
        description: catalog.screenMap.description,
        fieldDefinitions: { content: 'Screen Mapのページです。id、navTitleと、Screen Mapブロック1つだけのblocksを維持してください。', ...catalog.screenMap.fieldDefinitions },
        screenMapTemplate: catalog.screenMap.block,
      },
    }
    return {
      ...payload,
      guide: contentTemplateGuide,
      reference: {
        allowedValues: { blockTypes: catalog.allowedTypes, nestedBlockTypes: catalog.nestedAllowedTypes, calloutTones: ['info', 'warning', 'tip'], badgeTones: ['neutral', 'info', 'success', 'warning', 'danger'] },
        fieldDefinitions: {
          content: '選択中ページのタイトルとブロックです。id、navTitle、blocksを維持してください。',
          glossary: 'カテゴリ内で共有する用語一覧です。各項目に重複しないid、term、descriptionを設定します。',
          blocks: '各ブロックは重複しないid、許可されたtype、typeに対応するdataを持ちます。',
        },
        blockTemplates: catalog.templates,
        example: contentTemplateExample,
      },
    }
  }
  const downloadContentJson = (payload: unknown, fileName: string, message?: string) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0)
    if (message) showAIDesktopNotification('success', message)
  }
  const downloadCurrentContentJson = () => {
    if (!selectedItem) return
    const payload = contentExportPayload()
    if (payload) downloadContentJson(payload, `${selectedItem.navTitle.trim().replace(/[/:*?"<>|]/g, '-') || 'content'}.json`, AI_DESKTOP_MESSAGES.content.jsonDownloaded)
  }
  const downloadContentTemplate = () => {
    if (!selectedItem) return
    const payload = contentEditingTemplate()
    if (payload) downloadContentJson(payload, `${selectedItem.navTitle.trim().replace(/[/:*?"<>|]/g, '-') || 'content'}-template.json`, AI_DESKTOP_MESSAGES.content.templateDownloaded)
  }
  const copyContentTarget = async () => {
    if (!selectedItem) return
    const targetJson = JSON.stringify({ target: { serviceId, categoryId: category.id, contentId: selectedItem.id, source: 'published', databaseTarget: import.meta.env.DEV ? 'local' : 'remote' } }, null, 2)
    const value = includeAiPrompt && selectedIsScreenMap
      ? `HundredのAI DesktopのScreen Mapを編集してください。

次の資料情報を使って、選択中のScreen MapをDBから取得し、私の依頼に沿って編集してください。
取得したJSONのblockCatalog.screenMapを参照し、contentのScreen Mapブロック1つのdata（groups・screens・transitions）だけを編集してください。ブロックの追加・削除はしないでください。
グループ・画面・遷移のidは英小文字・数字・ハイフンで重複しない値にし、groupId・stateOf・from・toには存在するidを設定してください。
AIが追加・変更した画面と遷移のverificationはai-inferredにしてください。
カテゴリ名、説明、所属グループ、アイコン、カテゴリの種類などのカテゴリ設定は変更しないでください。
編集後はJSONの構造を検証し、正式公開データを直接変更せず、AI下書き履歴へ保存してください。
保存が完了したら、追加・変更した画面と遷移、保存した版数を報告してください。

${targetJson}

依頼内容:
（ここに作成・修正内容を記入してください）`
      : includeAiPrompt
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
  const showContentImportError = (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('TARGET_SCOPE:')) {
      const actual = error.message.slice('TARGET_SCOPE:'.length)
      showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.differentTarget(actual, `${serviceId}/${category.id}`))
      return
    }
    showAIDesktopNotification('error', error instanceof Error && error.message === 'RESOURCE_TYPE' ? AI_DESKTOP_MESSAGES.content.wrongResourceType : error instanceof Error && error.message === 'TARGET_FORMAT' ? AI_DESKTOP_MESSAGES.content.invalidTarget : error instanceof Error && error.message === 'MERMAID' ? AI_DESKTOP_MESSAGES.content.mermaidImportInvalid : error instanceof Error && error.message === 'KIND' ? AI_DESKTOP_MESSAGES.content.kindMismatch : error instanceof Error && error.message === 'SCREEN_MAP' ? AI_DESKTOP_MESSAGES.content.screenMapImportInvalid : AI_DESKTOP_MESSAGES.content.invalidTemplate)
  }
  const applyContentJson = async (text: string) => {
    if (!selectedItem) return false
    const payload = JSON.parse(text) as unknown
    if (!isRecord(payload) || payload.version !== 1) throw new Error('FORMAT')
    let data: Record<string, unknown>
    if (payload.format === 'hundred-ai-desktop') {
      if (payload.resourceType !== 'content') throw new Error(payload.resourceType === 'project' ? 'RESOURCE_TYPE' : 'FORMAT')
      if (!isRecord(payload.data)) throw new Error('FORMAT')
      data = payload.data
    } else if (payload.format === 'hundred-ai-desktop-content') {
      data = payload
    } else {
      throw new Error('FORMAT')
    }
    const target = payload.target
    if (target !== undefined && (!isRecord(target) || typeof target.serviceId !== 'string' || typeof target.categoryId !== 'string' || typeof target.contentId !== 'string')) throw new Error('TARGET_FORMAT')
    if (isRecord(target) && (target.serviceId !== serviceId || target.categoryId !== category.id)) throw new Error(`TARGET_SCOPE:${target.serviceId}/${target.categoryId}`)
    const imported = importedContent(data.content)
    if (!imported) throw new Error(selectedIsScreenMap ? 'SCREEN_MAP' : 'CONTENT')
    if (!contentMatchesPage(imported, selectedIsScreenMap)) throw new Error('KIND')
    if (!await validateContentDiagrams(imported.blocks)) throw new Error('MERMAID')
    const targetId = selectedItem.id
    const nextGlossary = data.glossary === undefined ? null : importedGlossary(data.glossary)
    if (data.glossary !== undefined && !nextGlossary) throw new Error('GLOSSARY')
    const next = withAutomaticPageLayout({ ...imported, id: targetId, blocks: normalizeTableWidths(withoutPageGlossary(imported.blocks)) })
    updateItem(next)
    setSelectedItemId(targetId)
    if (nextGlossary) setGlossary(nextGlossary)
    setSaveState('idle')
    return Boolean(nextGlossary)
  }
  const importContentJson = () => {
    if (!selectedItem) return
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'application/json,.json'
    picker.onchange = () => {
      const file = picker.files?.[0]
      if (!file) return
      void file.text().then(async (text) => {
        const withGlossary = await applyContentJson(text)
        showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.draft.applied(withGlossary))
      }).catch(showContentImportError)
    }
    picker.click()
  }
  // ワークスペースへの書き出しは ai-desktop:pull と同じ場所・同じ形にし、AIがそのまま読み、ai-desktop:push できるようにする。
  // Screen Mapのページは、画面ごとの画像も一緒に書き出す。
  const workspaceTarget = (): ContentWorkspaceTarget | null => selectedItem ? { databaseTarget: import.meta.env.DEV ? 'local' : 'remote', serviceId, categoryId: category.id, contentId: selectedItem.id } : null
  const workspacePayload = (screenImages: Record<string, ScreenMapImageEntry> | null) => {
    const payload = currentContentPayload()
    if (!payload || !selectedItem) return null
    return { ...payload, labels: { service: service.name, category: title, content: selectedItem.navTitle }, ...(selectedIsScreenMap ? { instructions: screenMapWorkspaceInstructions } : {}), blockCatalog: createContentBlockCatalog(), ...(screenImages ? { screenImages } : {}) }
  }
  const writeContentWorkspaceJson = async () => {
    const target = workspaceTarget()
    const payload = workspacePayload(null)
    if (!selectedItem || !target || !payload || !(await confirmAIDesktop({ title: '現在のページをワークスペースへ書き出しますか？', message: `${contentWorkspacePath(target)} を上書きします。${selectedIsScreenMap ? '画面の画像も書き出します。' : ''}`, confirmLabel: '書き出す' }))) return
    if (!supportsContentWorkspaceFolder()) {
      downloadContentJson(payload, `${safeContentFileName(selectedItem.id)}.json`)
      showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.workspaceUnsupported)
      return
    }
    try {
      const result = await writeContentWorkspace(target, screenMapBlock?.data ?? null, (screenImages) => workspacePayload(screenImages))
      if (result.failedScreens.length) showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.screenMapImagesFailed(result.failedScreens))
      else showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.content.workspaceWritten(result.path, selectedIsScreenMap ? result.imageCount : null))
    } catch (error) {
      if (isWorkspaceJsonFileCancelled(error)) return
      showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.project.workspaceWriteFailed)
    }
  }
  const readContentWorkspaceJson = async () => {
    const target = workspaceTarget()
    if (!selectedItem || !target || !(await confirmAIDesktop({ title: 'ワークスペースのJSONを読み込みますか？', message: `${contentWorkspacePath(target)} を読み込みます。現在の未保存の編集内容は置き換えられます。`, confirmLabel: '読み込む' }))) return
    if (!supportsContentWorkspaceFolder()) { importContentJson(); return }
    try {
      const file = await readContentWorkspace(target)
      await applyContentJson(file.content)
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.project.workspaceRead(file.name))
    } catch (error) {
      if (isWorkspaceJsonFileCancelled(error)) return
      if (error instanceof Error && error.message === 'WORKSPACE_FILE_NOT_FOUND') { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.workspaceFileNotFound(contentWorkspacePath(target))); return }
      if (error instanceof Error && (error.message.startsWith('TARGET_SCOPE:') || ['RESOURCE_TYPE', 'TARGET_FORMAT', 'MERMAID', 'FORMAT', 'CONTENT', 'GLOSSARY', 'KIND', 'SCREEN_MAP'].includes(error.message))) { showContentImportError(error); return }
      showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.project.workspaceReadFailed)
    }
  }
  const changeContentWorkspaceJson = async () => {
    if (!supportsContentWorkspaceFolder()) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.workspaceUnsupported); return }
    try {
      const name = await selectContentWorkspaceFolder()
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.content.workspaceFolderSelected(name))
    } catch (error) {
      if (isWorkspaceJsonFileCancelled(error)) return
      showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.project.workspaceSelectFailed)
    }
  }
  const save = async () => {
    setSaveState('saving')
    try {
      for (const item of itemsRef.current) if (!await validateContentDiagrams(item.blocks)) throw new Error('MERMAID')
      const nextGlossary = glossary.filter((entry) => entry.term.trim() || entry.description.trim())
      const nextItems = itemsRef.current.map((item) => withAutomaticPageLayout({ ...item, navTitle: item.navTitle.trim() || '名称未設定', blocks: normalizeTableWidths(withoutPageGlossary(item.blocks)) }))
      const nextCategory: Category = { ...category, title: title.trim(), description: description.trim(), icon: icon.trim() || '◫', glossary: nextGlossary, items: nextItems }
      // kindは「Screen Mapのページを持つ」ことを表す。Screen Mapのページは常に先頭に置く。
      nextCategory.items = [...nextItems.filter((item) => screenMapBlockOf(item)), ...nextItems.filter((item) => !screenMapBlockOf(item))]
      if (nextCategory.items.some((item) => screenMapBlockOf(item))) nextCategory.kind = 'screen-map'
      else delete nextCategory.kind
      await onSave(nextCategory, targetGroupId, selectedItemId)
      setTitle(nextCategory.title)
      setDescription(nextCategory.description)
      setIcon(nextCategory.icon)
      setGlossary(nextGlossary)
      commitItems(nextItems)
      setSavedSnapshot(JSON.stringify({ title: nextCategory.title, description: nextCategory.description, icon: nextCategory.icon, targetGroupId, glossary: nextGlossary, items: nextItems }))
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.content.saved)
    } catch (error) {
      if (error instanceof Error && error.message === 'MERMAID') showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.content.mermaidInvalid)
    } finally {
      setSaveState('idle')
    }
  }
  // 下書きとJSON連携のボタン。ページ編集と、Screen Mapの編集画面の両方で使う。
  const contentExchange = selectedItem ? <div className="ad-content-exchange ad-content-exchange--header">
  <div className="ad-content-draft-actions" role="group" aria-label="AI下書き">
    <button type="button" className="draft-save" disabled={draftBusy} onClick={() => void saveContentDraft()}>下書き保存</button>
    <button type="button" className="draft-history" disabled={draftBusy} onClick={() => void openDraftDialog()}>下書き履歴</button>
  </div>
  <details className="ad-project-json-menu ad-project-json-menu--labeled">
    <summary>JSON連携 <span aria-hidden="true">⌄</span></summary>
    <div>
      <section><strong>ワークスペース</strong><button type="button" onClick={() => void writeContentWorkspaceJson()}>JSONへ書き出す</button><button type="button" onClick={() => void readContentWorkspaceJson()}>JSONから読み込む</button><button type="button" onClick={() => void changeContentWorkspaceJson()}>ワークスペースのフォルダを変更</button></section>
      <section><strong>ファイル操作</strong><button type="button" onClick={downloadCurrentContentJson}>JSONをダウンロード</button><button type="button" onClick={importContentJson}>JSONをインポート</button><button type="button" onClick={downloadContentTemplate}>テンプレートをダウンロード</button></section>
      <section className="ad-json-menu-copy"><strong>AIへの依頼</strong><label><input type="checkbox" checked={includeAiPrompt} onChange={(event) => setIncludeAiPrompt(event.target.checked)} /><span>AI用指示付き</span></label><button type="button" onClick={() => void copyContentTarget()}>コンテキストをコピー</button></section>
    </div>
  </details>
</div> : null
  return <div className="ad-category-editor">{screenMapPageOpen && screenMapBlock && selectedItem ? <div className="ad-sm-fullpage"><header className="ad-content-head ad-category-editor-head"><div><p className="ad-eyebrow">{service.name.toUpperCase()} / SCREEN MAP</p><h1>{title.trim() || 'カテゴリ'}のScreen Map</h1></div><div className="ad-home-controls"><button type="button" className="ad-editor-header-back" onClick={() => setScreenMapPageOpen(false)}>← ページ編集へ戻る</button>{contentExchange}<button type="button" className="ad-editor-header-save" disabled={!canSave || saveState === 'saving'} onClick={() => void save()}>{saveState === 'saving' ? '保存中…' : 'DBへ保存'}</button></div></header><ScreenMapEditor fill data={screenMapBlock.data} imageFolder={serviceId} onChange={(nextData) => updateItem({ ...selectedItem, blocks: [{ ...screenMapBlock, data: nextData }] })} /></div> : <><header className="ad-content-head ad-category-editor-head"><div><p className="ad-eyebrow">{service.name.toUpperCase()} / PAGE EDITOR</p><h1>カテゴリを編集</h1></div><div className="ad-home-controls"><div className="ad-mode-switch" aria-label="詳細カテゴリの表示モード"><button type="button" onClick={switchToView}>閲覧</button><button type="button" className="active" aria-current="page">編集</button></div><button type="button" className="ad-editor-header-back" onClick={backToCategories}>一覧へ戻る</button><button type="button" className="ad-editor-header-delete" onClick={onDelete}>カテゴリを削除</button><button type="button" className="ad-editor-header-save" disabled={!canSave || saveState === 'saving'} onClick={() => void save()}>{saveState === 'saving' ? '保存中…' : 'DBへ保存'}</button></div></header><section className={`ad-category-settings ${categorySettingsOpen ? 'open' : ''}`}><button type="button" className="ad-category-settings-toggle" aria-expanded={categorySettingsOpen} onClick={() => setCategorySettingsOpen((current) => !current)}><span><strong>カテゴリ設定</strong><small>{title.trim() || 'カテゴリ名未設定'} ・ {service.categoryGroups.find((group) => group.id === targetGroupId)?.title ?? '所属グループ未設定'}</small></span><i>{categorySettingsOpen ? '−' : '＋'}</i></button>{categorySettingsOpen && <div className="ad-editor-grid"><section className="ad-editor-form"><label><span>カテゴリ名</span><input value={title} maxLength={32} onChange={(event) => setTitle(event.target.value)} /></label><label><span>短い説明</span><input value={description} maxLength={60} onChange={(event) => setDescription(event.target.value)} /></label><label><span>所属グループ</span><select value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)}>{service.categoryGroups.map((group) => <option value={group.id} key={group.id}>{group.title}</option>)}</select></label><label className="ad-editor-check"><input type="checkbox" checked={usesScreenMap} onChange={(event) => void toggleScreenMap(event.target.checked)} /><span>Screen Mapを使う（画面遷移図のページを先頭に追加します）</span></label><label><span>アイコン</span><input value={icon} maxLength={3} onChange={(event) => setIcon(event.target.value)} /></label></section><aside className="ad-editor-preview"><span>カテゴリプレビュー</span><div className="ad-category"><i className="ad-category-icon">{icon || '◫'}</i><div><strong>{title || 'カテゴリ名'}</strong><small>{description || 'カテゴリの説明'}</small></div><b className="ad-arrow">✎</b></div><p>{usesScreenMap ? `詳細画面にはScreen Mapと ${items.length - 1} 件のコンテンツが表示されます。` : `詳細画面には ${items.length} 件のコンテンツが表示されます。`}</p></aside></div>}</section><section className={`ad-category-settings ad-category-glossary-settings ${glossaryOpen ? 'open' : ''}`}><button type="button" className="ad-category-settings-toggle" aria-expanded={glossaryOpen} onClick={() => setGlossaryOpen((current) => !current)}><span><strong>用語編集</strong><small>{glossary.length ? `${glossary.length}件の用語` : '用語は登録されていません'}</small></span><i>{glossaryOpen ? '−' : '＋'}</i></button>{glossaryOpen && <div className="ad-category-glossary-editor"><p>カテゴリ内の全ページで用語を自動リンクします。</p>{glossary.map((entry, index) => <div className="ad-category-glossary-row" key={entry.id}><label><span>用語</span><input value={entry.term} placeholder="例: SDK" onChange={(event) => updateGlossary(index, { term: event.target.value })} /></label><label><span>説明</span><textarea value={entry.description} placeholder="用語の説明を入力してください。" onChange={(event) => updateGlossary(index, { description: event.target.value })} /></label><button type="button" aria-label={`${entry.term || '用語'}を削除`} onClick={() => setGlossary((current) => current.filter((_, candidateIndex) => candidateIndex !== index))}>×</button></div>)}<button type="button" className="ad-glossary-add" onClick={addGlossaryEntry}>＋ 用語を追加</button></div>}</section><section className={`ad-item-editor ${pageEditorOpen ? 'open' : ''}`}><header><button type="button" className="ad-item-editor-toggle" aria-expanded={pageEditorOpen} onClick={() => setPageEditorOpen((current) => !current)}><span><h2>ページ編集</h2><p>{pageEditorOpen ? selectedIsScreenMap ? '画面を配置し、矢印でつないで画面遷移を整理します。' : 'ブロックの追加、編集、削除、並び替えができます。' : `${items.length}件のページ`}</p></span><i>{pageEditorOpen ? '−' : '＋'}</i></button>{pageEditorOpen && contentExchange}{pageEditorOpen && <button type="button" className="ad-add-content" onClick={addItem}>＋ コンテンツを追加</button>}</header>{pageEditorOpen && <div className="ad-item-editor-grid"><div className="ad-item-list">{items.length === 0 ? <p>コンテンツがありません。</p> : items.map((candidate, index) => <button key={candidate.id} className={candidate.id === selectedItemId ? 'active' : ''} onClick={() => { setSelectedItemId(candidate.id); if (screenMapBlockOf(candidate)) setScreenMapPageOpen(true) }}><span>{screenMapBlockOf(candidate) ? '◇' : String(index + (usesScreenMap ? 0 : 1)).padStart(2, '0')}</span><strong>{screenMapBlockOf(candidate) ? 'Screen Map' : candidate.navTitle || '名称未設定'}</strong><i>›</i></button>)}</div><div className="ad-item-fields">{selectedItem && screenMapBlock ? <div className="ad-sm-open-panel"><span aria-hidden="true">◇</span><h3>Screen Map</h3><p>画面 {screenMapBlock.data.screens.length}・遷移 {screenMapBlock.data.transitions.length}・グループ {screenMapBlock.data.groups.length}</p><button type="button" onClick={() => setScreenMapPageOpen(true)}>Screen Mapを編集</button></div> : selectedItem ? <><ContentCanvas item={selectedItem} onChange={updateItem} /><div className="ad-item-meta"><span>識別子</span><code>{selectedItem.id}</code></div><button className="danger" onClick={deleteItem}>このコンテンツを削除</button></> : <div className="ad-item-empty"><span>＋</span><p>コンテンツを追加すると、ここでページを編集できます。</p></div>}</div></div>}</section></>}{draftDialogOpen && <div className="ad-draft-dialog-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !draftBusy) setDraftDialogOpen(false) }}><section className="ad-draft-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-draft-dialog-title"><header><div><span>AI DRAFT</span><h2 id="ad-draft-dialog-title">AI下書き</h2><p>対象: {selectedItem?.navTitle || 'コンテンツ未選択'}</p></div><button type="button" aria-label="閉じる" disabled={draftBusy} onClick={() => setDraftDialogOpen(false)}>×</button></header><div className="ad-draft-history"><div className="ad-draft-history-heading"><strong>直近の保存履歴</strong><button type="button" disabled={draftBusy || draftHistory.length === 0} onClick={() => void deleteDraftHistory()}>履歴をすべて削除</button></div>{draftBusy && draftHistory.length === 0 ? <p>読み込み中…</p> : draftHistory.length === 0 ? <p>下書き保存の履歴はありません。</p> : <ol>{draftHistory.map((entry) => <li className={entry.id === selectedDraftHistoryId ? 'selected' : ''} key={entry.id}><button type="button" className="ad-draft-history-preview" aria-pressed={entry.id === selectedDraftHistoryId} disabled={draftBusy || !entry.hasPreview} onClick={() => void previewDraftHistory(entry)}><time>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(entry.savedAt)}</time><span>{entry.contentTitle}</span><small>{entry.hasPreview ? entry.id === selectedDraftHistoryId ? `選択中・第${entry.revision}版` : `第${entry.revision}版をプレビュー ›` : 'プレビュー情報なし'}</small></button></li>)}</ol>}</div><footer><button type="button" className="load" disabled={draftBusy || !selectedDraftHistoryId} onClick={() => void applySelectedDraftHistory()}>編集画面に反映</button></footer></section></div>}{draftPreview && <div className="ad-content-preview-overlay ad-draft-preview-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setDraftPreview(null) }}><section className="ad-content-preview-dialog ad-draft-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-draft-preview-title"><header><div><span>DRAFT HISTORY · 第{draftPreview.revision}版 · {new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(draftPreview.savedAt)}</span><h2 id="ad-draft-preview-title">{draftPreview.item.navTitle || '名称未設定'}</h2></div><button type="button" aria-label="履歴プレビューを閉じる" onClick={() => setDraftPreview(null)}>×</button></header><div className="ad-draft-preview-body"><div className="ad-article-stage"><article className="ad-article"><p className="ad-breadcrumb">{service.name} / {title.trim() || 'カテゴリ名'} / 保存履歴</p>{draftPreview.item.blocks.length ? draftPreview.item.blocks.map((block) => <BlockRenderer block={block} pageBlocks={withCategoryGlossary(draftPreview.item.blocks, draftPreview.glossary ?? glossary)} key={block.id} />) : <div className="ad-empty-page"><p>この履歴にはブロックがありません。</p></div>}</article><ContentTableOfContents blocks={withCategoryGlossary(draftPreview.item.blocks, draftPreview.glossary ?? glossary)} /></div></div><footer className="ad-draft-preview-actions"><p>コンテンツと用語を反映した後、編集画面の「DBへ保存」で資料に反映できます。</p><button type="button" onClick={() => setDraftPreview(null)}>閉じる</button><button type="button" className="apply" onClick={applyDraftPreview}>編集画面へ反映</button></footer></section></div>}</div>
}

function CategoryDetail({ serviceId, service, category, selectedId, canEdit, onBack, onSelect, onMode }: { serviceId: ServiceId; service: ServiceConfig; category: Category; selectedId: string; canEdit: boolean; onBack: () => void; onSelect: (id: string) => void; onMode: (mode: ServiceMode) => void }) {
  const selected = category.items.find((candidate) => candidate.id === selectedId) ?? category.items[0]
  const articleStageRef = useRef<HTMLDivElement>(null)
  const [imageCopyState, setImageCopyState] = useState<'idle' | 'copying'>('idle')
  // Screen Mapのミニマップは、キャンバスを広く使えるよう左ペインに表示する。
  const [screenMapMinimapSlot, setScreenMapMinimapSlot] = useState<HTMLDivElement | null>(null)
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
  const copyPageUrl = async () => {
    if (!selected) return
    const url = new URL('/ai-desktop', window.location.origin)
    url.searchParams.set('service', serviceId)
    url.searchParams.set('category', category.id)
    url.searchParams.set('content', selected.id)
    try {
      await navigator.clipboard.writeText(url.toString())
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.content.shareUrlCopied)
    } catch {
      showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.content.shareUrlCopyFailed)
    }
  }
  const screenMapBlock = screenMapBlockOf(selected)
  // Screen Mapのページは、名前ではなく「Screen Map」として一覧に出す。
  const pageNav = selected ? <nav>{category.items.map((candidate) => <button key={candidate.id} className={candidate.id === selected.id ? 'active' : ''} aria-current={candidate.id === selected.id ? 'page' : undefined} onClick={() => onSelect(candidate.id)}>{screenMapBlockOf(candidate) ? 'Screen Map' : candidate.navTitle}{candidate.id === selected.id && <span>●</span>}</button>)}</nav> : null
  if (screenMapBlock) return <div className="ad-article-layout ad-screen-map-layout"><aside className="ai-desktop-sidebar"><button className="ad-back" onClick={onBack}>← カテゴリ一覧へ戻る</button>{canEdit && <div className="ad-mode-switch ad-detail-view-switch" aria-label="詳細カテゴリの表示モード"><button type="button" className="active" aria-current="page">閲覧</button><button type="button" onClick={() => onMode('edit')}>編集</button></div>}<p className="ai-desktop-sidebar-service">{service.name}</p><h2>{category.title}</h2>{category.items.length > 1 && pageNav}<div ref={setScreenMapMinimapSlot} className="ad-sm-minimap-slot" /></aside><div className="ad-screen-map-stage"><p className="ad-breadcrumb">{service.name} / {category.title}</p><ScreenMapOverview data={screenMapBlock.data} title={category.title} minimapTarget={screenMapMinimapSlot} /></div></div>
  if (!selected) return <div className="ad-article-layout"><aside className="ai-desktop-sidebar"><button className="ad-back" onClick={onBack}>← カテゴリ一覧へ戻る</button>{canEdit && <div className="ad-mode-switch ad-detail-view-switch" aria-label="詳細カテゴリの表示モード"><button type="button" className="active" aria-current="page">閲覧</button><button type="button" onClick={() => onMode('edit')}>編集</button></div>}<p className="ai-desktop-sidebar-service">{service.name}</p><h2>{category.title}</h2></aside><section className="ad-content-empty"><span>□</span><h1>コンテンツがありません</h1><p>編集モードでコンテンツを追加してください。</p><button onClick={onBack}>カテゴリ一覧へ</button></section></div>
  return <div className="ad-article-layout"><aside className="ai-desktop-sidebar"><button className="ad-back" onClick={onBack}>← カテゴリ一覧へ戻る</button>{canEdit && <div className="ad-mode-switch ad-detail-view-switch" aria-label="詳細カテゴリの表示モード"><button type="button" className="active" aria-current="page">閲覧</button><button type="button" onClick={() => onMode('edit')}>編集</button></div>}<button type="button" className="ad-copy-page-image" disabled={imageCopyState === 'copying'} onClick={() => void copyPageImage()}>{imageCopyState === 'copying' ? '画像を作成中…' : 'ページを画像コピー'}<span aria-hidden="true">⧉</span></button><button type="button" className="ad-copy-page-image ad-copy-page-url" onClick={() => void copyPageUrl()}>ページURLをコピー<span aria-hidden="true">↗</span></button><p className="ai-desktop-sidebar-service">{service.name}</p><h2>{category.title}</h2>{pageNav}</aside><div ref={articleStageRef} className="ad-article-stage" key={selected.id}><article className="ad-article"><p className="ad-breadcrumb">{service.name} / {category.title}</p>{selected.blocks.length ? selected.blocks.map((block) => <BlockRenderer block={block} pageBlocks={withCategoryGlossary(selected.blocks, category.glossary)} key={block.id} />) : <div className="ad-empty-page"><p>このページにはまだブロックがありません。</p></div>}<div className="ad-learning-nav"><button onClick={onBack}>カテゴリ一覧へ</button><span>{category.items.findIndex((candidate) => candidate.id === selected.id) + 1} / {category.items.length}</span></div></article><ContentTableOfContents blocks={withCategoryGlossary(selected.blocks, category.glossary)} /></div></div>
}

function ServiceContent({ serviceId, service, mode, canEdit, navigation, publicationStatus, publicationBusy, onMaterialList, onPublication, onMode, onChange, onAddCategory, onUpdateService, onSaveCategory, onDelete }: { serviceId: ServiceId; service: ServiceConfig; mode: ServiceMode; canEdit: boolean; navigation: ServiceNavigation; publicationStatus?: 'draft' | 'published' | 'unpublished'; publicationBusy?: boolean; onMaterialList: () => void; onPublication?: () => void; onMode: (mode: ServiceMode) => void; onChange: (next: ServiceNavigation) => void; onAddCategory: (groupId: string) => void; onUpdateService: (service: ServiceConfig) => void; onSaveCategory: (category: Category, sourceGroupId: string, targetGroupId: string, contentId: string | null) => Promise<void>; onDelete: (categoryId: string) => void }) {
  const categories = allCategories(service)
  const category = categories.find((candidate) => candidate.id === navigation.categoryId)
  const group = service.categoryGroups.find((candidate) => candidate.categories.some((item) => item.id === navigation.categoryId))
  if (!category || !group) return <ServiceHome service={service} mode={canEdit ? mode : 'view'} canEdit={canEdit} publicationStatus={publicationStatus} publicationBusy={publicationBusy} onMaterialList={onMaterialList} onPublication={onPublication} onMode={onMode} onAddCategory={onAddCategory} onUpdateService={onUpdateService} onCategory={(categoryId) => { const next = categories.find((candidate) => candidate.id === categoryId)!; onChange({ categoryId, contentId: mode === 'view' || !canEdit ? next.items[0]?.id ?? null : null }) }} />
  if (mode === 'edit' && canEdit) return <CategoryEditor key={category.id} serviceId={serviceId} service={service} category={category} groupId={group.id} initialSelectedItemId={navigation.contentId} onBack={() => onChange({ categoryId: null, contentId: null })} onView={(contentId) => { onChange({ categoryId: category.id, contentId }); onMode('view') }} onSave={(next, targetGroupId, contentId) => onSaveCategory(next, group.id, targetGroupId, contentId)} onDelete={() => onDelete(category.id)} />
  return <CategoryDetail serviceId={serviceId} service={service} category={category} selectedId={navigation.contentId ?? category.items[0]?.id ?? ''} canEdit={canEdit} onMode={onMode} onBack={() => onChange({ categoryId: null, contentId: null })} onSelect={(contentId) => onChange({ categoryId: category.id, contentId })} />
}

function DocumentsWorkspace({ kind, selectedServiceId, catalog, publications, modes, navigation, canEdit, onService, onMode, onChange, onAddCategory, onUpdateService, onSaveCategory, onDelete, onCreateCatalog, onCatalogPublication }: { kind: 'personal' | 'published'; selectedServiceId: ServiceId | null; catalog: Record<ServiceId, ServiceConfig>; publications: Record<ServiceId, AIDesktopCatalogPublication>; modes: Record<ServiceId, ServiceMode>; navigation: Record<ServiceId, ServiceNavigation>; canEdit: boolean; onService: (serviceId: ServiceId | null) => void; onMode: (serviceId: ServiceId, mode: ServiceMode) => void; onChange: (serviceId: ServiceId, next: ServiceNavigation) => void; onAddCategory: (serviceId: ServiceId, groupId: string) => void; onUpdateService: (serviceId: ServiceId, service: ServiceConfig) => void; onSaveCategory: (serviceId: ServiceId, category: Category, sourceGroupId: string, targetGroupId: string, contentId: string | null) => Promise<void>; onDelete: (serviceId: ServiceId, categoryId: string) => void; onCreateCatalog: (name: string, eyebrow: string, introduction: string) => Promise<ServiceId>; onCatalogPublication: (serviceId: ServiceId, published: boolean) => Promise<void> }) {
  const isPersonal = kind === 'personal'
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEyebrow, setCreateEyebrow] = useState('KNOWLEDGE BASE')
  const [createIntroduction, setCreateIntroduction] = useState('')
  const [busyServiceId, setBusyServiceId] = useState<ServiceId | null>(null)
  if (isPersonal && !canEdit) return <div className="ad-auth-required"><span>✎</span><h1>マイ資料</h1><p>資料を作成・編集・公開するには、Hundredへサインインしてください。</p></div>
  const workspaceCatalog = Object.fromEntries(Object.entries(catalog).filter(([serviceId]) => isPersonal || (publications[serviceId]?.status ?? 'published') === 'published')) as Record<ServiceId, ServiceConfig>
  const publicationLabel = (serviceId: ServiceId) => { const status = publications[serviceId]?.status ?? 'published'; return status === 'published' ? '公開中' : status === 'draft' ? '下書き' : '非公開' }
  const publicationClass = (serviceId: ServiceId) => publications[serviceId]?.status ?? 'published'
  const submitCreate = async () => {
    if (!createName.trim() || busyServiceId) return
    setBusyServiceId('creating')
    try {
      const serviceId = await onCreateCatalog(createName.trim(), createEyebrow.trim(), createIntroduction.trim())
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.document.created)
      setCreateOpen(false)
      setCreateName('')
      setCreateEyebrow('KNOWLEDGE BASE')
      setCreateIntroduction('')
      onMode(serviceId, 'edit')
      onChange(serviceId, { categoryId: null, contentId: null })
      onService(serviceId)
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.document.createFailed))
    } finally {
      setBusyServiceId(null)
    }
  }
  const changePublication = async (serviceId: ServiceId) => {
    if (busyServiceId) return
    setBusyServiceId(serviceId)
    try {
      await onCatalogPublication(serviceId, (publications[serviceId]?.status ?? 'published') !== 'published')
    } finally {
      setBusyServiceId(null)
    }
  }
  if (!selectedServiceId) {
    return <AppShell className="ad-documents-home"><AppHeader eyebrow={isPersonal ? 'PERSONAL WORKSPACE' : 'PUBLISHED LIBRARY'} title={isPersonal ? 'マイ資料' : '公開資料'} description={isPersonal ? '資料の作成・編集・公開状態を管理します。公開した資料だけが公開資料に表示されます。' : '公開済みの資料を閲覧します。'} actions={<div className="ad-document-home-actions"><span className={`ad-document-scope ${isPersonal ? 'personal' : 'published'}`}>{isPersonal ? '作成・編集' : '公開済み'}</span>{isPersonal && <button type="button" className="primary" disabled={!canEdit} onClick={() => setCreateOpen(true)}>＋ 資料を作成</button>}</div>} />
      <AppContent><div className="ad-document-library-layout"><section className="ad-material-list-panel"><header><h2>資料一覧</h2><span>{Object.keys(workspaceCatalog).length}件</span></header><div className={`ad-document-service-grid ${isPersonal ? 'personal' : 'published'}`}>{Object.entries(workspaceCatalog).map(([serviceId, service]) => { const categories = allCategories(service); const pageCount = categories.reduce((total, category) => total + category.items.length, 0); return <article key={serviceId}><button type="button" className="ad-document-service-open" onClick={() => onService(serviceId)}><i>{serviceId === 'chatgpt' ? '◎' : serviceId === 'codex' ? '⌘' : serviceId === 'claude' ? 'C' : serviceId === 'ai-desktop' ? '▦' : '◇'}</i><span><strong>{service.name}</strong><small>{categories.length}カテゴリ ・ {pageCount}ページ{isPersonal ? ` ・ ${publicationLabel(serviceId)}` : ''}</small></span><b>›</b></button></article> })}</div></section><aside className="ad-document-history"><header><h2>履歴</h2></header><div className="ad-document-history-empty"><span>◷</span><strong>履歴はありません</strong><p>履歴機能は今後ここに表示します。</p></div></aside></div></AppContent>
      {createOpen && <div className="ad-document-create-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !busyServiceId) setCreateOpen(false) }}><section role="dialog" aria-modal="true" aria-labelledby="ad-document-create-title"><header><div><small>NEW MATERIAL</small><h2 id="ad-document-create-title">資料を作成</h2><p>ChatGPTやCodexと同じ階層に、非公開の資料を作成します。</p></div><button type="button" aria-label="閉じる" disabled={Boolean(busyServiceId)} onClick={() => setCreateOpen(false)}>×</button></header><label><span>資料名</span><input autoFocus maxLength={100} value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="例：社内開発ガイド" /></label><label><span>英字ラベル</span><input maxLength={100} value={createEyebrow} onChange={(event) => setCreateEyebrow(event.target.value)} placeholder="KNOWLEDGE BASE" /></label><label><span>説明</span><textarea rows={4} maxLength={2000} value={createIntroduction} onChange={(event) => setCreateIntroduction(event.target.value)} placeholder="この資料で扱う内容を入力してください。" /></label><footer><button type="button" disabled={Boolean(busyServiceId)} onClick={() => setCreateOpen(false)}>キャンセル</button><button type="button" className="primary" disabled={Boolean(busyServiceId) || !createName.trim()} onClick={() => void submitCreate()}>{busyServiceId ? '作成中…' : '作成して編集'}</button></footer></section></div>}
    </AppShell>
  }
  const service = workspaceCatalog[selectedServiceId]
  if (!service) return <div className="ad-content-empty"><h1>この資料は非公開です</h1><button type="button" onClick={() => onService(null)}>公開資料へ戻る</button></div>
  const currentNavigation = navigation[selectedServiceId] ?? { categoryId: null, contentId: null }
  const currentMode = modes[selectedServiceId] ?? 'view'
  return <div className="ad-documents-content ad-documents-content--standalone"><ServiceContent serviceId={selectedServiceId} service={service} mode={isPersonal ? currentMode : 'view'} canEdit={isPersonal && canEdit} navigation={currentNavigation} publicationStatus={isPersonal ? publicationClass(selectedServiceId) : undefined} publicationBusy={Boolean(busyServiceId)} onMaterialList={() => onService(null)} onPublication={isPersonal ? () => void changePublication(selectedServiceId) : undefined} onMode={(mode) => onMode(selectedServiceId, mode)} onChange={(next) => onChange(selectedServiceId, next)} onAddCategory={(groupId) => onAddCategory(selectedServiceId, groupId)} onUpdateService={(next) => onUpdateService(selectedServiceId, next)} onSaveCategory={(category, sourceGroupId, targetGroupId, contentId) => onSaveCategory(selectedServiceId, category, sourceGroupId, targetGroupId, contentId)} onDelete={(categoryId) => onDelete(selectedServiceId, categoryId)} /></div>
}

function GenericContent({ id, canEdit, catalog, documents, customApps, visibility, onTheme, onSaveApps, onOpenProjectDocument, documentsProjectRequest, onOpenProjectDesignDocuments, taskbarPosition, onTaskbarPosition }: { id: 'projects' | 'design-documents' | 'explorer' | 'settings'; canEdit: boolean; catalog: Record<ServiceId, ServiceConfig>; documents: AIDesktopDocument[]; customApps: AIDesktopCustomApp[]; visibility: Record<string, boolean>; onTheme: () => void; onSaveApps: (apps: AIDesktopCustomApp[], visibility: Record<string, boolean>) => void; onOpenProjectDocument: (document: AIDesktopProjectDocument, edit?: boolean) => void; documentsProjectRequest: DesignDocumentsProjectRequest | null; onOpenProjectDesignDocuments: (projectId: string) => void; taskbarPosition: AIDesktopTaskbarPosition; onTaskbarPosition: (position: AIDesktopTaskbarPosition) => void }) {
  if (id === 'settings') return <div className="ad-generic"><p className="ad-eyebrow">PERSONALIZE</p><h1>設定</h1><div className="ad-setting-row"><div><strong>タスクバーの位置</strong><p>左右に置くと、資料を表示する縦の領域が広がります。</p></div><div className="ad-setting-options" role="group" aria-label="タスクバーの位置">{(['bottom', 'left', 'right'] as const).map((position) => <button type="button" key={position} className={taskbarPosition === position ? 'active' : ''} aria-pressed={taskbarPosition === position} onClick={() => onTaskbarPosition(position)}>{{ bottom: '下', left: '左', right: '右' }[position]}</button>)}</div></div><div className="ad-setting-row"><div><strong>カラーモード</strong><p>{canEdit ? 'デスクトップとウィンドウの表示を切り替え、DBへ保存します。' : 'デスクトップとウィンドウの表示を切り替えます。ゲスト利用中の変更は保存されません。'}</p></div><button onClick={onTheme}>ライト / ダークを切り替え</button></div><div className="ad-setting-row"><div><strong>壁紙</strong><p>現在の壁紙: Aurora</p></div><span className="ad-wallpaper-chip" /></div></div>
  if (id === 'projects') return <ProjectsApp canManage={canEdit} catalog={catalog} publishedDocuments={documents.filter((document) => document.status === 'published')} onOpenDocument={onOpenProjectDocument} onOpenDesignDocuments={onOpenProjectDesignDocuments} />
  if (id === 'design-documents') return <DesignDocumentsApp canManage={canEdit} projectRequest={documentsProjectRequest} />
  if (!canEdit) return <div className="ad-auth-required"><span>▰</span><h1>Explorer</h1><p>画像と追加APPを管理するには、Hundredへサインインしてください。</p></div>
  return <ImageExplorer canManage={canEdit} builtInApps={apps} customApps={customApps} visibility={visibility} onSaveApps={onSaveApps} />
}

function AIDesktopPage() {
  const navigate = useNavigate()
  const { openAppleIntelligence } = useHundredAppleIntelligence()
  const [restoredSession] = useState(() => readAIDesktopSessionState('desktop', isDesktopSession))
  const [windows, setWindows] = useState<WindowState[]>(() => restoredWindows(restoredSession))
  const [documentsProjectRequest, setDocumentsProjectRequest] = useState<DesignDocumentsProjectRequest | null>(null)
  const [active, setActive] = useState<AppId | null>(restoredSession?.active ?? null)
  const [startOpen, setStartOpen] = useState(false)
  const [taskbarVisible, setTaskbarVisible] = useState(true)
  const [taskbarPosition, setTaskbarPosition] = useState<AIDesktopTaskbarPosition>('bottom')
  const [taskbarPeekOpen, setTaskbarPeekOpen] = useState(false)
  const [layoutEditing, setLayoutEditing] = useState(false)
  const [desktopIconPositions, setDesktopIconPositions] = useState<Record<AppId, DesktopIconPosition>>(defaultDesktopIconPositions)
  const [customApps, setCustomApps] = useState<AIDesktopCustomApp[]>([])
  const [desktopAppVisibility, setDesktopAppVisibility] = useState<Record<string, boolean>>({})
  const [dark, setDark] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [accountName, setAccountName] = useState('Guest User')
  const [catalog, setCatalog] = useState<Record<ServiceId, ServiceConfig>>({})
  const [catalogPublications, setCatalogPublications] = useState<Record<ServiceId, AIDesktopCatalogPublication>>({})
  const [documents, setDocuments] = useState<AIDesktopDocument[]>([])
  const [catalogReady, setCatalogReady] = useState(false)
  const [serviceModes, setServiceModes] = useState<Record<ServiceId, ServiceMode>>({ codex: 'view', chatgpt: 'view', claude: 'view', 'ai-desktop': 'view' })
  const [serviceNavigation, setServiceNavigation] = useState<Record<ServiceId, ServiceNavigation>>(() => ({ ...{ codex: { categoryId: null, contentId: null }, chatgpt: { categoryId: null, contentId: null }, claude: { categoryId: null, contentId: null }, 'ai-desktop': { categoryId: null, contentId: null } }, ...restoredSession?.serviceNavigation }))
  const [personalServiceId, setPersonalServiceId] = useState<ServiceId | null>(restoredSession?.personalServiceId ?? null)
  const [publishedServiceId, setPublishedServiceId] = useState<ServiceId | null>(restoredSession?.publishedServiceId ?? null)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [changingAccount, setChangingAccount] = useState(false)
  const zRef = useRef(Math.max(2, ...(restoredSession?.windows.map((win) => win.z) ?? [])))
  useAIDesktopSessionStateSaver('desktop', { windows, active, personalServiceId, publishedServiceId, serviceNavigation })
  const draggedDesktopIconRef = useRef<AppId | null>(null)
  const hiddenTaskbarRef = useRef<HTMLDivElement>(null)
  const sharedTargetRef = useRef<SharedContentTarget | null>(sharedContentTarget(window.location.search))
  const sharedTargetAppliedRef = useRef(false)
  // 公開済みの一覧と、自分の資料（非公開を含む）の一覧は別々に届く。自分の資料を反映したあとに公開済みの一覧で上書きすると、非公開の資料が消えるため、後から届いた公開済みの一覧は使わない。
  const manageableCatalogsAppliedRef = useRef(false)
  const applyCatalogs = (catalogs: Partial<Record<string, unknown>>) => setCatalog((current) => Object.fromEntries(Object.entries(catalogs).map(([serviceId, value]) => [serviceId, normalizeServiceConfig(value, current[serviceId] ?? { schemaVersion: 3, name: serviceId, eyebrow: 'KNOWLEDGE BASE', introduction: '', categoryGroups: [] })])))
  const refreshDocuments = (manage = canEdit) => listAIDesktopDocuments(manage).then((result) => setDocuments(result.documents)).catch(() => undefined)

  useEffect(() => {
    let active = true
    const syncAccount = async () => {
      try {
        const [user, session] = await Promise.all([getCurrentUser(), fetchAuthSession()])
        const claims = session.tokens?.idToken?.payload
        const tokenName = typeof claims?.name === 'string' ? claims.name : undefined
        const preferredUsername = typeof claims?.preferred_username === 'string' ? claims.preferred_username : undefined
        const tokenEmail = typeof claims?.email === 'string' ? claims.email : undefined
        if (!active) return
        const tokenDisplayName = resolveAccountName(user.username, tokenName, preferredUsername, tokenEmail)
        setCanEdit(Boolean(session.tokens?.accessToken))
        setAccountName(tokenDisplayName)
        if (session.tokens?.accessToken) void syncAIDesktopUserProfile(tokenDisplayName).catch(() => undefined)
        try {
          const attributes = await fetchUserAttributes()
          if (!active) return
          const displayName = resolveAccountName(user.username, attributes.name, undefined, attributes.email)
          setAccountName(displayName)
          if (session.tokens?.accessToken) void syncAIDesktopUserProfile(displayName).catch(() => undefined)
        } catch { /* IDトークン由来の表示名を維持する。 */ }
      } catch {
        if (!active) return
        setCanEdit(false)
        setAccountName('Guest User')
      }
    }
    void syncAccount()
    return () => { active = false }
  }, [])
  useEffect(() => { if (!accountDialogOpen) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !changingAccount) setAccountDialogOpen(false) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [accountDialogOpen, changingAccount])
  useEffect(() => {
    if (!taskbarPeekOpen) return
    const closePeek = (event: PointerEvent) => { if (!hiddenTaskbarRef.current?.contains(event.target as Node)) setTaskbarPeekOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setTaskbarPeekOpen(false) }
    document.addEventListener('pointerdown', closePeek, true)
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closePeek, true); window.removeEventListener('keydown', closeOnEscape) }
  }, [taskbarPeekOpen])
  useEffect(() => { let active = true; void getAIDesktopCatalogs<unknown>().then(({ catalogs, publications }) => { if (!active || manageableCatalogsAppliedRef.current) return; applyCatalogs(catalogs); setCatalogPublications(publications) }).catch(() => { /* Local API未起動時は初期データを表示する。 */ }).finally(() => { if (active) setCatalogReady(true) }); return () => { active = false } }, [])
  useEffect(() => { void listAIDesktopDocuments().then((result) => setDocuments(result.documents)).catch(() => undefined) }, [])
  useEffect(() => { if (!canEdit) return; let active = true; void Promise.all([getManageableAIDesktopCatalogs<unknown>(), listAIDesktopDocuments(true)]).then(([catalogResult, documentResult]) => { if (!active) return; manageableCatalogsAppliedRef.current = true; applyCatalogs(catalogResult.catalogs); setCatalogPublications(catalogResult.publications); setDocuments(documentResult.documents) }).catch((error: unknown) => { if (active) showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.document.manageableLoadFailed)) }); return () => { active = false } }, [canEdit])
  useEffect(() => {
    const target = sharedTargetRef.current
    if (!catalogReady || sharedTargetAppliedRef.current || !target) return
    sharedTargetAppliedRef.current = true
    const targetService = catalog[target.serviceId]
    const category = targetService ? allCategories(targetService).find((candidate) => candidate.id === target.categoryId) : undefined
    const item = category?.items.find((candidate) => candidate.id === target.contentId)
    if (!category || !item) {
      showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.content.sharedPageNotFound)
      return
    }
    setServiceModes((current) => ({ ...current, [target.serviceId]: 'view' }))
    setServiceNavigation((current) => ({ ...current, [target.serviceId]: { categoryId: category.id, contentId: item.id } }))
    zRef.current += 1
    setPublishedServiceId(target.serviceId)
    setWindows([{ id: 'documents', x: 0, y: 0, width: window.innerWidth, height: window.innerHeight, minimized: false, maximized: true, z: zRef.current }])
    setActive('documents')
  }, [catalog, catalogReady])
  useEffect(() => { let active = true; void getAIDesktopState().then(({ state }) => { if (!active || !state) return; const saved = state.iconPositions as Partial<Record<AppId, DesktopIconPosition>>; setDesktopIconPositions({ ...defaultDesktopIconPositions, ...saved }); setTaskbarVisible(state.taskbarVisible); setTaskbarPosition(state.taskbarPosition ?? 'bottom'); setDark(state.theme === 'dark'); setCustomApps(state.customApps ?? []); const savedVisibility = state.desktopAppVisibility ?? {}; setDesktopAppVisibility({ ...savedVisibility, 'my-documents': savedVisibility['my-documents'] ?? true, documents: savedVisibility.documents ?? true }) }).catch(() => { /* マイグレーション前は既定配置を使用する。 */ }); return () => { active = false } }, [])
  const appById = useMemo(() => Object.fromEntries(apps.map((app) => [app.id, app])), [])

  const goToSignIn = async () => { setChangingAccount(true); try { try { await signOut() } catch { /* Guest session */ } endHundredGuestSession(); navigate('/', { replace: true }) } finally { setChangingAccount(false) } }
  const openApp = (id: AppId) => { zRef.current += 1; setWindows((current) => { const existing = current.find((win) => win.id === id); if (existing) return current.map((win) => win.id === id ? { ...win, minimized: false, z: zRef.current } : win); const offset = current.length * 28; return [...current, { id, x: 110 + offset, y: 62 + offset, width: Math.min(940, window.innerWidth - 150), height: Math.min(650, window.innerHeight - 120), minimized: false, maximized: false, z: zRef.current }] }); setActive(id); setStartOpen(false) }
  const focus = (id: AppId) => { zRef.current += 1; setActive(id); setWindows((current) => current.map((win) => win.id === id ? { ...win, z: zRef.current } : win)) }
  const update = (id: AppId, next: Partial<WindowState>) => setWindows((current) => current.map((win) => win.id === id ? { ...win, ...next } : win))
  const close = (id: AppId) => { setWindows((current) => current.filter((win) => win.id !== id)); if (active === id) setActive(null) }
  const persistService = async (id: ServiceId, next: ServiceConfig, afterSave?: () => void) => { try { await saveAIDesktopCatalog(id, next); setCatalog((current) => ({ ...current, [id]: next })); await refreshDocuments(true); afterSave?.() } catch (error: unknown) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.content.saveFailed)); throw error } }
  const addCategory = (id: ServiceId, groupId: string) => { const categoryId = `category-${Date.now()}`; const nextCategory: Category = { id: categoryId, title: '新しいカテゴリ', description: 'カテゴリの説明を入力', icon: '＋', items: [content(`overview-${Date.now()}`, '概要', 'このカテゴリの概要です。')] }; setCatalog((current) => ({ ...current, [id]: { ...current[id], categoryGroups: current[id].categoryGroups.map((group) => group.id === groupId ? { ...group, categories: [...group.categories, nextCategory] } : group) } })); setServiceNavigation((current) => ({ ...current, [id]: { categoryId, contentId: null } })) }
  const updateService = (id: ServiceId, next: ServiceConfig) => { void persistService(id, next).catch(() => undefined) }
  const saveCategory = (id: ServiceId, category: Category, sourceGroupId: string, targetGroupId: string): Promise<void> => { const next = { ...catalog[id], categoryGroups: catalog[id].categoryGroups.map((group) => { const withoutCategory = group.categories.filter((candidate) => candidate.id !== category.id); return group.id === targetGroupId ? { ...group, categories: [...withoutCategory, category] } : group.id === sourceGroupId ? { ...group, categories: withoutCategory } : group }) }; return persistService(id, next) }
  const deleteCategory = async (id: ServiceId, categoryId: string) => { if (!(await confirmAIDesktop({ title: 'このカテゴリを削除しますか？', confirmLabel: '削除', tone: 'danger' }))) return; const next = { ...catalog[id], categoryGroups: catalog[id].categoryGroups.map((group) => ({ ...group, categories: group.categories.filter((candidate) => candidate.id !== categoryId) })) }; void persistService(id, next, () => setServiceNavigation((current) => ({ ...current, [id]: { categoryId: null, contentId: null } }))).catch(() => undefined) }

  const persistDesktopState = (iconPositions: Record<AppId, DesktopIconPosition>, visible: boolean, theme: 'light' | 'dark' = dark ? 'dark' : 'light', nextCustomApps = customApps, nextVisibility = desktopAppVisibility, position = taskbarPosition) => { if (!canEdit) return; void saveAIDesktopState({ iconPositions, taskbarVisible: visible, taskbarPosition: position, theme, customApps: nextCustomApps, desktopAppVisibility: nextVisibility }).catch((error: unknown) => showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.app.settingsSaveFailed))) }
  const saveApps = (nextApps: AIDesktopCustomApp[], nextVisibility: Record<string, boolean>) => { setCustomApps(nextApps); setDesktopAppVisibility(nextVisibility); persistDesktopState(desktopIconPositions, taskbarVisible, dark ? 'dark' : 'light', nextApps, nextVisibility) }
  const openCustomApp = (app: AIDesktopCustomApp) => { window.open(app.url, '_blank', 'noopener,noreferrer'); setStartOpen(false) }
  const showDesktop = () => { setWindows((current) => current.map((win) => ({ ...win, minimized: true }))); setActive(null); setStartOpen(false) }
  const handleStart = () => { if (windows.some((win) => !win.minimized)) { showDesktop(); return } setStartOpen((current) => !current) }
  const hideTaskbar = () => { setTaskbarPeekOpen(false); setTaskbarVisible(false); persistDesktopState(desktopIconPositions, false) }
  const activatePeekApp = (win: WindowState) => { if (win.minimized) openApp(win.id); else focus(win.id); setTaskbarPeekOpen(false) }
  const changeTaskbarPosition = (position: AIDesktopTaskbarPosition) => { setTaskbarPosition(position); persistDesktopState(desktopIconPositions, taskbarVisible, undefined, customApps, desktopAppVisibility, position) }
  const toggleTheme = () => { const next = dark ? 'light' : 'dark'; setDark(next === 'dark'); persistDesktopState(desktopIconPositions, taskbarVisible, next) }
  const startDesktopIconDrag = (event: React.PointerEvent<HTMLButtonElement>, id: AppId) => { if (event.button !== 0 || window.innerWidth <= 760 || !canEdit || !layoutEditing) return; event.stopPropagation(); const startX = event.clientX; const startY = event.clientY; const origin = desktopIconPositions[id]; let moved = false; let latest = origin; const move = (moveEvent: PointerEvent) => { const deltaX = moveEvent.clientX - startX; const deltaY = moveEvent.clientY - startY; if (!moved && Math.hypot(deltaX, deltaY) < 4) return; moved = true; latest = { x: Math.max(0, Math.min(window.innerWidth - 92, origin.x + deltaX)), y: Math.max(0, Math.min(window.innerHeight - (taskbarVisible ? 48 : 0) - 84, origin.y + deltaY)) }; setDesktopIconPositions((current) => ({ ...current, [id]: latest })) }; const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); if (moved) { draggedDesktopIconRef.current = id; persistDesktopState({ ...desktopIconPositions, [id]: latest }, taskbarVisible) } }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop) }
  const selectDesktopIcon = (id: AppId) => { if (draggedDesktopIconRef.current === id) { draggedDesktopIconRef.current = null; return } setActive(id) }

  const startDrag = (event: React.PointerEvent, win: WindowState) => { if (win.maximized || (event.target as HTMLElement).closest('button')) return; focus(win.id); const startX = event.clientX; const startY = event.clientY; const originX = win.x; const originY = win.y; const move = (moveEvent: PointerEvent) => update(win.id, { x: Math.max(0, originX + moveEvent.clientX - startX), y: Math.max(0, originY + moveEvent.clientY - startY) }); const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop) }
  const openProjectDesignDocuments = (projectId: string) => { setDocumentsProjectRequest((current) => ({ projectId, sequence: (current?.sequence ?? 0) + 1 })); openApp('design-documents') }
  const openProjectDocument = (document: AIDesktopProjectDocument, edit = false) => {
    setServiceNavigation((current) => ({ ...current, [document.serviceId]: { categoryId: document.categoryId, contentId: document.contentId } }))
    setServiceModes((current) => ({ ...current, [document.serviceId]: edit && canEdit ? 'edit' : 'view' }))
    const publication = documents.find((candidate) => candidate.serviceId === document.serviceId && candidate.categoryId === document.categoryId && candidate.contentId === document.contentId)
    if ((edit || publication?.status !== 'published') && canEdit) { setPersonalServiceId(document.serviceId); openApp('my-documents') }
    else { setPublishedServiceId(document.serviceId); openApp('documents') }
  }
  const createCatalog = async (name: string, eyebrow: string, introduction: string) => {
    const result = await createAIDesktopCatalog(name, eyebrow, introduction)
    setCatalog((current) => ({ ...current, [result.serviceId]: normalizeServiceConfig(result.catalog, { schemaVersion: 3, name, eyebrow, introduction, categoryGroups: [] }) }))
    setCatalogPublications((current) => ({ ...current, [result.serviceId]: result.publication }))
    setServiceModes((current) => ({ ...current, [result.serviceId]: 'edit' }))
    setServiceNavigation((current) => ({ ...current, [result.serviceId]: { categoryId: null, contentId: null } }))
    return result.serviceId
  }
  const updateCatalogPublication = async (serviceId: ServiceId, published: boolean) => {
    const includesScreenMap = Boolean(catalog[serviceId]?.categoryGroups.some((group) => group.categories.some((category) => categoryKindOf(category) === 'screen-map')))
    if (published && includesScreenMap && !(await confirmAIDesktop({ title: AI_DESKTOP_MESSAGES.document.screenMapPublicationTitle, message: AI_DESKTOP_MESSAGES.document.screenMapPublicationMessage, confirmLabel: '公開する', tone: 'danger' }))) return
    try {
      const result = await setAIDesktopCatalogPublication(serviceId, published)
      setCatalogPublications((current) => ({ ...current, [serviceId]: { ...(current[serviceId] ?? { ownerId: accountName, createdBy: accountName, updatedBy: accountName, publishedBy: null, createdAt: Date.now(), updatedAt: Date.now(), publishedAt: null }), ...result.publication } as AIDesktopCatalogPublication }))
      await refreshDocuments(true)
      showAIDesktopNotification('success', published ? AI_DESKTOP_MESSAGES.document.published : AI_DESKTOP_MESSAGES.document.unpublished)
      if (!published && publishedServiceId === serviceId) setPublishedServiceId(null)
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.document.publicationFailed))
    }
  }

  return <main className={`ai-desktop ${dark ? 'dark' : ''} ${taskbarVisible ? `taskbar-${taskbarPosition}` : 'taskbar-hidden'} ${layoutEditing ? 'layout-editing' : ''}`} onPointerDown={() => setStartOpen(false)}><AIDesktopNotifications /><AIDesktopConfirmDialog /><div className="ad-wallpaper-orb one" /><div className="ad-wallpaper-orb two" /><section className="ad-desktop-icons" aria-label="デスクトップのアプリ">{apps.filter((app) => desktopAppVisibility[app.id] !== false).map((app) => <button key={app.id} style={{ left: desktopIconPositions[app.id].x, top: desktopIconPositions[app.id].y }} onPointerDown={(event) => startDesktopIconDrag(event, app.id)} onDoubleClick={() => { if (draggedDesktopIconRef.current !== app.id) openApp(app.id) }} onClick={() => selectDesktopIcon(app.id)} className={active === app.id ? 'selected' : ''}><AppIcon id={app.id} /><span>{app.name}</span></button>)}{customApps.filter((app) => desktopAppVisibility[app.id] !== false).map((app, index) => <button key={app.id} style={{ left: 110 + Math.floor(index / 6) * 92, top: 18 + (index % 6) * 92 }} onDoubleClick={() => openCustomApp(app)}><span className="ad-app-icon large" style={{ '--app-color': app.color } as CSSProperties}>{app.mark}</span><span>{app.name}</span></button>)}</section>
    {windows.filter((win) => !win.minimized).map((win) => <section key={win.id} className={`ad-window ${active === win.id ? 'active' : ''} ${win.maximized ? 'maximized' : ''}`} style={win.maximized ? { zIndex: win.z } : { left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.z }} onPointerDown={(event) => { event.stopPropagation(); focus(win.id) }}><div className="ad-fullscreen-titlebar-trigger" aria-hidden="true" /><header className="ad-titlebar" onPointerDown={(event) => startDrag(event, win)} onDoubleClick={() => update(win.id, { maximized: !win.maximized })}><div><AppIcon id={win.id} size="small" /><strong>{appById[win.id].name}</strong></div><nav><button aria-label="最小化" onClick={() => update(win.id, { minimized: true })}>—</button><button aria-label={win.maximized ? '元のサイズに戻す' : '最大化'} onClick={() => update(win.id, { maximized: !win.maximized })}>□</button><button aria-label="閉じる" className="close" onClick={() => close(win.id)}>×</button></nav></header><div className="ad-window-body">{win.id === 'my-documents' || win.id === 'documents' ? <DocumentsWorkspace kind={win.id === 'my-documents' ? 'personal' : 'published'} selectedServiceId={win.id === 'my-documents' ? personalServiceId : publishedServiceId} catalog={catalog} publications={catalogPublications} modes={serviceModes} navigation={serviceNavigation} canEdit={canEdit} onService={win.id === 'my-documents' ? setPersonalServiceId : setPublishedServiceId} onMode={(serviceId, mode) => setServiceModes((current) => ({ ...current, [serviceId]: mode }))} onChange={(serviceId, next) => setServiceNavigation((current) => ({ ...current, [serviceId]: next }))} onAddCategory={addCategory} onUpdateService={updateService} onSaveCategory={saveCategory} onDelete={deleteCategory} onCreateCatalog={createCatalog} onCatalogPublication={updateCatalogPublication} /> : <GenericContent id={win.id} canEdit={canEdit} catalog={catalog} documents={documents} customApps={customApps} visibility={desktopAppVisibility} onTheme={toggleTheme} onSaveApps={saveApps} onOpenProjectDocument={openProjectDocument} documentsProjectRequest={documentsProjectRequest} onOpenProjectDesignDocuments={openProjectDesignDocuments} taskbarPosition={taskbarPosition} onTaskbarPosition={changeTaskbarPosition} />}</div></section>)}
    {startOpen && <section className="ad-start" onPointerDown={(event) => event.stopPropagation()}><label className="ad-start-search">⌕ <input autoFocus placeholder="アプリ、設定、コンテンツを検索" /></label><div className="ad-start-label"><strong>ピン留め済み</strong><button>すべてのアプリ ›</button></div><div className="ad-pinned">{apps.map((app) => <button key={app.id} onClick={() => openApp(app.id)}><AppIcon id={app.id} /><span>{app.name}</span></button>)}{customApps.map((app) => <button key={app.id} onClick={() => openCustomApp(app)}><span className="ad-app-icon large" style={{ '--app-color': app.color } as CSSProperties}>{app.mark}</span><span>{app.name}</span></button>)}</div><div className="ad-recommended"><strong>おすすめ</strong><button onClick={() => { setPersonalServiceId('codex'); openApp('my-documents') }}><span>✦</span><div><b>Codex資料を開く</b><small>マイ資料・Codex</small></div></button></div><footer><button className="ad-account" type="button" title={accountName} onClick={() => { setStartOpen(false); setAccountDialogOpen(true) }}><span className="ad-user">{accountName.charAt(0).toUpperCase() || 'H'}</span><strong>{accountName}</strong></button><button className="ad-start-apple" type="button" aria-label="Apple Intelligenceを開く" title="Apple Intelligence" onClick={() => { setStartOpen(false); openAppleIntelligence('ai-desktop') }}><AppleIntelligenceMark compact /></button><button className="ad-home-link" type="button" onClick={() => navigate('/')}><span>‹</span> Hundred Home</button></footer></section>}
    {accountDialogOpen && <div className="hundred-login-confirm ad-account-confirm" role="presentation" onPointerDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget && !changingAccount) setAccountDialogOpen(false) }}><section className="hundred-login-confirm__panel" role="dialog" aria-modal="true" aria-labelledby="ad-account-confirm-title"><p>ACCOUNT</p><h2 id="ad-account-confirm-title">{canEdit ? 'サインアウトしますか？' : 'サインイン画面へ移動しますか？'}</h2><p>{canEdit ? <><strong>{accountName}</strong>からサインアウトし、サインイン画面へ戻ります。</> : <>現在は<strong>ゲスト</strong>として利用しています。移動するとゲスト利用を終了し、Hundredのサインイン画面を表示します。</>}</p><div className="hundred-login-confirm__actions"><button type="button" onClick={() => setAccountDialogOpen(false)} disabled={changingAccount} autoFocus>キャンセル</button><button type="button" data-primary="true" onClick={() => void goToSignIn()} disabled={changingAccount}>{changingAccount ? '移動中…' : canEdit ? 'サインアウト' : 'サインイン画面へ'}</button></div></section></div>}
    {!taskbarVisible && <div ref={hiddenTaskbarRef} className={`ad-hidden-taskbar-launcher ${taskbarPeekOpen ? 'open' : ''}`} onPointerDown={(event) => event.stopPropagation()} onMouseEnter={() => setTaskbarPeekOpen(true)}>{taskbarPeekOpen && <section className="ad-running-apps" aria-label="起動中のアプリ"><strong>起動中のアプリ</strong>{windows.length ? <nav>{windows.map((win) => <div className="ad-running-app-row" key={win.id}><button type="button" className={active === win.id && !win.minimized ? 'active' : ''} onClick={() => activatePeekApp(win)}><AppIcon id={win.id} size="small" /><span><b>{appById[win.id].name}</b><small>{win.minimized ? '最小化中' : active === win.id ? '表示中' : '起動中'}</small></span></button><button type="button" className="ad-running-app-close" aria-label={`${appById[win.id].name}を閉じる`} title="閉じる" onClick={(event) => { event.stopPropagation(); close(win.id) }}>×</button></div>)}</nav> : <p>起動中のアプリはありません。</p>}</section>}<button type="button" className="ad-show-taskbar" aria-label="タスクバーを表示" title="ホバーで起動中のアプリを表示" aria-expanded={taskbarPeekOpen} onFocus={() => setTaskbarPeekOpen(true)} onClick={() => { setTaskbarPeekOpen(false); setTaskbarVisible(true); persistDesktopState(desktopIconPositions, true) }}>↑</button></div>}
    {taskbarVisible && <footer className="ad-taskbar" onPointerDown={(event) => event.stopPropagation()}><div className="ad-taskbar-spacer" /><nav><button className={startOpen ? 'active' : ''} onClick={handleStart} aria-label="スタート"><span className="ad-windows-logo">◆</span></button>{windows.map((win) => <div className="ad-taskbar-app" key={win.id}><button className={active === win.id && !win.minimized ? 'running active' : 'running'} aria-label={appById[win.id].name} onClick={() => win.minimized ? openApp(win.id) : (active === win.id ? update(win.id, { minimized: true }) : focus(win.id))}><AppIcon id={win.id} size="small" /></button><button type="button" className="ad-taskbar-close" aria-label={`${appById[win.id].name}を閉じる`} title="閉じる" onClick={(event) => { event.stopPropagation(); close(win.id) }}>×</button></div>)}</nav><div className="ad-tray"><button type="button" className={`ad-layout-edit ${layoutEditing ? 'active' : ''}`} aria-label={layoutEditing ? '配置変更を終了' : '配置変更'} title={canEdit ? layoutEditing ? '配置変更を終了' : 'デスクトップアイコンの配置を変更' : '配置変更にはサインインが必要です'} disabled={!canEdit} onClick={() => setLayoutEditing((current) => !current)}>✥</button><button type="button" className="ad-hide-taskbar" aria-label="タスクバーを非表示" title="タスクバーを非表示" onClick={hideTaskbar}>⌄</button></div></footer>}<p className={`ad-hint ${layoutEditing ? 'editing' : ''}`}>{layoutEditing ? 'アイコンをドラッグして配置を変更' : 'アイコンをダブルクリックして起動'}</p></main>
}

export default AIDesktopPage
