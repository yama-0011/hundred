import type { AIDesktopDesignDocumentInput, AIDesktopDesignStatus } from '../../services/AIDesktop/aiDesktopApi'
import { createContentBlockCatalog } from './contentBlockCatalog'
import type { ContentBlock, ContentItem } from './contentBlocks'
import type { DesignDocumentContent } from './designDocumentStandardTemplates'
import { validateMermaidSource, type DiagramKind } from './mermaidDiagramValidation'

type DesignDocumentDraft = AIDesktopDesignDocumentInput<DesignDocumentContent>

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const badgeTones = new Set(['neutral', 'info', 'success', 'warning', 'danger'])
const diagramKinds = new Set<DiagramKind>(['flowchart', 'sequence', 'architecture', 'er', 'state'])
const statuses = new Set<AIDesktopDesignStatus>(['draft', 'review', 'approved'])
const text = (value: unknown, max = 100_000) => typeof value === 'string' && value.length <= max
const id = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 300
const badges = (value: unknown, max: number) => value === undefined || (Array.isArray(value) && value.length <= max && value.every((badge) => isRecord(badge) && id(badge.id) && text(badge.label, 200) && badgeTones.has(String(badge.tone))))

function validBlocks(value: unknown, nested = false): value is ContentBlock[] {
  return Array.isArray(value) && value.length <= 300 && value.every((candidate) => {
    if (!isRecord(candidate) || !id(candidate.id) || !isRecord(candidate.data)) return false
    const data = candidate.data
    switch (candidate.type) {
      case 'heading': return text(data.text, 10_000) && (data.level === 1 || data.level === 2 || data.level === 3)
      case 'text': return text(data.text)
      case 'image': return text(data.imageId, 300) && text(data.url, 4_000) && text(data.alt, 1_000) && text(data.caption, 2_000)
      case 'code': return text(data.code, 500_000) && text(data.language, 100) && (data.filename === undefined || text(data.filename, 500))
      case 'checklist': return Array.isArray(data.items) && data.items.length <= 200 && data.items.every((item) => isRecord(item) && id(item.id) && text(item.text, 10_000))
      case 'callout': return text(data.text) && (data.title === undefined || text(data.title, 500)) && (data.tone === 'info' || data.tone === 'warning' || data.tone === 'tip')
      case 'divider': case 'toc': return true
      case 'link': return text(data.label, 1_000) && text(data.url, 4_000)
      case 'glossary': return Array.isArray(data.entries) && data.entries.length <= 200 && data.entries.every((entry) => isRecord(entry) && id(entry.id) && text(entry.term, 500) && text(entry.description, 10_000))
      case 'card': return (data.columns === 1 || data.columns === 2 || data.columns === 3) && Array.isArray(data.items) && data.items.length <= 50 && data.items.every((item) => isRecord(item) && id(item.id) && text(item.title, 1_000) && text(item.description, 20_000) && badges(item.badges, 10) && (item.link === undefined || (isRecord(item.link) && text(item.link.label, 1_000) && text(item.link.url, 4_000))))
      case 'steps': return Array.isArray(data.items) && data.items.length <= 100 && data.items.every((item) => isRecord(item) && id(item.id) && text(item.title, 1_000) && text(item.text, 20_000) && badges(item.badges, 10))
      case 'diagram': return !nested && diagramKinds.has(String(data.kind) as DiagramKind) && text(data.title, 1_000) && text(data.source, 100_000) && (data.caption === undefined || text(data.caption, 2_000))
      case 'table': {
        const columns = data.columns
        const rows = data.rows
        return Array.isArray(columns) && columns.length > 0 && columns.length <= 50 && columns.every((column) => isRecord(column) && id(column.id) && text(column.label, 1_000) && typeof column.width === 'number' && Number.isFinite(column.width) && column.width > 0) && Array.isArray(rows) && rows.length <= 2_000 && rows.every((row) => isRecord(row) && id(row.id) && Array.isArray(row.cells) && row.cells.length === columns.length && row.cells.every((cell) => text(cell))) && (data.rowHeight === 'compact' || data.rowHeight === 'standard' || data.rowHeight === 'comfortable') && (data.tableWidth === undefined || (typeof data.tableWidth === 'number' && data.tableWidth >= 100 && data.tableWidth <= 300))
      }
      case 'columns': return !nested && validBlocks(data.left, true) && validBlocks(data.right, true)
      default: return false
    }
  })
}

function validPage(value: unknown): value is ContentItem {
  return isRecord(value) && id(value.id) && text(value.navTitle, 200) && (value.parentId === undefined || id(value.parentId)) && (value.pageWidth === undefined || value.pageWidth === 'standard' || value.pageWidth === 'wide' || value.pageWidth === 'compact') && validBlocks(value.blocks)
}

function allBlockIds(blocks: ContentBlock[]): string[] {
  return blocks.flatMap((block) => block.type === 'columns' ? [block.id, ...allBlockIds(block.data.left), ...allBlockIds(block.data.right)] : [block.id])
}

async function validDiagrams(blocks: ContentBlock[]): Promise<boolean> {
  for (const block of blocks) {
    if (block.type === 'diagram' && !await validateMermaidSource(block.data.kind, block.data.source)) return false
    if (block.type === 'columns' && !await validDiagrams([...block.data.left, ...block.data.right])) return false
  }
  return true
}

export function createDesignDocumentJson(draft: DesignDocumentDraft, designDocumentId: string, withGuide = false) {
  const payload = {
    format: 'hundred-ai-desktop',
    version: 1,
    resourceType: 'design-document',
    target: {
      projectId: draft.projectId,
      designDocumentId,
      domain: draft.domain,
      phase: draft.phase,
      documentType: draft.documentType,
      templateId: draft.templateId,
      templateVersion: draft.templateVersion,
    },
    data: { title: draft.title, content: draft.content },
  }
  if (!withGuide) return payload
  const catalog = createContentBlockCatalog()
  return {
    ...payload,
    guide: {
      purpose: 'HundredのドキュメントをJSONで作成・編集するためのテンプレートです。実際に反映されるのはdata.titleとdata.contentです。',
      steps: [
        'targetの分類を確認し、data.content.pagesへドキュメントのページを作成します。',
        '各ページはid、navTitle、blocksを持ち、各ブロックは重複しないid、type、typeに対応するdataを持ちます。',
        'JSONから読み込んだ後、画面で内容を確認して「保存」を押します。',
      ],
      cautions: ['targetの分類は変更できません。', 'ページとブロックのidは、それぞれ重複しない値にしてください。', 'guideとreferenceは説明用で、ドキュメントには保存されません。'],
    },
    reference: {
      allowedValues: { blockTypes: catalog.allowedTypes, nestedBlockTypes: catalog.nestedAllowedTypes, calloutTones: ['info', 'warning', 'tip'], badgeTones: [...badgeTones], diagramKinds: [...diagramKinds] },
      fieldDefinitions: {
        pages: 'ドキュメントを構成するページです。左ナビゲーションの順番で配列へ並べます。',
        navTitle: '左ナビゲーションに表示するページ名です。',
        blocks: 'ページ本文です。reference.blockTemplatesの構造を参考に作成します。',
      },
      blockTemplates: catalog.templates,
    },
  }
}

export async function parseDesignDocumentJson(source: string, current: DesignDocumentDraft): Promise<DesignDocumentDraft> {
  const payload = JSON.parse(source) as unknown
  if (!isRecord(payload) || payload.format !== 'hundred-ai-desktop' || payload.version !== 1) throw new Error('FORMAT')
  if (payload.resourceType !== 'design-document') throw new Error('RESOURCE_TYPE')
  if (!isRecord(payload.target) || payload.target.domain !== current.domain || payload.target.phase !== current.phase || payload.target.documentType !== current.documentType) throw new Error('CLASSIFICATION')
  if (!isRecord(payload.data) || !text(payload.data.title, 200) || !String(payload.data.title).trim() || (payload.data.status !== undefined && !statuses.has(String(payload.data.status) as AIDesktopDesignStatus)) || !isRecord(payload.data.content)) throw new Error('FORMAT')
  const content = payload.data.content
  if (content.schemaVersion !== 2 || !Array.isArray(content.pages) || content.pages.length === 0 || content.pages.length > 100 || !content.pages.every(validPage) || JSON.stringify(content).length > 2_000_000) throw new Error('CONTENT')
  const pages = content.pages as ContentItem[]
  const pageIds = pages.map((page) => page.id)
  const blockIds = pages.flatMap((page) => allBlockIds(page.blocks))
  if (new Set(pageIds).size !== pageIds.length || new Set(blockIds).size !== blockIds.length) throw new Error('DUPLICATE_ID')
  if (pages.some((page) => page.parentId && (page.parentId === page.id || !pageIds.includes(page.parentId)))) throw new Error('CONTENT')
  for (const page of pages) if (!await validDiagrams(page.blocks)) throw new Error('MERMAID')
  return { ...current, title: String(payload.data.title).trim(), content: content as DesignDocumentContent }
}
