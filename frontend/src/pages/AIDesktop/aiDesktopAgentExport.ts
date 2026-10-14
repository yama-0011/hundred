/**
 * 概要:
 * プロジェクトとドキュメントを、Claude Code・Codexが読めるファイル群（AGENTS.md・CLAUDE.md・docs/）に変換する。
 *
 * 責務:
 * - ドキュメントのページとブロックをMarkdownへ変換する
 * - 毎回読まれるAGENTS.mdを小さく保ち、詳しい内容はdocs/以下へ分ける
 * - 書き出したファイルをZIPにまとめる
 *
 * AIの注意とトークンを無駄にしないため、AGENTS.mdには設計書の本文や一覧を入れない。
 * 公開リポジトリに置かれる可能性があるため、メンバー・顧客名・AI Desktop内のURLは書き出さない。
 */
import type { AIDesktopDesignCategory, AIDesktopDesignDocument, AIDesktopProject } from '../../services/AIDesktop/aiDesktopApi'
import type { ContentBlock, LeafBlock } from './contentBlocks'
import { createContentBlockCatalog, type ContentBlockCatalog } from './contentBlockCatalog'
import type { DesignDocumentContent } from './designDocumentStandardTemplates'

/** 書き出しの形式。AIへの説明と合わせて、形式を変えたときに増やす。 */
export const AGENT_EXPORT_FORMAT_VERSION = 1
/** AGENTS.mdの行数の目安。超えた場合は、ルールやコマンドが増えすぎていることを知らせる。 */
export const AGENTS_FILE_LINE_BUDGET = 200
export const GENERATED_START = '<!-- ai-desktop:start（この範囲はAI Desktopが生成します。編集しないでください） -->'
export const GENERATED_END = '<!-- ai-desktop:end -->'

export type AgentExportFile = { path: string; content: string }
export type AgentExportDocument = { document: AIDesktopDesignDocument<DesignDocumentContent>; categoryName: string }
// documentVersions は、文書ごとのAI Desktop上の最終更新日時。前回の書き出しと比べて、書き出し待ちの文書を数えるために使う。
export type AgentExportResult = { files: AgentExportFile[]; agentsLineCount: number; documentVersions: Record<string, number> }

const formatLabels: Record<string, string> = { pdf: 'PDF', word: 'Word', excel: 'Excel' }
// 大きな設計書はページごとのファイルに分け、AIが必要なページだけを読めるようにする。
// 小さな設計書まで分けるとファイルが増えるだけなので、大きさだけで判断する。
const splitCharacterCount = 30_000

const safeName = (value: string) => value.trim().replace(/[\\/:*?"<>|]/gu, '-').replace(/\s+/gu, ' ').slice(0, 80) || '名称未設定'
const numbered = (index: number, name: string) => `${String(index + 1).padStart(2, '0')}-${safeName(name)}`
const lines = (...values: Array<string | false | null | undefined>) => values.filter((value): value is string => typeof value === 'string').join('\n')
const tableCell = (value: string) => value.replace(/\|/gu, '\\|').replace(/\r?\n/gu, '<br>').trim()
const markdownTable = (headers: string[], rows: string[][]) => rows.length ? lines(`| ${headers.map(tableCell).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${headers.map((_, index) => tableCell(row[index] ?? '')).join(' | ')} |`)) : ''
const generated = (body: string) => `${GENERATED_START}\n${body.trim()}\n${GENERATED_END}\n`
const GENERATED_NOTICE = '> AI Desktopが生成したファイルです。直接編集せず、AI Desktopで変更してください。'
// 書き出す端末の時刻設定に関係なく同じ表記にするため、日本時間で固定する。
const updatedAtLabel = (value: number) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value)
const stateLabel = (document: AIDesktopDesignDocument<DesignDocumentContent>) => document.editingBy.length ? `編集中（${document.editingBy.join('、')}さん）。内容が変わる可能性があります` : document.deliveryState === 'changed' ? '未反映の変更あり（最新の成果物と内容が異なります）' : document.deliveryState === 'unsubmitted' ? '未提出（まだ成果物に含まれていません）' : ''
const shortStateLabel = (document: AIDesktopDesignDocument<DesignDocumentContent>) => document.editingBy.length ? '編集中' : document.deliveryState === 'changed' ? '未反映の変更あり' : document.deliveryState === 'unsubmitted' ? '未提出' : ''
// 生成したこと、いつ時点の内容か、今の状態を、各設計書の先頭に記録する。
const documentHeader = (document: AIDesktopDesignDocument<DesignDocumentContent>) => lines(GENERATED_NOTICE, `> AI Desktop上の最終更新：${updatedAtLabel(document.updatedAt)}`, stateLabel(document) && `> 状態：${stateLabel(document)}。`)

function leafToMarkdown(block: LeafBlock): string {
  switch (block.type) {
    case 'heading': return `${'#'.repeat(Math.min(block.data.level + 1, 6))} ${block.data.text}`
    case 'text': return block.data.text
    case 'image': return lines(`![${block.data.alt}](${block.data.url})`, block.data.caption && `*${block.data.caption}*`)
    case 'code': return lines(block.data.filename && `\`${block.data.filename}\``, `\`\`\`${block.data.language}`, block.data.code, '```')
    case 'checklist': return block.data.items.map((item) => `- [ ] ${item.text}`).join('\n')
    case 'callout': return [`**${block.data.title || { info: '補足', warning: '注意', tip: 'ヒント' }[block.data.tone]}**`, ...block.data.text.split('\n')].map((line) => `> ${line}`).join('\n')
    case 'divider': return '---'
    case 'table': return markdownTable(block.data.columns.map((column) => column.label), block.data.rows.map((row) => row.cells))
    case 'link': return `[${block.data.label}](${block.data.url})`
    case 'toc': return ''
    case 'glossary': return markdownTable(['用語', '説明'], block.data.entries.map((entry) => [entry.term, entry.description]))
    case 'card': return block.data.items.map((item) => lines(`- **${item.title}**${item.badges?.length ? `（${item.badges.map((badge) => badge.label).join('、')}）` : ''}`, item.description && `  ${item.description.replace(/\n/gu, '\n  ')}`, item.link && `  [${item.link.label}](${item.link.url})`)).join('\n')
    case 'steps': return block.data.items.map((item, index) => lines(`${index + 1}. **${item.title}**${item.badges?.length ? `（${item.badges.map((badge) => badge.label).join('、')}）` : ''}`, item.text && `   ${item.text.replace(/\n/gu, '\n   ')}`)).join('\n')
    case 'diagram': return lines(block.data.title && `**${block.data.title}**`, '```mermaid', block.data.source, '```', block.data.caption && `*${block.data.caption}*`)
  }
}

function blockToMarkdown(block: ContentBlock): string {
  if (block.type === 'columns') return [...block.data.left, ...block.data.right].map(leafToMarkdown).filter(Boolean).join('\n\n')
  // Screen Mapブロックは資料（マイ資料）専用で、設計書には現れない。
  if (block.type === 'screenMap') return ''
  return leafToMarkdown(block)
}

const pageToMarkdown = (page: DesignDocumentContent['pages'][number]) => page.blocks.map(blockToMarkdown).filter((text) => text.trim()).join('\n\n')

/** 概要: ドキュメントをMarkdownのファイルにする。 責務: 大きいものはページごとのファイルに分ける。 */
function documentFiles(directory: string, document: AIDesktopDesignDocument<DesignDocumentContent>): { entryPath: string; files: AgentExportFile[] } {
  const pages = document.content.pages
  const pageTexts = pages.map(pageToMarkdown)
  const totalLength = pageTexts.reduce((sum, text) => sum + text.length, 0)
  if (pages.length < 2 || totalLength < splitCharacterCount) {
    // ページの先頭がすでに見出しなら、ページ名の見出しは重ねて出さない。
    const body = pages.map((page, index) => page.blocks[0]?.type === 'heading' ? pageTexts[index] : lines(`## ${page.navTitle}`, '', pageTexts[index])).join('\n\n')
    return { entryPath: `${directory}.md`, files: [{ path: `${directory}.md`, content: `# ${document.title}\n\n${documentHeader(document)}\n\n${body}\n` }] }
  }
  const files = pages.map((page, index) => ({ path: `${directory}/${numbered(index, page.navTitle)}.md`, content: `# ${document.title} / ${page.navTitle}\n\n${documentHeader(document)}\n\n${pageTexts[index]}\n` }))
  const index = lines(`# ${document.title}`, '', documentHeader(document), '', 'ページごとにファイルを分けています。必要なページだけを読んでください。', '', ...pages.map((page, pageIndex) => `- [${page.navTitle}](<./${numbered(pageIndex, page.navTitle)}.md>)`))
  return { entryPath: `${directory}/README.md`, files: [{ path: `${directory}/README.md`, content: `${index}\n` }, ...files] }
}

function projectFiles(project: AIDesktopProject): Array<AgentExportFile & { title: string }> {
  const files: Array<AgentExportFile & { title: string }> = []
  const add = (name: string, title: string, body: string) => { if (body.trim()) files.push({ path: `docs/project/${name}.md`, title, content: `# ${title}\n\n${GENERATED_NOTICE}\n\n${body.trim()}\n` }) }
  add('overview', '概要と構成', lines(project.summary, project.systemDiagramSource.trim() && `\n## システム構成図\n\n\`\`\`mermaid\n${project.systemDiagramSource.trim()}\n\`\`\``, project.fileStructure?.trim() && `\n## ファイル構成\n\n\`\`\`text\n${project.fileStructure.trim()}\n\`\`\``))
  add('tech-stack', '技術スタック', markdownTable(['名前', '分類', '用途'], project.technologyStack.map((item) => [item.name, item.category ?? '', item.description])))
  add('database', 'データベース', project.databaseInfo.map((item) => lines(`## ${item.name}`, item.category && `分類：${item.category}`, item.description, item.ddl?.trim() && `\n\`\`\`sql\n${item.ddl.trim()}\n\`\`\``)).join('\n\n'))
  const environment = project.environmentSetup
  if (environment && typeof environment === 'object' && 'summary' in environment) {
    const summaryLabels: Record<string, string> = { os: 'OS', runtime: '実行環境', packageManager: 'パッケージ管理', frontend: 'フロントエンド', worker: 'バックエンド・Worker' }
    add('environment', '開発環境', lines(
      markdownTable(['項目', '内容'], Object.entries(environment.summary).filter(([, value]) => value).map(([key, value]) => [summaryLabels[key] ?? key, value])),
      environment.prerequisites.length > 0 && `\n## 前提ソフトウェア\n\n${markdownTable(['名前', 'バージョン', '必須', '説明'], environment.prerequisites.map((item) => [item.name, item.version, item.required ? '必須' : '任意', item.description]))}`,
      environment.services.length > 0 && `\n## ローカルサービス\n\n${markdownTable(['名前', '接続先', '起動コマンド'], environment.services.map((item) => [item.name, item.endpoint, item.command]))}`,
      environment.steps.length > 0 && `\n## 初回セットアップ\n\n${environment.steps.map((item, index) => lines(`${index + 1}. ${item.title}${item.description ? `：${item.description}` : ''}`, item.command && `   \`\`\`\n   ${item.command.replace(/\n/gu, '\n   ')}\n   \`\`\``)).join('\n')}`,
      environment.variables.length > 0 && `\n## 環境変数（値は記載しません）\n\n${markdownTable(['変数名', '設定先', '必須', '説明'], environment.variables.map((item) => [item.name, item.location, item.required ? '必須' : '任意', item.description]))}`,
      environment.checks.length > 0 && `\n## 動作確認\n\n${environment.checks.map((item) => `- [ ] ${item.label}`).join('\n')}`,
    ))
  }
  add('commands', 'よく使うコマンド', project.commands.map((command) => lines(`## ${command.name}`, command.description, [command.directory && `実行場所：${command.directory}`, command.environment && `環境：${command.environment}`].filter(Boolean).join(' ／ '), `\`\`\`\n${command.command}\n\`\`\``)).join('\n\n'))
  add('rules', 'プロジェクトルール', project.projectRules.map((rule) => `- **${rule.importance === 'recommended' ? '推奨' : '必須'}** ${rule.name}${rule.category ? `（${rule.category}）` : ''}：${rule.description}`).join('\n'))
  add('links', 'リンク集', project.links.map((link) => `- [${link.name}](${link.url})${link.description ? `：${link.description}` : ''}`).join('\n'))
  add('notes', '開発メモ', project.developmentNotes)
  return files
}

function aiDesktopGuide() {
  return lines(
    '# AI Desktopについて',
    '',
    `書き出し形式：${AGENT_EXPORT_FORMAT_VERSION}`,
    '',
    '`docs/design/` と `docs/project/` は、AI Desktop（プロジェクト単位でドキュメントを管理するツール）が生成したファイルです。正しい内容はAI Desktopにあり、これらのファイルを直接編集しても、次の書き出しで上書きされます。',
    '',
    '## ドキュメントを変更・作成するとき',
    '',
    '1. 利用者に、AI Desktopで対象のドキュメントを開き、「JSON連携」から現在の内容をJSONとして書き出してもらう（Workspace JSONやダウンロードしたJSONファイル）。',
    '2. そのJSONの `data.title` と `data.content` だけを編集する。`format`・`version`・`resourceType`・`target` は変更しない。',
    '3. 利用者がAI Desktopで「JSONから読み込む」を実行し、画面で内容を確認してから保存する。',
    '',
    '## JSONの構造',
    '',
    '- `data.content` は `{ "schemaVersion": 2, "pages": [...] }` です。',
    '- 各ページは `id`・`navTitle`・`blocks` を持ちます（子ページは `parentId` を持ちます）。',
    '- 各ブロックは、ページ内で重複しない `id` と、`type`・`data` を持ちます。使えるブロックと `data` の形は `docs/ai-desktop/block-reference.json` を参照してください。',
    '- ページとブロックの `id` は、文書の中で重複しない値にしてください。',
    '',
    '## 設計書の状態',
    '',
    '各設計書の先頭に、AI Desktop上の最終更新日時と状態を記録しています。状態は、AI Desktopが自動で決めます。',
    '',
    '- 編集中：書き出した時点で、誰かがAI Desktopで編集していました。内容が変わる可能性があります。',
    '- 未反映の変更あり：最新の成果物を作ったあとに、内容が変わりました。',
    '- 未提出：まだどの成果物にも含まれていません。',
    '- 表示なし：最新の成果物と同じ内容、またはプロジェクトで成果物を使っていません。',
    '',
    '## 注意',
    '',
    '- 設計書の構成（ページの並びや表の列）は、標準テンプレートに沿っています。必要がない限り、構成を変えずに中身を埋めてください。',
    '- 秘密情報（パスワード、APIキー、個人情報）は書かないでください。',
  )
}

/**
 * 概要: プロジェクトとドキュメントから、AI向けのファイル一式を作る。
 * 責務: AGENTS.mdは小さく保ち、詳しい内容をdocs/以下に分ける。並び順と書式を固定し、同じ内容なら同じファイルになるようにする。
 */
export function buildAgentExport(project: AIDesktopProject, categories: AIDesktopDesignCategory[], documents: AgentExportDocument[]): AgentExportResult {
  const files: AgentExportFile[] = []
  const projectDocs = projectFiles(project)
  files.push(...projectDocs)

  // 設計書はカテゴリごとのフォルダに分け、カテゴリ内の並び順（標準テンプレートの順）で番号を付ける。
  const categoryNames = [...categories.map((category) => category.name), '未分類']
  const indexSections: string[] = []
  categoryNames.forEach((categoryName, categoryIndex) => {
    const items = documents.filter((item) => item.categoryName === categoryName)
    if (!items.length) return
    const folder = `docs/design/${numbered(categoryIndex, categoryName)}`
    const entries = items.map((item, index) => {
      if (item.document.format !== 'document') return `- ${item.document.title}（${formatLabels[item.document.format] ?? item.document.format}ファイル。中身はAI Desktopで管理しており、書き出していません）`
      const { entryPath, files: documentOutput } = documentFiles(`${folder}/${numbered(index, item.document.title)}`, item.document)
      files.push(...documentOutput)
      return `- [${item.document.title}](<${entryPath.replace('docs/design/', './')}>)${shortStateLabel(item.document) ? `（${shortStateLabel(item.document)}）` : ''}`
    })
    indexSections.push(lines(`## ${categoryName}`, '', ...entries))
  })
  files.push({ path: 'docs/design/README.md', content: `${lines('# 設計書の一覧', '', '作業に関係する設計書だけを開いて読んでください。', '', indexSections.join('\n\n'))}\n` })

  files.push({ path: 'docs/ai-desktop/README.md', content: `${aiDesktopGuide()}\n` })
  // 設計書ではScreen Mapブロックを使わないため、設計書向けのブロック一覧には含めない。
  const blockReference: Partial<ContentBlockCatalog> = createContentBlockCatalog()
  delete blockReference.screenMap
  files.push({ path: 'docs/ai-desktop/block-reference.json', content: `${JSON.stringify(blockReference, null, 2)}\n` })

  // 毎回読まれるため、概要・必須のルール・固定したコマンド・置き場所の案内だけにする。
  const requiredRules = project.projectRules.filter((rule) => rule.importance !== 'recommended')
  const pinnedCommands = project.commands.filter((command) => command.pinned)
  const summary = project.summary.trim().split('\n').slice(0, 6).join('\n')
  const agents = lines(
    `# ${project.name}`,
    summary && `\n${summary}`,
    requiredRules.length > 0 && `\n## 守るルール\n\n${requiredRules.map((rule) => `- ${rule.name}：${rule.description}`).join('\n')}`,
    pinnedCommands.length > 0 && `\n## よく使うコマンド\n\n${pinnedCommands.map((command) => `- ${command.name}：\`${command.command.split('\n')[0]}\`${command.directory ? `（${command.directory}）` : ''}`).join('\n')}`,
    '\n## 詳しい情報の置き場所',
    '',
    '- 設計書：`docs/design/`（一覧は `docs/design/README.md`）。要件や設計に関わる作業では、該当する設計書を読んでから始めてください。',
    projectDocs.length > 0 && `- プロジェクト情報：${projectDocs.map((file) => `${file.title}は \`${file.path}\``).join('、')}`,
    '- `docs/design/` と `docs/project/` はAI Desktopが生成したファイルです。直接編集せず、変更が必要なときは `docs/ai-desktop/README.md` の手順に従ってください。',
  )
  files.unshift({ path: 'AGENTS.md', content: generated(agents) }, { path: 'CLAUDE.md', content: generated('@AGENTS.md') })
  const documentVersions = Object.fromEntries(documents.map((item) => [item.document.id, item.document.updatedAt]))
  return { files, agentsLineCount: agents.split('\n').length, documentVersions }
}

const crcTable = Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0 })
const crc32 = (bytes: Uint8Array) => { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }

/**
 * 概要: ファイル一式を無圧縮のZIPにまとめる。
 * 責務: 日本語のファイル名をUTF-8で記録し、どのブラウザでもダウンロードできるようにする。各ファイルには書き出した日時を記録する。
 */
export function createZip(files: AgentExportFile[], exportedAt = new Date()): Blob {
  const encoder = new TextEncoder()
  // ZIPの日時はMS-DOS形式（2秒単位、1980年起点）で、利用者の端末の時刻として記録する。
  const dosTime = (exportedAt.getHours() << 11) | (exportedAt.getMinutes() << 5) | Math.floor(exportedAt.getSeconds() / 2)
  const dosDate = ((exportedAt.getFullYear() - 1980) << 9) | ((exportedAt.getMonth() + 1) << 5) | exportedAt.getDate()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.path)
    const data = encoder.encode(file.content)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true); local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), name, data)
    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true); entry.setUint16(10, 0, true)
    entry.setUint16(12, dosTime, true); entry.setUint16(14, dosDate, true); entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true)
    entry.setUint16(28, name.length, true); entry.setUint16(30, 0, true); entry.setUint16(32, 0, true); entry.setUint16(34, 0, true); entry.setUint16(36, 0, true)
    entry.setUint32(38, 0, true); entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), name)
    offset += 30 + name.length + data.length
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)].map((part) => part.slice().buffer as ArrayBuffer), { type: 'application/zip' })
}
