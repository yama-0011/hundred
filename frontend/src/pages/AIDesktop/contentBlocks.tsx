import { useEffect, useRef, useState, type ReactNode } from 'react'
import { uploadAIDesktopImage } from '../../services/AIDesktop/aiDesktopApi'
import { AI_DESKTOP_MESSAGES } from './aiDesktopMessages'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import { contentBlockCatalog } from './contentBlockCatalog'
import { MermaidDiagram } from './MermaidDiagram'
import type { DiagramKind } from './mermaidDiagramValidation'

export type ContentLayout = 'standard' | 'wide' | 'compact'
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type BadgeValue = { id: string; label: string; tone: BadgeTone }
export type LeafBlockType = 'heading' | 'text' | 'image' | 'code' | 'checklist' | 'callout' | 'divider' | 'table' | 'link' | 'toc' | 'glossary' | 'card' | 'steps' | 'diagram'
export type BlockType = LeafBlockType | 'columns'
type BlockBase<T extends BlockType, D> = { id: string; type: T; data: D }
export type HeadingBlock = BlockBase<'heading', { text: string; level: 1 | 2 | 3 }>
export type TextBlock = BlockBase<'text', { text: string }>
export type ImageBlock = BlockBase<'image', { imageId: string; url: string; alt: string; caption: string }>
export type CodeBlock = BlockBase<'code', { code: string; language: string; filename?: string }>
export type ChecklistBlock = BlockBase<'checklist', { items: Array<{ id: string; text: string }> }>
export type CalloutBlock = BlockBase<'callout', { tone: 'info' | 'warning' | 'tip'; title?: string; text: string }>
export type DividerBlock = BlockBase<'divider', Record<string, never>>
export type GlossaryBlock = BlockBase<'glossary', { entries: Array<{ id: string; term: string; description: string }> }>
export type GlossaryEntry = GlossaryBlock['data']['entries'][number]
export type TocBlock = BlockBase<'toc', Record<string, never>>
export type LinkBlock = BlockBase<'link', { label: string; url: string }>
export type TableBlock = BlockBase<'table', { columns: Array<{ id: string; label: string; width: number }>; rows: Array<{ id: string; cells: string[] }>; rowHeight: 'compact' | 'standard' | 'comfortable'; tableWidth?: number }>
export type CardBlock = BlockBase<'card', { columns: 1 | 2 | 3; items: Array<{ id: string; title: string; description: string; badges?: BadgeValue[]; link?: { label: string; url: string } }> }>
export type StepsBlock = BlockBase<'steps', { items: Array<{ id: string; title: string; text: string; badges?: BadgeValue[] }> }>
export type DiagramBlock = BlockBase<'diagram', { kind: DiagramKind; title: string; source: string; caption?: string }>
export type LeafBlock = HeadingBlock | TextBlock | ImageBlock | CodeBlock | ChecklistBlock | CalloutBlock | DividerBlock | TableBlock | LinkBlock | TocBlock | GlossaryBlock | CardBlock | StepsBlock | DiagramBlock
export type ColumnsBlock = BlockBase<'columns', { left: LeafBlock[]; right: LeafBlock[] }>
export type ContentBlock = LeafBlock | ColumnsBlock
export type ContentItem = { id: string; navTitle: string; pageWidth?: ContentLayout; blocks: ContentBlock[] }
export type Category = { id: string; title: string; description: string; icon: string; glossary?: GlossaryEntry[]; items: ContentItem[] }
export type CategoryGroup = { id: string; title: string; description: string; categories: Category[] }
export type ServiceConfig = { schemaVersion: 3; name: string; eyebrow: string; introduction: string; categoryGroups: CategoryGroup[] }

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function createBlock(type: BlockType): ContentBlock {
  const id = uid(type)
  switch (type) {
    case 'heading': return { id, type, data: { text: '新しい見出し', level: 2 } }
    case 'text': return { id, type, data: { text: 'テキストを入力してください。' } }
    case 'image': return { id, type, data: { imageId: '', url: '', alt: '', caption: '' } }
    case 'code': return { id, type, data: { code: '', language: 'text', filename: '' } }
    case 'checklist': return { id, type, data: { items: [{ id: uid('check'), text: '確認項目' }] } }
    case 'callout': return { id, type, data: { tone: 'info', title: 'ポイント', text: '' } }
    case 'divider': return { id, type, data: {} }
    case 'link': return { id, type, data: { label: 'リンクを開く', url: '' } }
    case 'toc': return { id, type, data: {} }
    case 'glossary': return { id, type, data: { entries: [{ id: uid('term'), term: '用語', description: '用語の説明を入力してください。' }] } }
    case 'table': return { id, type, data: { columns: [{ id: uid('column'), label: '項目', width: 40 }, { id: uid('column'), label: '内容', width: 60 }], rows: [{ id: uid('row'), cells: ['', ''] }, { id: uid('row'), cells: ['', ''] }], rowHeight: 'standard', tableWidth: 100 } }
    case 'card': return { id, type, data: { columns: 2, items: [{ id: uid('card-item'), title: 'カードの見出し', description: '重要な情報や選択肢の説明を入力してください。', badges: [] }] } }
    case 'steps': return { id, type, data: { items: [{ id: uid('step'), title: '最初の手順', text: '行う作業を説明してください。', badges: [] }] } }
    case 'diagram': return { id, type, data: { kind: 'flowchart', title: '処理の流れ', source: 'flowchart TD\n  A[開始] --> B[完了]', caption: '' } }
    case 'columns': return { id, type, data: { left: [], right: [] } }
  }
}

export function createContent(id: string, title: string, lead = '', body = '', points: string[] = []): ContentItem {
  const blocks: ContentBlock[] = [{ id: uid('heading'), type: 'heading', data: { text: title, level: 1 } }]
  if (lead) blocks.push({ id: uid('text'), type: 'text', data: { text: lead } })
  if (body) blocks.push({ id: uid('callout'), type: 'callout', data: { tone: 'info', title: 'ポイント', text: body } })
  if (points.length) blocks.push({ id: uid('checklist'), type: 'checklist', data: { items: points.map((text) => ({ id: uid('check'), text })) } })
  return { id, navTitle: title, blocks }
}

type LegacyItem = { id?: unknown; title?: unknown; lead?: unknown; body?: unknown; points?: unknown; images?: unknown; layout?: unknown }
const string = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const validLayout = (value: unknown): ContentLayout => value === 'wide' || value === 'compact' ? value : 'standard'

function migrateItem(value: unknown, index: number): ContentItem {
  const item = value && typeof value === 'object' ? value as LegacyItem & Partial<ContentItem> : {}
  if (Array.isArray(item.blocks)) return { id: string(item.id, `item-${index}`), navTitle: string(item.navTitle, '名称未設定'), pageWidth: validLayout(item.pageWidth), blocks: item.blocks as ContentBlock[] }
  const title = string(item.title, '名称未設定')
  const migrated = createContent(string(item.id, `item-${index}`), title, string(item.lead), string(item.body), Array.isArray(item.points) ? item.points.filter((point): point is string => typeof point === 'string') : [])
  const images = Array.isArray(item.images) ? item.images : []
  const imageBlocks: ImageBlock[] = images.flatMap((image) => {
    if (!image || typeof image !== 'object') return []
    const record = image as Record<string, unknown>
    return [{ id: uid('image'), type: 'image', data: { imageId: string(record.id), url: string(record.url), alt: string(record.alt), caption: string(record.caption) } }]
  })
  const insertAt = Math.min(2, migrated.blocks.length)
  migrated.blocks.splice(insertAt, 0, ...imageBlocks)
  migrated.pageWidth = validLayout(item.layout)
  return migrated
}

const knowledgeCategoryIds = new Set(['basics', 'features', 'models', 'usage'])

export function createCategoryGroups(categories: Category[]): CategoryGroup[] {
  const knowledge = categories.filter((category) => knowledgeCategoryIds.has(category.id))
  const practice = categories.filter((category) => !knowledgeCategoryIds.has(category.id))
  return [
    { id: 'knowledge', title: '知識', description: 'サービスを使うために知っておくこと', categories: knowledge },
    { id: 'practice', title: '実践', description: 'サービスを実際の作業でどう活用するか', categories: practice },
  ].filter((group) => group.categories.length > 0)
}

export function normalizeServiceConfig(value: unknown, fallback: ServiceConfig): ServiceConfig {
  if (!value || typeof value !== 'object') return fallback
  const record = value as Record<string, unknown>
  const rawGroups = Array.isArray(record.categoryGroups) ? record.categoryGroups : null
  const rawCategories = Array.isArray(record.categories) ? record.categories : null
  if (!rawGroups && !rawCategories) return fallback
  const migrateCategory = (rawCategory: unknown, categoryIndex: number): Category => {
    const category = rawCategory && typeof rawCategory === 'object' ? rawCategory as Record<string, unknown> : {}
    const glossary = Array.isArray(category.glossary) ? category.glossary.flatMap((entry, entryIndex): GlossaryEntry[] => entry && typeof entry === 'object' ? [{ id: string((entry as Record<string, unknown>).id, `term-${categoryIndex}-${entryIndex}`), term: string((entry as Record<string, unknown>).term), description: string((entry as Record<string, unknown>).description) }] : []) : []
    return { id: string(category.id, `category-${categoryIndex}`), title: string(category.title, '名称未設定'), description: string(category.description), icon: string(category.icon, '◫'), glossary, items: Array.isArray(category.items) ? category.items.map(migrateItem) : [] }
  }
  return {
    schemaVersion: 3,
    name: string(record.name, fallback.name), eyebrow: string(record.eyebrow, fallback.eyebrow), introduction: string(record.introduction, fallback.introduction),
    categoryGroups: rawGroups ? rawGroups.map((rawGroup, groupIndex) => { const group = rawGroup && typeof rawGroup === 'object' ? rawGroup as Record<string, unknown> : {}; return { id: string(group.id, `group-${groupIndex}`), title: string(group.title, '名称未設定'), description: string(group.description), categories: Array.isArray(group.categories) ? group.categories.map(migrateCategory) : [] } }) : createCategoryGroups((rawCategories ?? []).map(migrateCategory)),
  }
}

type TocHeading = { id: string; text: string; level: 1 | 2 | 3 }

function collectHeadings(blocks: ContentBlock[]): TocHeading[] {
  return blocks.flatMap((block): TocHeading[] => block.type === 'heading' && block.data.text.trim() ? [{ id: block.id, text: block.data.text.trim(), level: block.data.level }] : block.type === 'columns' ? collectHeadings([...block.data.left, ...block.data.right]) : [])
}

function collectGlossaryEntries(blocks: ContentBlock[]): GlossaryBlock['data']['entries'] {
  return blocks.flatMap((block) => block.type === 'glossary' ? block.data.entries.filter((entry) => entry.term.trim() || entry.description.trim()) : block.type === 'columns' ? collectGlossaryEntries([...block.data.left, ...block.data.right]) : [])
}

export function ContentTableOfContents({ blocks }: { blocks: ContentBlock[] }) {
  const headings = collectHeadings(blocks)
  const glossaryEntries = collectGlossaryEntries(blocks)
  const sideRef = useRef<HTMLDivElement>(null)
  const [activeGlossaryId, setActiveGlossaryId] = useState<string | null>(null)
  const activeGlossary = glossaryEntries.find((entry) => entry.id === activeGlossaryId) ?? null
  useEffect(() => {
    const stage = sideRef.current?.closest('.ad-article-stage')
    if (!stage) return
    const selectGlossary = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail.id
      setActiveGlossaryId(id)
      window.requestAnimationFrame(() => sideRef.current?.querySelector<HTMLElement>('.ad-page-glossary-panel')?.focus({ preventScroll: true }))
    }
    stage.addEventListener('ad:select-glossary', selectGlossary)
    return () => stage.removeEventListener('ad:select-glossary', selectGlossary)
  }, [blocks])
  if (!headings.length && !glossaryEntries.length) return null
  return <div className="ad-page-side" ref={sideRef}>{headings.length > 0 && <aside className="ad-page-toc"><strong>目次</strong><ol>{headings.map((heading) => <li className={`level-${heading.level}`} key={heading.id}><button type="button" title={heading.text} onClick={(event) => { const root = event.currentTarget.closest('.ad-article-stage'); const target = [...(root?.querySelectorAll<HTMLElement>('[data-heading-id]') ?? [])].find((element) => element.dataset.headingId === heading.id); target?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{heading.text}</button></li>)}</ol></aside>}{activeGlossary && <aside className="ad-page-glossary-panel" tabIndex={-1} aria-live="polite"><header><span>用語</span><button type="button" aria-label="用語の説明を閉じる" onClick={() => setActiveGlossaryId(null)}>×</button></header><strong>{activeGlossary.term || '名称未設定'}</strong><p>{activeGlossary.description}</p></aside>}</div>
}

function glossaryText(text: string, blocks?: ContentBlock[]): ReactNode {
  const entries = blocks ? collectGlossaryEntries(blocks).filter((entry) => entry.term.trim()).sort((a, b) => b.term.length - a.term.length) : []
  if (!entries.length || !text) return text
  const nodes: ReactNode[] = []
  let cursor = 0
  while (cursor < text.length) {
    const rest = text.slice(cursor)
    const match = entries.reduce<{ entry: GlossaryBlock['data']['entries'][number]; index: number } | null>((best, entry) => {
      const index = rest.toLocaleLowerCase().indexOf(entry.term.trim().toLocaleLowerCase())
      if (index < 0 || (best && (best.index < index || (best.index === index && best.entry.term.length >= entry.term.length)))) return best
      return { entry, index }
    }, null)
    if (!match) { nodes.push(rest); break }
    if (match.index > 0) nodes.push(rest.slice(0, match.index))
    const term = rest.slice(match.index, match.index + match.entry.term.trim().length)
    nodes.push(<button type="button" className="ad-glossary-link" key={`${cursor}-${match.entry.id}`} onClick={(event) => event.currentTarget.closest('.ad-article-stage')?.dispatchEvent(new CustomEvent('ad:select-glossary', { detail: { id: match.entry.id } }))}>{term}</button>)
    cursor += match.index + term.length
  }
  return nodes
}

function BadgeList({ badges = [] }: { badges?: BadgeValue[] }) {
  if (!badges.length) return null
  return <div className="ad-badges">{badges.map((badge) => <span className={`ad-badge tone-${badge.tone}`} key={badge.id}>{badge.label}</span>)}</div>
}

export function BlockRenderer({ block, pageBlocks }: { block: ContentBlock; pageBlocks?: ContentBlock[] }) {
  switch (block.type) {
    case 'heading': { const Tag = `h${block.data.level}` as 'h1' | 'h2' | 'h3'; return <Tag data-heading-id={block.id}>{block.data.text}</Tag> }
    case 'text': return <div className="ad-block-text">{block.data.text.split('\n').filter((line) => line.trim().length > 0).map((line, index) => <p key={index}>{glossaryText(line, pageBlocks)}</p>)}</div>
    case 'image': return block.data.url ? <figure><img src={block.data.url} alt={block.data.alt} />{block.data.caption && <figcaption>{block.data.caption}</figcaption>}</figure> : null
    case 'code': return <div className="ad-code-block">{block.data.filename && <span>{block.data.filename}</span>}<pre><code data-language={block.data.language}>{block.data.code}</code></pre></div>
    case 'checklist': return <ul>{block.data.items.filter((item) => item.text).map((item) => <li key={item.id}>{item.text}</li>)}</ul>
    case 'callout': { const label = block.data.tone === 'warning' ? '注意' : block.data.tone === 'tip' ? 'ヒント' : '補足'; const title = block.data.title?.trim(); return <aside className={`ad-note tone-${block.data.tone}`}><span className="ad-note__label">{label}</span><div className="ad-note__content">{title && title !== label && <strong>{title}</strong>}<p>{glossaryText(block.data.text, pageBlocks)}</p></div></aside> }
    case 'divider': return <hr className="ad-block-divider" />
    case 'toc': return null
    case 'glossary': return null
    case 'link': return block.data.url ? <a className="ad-content-link" href={block.data.url} target="_blank" rel="noreferrer">{block.data.label || block.data.url}<span>↗</span></a> : null
    case 'table': return <div className="ad-table-scroll"><table className={`ad-content-table height-${block.data.rowHeight}`} style={{ width: `${block.data.tableWidth ?? 100}%` }}><colgroup>{block.data.columns.map((column) => <col key={column.id} style={{ width: `${column.width}%` }} />)}</colgroup><thead><tr>{block.data.columns.map((column) => <th key={column.id}>{column.label}</th>)}</tr></thead><tbody>{block.data.rows.map((row) => <tr key={row.id}>{block.data.columns.map((column, index) => <td key={column.id}>{row.cells[index]}</td>)}</tr>)}</tbody></table></div>
    case 'card': return <div className={`ad-card-grid columns-${block.data.columns}`}>{block.data.items.map((item) => <article className="ad-info-card" key={item.id}><BadgeList badges={item.badges} /><h3>{item.title}</h3><p>{glossaryText(item.description, pageBlocks)}</p>{item.link?.url && <a href={item.link.url} target="_blank" rel="noreferrer">{item.link.label || '詳しく見る'}<span>↗</span></a>}</article>)}</div>
    case 'steps': return <ol className="ad-steps">{block.data.items.map((item, index) => <li key={item.id}><span className="ad-step-number">{String(index + 1).padStart(2, '0')}</span><div><BadgeList badges={item.badges} /><h3>{item.title}</h3><p>{glossaryText(item.text, pageBlocks)}</p></div></li>)}</ol>
    case 'diagram': return <MermaidDiagram id={block.id} {...block.data} />
    case 'columns': return <div className="ad-block-columns"><div>{block.data.left.map((child) => <BlockRenderer block={child} pageBlocks={pageBlocks} key={child.id} />)}</div><div>{block.data.right.map((child) => <BlockRenderer block={child} pageBlocks={pageBlocks} key={child.id} />)}</div></div>
  }
}

const catalogLabels = Object.fromEntries(contentBlockCatalog.templates.map((template) => [template.block.type, template.label])) as Partial<Record<BlockType, string>>
const labels: Record<BlockType, string> = { heading: catalogLabels.heading ?? '見出し', text: catalogLabels.text ?? 'テキスト', image: catalogLabels.image ?? '画像', code: catalogLabels.code ?? 'コード', checklist: 'チェックリスト', callout: catalogLabels.callout ?? '注意／補足', divider: catalogLabels.divider ?? '区切り', table: catalogLabels.table ?? '表', link: catalogLabels.link ?? 'リンク', toc: '目次', glossary: '用語', card: catalogLabels.card ?? 'カード', steps: catalogLabels.steps ?? '手順', diagram: catalogLabels.diagram ?? '図', columns: catalogLabels.columns ?? '2カラム' }
const leafTypes = contentBlockCatalog.nestedAllowedTypes
const blockTypes = contentBlockCatalog.allowedTypes

function BlockPicker({ nested = false, onPick }: { nested?: boolean; onPick: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false)
  const [hoveredType, setHoveredType] = useState<BlockType | null>(null)
  const types = nested ? leafTypes : blockTypes
  return <div className="ad-block-picker"><button type="button" onClick={() => setOpen((current) => !current)}>＋ ブロックを追加</button>{open && <div className="ad-block-picker-menu"><div className="ad-block-picker-options">{types.map((type) => <button type="button" key={type} onPointerEnter={() => setHoveredType(type)} onFocus={() => setHoveredType(type)} onClick={() => { onPick(type); setOpen(false); setHoveredType(null) }}>{labels[type]}</button>)}</div>{hoveredType && <BlockTypePreview type={hoveredType} />}</div>}</div>
}

function BlockTypePreview({ type }: { type: BlockType }) {
  return <aside className="ad-block-type-preview"><strong>{labels[type]}</strong><div data-type={type}>{type === 'heading' ? <><b>ページの見出し</b><i /></> : type === 'text' ? <><i /><i /><i /></> : type === 'image' ? <span>▧</span> : type === 'code' ? <code>&gt; command</code> : type === 'checklist' ? <><small>✓ 確認項目</small><small>✓ 確認項目</small></> : type === 'callout' ? <p>! 補足や注意事項</p> : type === 'divider' ? <hr /> : type === 'table' ? <table><tbody><tr><th>項目</th><th>内容</th></tr><tr><td>A</td><td>データ</td></tr></tbody></table> : type === 'link' ? <a>リンクを開く　↗</a> : type === 'toc' ? <><small>目次</small><small>1. はじめに</small><small>2. 使い方</small></> : type === 'glossary' ? <><small><b>SDK</b></small><small>開発キット</small></> : type === 'card' ? <section className="card"><i /><i /></section> : type === 'steps' ? <><small>01　最初の手順</small><small>02　次の手順</small></> : type === 'diagram' ? <code>開始 ──→ 完了</code> : <section><i /><i /></section>}</div><p>クリックして追加</p></aside>
}

function ImageFields({ block, onChange }: { block: ImageBlock; onChange: (block: ImageBlock) => void }) {
  const [uploading, setUploading] = useState(false)
  const uploadFile = (file: File) => {
    if (!file.type.startsWith('image/')) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.image.imageRequired); return }
    setUploading(true)
    void uploadAIDesktopImage(file).then((result) => onChange({ ...block, data: { imageId: result.id, url: result.url, alt: file.name.replace(/\.[^.]+$/u, '') || '貼り付けた画像', caption: block.data.caption } })).catch(() => showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.image.uploadFailed)).finally(() => setUploading(false))
  }
  const chooseFile = () => { const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif'; picker.onchange = () => { const file = picker.files?.[0]; if (file) uploadFile(file) }; picker.click() }
  const pasteImage = (event: React.ClipboardEvent<HTMLDivElement>) => { const file = [...event.clipboardData.files].find((candidate) => candidate.type.startsWith('image/')); if (!file) return; event.preventDefault(); uploadFile(new File([file], file.name || `clipboard-${Date.now()}.png`, { type: file.type || 'image/png' })) }
  return <div className="ad-image-fields"><div className="ad-image-fields__actions"><button type="button" className="ad-upload-button" onClick={chooseFile} disabled={uploading}>{uploading ? 'アップロード中…' : block.data.url ? '画像を変更' : '画像を選択'}</button><span>画像領域を選択して<br />Ctrl / ⌘ + V</span></div><div className={`ad-image-fields__media ${uploading ? 'uploading' : ''}`} tabIndex={0} onPaste={pasteImage} aria-label="画像ファイルを選択するか、クリップボード画像を貼り付け">{block.data.url ? <img className="ad-block-image-preview" src={block.data.url} alt="" /> : <div className="ad-image-fields__empty"><strong>画像を貼り付け</strong><span>クリップボードから貼り付けられます</span></div>}</div><div className="ad-image-fields__details"><label><span>代替テキスト</span><input value={block.data.alt} onChange={(event) => onChange({ ...block, data: { ...block.data, alt: event.target.value } })} /></label><label><span>キャプション</span><input value={block.data.caption} onChange={(event) => onChange({ ...block, data: { ...block.data, caption: event.target.value } })} /></label></div></div>
}

function TableFields({ block, onChange }: { block: TableBlock; onChange: (block: TableBlock) => void }) {
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([])
  const [showOverallWidth, setShowOverallWidth] = useState(false)
  const updateColumn = (index: number, changes: Partial<TableBlock['data']['columns'][number]>) => onChange({ ...block, data: { ...block.data, columns: block.data.columns.map((column, columnIndex) => columnIndex === index ? { ...column, ...changes } : column) } })
  const addColumn = () => { const column = { id: uid('column'), label: `列 ${block.data.columns.length + 1}`, width: 30 }; onChange({ ...block, data: { ...block.data, columns: [...block.data.columns, column], rows: block.data.rows.map((row) => ({ ...row, cells: [...row.cells, ''] })) } }); setSelectedColumnIds([column.id]) }
  const deleteColumn = (index: number) => { if (block.data.columns.length <= 1) return; const columnId = block.data.columns[index].id; onChange({ ...block, data: { ...block.data, columns: block.data.columns.filter((_, columnIndex) => columnIndex !== index), rows: block.data.rows.map((row) => ({ ...row, cells: row.cells.filter((_, cellIndex) => cellIndex !== index) })) } }); setSelectedColumnIds((current) => current.filter((id) => id !== columnId)) }
  const toggleColumn = (columnId: string) => setSelectedColumnIds((current) => current.includes(columnId) ? current.filter((id) => id !== columnId) : [...current, columnId])
  const updateCell = (rowIndex: number, columnIndex: number, value: string) => onChange({ ...block, data: { ...block.data, rows: block.data.rows.map((row, candidateRowIndex) => candidateRowIndex === rowIndex ? { ...row, cells: row.cells.map((cell, candidateColumnIndex) => candidateColumnIndex === columnIndex ? value : cell) } : row) } })
  const addRow = () => onChange({ ...block, data: { ...block.data, rows: [...block.data.rows, { id: uid('row'), cells: block.data.columns.map(() => '') }] } })
  const selectedColumns = block.data.columns.map((column, index) => ({ column, index })).filter(({ column }) => selectedColumnIds.includes(column.id))
  return <div className="ad-table-editor"><div className="ad-table-editor-toolbar"><label><span>行の高さ</span><select value={block.data.rowHeight} onChange={(event) => onChange({ ...block, data: { ...block.data, rowHeight: event.target.value as TableBlock['data']['rowHeight'] } })}><option value="compact">コンパクト</option><option value="standard">標準</option><option value="comfortable">広め</option></select></label><button type="button" onClick={addColumn}>＋ 列</button><button type="button" onClick={addRow}>＋ 行</button><button type="button" className={showOverallWidth ? 'active' : ''} onClick={() => setShowOverallWidth((current) => !current)}>↔ 全体幅</button></div>{showOverallWidth && <div className="ad-table-overall-width"><label><span>表全体の幅</span><strong>{block.data.tableWidth ?? 100}%</strong><input type="range" min="100" max="300" step="10" value={block.data.tableWidth ?? 100} onChange={(event) => onChange({ ...block, data: { ...block.data, tableWidth: Number(event.target.value) } })} /></label><button type="button" onClick={() => onChange({ ...block, data: { ...block.data, tableWidth: 100 } })}>100%に戻す</button></div>}<p className="ad-table-selection-help">表の列名をクリックすると列設定を表示します。複数選択できます。</p>{selectedColumns.length > 0 && <div className="ad-table-column-settings">{selectedColumns.map(({ column, index }) => <div key={column.id}><label><span>列名</span><input value={column.label} onChange={(event) => updateColumn(index, { label: event.target.value })} /></label><label><span>幅 {column.width}%</span><input type="range" min="10" max="100" value={column.width} onChange={(event) => updateColumn(index, { width: Number(event.target.value) })} /></label><button type="button" disabled={block.data.columns.length <= 1} onClick={() => deleteColumn(index)}>列を削除</button></div>)}</div>}<div className="ad-table-input-scroll"><table style={{ width: `${block.data.tableWidth ?? 100}%` }}><colgroup>{block.data.columns.map((column) => <col key={column.id} style={{ width: `${column.width}%` }} />)}</colgroup><thead><tr>{block.data.columns.map((column) => <th key={column.id}><button type="button" className={selectedColumnIds.includes(column.id) ? 'selected' : ''} onClick={() => toggleColumn(column.id)}>{column.label || '名称未設定'}<span>{selectedColumnIds.includes(column.id) ? '✓' : '設定'}</span></button></th>)}<th /></tr></thead><tbody>{block.data.rows.map((row, rowIndex) => <tr key={row.id}>{block.data.columns.map((column, columnIndex) => <td key={column.id}><textarea aria-label={`${rowIndex + 1}行 ${column.label}`} value={row.cells[columnIndex] ?? ''} onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)} /></td>)}<td><button type="button" onClick={() => onChange({ ...block, data: { ...block.data, rows: block.data.rows.filter((_, index) => index !== rowIndex) } })}>削除</button></td></tr>)}</tbody></table></div></div>
}

function TextFields({ block, onChange }: { block: TextBlock; onChange: (block: TextBlock) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(block.data.text)
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])
  const show = () => { setDraft(block.data.text); setOpen(true) }
  const apply = () => { onChange({ ...block, data: { text: draft } }); setOpen(false) }
  return <><label className="ad-text-field"><span>テキスト</span><button type="button" className="ad-text-dialog-trigger" onClick={show}><span>{block.data.text || 'テキストを入力してください。'}</span><i>クリックして編集</i></button></label>{open && <div className="ad-text-dialog-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><section className="ad-text-dialog" role="dialog" aria-modal="true" aria-labelledby={`text-dialog-${block.id}`}><header><div><span>TEXT EDITOR</span><h2 id={`text-dialog-${block.id}`}>テキストを編集</h2></div><button type="button" aria-label="閉じる" onClick={() => setOpen(false)}>×</button></header><textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="テキストを入力してください。" /><footer><small>{draft.length.toLocaleString('ja-JP')} 文字</small><button type="button" onClick={() => setOpen(false)}>キャンセル</button><button type="button" className="primary" onClick={apply}>内容を反映</button></footer></section></div>}</>
}

function CodeFields({ block, onChange }: { block: CodeBlock; onChange: (block: CodeBlock) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(block.data.code)
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])
  const show = () => { setDraft(block.data.code); setOpen(true) }
  const apply = () => { onChange({ ...block, data: { ...block.data, code: draft } }); setOpen(false) }
  return <><div className="ad-block-inline"><label><span>言語</span><input value={block.data.language} onChange={(event) => onChange({ ...block, data: { ...block.data, language: event.target.value } })} /></label><label><span>ファイル名</span><input value={block.data.filename ?? ''} onChange={(event) => onChange({ ...block, data: { ...block.data, filename: event.target.value } })} /></label></div><label><span>コード</span><button type="button" className="ad-code-dialog-trigger" onClick={show}><code>{block.data.code || '// コードを入力してください。'}</code><i>クリックして編集</i></button></label>{open && <div className="ad-text-dialog-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><section className="ad-text-dialog ad-code-edit-dialog" role="dialog" aria-modal="true" aria-labelledby={`code-dialog-${block.id}`}><header><div><span>CODE EDITOR</span><h2 id={`code-dialog-${block.id}`}>{block.data.filename || 'コードを編集'}</h2></div><button type="button" aria-label="閉じる" onClick={() => setOpen(false)}>×</button></header><textarea autoFocus spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="コードを入力してください。" /><footer><small>{draft.split('\n').length.toLocaleString('ja-JP')} 行</small><button type="button" onClick={() => setOpen(false)}>キャンセル</button><button type="button" className="primary" onClick={apply}>内容を反映</button></footer></section></div>}</>
}

function GlossaryFields({ block, onChange }: { block: GlossaryBlock; onChange: (block: GlossaryBlock) => void }) {
  const update = (index: number, changes: Partial<GlossaryBlock['data']['entries'][number]>) => onChange({ ...block, data: { entries: block.data.entries.map((entry, candidateIndex) => candidateIndex === index ? { ...entry, ...changes } : entry) } })
  const add = () => onChange({ ...block, data: { entries: [...block.data.entries, { id: uid('term'), term: '', description: '' }] } })
  return <div className="ad-glossary-fields"><p>本文中の同じ用語が自動でリンクになり、押すと閲覧画面右側へ説明が表示されます。</p>{block.data.entries.map((entry, index) => <div key={entry.id}><label><span>用語</span><input value={entry.term} placeholder="例: SDK" onChange={(event) => update(index, { term: event.target.value })} /></label><label><span>説明</span><textarea value={entry.description} placeholder="用語の説明を入力してください。" onChange={(event) => update(index, { description: event.target.value })} /></label><button type="button" aria-label={`${entry.term || '用語'}を削除`} onClick={() => onChange({ ...block, data: { entries: block.data.entries.filter((_, candidateIndex) => candidateIndex !== index) } })}>×</button></div>)}<button type="button" className="ad-glossary-add" onClick={add}>＋ 用語を追加</button></div>
}

const badgeToneLabels: Record<BadgeTone, string> = { neutral: '標準', info: '情報', success: '完了', warning: '注意', danger: '重要' }

function BadgeFields({ badges = [], max, onChange }: { badges?: BadgeValue[]; max: number; onChange: (badges: BadgeValue[]) => void }) {
  const update = (index: number, changes: Partial<BadgeValue>) => onChange(badges.map((badge, candidateIndex) => candidateIndex === index ? { ...badge, ...changes } : badge))
  return <div className="ad-badge-fields"><span>バッジ（任意）</span>{badges.map((badge, index) => <div key={badge.id}><input value={badge.label} maxLength={40} placeholder="例: 実装済み" onChange={(event) => update(index, { label: event.target.value })} /><select value={badge.tone} onChange={(event) => update(index, { tone: event.target.value as BadgeTone })}>{Object.entries(badgeToneLabels).map(([tone, label]) => <option value={tone} key={tone}>{label}</option>)}</select><button type="button" aria-label="バッジを削除" onClick={() => onChange(badges.filter((_, candidateIndex) => candidateIndex !== index))}>×</button></div>)}{badges.length < max && <button type="button" className="ad-inline-add" onClick={() => onChange([...badges, { id: uid('badge'), label: '', tone: 'neutral' }])}>＋ バッジを追加</button>}</div>
}

function CardFields({ block, onChange }: { block: CardBlock; onChange: (block: CardBlock) => void }) {
  const update = (index: number, changes: Partial<CardBlock['data']['items'][number]>) => onChange({ ...block, data: { ...block.data, items: block.data.items.map((item, candidateIndex) => candidateIndex === index ? { ...item, ...changes } : item) } })
  return <div className="ad-collection-fields"><label className="ad-collection-columns"><span>1行のカード数</span><select value={block.data.columns} onChange={(event) => onChange({ ...block, data: { ...block.data, columns: Number(event.target.value) as 1 | 2 | 3 } })}><option value={1}>1列</option><option value={2}>2列</option><option value={3}>3列</option></select></label>{block.data.items.map((item, index) => <section key={item.id}><header><strong>カード {index + 1}</strong><button type="button" onClick={() => onChange({ ...block, data: { ...block.data, items: block.data.items.filter((_, candidateIndex) => candidateIndex !== index) } })}>削除</button></header><label><span>見出し</span><input value={item.title} maxLength={200} onChange={(event) => update(index, { title: event.target.value })} /></label><label><span>説明</span><textarea value={item.description} maxLength={5000} onChange={(event) => update(index, { description: event.target.value })} /></label><BadgeFields badges={item.badges} max={4} onChange={(badges) => update(index, { badges })} /><div className="ad-link-fields"><label><span>リンク表記（任意）</span><input value={item.link?.label ?? ''} onChange={(event) => update(index, { link: { label: event.target.value, url: item.link?.url ?? '' } })} /></label><label><span>URL（任意）</span><input type="url" value={item.link?.url ?? ''} onChange={(event) => update(index, { link: { label: item.link?.label ?? '', url: event.target.value } })} /></label></div></section>)}{block.data.items.length < 12 && <button type="button" className="ad-inline-add" onClick={() => onChange({ ...block, data: { ...block.data, items: [...block.data.items, { id: uid('card-item'), title: 'カードの見出し', description: '', badges: [] }] } })}>＋ カードを追加</button>}</div>
}

function StepsFields({ block, onChange }: { block: StepsBlock; onChange: (block: StepsBlock) => void }) {
  const update = (index: number, changes: Partial<StepsBlock['data']['items'][number]>) => onChange({ ...block, data: { items: block.data.items.map((item, candidateIndex) => candidateIndex === index ? { ...item, ...changes } : item) } })
  return <div className="ad-collection-fields">{block.data.items.map((item, index) => <section key={item.id}><header><strong>手順 {index + 1}</strong><button type="button" onClick={() => onChange({ ...block, data: { items: block.data.items.filter((_, candidateIndex) => candidateIndex !== index) } })}>削除</button></header><label><span>見出し</span><input value={item.title} maxLength={200} onChange={(event) => update(index, { title: event.target.value })} /></label><label><span>説明</span><textarea value={item.text} maxLength={5000} onChange={(event) => update(index, { text: event.target.value })} /></label><BadgeFields badges={item.badges} max={3} onChange={(badges) => update(index, { badges })} /></section>)}{block.data.items.length < 20 && <button type="button" className="ad-inline-add" onClick={() => onChange({ ...block, data: { items: [...block.data.items, { id: uid('step'), title: '次の手順', text: '', badges: [] }] } })}>＋ 手順を追加</button>}</div>
}

const diagramKindLabels: Record<DiagramKind, string> = { flowchart: 'フローチャート', sequence: 'シーケンス', architecture: 'アーキテクチャ', er: 'ER図', state: '状態遷移' }

function DiagramFields({ block, onChange }: { block: DiagramBlock; onChange: (block: DiagramBlock) => void }) {
  return <div className="ad-diagram-fields"><div className="ad-block-inline"><label><span>図の種類</span><select value={block.data.kind} onChange={(event) => onChange({ ...block, data: { ...block.data, kind: event.target.value as DiagramKind } })}>{Object.entries(diagramKindLabels).map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}</select></label><label><span>見出し</span><input value={block.data.title} maxLength={500} onChange={(event) => onChange({ ...block, data: { ...block.data, title: event.target.value } })} /></label></div><label><span>Mermaid構文</span><textarea className="ad-diagram-source" spellCheck={false} value={block.data.source} maxLength={50000} onChange={(event) => onChange({ ...block, data: { ...block.data, source: event.target.value } })} /></label><label><span>キャプション（任意）</span><input value={block.data.caption ?? ''} maxLength={2000} onChange={(event) => onChange({ ...block, data: { ...block.data, caption: event.target.value } })} /></label><div className="ad-diagram-editor-preview"><span>構文プレビュー</span><MermaidDiagram id={`editor-${block.id}`} {...block.data} /></div></div>
}

function LeafBlockFields({ block, onChange }: { block: LeafBlock; onChange: (block: LeafBlock) => void }) {
  switch (block.type) {
    case 'heading': return <div className="ad-heading-fields"><label><span>見出し</span><input value={block.data.text} onChange={(event) => onChange({ ...block, data: { ...block.data, text: event.target.value } })} /></label><label><span>レベル</span><select value={block.data.level} onChange={(event) => onChange({ ...block, data: { ...block.data, level: Number(event.target.value) as 1 | 2 | 3 } })}><option value={1}>大見出し</option><option value={2}>中見出し</option><option value={3}>小見出し</option></select></label></div>
    case 'text': return <TextFields block={block} onChange={onChange} />
    case 'image': return <ImageFields block={block} onChange={onChange} />
    case 'code': return <CodeFields block={block} onChange={onChange} />
    case 'checklist': return <label><span>項目（1行につき1項目）</span><textarea value={block.data.items.map((item) => item.text).join('\n')} onChange={(event) => onChange({ ...block, data: { items: event.target.value.split('\n').map((text, index) => ({ id: block.data.items[index]?.id ?? uid('check'), text })) } })} /></label>
    case 'callout': return <><div className="ad-block-inline"><label><span>種類</span><select value={block.data.tone} onChange={(event) => onChange({ ...block, data: { ...block.data, tone: event.target.value as CalloutBlock['data']['tone'] } })}><option value="info">補足</option><option value="tip">ヒント</option><option value="warning">注意</option></select></label><label><span>見出し（任意）</span><input value={block.data.title ?? ''} placeholder="例: Businessプランの条件" onChange={(event) => onChange({ ...block, data: { ...block.data, title: event.target.value } })} /></label></div><label><span>本文</span><textarea value={block.data.text} onChange={(event) => onChange({ ...block, data: { ...block.data, text: event.target.value } })} /></label></>
    case 'divider': return <p className="ad-divider-help">ページ内に区切り線を表示します。</p>
    case 'glossary': return <GlossaryFields block={block} onChange={onChange} />
    case 'toc': return <p className="ad-divider-help">このコンテンツ内の見出しから目次を自動生成します。</p>
    case 'link': return <div className="ad-link-fields"><label><span>表記</span><input value={block.data.label} placeholder="リンクを開く" onChange={(event) => onChange({ ...block, data: { ...block.data, label: event.target.value } })} /></label><label><span>URL</span><input type="url" value={block.data.url} placeholder="https://example.com" onChange={(event) => onChange({ ...block, data: { ...block.data, url: event.target.value } })} /></label></div>
    case 'table': return <TableFields block={block} onChange={onChange} />
    case 'card': return <CardFields block={block} onChange={onChange} />
    case 'steps': return <StepsFields block={block} onChange={onChange} />
    case 'diagram': return <DiagramFields block={block} onChange={onChange} />
  }
}

function BlocksEditor<T extends ContentBlock>({ blocks, nested = false, selectedBlockId, onSelectBlock, onChange }: { blocks: T[]; nested?: boolean; selectedBlockId: string | null; onSelectBlock: (id: string | null) => void; onChange: (blocks: T[]) => void }) {
  const update = (index: number, block: T) => onChange(blocks.map((candidate, candidateIndex) => candidateIndex === index ? block : candidate))
  const move = (index: number, direction: -1 | 1) => { const destination = index + direction; if (destination < 0 || destination >= blocks.length) return; const next = [...blocks]; [next[index], next[destination]] = [next[destination], next[index]]; onChange(next) }
  const remove = (index: number, blockId: string) => { if (selectedBlockId === blockId) onSelectBlock(null); onChange(blocks.filter((_, candidateIndex) => candidateIndex !== index)) }
  return <div className="ad-block-list">{blocks.map((block, index) => <section className={`ad-block-card ${selectedBlockId === block.id ? 'selected' : ''}`} key={block.id} onPointerDown={(event) => { event.stopPropagation(); onSelectBlock(block.id) }} onFocusCapture={() => onSelectBlock(block.id)}><header><strong>{labels[block.type]}</strong>{selectedBlockId === block.id && <span className="ad-block-selected-label">選択中</span>}<div><button type="button" disabled={index === 0} aria-label="上へ移動" onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === blocks.length - 1} aria-label="下へ移動" onClick={() => move(index, 1)}>↓</button><button type="button" className="danger" onClick={() => remove(index, block.id)}>削除</button></div></header><div className="ad-block-fields">{block.type === 'columns' ? <div className="ad-columns-editor"><div><strong>Left</strong><BlocksEditor blocks={block.data.left} nested selectedBlockId={selectedBlockId} onSelectBlock={onSelectBlock} onChange={(left) => update(index, { ...block, data: { ...block.data, left } } as T)} /></div><div><strong>Right</strong><BlocksEditor blocks={block.data.right} nested selectedBlockId={selectedBlockId} onSelectBlock={onSelectBlock} onChange={(right) => update(index, { ...block, data: { ...block.data, right } } as T)} /></div></div> : <LeafBlockFields block={block} onChange={(next) => update(index, next as T)} />}</div></section>)}<BlockPicker nested={nested} onPick={(type) => { const block = createBlock(type) as T; onChange([...blocks, block]); onSelectBlock(block.id) }} /></div>
}

export function ContentCanvas({ item, onChange }: { item: ContentItem; onChange: (item: ContentItem) => void }) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(item.blocks[0]?.id ?? null)
  useEffect(() => { setSelectedBlockId(item.blocks[0]?.id ?? null) }, [item.id])
  return <div className="ad-canvas"><div className="ad-canvas-settings"><label><span>コンテンツ名（左ペイン）</span><input value={item.navTitle} maxLength={80} onChange={(event) => onChange({ ...item, navTitle: event.target.value })} /></label></div><BlocksEditor blocks={item.blocks} selectedBlockId={selectedBlockId} onSelectBlock={setSelectedBlockId} onChange={(blocks) => onChange({ ...item, blocks })} /></div>
}
