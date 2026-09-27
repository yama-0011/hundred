import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  createAIDesktopProject,
  deleteAIDesktopProject,
  getAIDesktopProject,
  listAIDesktopProjects,
  searchAIDesktopUsers,
  updateAIDesktopProject,
  type AIDesktopProject,
  type AIDesktopDocument,
  type AIDesktopProjectCommand,
  type AIDesktopProjectDetail,
  type AIDesktopProjectDevelopmentMode,
  type AIDesktopProjectDocument,
  type AIDesktopProjectEnvironment,
  type AIDesktopProjectInput,
  type AIDesktopProjectLink,
  type AIDesktopProjectRule,
  type AIDesktopProjectStatus,
  type AIDesktopProjectSummary,
  type AIDesktopUserSearchResult,
} from '../../services/AIDesktop/aiDesktopApi'
import type { ServiceConfig } from './contentBlocks'
import { AI_DESKTOP_MESSAGES, localizedErrorMessage } from './aiDesktopMessages'
import { MermaidDiagram } from './MermaidDiagram'
import { validateMermaidSource } from './mermaidDiagramValidation'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import { isWorkspaceJsonFileCancelled, readWorkspaceJsonFile, selectWorkspaceJsonFile, supportsWorkspaceJsonFile, writeWorkspaceJsonFile } from './workspaceJsonFile'

type ServiceId = AIDesktopProjectDocument['serviceId']
type ProjectView = 'dashboard' | 'edit'
type ArchitectureTab = 'system' | 'files'
type ProjectDetailTab = 'technologyStack' | 'databaseInfo' | 'projectRules'
type ProjectWorkspaceTab = ProjectDetailTab | 'environmentSetup' | 'commands' | 'links' | 'developmentNotes' | 'members'
type ProjectTemplateProject = Omit<AIDesktopProjectInput, 'relatedDocuments' | 'memberUserIds' | 'customerName' | 'objective' | 'designNotes'>
type ProjectTemplate = { format: 'hundred-ai-desktop'; version: 1; resourceType: 'project'; target: { projectId: string | null }; guide?: Record<string, unknown>; reference?: Record<string, unknown>; data: { project: ProjectTemplateProject } }

const statusLabels: Record<AIDesktopProjectStatus, string> = {
  planning: '企画', proposal: '提案', design: '設計', development: '開発', review: '確認', completed: '完了', 'on-hold': '保留',
}
const developmentModeLabels: Record<AIDesktopProjectDevelopmentMode, string> = { personal: '個人開発', team: 'チーム開発' }
const workspaceTabLabels: Record<ProjectWorkspaceTab, string> = { technologyStack: '技術スタック', databaseInfo: 'DB情報', environmentSetup: '開発環境', commands: 'よく使うコマンド', links: 'リンク集', developmentNotes: '開発メモ', projectRules: 'プロジェクトルール', members: 'メンバー' }
const documentPhases = [
  ['common', '共通'], ['planning', '企画'], ['requirements', '要件定義'], ['basic-design', '基本設計'], ['detailed-design', '詳細設計'], ['implementation', '実装'], ['test', 'テスト'], ['release', 'リリース'], ['operation', '運用'], ['research', '調査'],
] as const
const documentTypes = [
  ['external-design', '外部設計'], ['internal-design', '内部設計'], ['ui-design', 'UI設計'], ['database-design', 'DB設計'], ['api-design', 'API設計'], ['usage-guide', '利用ガイド'], ['procedure', '手順書'], ['research', '調査資料'], ['test-specification', 'テスト仕様書'], ['minutes', '議事録'], ['other', 'その他'],
] as const
const documentPhaseLabel = (value?: string) => documentPhases.find(([id]) => id === value)?.[1] ?? '共通'
const documentTypeLabel = (value?: string) => documentTypes.find(([id]) => id === value)?.[1] ?? 'その他'
const initialDiagram = `flowchart LR
  User[ユーザー] --> App[アプリケーション]
  App --> API[API]
  API --> DB[(Database)]`
const initialFileStructure = `project/
├── frontend/
├── workers/
└── README.md`

const blankProjectEnvironment = (): AIDesktopProjectEnvironment => ({
  summary: { os: '', runtime: '', packageManager: '', frontend: '', worker: '' },
  prerequisites: [], services: [], steps: [], variables: [], checks: [],
})

const blankProject = (): AIDesktopProjectInput => ({
  name: '', customerName: '', summary: '', objective: '', status: 'planning', developmentMode: 'personal',
  systemDiagramSource: initialDiagram, fileStructure: initialFileStructure, technologyStack: [], databaseInfo: [], environmentSetup: blankProjectEnvironment(), commands: [], links: [], projectRules: [], designNotes: '', developmentNotes: '', relatedDocuments: [], memberUserIds: [],
})

const projectInput = (project: AIDesktopProject): AIDesktopProjectInput => ({
  name: project.name, customerName: project.customerName, summary: project.summary, objective: project.objective, status: project.status,
  developmentMode: project.developmentMode, systemDiagramSource: project.systemDiagramSource, fileStructure: project.fileStructure ?? '', technologyStack: project.technologyStack,
  databaseInfo: project.databaseInfo, environmentSetup: parseProjectEnvironment(project.environmentSetup ?? blankProjectEnvironment()), commands: project.commands ?? [], links: project.links ?? [], projectRules: project.projectRules ?? [], designNotes: project.designNotes, developmentNotes: project.developmentNotes, relatedDocuments: project.relatedDocuments, memberUserIds: project.memberUserIds ?? project.members?.filter((member) => member.role === 'member').map((member) => member.userId) ?? [],
})

const projectData = (source: AIDesktopProjectInput): ProjectTemplateProject => ({
  name: source.name || '新しいプロジェクト',
  summary: source.summary,
  status: source.status,
  developmentMode: source.developmentMode,
  systemDiagramSource: source.systemDiagramSource,
  fileStructure: source.fileStructure,
  technologyStack: source.technologyStack,
  databaseInfo: source.databaseInfo,
  environmentSetup: source.environmentSetup,
  commands: source.commands,
  links: source.links,
  developmentNotes: source.developmentNotes,
  projectRules: source.projectRules,
})

const projectTemplate = (source: AIDesktopProjectInput, projectId: string | null = null): ProjectTemplate => ({
  format: 'hundred-ai-desktop',
  version: 1,
  resourceType: 'project',
  target: { projectId },
  data: { project: projectData(source) },
})

const projectExample: ProjectTemplateProject = {
  name: 'サンプルWebアプリ',
  summary: '利用者が情報を登録・検索できるWebアプリケーションです。Reactの画面からWorker APIを呼び出し、D1へデータを保存します。',
  status: 'development',
  developmentMode: 'personal',
  systemDiagramSource: 'flowchart LR\n  User[ユーザー] --> Frontend[React]\n  Frontend --> API[Cloudflare Worker]\n  API --> DB[(Cloudflare D1)]',
  fileStructure: 'sample-app/\n├── frontend/\n│   └── src/\n├── workers/\n│   └── api/\n└── README.md',
  technologyStack: [{ name: 'React', description: '画面UIを実装します。', category: 'フロントエンド', ddl: '' }],
  databaseInfo: [{ name: 'items', description: '利用者が登録した情報を保存します。', category: 'Cloudflare D1', ddl: 'CREATE TABLE items (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  created_at INTEGER NOT NULL\n);' }],
  environmentSetup: {
    summary: { os: 'macOS', runtime: 'Node.js 22', packageManager: 'npm', frontend: 'Vite', worker: 'Wrangler' },
    prerequisites: [{ name: 'Node.js', version: '22', required: true, description: '開発サーバーとビルドに使用します。' }],
    services: [{ name: 'Frontend', endpoint: 'http://localhost:5173', command: 'npm run dev' }],
    steps: [{ title: '依存関係をインストール', description: 'frontendで実行します。', command: 'npm install' }],
    variables: [{ name: 'VITE_API_ORIGIN', location: 'frontend/.env.local', required: true, description: 'APIの接続先です。' }],
    checks: [{ label: '画面を開き、一覧を取得できることを確認する。' }],
  },
  commands: [{ name: 'フロントエンドを起動', description: 'Vite開発サーバーを起動します。', directory: 'frontend', command: 'npm run dev', environment: 'ローカル', category: '起動', pinned: true }],
  links: [{ name: 'React公式ドキュメント', description: 'Reactの仕様を確認します。', type: '公式資料', url: 'https://react.dev/' }],
  developmentNotes: '重要な調査結果や再開時に必要な情報を記載します。',
  projectRules: [{ name: 'コミットメッセージ', description: '変更内容が分かる日本語で記載します。', category: 'Git', importance: 'required' }],
}

const projectEditingTemplate = (source: AIDesktopProjectInput, projectId: string | null = null): ProjectTemplate => ({
  ...projectTemplate(source, projectId),
  guide: {
    purpose: 'HundredのProjectを新規作成または編集するためのJSONテンプレートです。実際に反映されるのはdata.projectだけです。guideとreferenceは説明用です。',
    editableSection: 'data.project',
    steps: [
      'reference.exampleとreference.fieldDefinitionsを参考にdata.projectの各項目を入力します。',
      'format、version、resourceType、target、dataのキー名と配列・オブジェクト構造を維持してJSONを保存します。',
      'HundredのProject編集画面で「JSONをインポート」または「JSONから読み込む」を実行します。',
      '編集画面へ反映された内容を確認し、「保存」を押してProjectへ反映します。',
    ],
    requiredFields: ['data.project.name', 'data.project.status', 'data.project.developmentMode'],
    optionalFields: ['data.project.summary', 'data.project.systemDiagramSource', 'data.project.fileStructure', 'data.project.technologyStack', 'data.project.databaseInfo', 'data.project.environmentSetup', 'data.project.commands', 'data.project.links', 'data.project.developmentNotes', 'data.project.projectRules'],
    managedInHundred: ['関連資料', 'メンバー'],
    cautions: ['data.project以外はインポートされません。', '配列を使用しない場合も空配列[]を維持してください。', 'URLはhttp://またはhttps://から始めてください。', 'systemDiagramSourceにはMermaid flowchart構文を使用してください。'],
  },
  reference: {
    allowedValues: { status: Object.keys(statusLabels), developmentMode: Object.keys(developmentModeLabels), ruleImportance: ['required', 'recommended'] },
    fieldDefinitions: {
      name: { description: 'プロジェクト名。必須です。', maxLength: 120 },
      summary: { description: 'プロジェクトの概要。目的、対象、提供する価値を簡潔に記載します。', maxLength: 2_000 },
      systemDiagramSource: { description: 'システム構成図として表示するMermaid flowchart構文です。', maxLength: 50_000 },
      fileStructure: { description: '主要なフォルダとファイルの構成をツリー形式で記載します。', maxLength: 50_000 },
      technologyStack: { item: { name: '技術名', description: '用途や採用理由', category: 'カテゴリ', ddl: '' } },
      databaseInfo: { item: { name: 'テーブル名', description: '用途', category: 'データベース名や分類', ddl: 'CREATE TABLE ...' } },
      environmentSetup: {
        summary: { os: 'OS', runtime: '実行環境', packageManager: 'パッケージ管理', frontend: 'フロントエンド', worker: 'バックエンドやWorker' },
        prerequisites: { item: { name: '前提ソフトウェア', version: 'バージョン', required: true, description: '説明' } },
        services: { item: { name: 'サービス名', endpoint: '接続先', command: '起動コマンド' } },
        steps: { item: { title: '手順名', description: '説明', command: '実行コマンド' } },
        variables: { item: { name: '環境変数名', location: '設定場所', required: true, description: '用途' } },
        checks: { item: { label: '動作確認項目' } },
      },
      commands: { item: { name: '表示名', description: '用途', directory: '実行場所', command: 'コマンド', environment: '環境', category: '分類', pinned: false } },
      links: { item: { name: '表示名', description: '用途', type: '分類', url: 'https://...' } },
      projectRules: { item: { name: 'ルール名', description: '内容', category: '分類', importance: 'required | recommended' } },
    },
    example: projectExample,
  },
})

function parseProjectEnvironment(value: unknown): AIDesktopProjectEnvironment {
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    return {
      ...blankProjectEnvironment(),
      prerequisites: value.map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
        const item = entry as Record<string, unknown>
        if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200 || typeof item.description !== 'string' || item.description.length > 1_000) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
        return { name: item.name.trim(), version: '', required: true, description: item.description.trim() }
      }),
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
  const environment = value as Record<string, unknown>
  if (!environment.summary || typeof environment.summary !== 'object' || Array.isArray(environment.summary)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
  const sourceSummary = environment.summary as Record<string, unknown>
  const summaryKeys = ['os', 'runtime', 'packageManager', 'frontend', 'worker'] as const
  if (!summaryKeys.every((key) => typeof sourceSummary[key] === 'string' && sourceSummary[key].length <= 200)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
  const list = <T,>(key: string, parse: (item: Record<string, unknown>) => T) => {
    const source = environment[key]
    if (!Array.isArray(source) || source.length > 100) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    return source.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
      return parse(entry as Record<string, unknown>)
    })
  }
  const requiredString = (item: Record<string, unknown>, key: string, max: number, allowEmpty = false) => {
    const content = item[key]
    if (typeof content !== 'string' || content.length > max || (!allowEmpty && !content.trim())) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    return content.trim()
  }
  return {
    summary: Object.fromEntries(summaryKeys.map((key) => [key, String(sourceSummary[key]).trim()])) as AIDesktopProjectEnvironment['summary'],
    prerequisites: list('prerequisites', (item) => ({ name: requiredString(item, 'name', 200), version: requiredString(item, 'version', 100, true), required: typeof item.required === 'boolean' ? item.required : true, description: requiredString(item, 'description', 1_000, true) })),
    services: list('services', (item) => ({ name: requiredString(item, 'name', 200), endpoint: requiredString(item, 'endpoint', 500, true), command: requiredString(item, 'command', 4_000, true) })),
    steps: list('steps', (item) => ({ title: requiredString(item, 'title', 200), description: requiredString(item, 'description', 1_000, true), command: requiredString(item, 'command', 4_000, true) })),
    variables: list('variables', (item) => ({ name: requiredString(item, 'name', 200), location: requiredString(item, 'location', 200, true), required: typeof item.required === 'boolean' ? item.required : true, description: requiredString(item, 'description', 1_000, true) })),
    checks: list('checks', (item) => ({ label: requiredString(item, 'label', 500) })),
  }
}

function parseProjectTemplate(value: unknown): ProjectTemplateProject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
  const template = value as Record<string, unknown>
  let source: Record<string, unknown>
  if (template.format === 'hundred-ai-desktop') {
    if (template.version !== 1 || template.resourceType !== 'project') throw new Error(template.resourceType === 'content' ? AI_DESKTOP_MESSAGES.project.wrongResourceType : AI_DESKTOP_MESSAGES.project.templateInvalid)
    if (!template.data || typeof template.data !== 'object' || Array.isArray(template.data)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    const data = template.data as Record<string, unknown>
    if (!data.project || typeof data.project !== 'object' || Array.isArray(data.project)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    source = data.project as Record<string, unknown>
  } else {
    if (template.format !== 'hundred-ai-desktop-project' || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(Number(template.version)) || !template.project || typeof template.project !== 'object' || Array.isArray(template.project)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    source = template.project as Record<string, unknown>
  }
  const requiredText = (key: string, max: number, allowEmpty = false) => {
    const field = source[key]
    if (typeof field !== 'string' || (!allowEmpty && !field.trim()) || field.length > max) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    return field
  }
  const detailList = (key: string, maxItems: number) => {
    const field = source[key]
    if (!Array.isArray(field) || field.length > maxItems) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    return field.map((item): AIDesktopProjectDetail => {
      if (typeof item === 'string') {
        if (!item.trim() || item.length > 1_200) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
        const delimiter = ' — '
        const index = item.indexOf(delimiter)
        const detail = index < 0 ? { name: item.trim(), description: '' } : { name: item.slice(0, index).trim(), description: item.slice(index + delimiter.length).trim() }
        if (!detail.name || detail.name.length > 200 || detail.description.length > 1_000) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
        return detail
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
      const detail = item as Record<string, unknown>
      if (typeof detail.name !== 'string' || !detail.name.trim() || detail.name.length > 200 || typeof detail.description !== 'string' || detail.description.length > 1_000 || (detail.category !== undefined && (typeof detail.category !== 'string' || detail.category.length > 100)) || (detail.ddl !== undefined && (typeof detail.ddl !== 'string' || detail.ddl.length > 50_000))) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
      return { name: detail.name.trim(), description: detail.description.trim(), category: typeof detail.category === 'string' ? detail.category.trim() : '', ddl: typeof detail.ddl === 'string' ? detail.ddl.trim() : '' }
    })
  }
  const commandList = () => {
    if (source.commands === undefined) return []
    if (!Array.isArray(source.commands) || source.commands.length > 100) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    return source.commands.map((item): AIDesktopProjectCommand => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
      const command = item as Record<string, unknown>
      if (typeof command.name !== 'string' || !command.name.trim() || command.name.length > 200 || typeof command.description !== 'string' || command.description.length > 1_000 || typeof command.directory !== 'string' || command.directory.length > 500 || typeof command.command !== 'string' || !command.command.trim() || command.command.length > 4_000 || typeof command.environment !== 'string' || command.environment.length > 100 || (command.category !== undefined && (typeof command.category !== 'string' || command.category.length > 100)) || (command.pinned !== undefined && typeof command.pinned !== 'boolean')) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
      return { name: command.name.trim(), description: command.description.trim(), directory: command.directory.trim(), command: command.command.trim(), environment: command.environment.trim(), category: typeof command.category === 'string' ? command.category.trim() : '', pinned: command.pinned === true }
    })
  }
  const ruleList = () => detailList('projectRules', 100).map((item, index): AIDesktopProjectRule => {
    const sourceRules = source.projectRules as unknown[]
    const sourceRule = sourceRules[index]
    const importance = sourceRule && typeof sourceRule === 'object' && !Array.isArray(sourceRule) ? (sourceRule as Record<string, unknown>).importance : undefined
    if (importance !== undefined && importance !== 'required' && importance !== 'recommended') throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    return { ...item, importance: importance === 'required' ? 'required' : 'recommended' }
  })
  const linkList = () => {
    if (source.links === undefined) return []
    if (!Array.isArray(source.links) || source.links.length > 100) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
    return source.links.map((item): AIDesktopProjectLink => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
      const link = item as Record<string, unknown>
      if (typeof link.name !== 'string' || !link.name.trim() || link.name.length > 200 || typeof link.description !== 'string' || link.description.length > 1_000 || typeof link.type !== 'string' || link.type.length > 100 || typeof link.url !== 'string' || !/^https?:\/\//u.test(link.url.trim()) || link.url.length > 2_000) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
      return { name: link.name.trim(), description: link.description.trim(), type: link.type.trim(), url: link.url.trim() }
    })
  }
  if (!Object.hasOwn(statusLabels, String(source.status)) || !Object.hasOwn(developmentModeLabels, String(source.developmentMode))) throw new Error(AI_DESKTOP_MESSAGES.project.templateInvalid)
  return {
    name: requiredText('name', 120), summary: requiredText('summary', 2_000, true),
    status: String(source.status) as AIDesktopProjectStatus, developmentMode: String(source.developmentMode) as AIDesktopProjectDevelopmentMode,
    systemDiagramSource: requiredText('systemDiagramSource', 50_000, true), fileStructure: source.fileStructure === undefined ? '' : requiredText('fileStructure', 50_000, true), technologyStack: detailList('technologyStack', 100), databaseInfo: detailList('databaseInfo', 100), environmentSetup: source.environmentSetup === undefined ? blankProjectEnvironment() : parseProjectEnvironment(source.environmentSetup), commands: commandList(), links: linkList(), developmentNotes: source.developmentNotes === undefined ? '' : requiredText('developmentNotes', 50_000, true), projectRules: source.projectRules === undefined ? [] : ruleList(),
  }
}

type ParsedDdl = {
  columns: Array<{ name: string; type: string; constraints: string }>
  tableConstraints: string[]
  indexes: Array<{ name: string; columns: string; unique: boolean }>
}

const cleanSqlIdentifier = (value: string) => value.replace(/^(?:`|"|\[)|(?:`|"|\])$/gu, '')

function matchingParenthesis(source: string, openIndex: number) {
  let depth = 0
  let quote = ''
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (quote === ']' ? character === ']' : character === quote && source[index - 1] !== '\\') quote = ''
      continue
    }
    if (character === "'" || character === '"' || character === '`' || character === '[') {
      quote = character === '[' ? ']' : character
      continue
    }
    if (character === '(') depth += 1
    if (character === ')' && --depth === 0) return index
  }
  return -1
}

function splitSqlDefinitions(source: string) {
  const definitions: string[] = []
  let start = 0
  let depth = 0
  let quote = ''
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (quote === ']' ? character === ']' : character === quote && source[index - 1] !== '\\') quote = ''
      continue
    }
    if (character === "'" || character === '"' || character === '`' || character === '[') {
      quote = character === '[' ? ']' : character
      continue
    }
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    else if (character === ',' && depth === 0) {
      definitions.push(source.slice(start, index).trim())
      start = index + 1
    }
  }
  const last = source.slice(start).trim()
  if (last) definitions.push(last)
  return definitions
}

function parseDatabaseDdl(ddl: string): ParsedDdl {
  const result: ParsedDdl = { columns: [], tableConstraints: [], indexes: [] }
  const tableMatch = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:(?:`|"|\[)?[\w-]+(?:`|"|\])?\.)?(?:`|"|\[)?[\w-]+(?:`|"|\])?\s*\(/iu.exec(ddl)
  if (tableMatch) {
    const openIndex = tableMatch.index + tableMatch[0].lastIndexOf('(')
    const closeIndex = matchingParenthesis(ddl, openIndex)
    if (closeIndex > openIndex) {
      for (const definition of splitSqlDefinitions(ddl.slice(openIndex + 1, closeIndex))) {
        if (/^(?:CONSTRAINT\s+\S+\s+)?(?:PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK)\b/iu.test(definition)) {
          result.tableConstraints.push(definition.replace(/\s+/gu, ' ').trim())
          continue
        }
        const column = /^\s*(`[^`]+`|"[^"]+"|\[[^\x5D]+\]|\S+)\s+([^\s,]+)([\s\S]*)$/u.exec(definition)
        if (column) result.columns.push({ name: cleanSqlIdentifier(column[1]), type: column[2], constraints: column[3].replace(/\s+/gu, ' ').trim() || '—' })
      }
    }
  }
  const indexPattern = /CREATE\s+(UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+((?:`|"|\[)?[^\s`"\]]+(?:`|"|\])?)\s+ON\s+[^\s(]+\s*\(([^;]+)\)/giu
  for (const match of ddl.matchAll(indexPattern)) result.indexes.push({ name: cleanSqlIdentifier(match[2]), columns: match[3].replace(/\s+/gu, ' ').trim(), unique: Boolean(match[1]) })
  return result
}

function DatabaseDdlView({ ddl }: { ddl: string }) {
  if (!ddl.trim()) return <p className="ad-project-ddl-empty">DDL・マイグレーションは登録されていません。</p>
  const parsed = parseDatabaseDdl(ddl)
  return <div className="ad-project-ddl-view">
    {parsed.columns.length > 0 && <div className="ad-project-schema-table"><table><thead><tr><th>カラム</th><th>型</th><th>制約・初期値</th></tr></thead><tbody>{parsed.columns.map((column, index) => <tr key={`${column.name}:${index}`}><td><code>{column.name}</code></td><td><code>{column.type}</code></td><td>{column.constraints}</td></tr>)}</tbody></table></div>}
    {parsed.tableConstraints.length > 0 && <section className="ad-project-ddl-constraints"><strong>テーブル制約</strong>{parsed.tableConstraints.map((constraint, index) => <code key={index}>{constraint}</code>)}</section>}
    {parsed.indexes.length > 0 && <section className="ad-project-ddl-indexes"><strong>インデックス</strong>{parsed.indexes.map((index) => <div key={index.name}><code>{index.name}</code><span>{index.unique ? 'UNIQUE · ' : ''}{index.columns}</span></div>)}</section>}
    {parsed.columns.length === 0 && <p className="ad-project-ddl-empty">表形式に変換できないSQLです。元のDDLを確認してください。</p>}
    <details className="ad-project-ddl-source"><summary>元のDDLを表示</summary><pre>{ddl}</pre></details>
  </div>
}

function EmptyValue({ children }: { children: ReactNode }) {
  return <div className="ad-project-dashboard-empty">{children}</div>
}

function ProjectEnvironmentDashboard({ environment, onCopy }: { environment: AIDesktopProjectEnvironment; onCopy: (command: string) => void }) {
  const summaryLabels: Array<[keyof AIDesktopProjectEnvironment['summary'], string]> = [['os', 'OS'], ['runtime', 'Runtime'], ['packageManager', 'Package Manager'], ['frontend', 'Frontend'], ['worker', 'Worker']]
  const summary = summaryLabels.filter(([key]) => environment.summary[key])
  const empty = summary.length === 0 && environment.prerequisites.length === 0 && environment.services.length === 0 && environment.steps.length === 0 && environment.variables.length === 0 && environment.checks.length === 0
  if (empty) return <EmptyValue>開発環境はまだ登録されていません。</EmptyValue>
  return <div className="ad-project-environment">
    {summary.length > 0 && <dl className="ad-project-environment-summary">{summary.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{environment.summary[key]}</dd></div>)}</dl>}
    {(environment.prerequisites.length > 0 || environment.services.length > 0) && <div className="ad-project-environment-columns">
      <section><header><small>REQUIREMENTS</small><h4>前提ソフトウェア</h4></header>{environment.prerequisites.length ? <div className="ad-project-environment-list">{environment.prerequisites.map((item, index) => <article key={`${item.name}:${index}`}><div><strong>{item.name}</strong>{item.version && <code>{item.version}</code>}{item.required && <span>必須</span>}</div>{item.description && <p>{item.description}</p>}</article>)}</div> : <EmptyValue>登録されていません。</EmptyValue>}</section>
      <section><header><small>LOCAL SERVICES</small><h4>ローカルサービス</h4></header>{environment.services.length ? <div className="ad-project-environment-list">{environment.services.map((item, index) => <article key={`${item.name}:${index}`}><div><strong>{item.name}</strong>{item.endpoint && <code>{item.endpoint}</code>}</div>{item.command && <button type="button" onClick={() => onCopy(item.command)}>起動コマンドをコピー</button>}</article>)}</div> : <EmptyValue>登録されていません。</EmptyValue>}</section>
    </div>}
    {environment.steps.length > 0 && <section className="ad-project-environment-block"><header><small>SETUP</small><h4>初回セットアップ</h4></header><ol className="ad-project-environment-steps">{environment.steps.map((item, index) => <li key={`${item.title}:${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}{item.command && <div><pre>{item.command}</pre><button type="button" onClick={() => onCopy(item.command)}>コピー</button></div>}</div></li>)}</ol></section>}
    {environment.variables.length > 0 && <section className="ad-project-environment-block"><header><small>CONFIGURATION</small><h4>環境変数</h4></header><div className="ad-project-environment-table"><table><thead><tr><th>変数名</th><th>設定先</th><th>必須</th><th>説明</th></tr></thead><tbody>{environment.variables.map((item, index) => <tr key={`${item.name}:${index}`}><td><code>{item.name}</code></td><td>{item.location || '—'}</td><td>{item.required ? '必須' : '任意'}</td><td>{item.description || '—'}</td></tr>)}</tbody></table></div><p className="ad-project-environment-secret-note">値や秘密情報は保存せず、変数名と設定先だけを管理します。</p></section>}
    {environment.checks.length > 0 && <section className="ad-project-environment-block"><header><small>VERIFICATION</small><h4>動作確認</h4></header><ul className="ad-project-environment-checks">{environment.checks.map((item, index) => <li key={`${item.label}:${index}`}><span>✓</span>{item.label}</li>)}</ul></section>}
  </div>
}

function ProjectEnvironmentEditor({ environment, onChange }: { environment: AIDesktopProjectEnvironment; onChange: (environment: AIDesktopProjectEnvironment) => void }) {
  const updateSummary = (key: keyof AIDesktopProjectEnvironment['summary'], value: string) => onChange({ ...environment, summary: { ...environment.summary, [key]: value } })
  const replace = <K extends keyof Pick<AIDesktopProjectEnvironment, 'prerequisites' | 'services' | 'steps' | 'variables' | 'checks'>,>(key: K, value: AIDesktopProjectEnvironment[K]) => onChange({ ...environment, [key]: value })
  return <div className="ad-project-environment-editor">
    <section><header><div><small>SUMMARY</small><h4>環境サマリー</h4></div></header><div className="ad-project-environment-summary-editor"><input maxLength={200} value={environment.summary.os} placeholder="OS（例：macOS）" onChange={(event) => updateSummary('os', event.target.value)} /><input maxLength={200} value={environment.summary.runtime} placeholder="Runtime（例：Node.js 22）" onChange={(event) => updateSummary('runtime', event.target.value)} /><input maxLength={200} value={environment.summary.packageManager} placeholder="Package Manager（例：npm）" onChange={(event) => updateSummary('packageManager', event.target.value)} /><input maxLength={200} value={environment.summary.frontend} placeholder="Frontend（例：localhost:5173）" onChange={(event) => updateSummary('frontend', event.target.value)} /><input maxLength={200} value={environment.summary.worker} placeholder="Worker（例：localhost:8787）" onChange={(event) => updateSummary('worker', event.target.value)} /></div></section>
    <section><header><div><small>REQUIREMENTS</small><h4>前提ソフトウェア</h4></div><button type="button" onClick={() => replace('prerequisites', [...environment.prerequisites, { name: '', version: '', required: true, description: '' }])}>＋ 追加</button></header><div className="ad-project-environment-editor-list prerequisites">{environment.prerequisites.map((item, index) => <article key={index}><input maxLength={200} value={item.name} placeholder="名前" onChange={(event) => replace('prerequisites', environment.prerequisites.map((entry, itemIndex) => itemIndex === index ? { ...entry, name: event.target.value } : entry))} /><input maxLength={100} value={item.version} placeholder="バージョン" onChange={(event) => replace('prerequisites', environment.prerequisites.map((entry, itemIndex) => itemIndex === index ? { ...entry, version: event.target.value } : entry))} /><label><input type="checkbox" checked={item.required} onChange={(event) => replace('prerequisites', environment.prerequisites.map((entry, itemIndex) => itemIndex === index ? { ...entry, required: event.target.checked } : entry))} />必須</label><input maxLength={1000} value={item.description} placeholder="用途・説明" onChange={(event) => replace('prerequisites', environment.prerequisites.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} /><button type="button" aria-label="削除" onClick={() => replace('prerequisites', environment.prerequisites.filter((_, itemIndex) => itemIndex !== index))}>×</button></article>)}</div></section>
    <section><header><div><small>LOCAL SERVICES</small><h4>ローカルサービス</h4></div><button type="button" onClick={() => replace('services', [...environment.services, { name: '', endpoint: '', command: '' }])}>＋ 追加</button></header><div className="ad-project-environment-editor-list services">{environment.services.map((item, index) => <article key={index}><input maxLength={200} value={item.name} placeholder="サービス名" onChange={(event) => replace('services', environment.services.map((entry, itemIndex) => itemIndex === index ? { ...entry, name: event.target.value } : entry))} /><input maxLength={500} value={item.endpoint} placeholder="URL・ポート" onChange={(event) => replace('services', environment.services.map((entry, itemIndex) => itemIndex === index ? { ...entry, endpoint: event.target.value } : entry))} /><input maxLength={4000} value={item.command} placeholder="起動コマンド" onChange={(event) => replace('services', environment.services.map((entry, itemIndex) => itemIndex === index ? { ...entry, command: event.target.value } : entry))} /><button type="button" aria-label="削除" onClick={() => replace('services', environment.services.filter((_, itemIndex) => itemIndex !== index))}>×</button></article>)}</div></section>
    <section><header><div><small>SETUP</small><h4>初回セットアップ</h4></div><button type="button" onClick={() => replace('steps', [...environment.steps, { title: '', description: '', command: '' }])}>＋ 追加</button></header><div className="ad-project-environment-editor-list steps">{environment.steps.map((item, index) => <article key={index}><span>{String(index + 1).padStart(2, '0')}</span><input maxLength={200} value={item.title} placeholder="手順名" onChange={(event) => replace('steps', environment.steps.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: event.target.value } : entry))} /><input maxLength={1000} value={item.description} placeholder="説明" onChange={(event) => replace('steps', environment.steps.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} /><textarea rows={3} maxLength={4000} value={item.command} placeholder="初回セットアップ用コマンド" onChange={(event) => replace('steps', environment.steps.map((entry, itemIndex) => itemIndex === index ? { ...entry, command: event.target.value } : entry))} /><button type="button" aria-label="削除" onClick={() => replace('steps', environment.steps.filter((_, itemIndex) => itemIndex !== index))}>×</button></article>)}</div></section>
    <section><header><div><small>CONFIGURATION</small><h4>環境変数</h4></div><button type="button" onClick={() => replace('variables', [...environment.variables, { name: '', location: '', required: true, description: '' }])}>＋ 追加</button></header><p>値や秘密情報は入力せず、変数名と設定先だけを登録してください。</p><div className="ad-project-environment-editor-list variables">{environment.variables.map((item, index) => <article key={index}><input maxLength={200} value={item.name} placeholder="変数名" onChange={(event) => replace('variables', environment.variables.map((entry, itemIndex) => itemIndex === index ? { ...entry, name: event.target.value } : entry))} /><input maxLength={200} value={item.location} placeholder="設定先" onChange={(event) => replace('variables', environment.variables.map((entry, itemIndex) => itemIndex === index ? { ...entry, location: event.target.value } : entry))} /><label><input type="checkbox" checked={item.required} onChange={(event) => replace('variables', environment.variables.map((entry, itemIndex) => itemIndex === index ? { ...entry, required: event.target.checked } : entry))} />必須</label><input maxLength={1000} value={item.description} placeholder="説明" onChange={(event) => replace('variables', environment.variables.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} /><button type="button" aria-label="削除" onClick={() => replace('variables', environment.variables.filter((_, itemIndex) => itemIndex !== index))}>×</button></article>)}</div></section>
    <section><header><div><small>VERIFICATION</small><h4>動作確認</h4></div><button type="button" onClick={() => replace('checks', [...environment.checks, { label: '' }])}>＋ 追加</button></header><div className="ad-project-environment-editor-list checks">{environment.checks.map((item, index) => <article key={index}><span>✓</span><input maxLength={500} value={item.label} placeholder="確認項目" onChange={(event) => replace('checks', environment.checks.map((entry, itemIndex) => itemIndex === index ? { label: event.target.value } : entry))} /><button type="button" aria-label="削除" onClick={() => replace('checks', environment.checks.filter((_, itemIndex) => itemIndex !== index))}>×</button></article>)}</div></section>
  </div>
}

export default function ProjectsApp({ canManage, catalog, publishedDocuments, onOpenDocument }: {
  canManage: boolean
  catalog: Record<ServiceId, ServiceConfig>
  publishedDocuments: AIDesktopDocument[]
  onOpenDocument: (document: AIDesktopProjectDocument, edit?: boolean) => void
}) {
  const [projects, setProjects] = useState<AIDesktopProjectSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [project, setProject] = useState<AIDesktopProject | null>(null)
  const [draft, setDraft] = useState<AIDesktopProjectInput>(blankProject)
  const [view, setView] = useState<ProjectView>('dashboard')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(canManage)
  const [saving, setSaving] = useState(false)
  const [architectureTab, setArchitectureTab] = useState<ArchitectureTab>('system')
  const [workspaceTab, setWorkspaceTab] = useState<ProjectWorkspaceTab>('technologyStack')
  const [expandedDatabaseIndex, setExpandedDatabaseIndex] = useState<number | null>(null)
  const [commandCategory, setCommandCategory] = useState('すべて')
  const [expandedCommandIndex, setExpandedCommandIndex] = useState<number | null>(null)
  const [linkCategory, setLinkCategory] = useState('すべて')
  const [expandedLinkIndex, setExpandedLinkIndex] = useState<number | null>(null)
  const [ruleCategory, setRuleCategory] = useState('すべて')
  const [expandedRuleIndex, setExpandedRuleIndex] = useState<number | null>(null)
  const [documentServiceId, setDocumentServiceId] = useState<ServiceId>('ai-desktop')
  const [documentCategoryId, setDocumentCategoryId] = useState('')
  const [documentContentId, setDocumentContentId] = useState('')
  const [documentPhase, setDocumentPhase] = useState('common')
  const [documentType, setDocumentType] = useState('other')
  const [documentNote, setDocumentNote] = useState('')
  const [documentPhaseFilter, setDocumentPhaseFilter] = useState('all')
  const [memberQuery, setMemberQuery] = useState('')
  const [memberResults, setMemberResults] = useState<AIDesktopUserSearchResult[]>([])
  const [knownMembers, setKnownMembers] = useState<Record<string, string>>({})
  const [searchingMembers, setSearchingMembers] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const documentOptions = useMemo(() => publishedDocuments.filter((document) => document.status === 'published' && catalog[document.serviceId]).map((document) => ({ serviceId: document.serviceId, categoryId: document.categoryId, contentId: document.contentId, title: document.title, categoryTitle: document.categoryTitle })), [catalog, publishedDocuments])
  const documentServiceIds = useMemo(() => [...new Set(documentOptions.map((document) => document.serviceId))], [documentOptions])
  const selectedDocumentServiceId = documentServiceIds.includes(documentServiceId) ? documentServiceId : documentServiceIds[0] ?? ''
  const categories = useMemo(() => [...new Map(documentOptions.filter((document) => document.serviceId === selectedDocumentServiceId).map((document) => [document.categoryId, { id: document.categoryId, title: document.categoryTitle }])).values()], [documentOptions, selectedDocumentServiceId])
  const selectedCategoryId = categories.some((category) => category.id === documentCategoryId) ? documentCategoryId : categories[0]?.id ?? ''
  const contents = useMemo(() => documentOptions.filter((document) => document.serviceId === selectedDocumentServiceId && document.categoryId === selectedCategoryId), [documentOptions, selectedCategoryId, selectedDocumentServiceId])
  const selectedContentId = contents.some((item) => item.contentId === documentContentId) ? documentContentId : contents[0]?.contentId ?? ''
  const baseline = project ? projectInput(project) : blankProject()
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)

  const refreshProjects = async (preferredId?: string | null) => {
    const result = await listAIDesktopProjects()
    setProjects(result.projects)
    const nextId = preferredId === undefined ? selectedId ?? result.projects[0]?.id ?? null : preferredId ?? result.projects[0]?.id ?? null
    setSelectedId(nextId)
    return nextId
  }

  const loadProject = async (id: string) => {
    setLoading(true)
    try {
      const result = await getAIDesktopProject(id)
      setProject(result.project)
      setDraft(projectInput(result.project))
      setKnownMembers(Object.fromEntries((result.project.members ?? []).map((member) => [member.userId, member.displayName])))
      setCreating(false)
      setView('dashboard')
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.project.loadFailed))
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!canManage) return
    let active = true
    void listAIDesktopProjects().then(async (result) => {
      if (!active) return
      setProjects(result.projects)
      const firstId = result.projects[0]?.id ?? null
      setSelectedId(firstId)
      if (!firstId) return
      const detail = await getAIDesktopProject(firstId)
      if (!active) return
      setProject(detail.project)
      setDraft(projectInput(detail.project))
      setKnownMembers(Object.fromEntries((detail.project.members ?? []).map((member) => [member.userId, member.displayName])))
    }).catch((error) => showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.project.listFailed))).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [canManage])

  useEffect(() => {
    if (workspaceTab !== 'members' || view !== 'edit' || (!creating && project?.canEdit === false)) return
    let active = true
    const timeout = window.setTimeout(() => {
      setSearchingMembers(true)
      void searchAIDesktopUsers(memberQuery).then((result) => {
        if (!active) return
        setMemberResults(result.users)
        setKnownMembers((current) => ({ ...current, ...Object.fromEntries(result.users.map((user) => [user.userId, user.displayName])) }))
      }).catch((error) => { if (active) showAIDesktopNotification('error', localizedErrorMessage(error, 'ユーザーを検索できませんでした。')) }).finally(() => { if (active) setSearchingMembers(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timeout) }
  }, [creating, memberQuery, project?.canEdit, view, workspaceTab])

  const confirmDiscard = () => !dirty || window.confirm('保存していない変更があります。変更を破棄して移動しますか？')
  const selectProject = (id: string) => { if (!confirmDiscard()) return; setSelectedId(id); setCreating(false); void loadProject(id) }
  const startCreate = () => { if (!confirmDiscard()) return; setSelectedId(null); setProject(null); setDraft(blankProject()); setCreating(true); setView('edit') }

  const save = async () => {
    if (!draft.name.trim() || saving) return
    if (draft.systemDiagramSource.trim() && !await validateMermaidSource('flowchart', draft.systemDiagramSource)) {
      showAIDesktopNotification('error', 'システム構成図のMermaid構文を確認してください。')
      return
    }
    setSaving(true)
    try {
      const normalizeDetails = (items: AIDesktopProjectDetail[]) => items.map((item) => ({ name: item.name.trim(), description: item.description.trim(), category: item.category?.trim() ?? '', ddl: item.ddl?.trim() ?? '' })).filter((item) => item.name)
      const environmentSetup: AIDesktopProjectEnvironment = {
        summary: Object.fromEntries(Object.entries(draft.environmentSetup.summary).map(([key, value]) => [key, value.trim()])) as AIDesktopProjectEnvironment['summary'],
        prerequisites: draft.environmentSetup.prerequisites.map((item) => ({ ...item, name: item.name.trim(), version: item.version.trim(), description: item.description.trim() })).filter((item) => item.name),
        services: draft.environmentSetup.services.map((item) => ({ name: item.name.trim(), endpoint: item.endpoint.trim(), command: item.command.trim() })).filter((item) => item.name),
        steps: draft.environmentSetup.steps.map((item) => ({ title: item.title.trim(), description: item.description.trim(), command: item.command.trim() })).filter((item) => item.title),
        variables: draft.environmentSetup.variables.map((item) => ({ ...item, name: item.name.trim(), location: item.location.trim(), description: item.description.trim() })).filter((item) => item.name),
        checks: draft.environmentSetup.checks.map((item) => ({ label: item.label.trim() })).filter((item) => item.label),
      }
      const projectRules = draft.projectRules.map((rule) => ({ name: rule.name.trim(), description: rule.description.trim(), category: rule.category?.trim() ?? '', importance: rule.importance === 'required' ? 'required' as const : 'recommended' as const })).filter((rule) => rule.name)
      const normalized = {
        ...draft,
        technologyStack: normalizeDetails(draft.technologyStack), databaseInfo: normalizeDetails(draft.databaseInfo), environmentSetup, projectRules,
        commands: draft.commands.map((command) => ({ name: command.name.trim(), description: command.description.trim(), directory: command.directory.trim(), command: command.command.trim(), environment: command.environment.trim(), category: command.category?.trim() ?? '', pinned: command.pinned === true })).filter((command) => command.name && command.command),
        links: draft.links.map((link) => ({ name: link.name.trim(), description: link.description.trim(), type: link.type.trim(), url: link.url.trim() })).filter((link) => link.name && link.url),
        relatedDocuments: draft.relatedDocuments.map((document, index) => ({ ...document, phase: document.phase || 'common', documentType: document.documentType || 'other', note: document.note?.trim() ?? '', sortOrder: index })),
      }
      const result = creating || !project ? await createAIDesktopProject(normalized) : await updateAIDesktopProject(project.id, normalized)
      setProject(result.project)
      setDraft(projectInput(result.project))
      setKnownMembers(Object.fromEntries((result.project.members ?? []).map((member) => [member.userId, member.displayName])))
      setCreating(false)
      setView('dashboard')
      await refreshProjects(result.project.id)
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.project.saved)
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.project.saveFailed))
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!project || saving || !window.confirm(`「${project.name}」を削除しますか？\n関連資料そのものは削除されません。`)) return
    setSaving(true)
    try {
      await deleteAIDesktopProject(project.id)
      setProject(null)
      setDraft(blankProject())
      const nextId = await refreshProjects(null)
      if (nextId) await loadProject(nextId)
      else setCreating(false)
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.project.deleted)
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.project.deleteFailed))
    } finally { setSaving(false) }
  }

  const addExistingDocument = () => {
    const option = documentOptions.find((candidate) => candidate.serviceId === selectedDocumentServiceId && candidate.categoryId === selectedCategoryId && candidate.contentId === selectedContentId)
    if (!option) return
    const document = { serviceId: option.serviceId, categoryId: option.categoryId, contentId: option.contentId, title: option.title, phase: documentPhase, documentType, note: documentNote.trim(), sortOrder: draft.relatedDocuments.length }
    if (draft.relatedDocuments.some((candidate) => candidate.serviceId === document.serviceId && candidate.categoryId === document.categoryId && candidate.contentId === document.contentId)) {
      showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.project.documentAlreadyLinked)
      return
    }
    setDraft((current) => ({ ...current, relatedDocuments: [...current.relatedDocuments, document] }))
    setDocumentNote('')
  }

  const updateRelatedDocument = (index: number, values: Partial<AIDesktopProjectDocument>) => setDraft((current) => ({ ...current, relatedDocuments: current.relatedDocuments.map((document, documentIndex) => documentIndex === index ? { ...document, ...values } : document) }))

  const updateList = (field: ProjectDetailTab, index: number, key: keyof AIDesktopProjectDetail, value: string) => setDraft((current) => ({ ...current, [field]: current[field].map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }))
  const addListItem = (field: ProjectDetailTab) => setDraft((current) => ({ ...current, [field]: [...current[field], field === 'projectRules' ? { name: '', description: '', category: '', importance: 'recommended' } : { name: '', description: '', category: '', ddl: '' }] }))
  const removeListItem = (field: ProjectDetailTab, index: number) => setDraft((current) => ({ ...current, [field]: current[field].filter((_, itemIndex) => itemIndex !== index) }))
  const updateCommand = (index: number, key: Exclude<keyof AIDesktopProjectCommand, 'pinned'>, value: string) => setDraft((current) => ({ ...current, commands: current.commands.map((command, commandIndex) => commandIndex === index ? { ...command, [key]: value } : command) }))
  const addCommand = () => setDraft((current) => ({ ...current, commands: [...current.commands, { name: '', description: '', directory: '', command: '', environment: '', category: '', pinned: false }] }))
  const removeCommand = (index: number) => setDraft((current) => ({ ...current, commands: current.commands.filter((_, commandIndex) => commandIndex !== index) }))
  const updateLink = (index: number, key: keyof AIDesktopProjectLink, value: string) => setDraft((current) => ({ ...current, links: current.links.map((link, linkIndex) => linkIndex === index ? { ...link, [key]: value } : link) }))
  const addLink = () => setDraft((current) => ({ ...current, links: [...current.links, { name: '', description: '', type: '', url: '' }] }))
  const removeLink = (index: number) => setDraft((current) => ({ ...current, links: current.links.filter((_, linkIndex) => linkIndex !== index) }))
  const copyCommand = async (command: string) => {
    try { await navigator.clipboard.writeText(command); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.project.commandCopied) }
    catch { showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.project.commandCopyFailed) }
  }
  const addMember = (user: AIDesktopUserSearchResult) => {
    if (user.isCurrentUser || draft.memberUserIds.includes(user.userId)) return
    setKnownMembers((current) => ({ ...current, [user.userId]: user.displayName }))
    setDraft((current) => ({ ...current, memberUserIds: [...current.memberUserIds, user.userId] }))
  }
  const removeMember = (userId: string) => setDraft((current) => ({ ...current, memberUserIds: current.memberUserIds.filter((candidate) => candidate !== userId) }))

  const downloadProjectJson = (payload = projectTemplate(draft, project?.id ?? null), fileName = 'Hundred_Project.json', message: string | null = AI_DESKTOP_MESSAGES.project.jsonDownloaded) => {
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
    if (message) showAIDesktopNotification('success', message)
  }

  const downloadProjectTemplate = () => {
    downloadProjectJson(projectEditingTemplate(draft, project?.id ?? null), 'Hundred_Project_テンプレート.json', AI_DESKTOP_MESSAGES.project.templateDownloaded)
  }

  const applyTemplate = async (content: string) => {
    const importedProject = parseProjectTemplate(JSON.parse(content) as unknown)
    if (importedProject.systemDiagramSource.trim() && !await validateMermaidSource('flowchart', importedProject.systemDiagramSource)) throw new Error(AI_DESKTOP_MESSAGES.project.templateMermaidInvalid)
    setDraft((current) => ({ ...current, ...importedProject }))
  }

  const writeWorkspaceTemplate = async () => {
    if (!window.confirm(`現在のProject情報をJSONへ書き出しますか？\n\n選択中のJSONは上書きされます。`)) return
    try {
      const name = await writeWorkspaceJsonFile(`${JSON.stringify(projectEditingTemplate(draft, project?.id ?? null), null, 2)}\n`)
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.project.workspaceWritten(name))
    } catch (error) {
      if (isWorkspaceJsonFileCancelled(error)) return
      if (!supportsWorkspaceJsonFile()) {
        downloadProjectJson(projectEditingTemplate(draft, project?.id ?? null), 'Hundred_Project_テンプレート.json', null)
        showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.project.workspaceUnsupported)
        return
      }
      showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.project.workspaceWriteFailed)
    }
  }

  const readWorkspaceTemplate = async () => {
    if (!window.confirm(`JSONのProject情報を編集画面へ読み込みますか？\n\n現在の未保存の編集内容は置き換えられます。`)) return
    if (!supportsWorkspaceJsonFile()) {
      importInputRef.current?.click()
      return
    }
    try {
      const file = await readWorkspaceJsonFile()
      await applyTemplate(file.content)
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.project.workspaceRead(file.name))
    } catch (error) {
      if (isWorkspaceJsonFileCancelled(error)) return
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.project.workspaceReadFailed))
    }
  }

  const changeWorkspaceFile = async () => {
    if (!supportsWorkspaceJsonFile()) {
      showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.project.workspaceUnsupported)
      return
    }
    try {
      const name = await selectWorkspaceJsonFile()
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.project.workspaceSelected(name))
    } catch (error) {
      if (isWorkspaceJsonFileCancelled(error)) return
      showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.project.workspaceSelectFailed)
    }
  }

  const importTemplate = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    try {
      await applyTemplate(await file.text())
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.project.templateImported)
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.project.templateInvalid))
    }
  }

  const copyProjectInfo = async () => {
    const documents = draft.relatedDocuments.map((document) => `- ${document.title} [${documentPhaseLabel(document.phase)} / ${documentTypeLabel(document.documentType)}]${document.note ? `: ${document.note}` : ''}\n  ${new URL('/ai-desktop', window.location.origin)}?service=${encodeURIComponent(document.serviceId)}&category=${encodeURIComponent(document.categoryId)}&content=${encodeURIComponent(document.contentId)}`).join('\n') || '- なし'
    const detailText = (items: AIDesktopProjectDetail[]) => items.map((item) => `- ${item.name}${item.category ? ` [${item.category}]` : ''}${item.description ? `: ${item.description}` : ''}`).join('\n') || '- なし'
    const commands = draft.commands.map((command) => `- ${command.name}${command.category ? ` [${command.category}]` : ''}${command.environment ? ` [${command.environment}]` : ''}${command.directory ? ` / ${command.directory}` : ''}: ${command.command}${command.description ? ` — ${command.description}` : ''}`).join('\n') || '- なし'
    const links = draft.links.map((link) => `- ${link.name}${link.type ? ` [${link.type}]` : ''}: ${link.url}${link.description ? ` — ${link.description}` : ''}`).join('\n') || '- なし'
    const environment = [
      `サマリー: ${Object.entries(draft.environmentSetup.summary).filter(([, content]) => content).map(([key, content]) => `${key}=${content}`).join(', ') || '未設定'}`,
      `前提ソフトウェア:\n${draft.environmentSetup.prerequisites.map((item) => `- ${item.name}${item.version ? ` ${item.version}` : ''}${item.required ? ' [必須]' : ' [任意]'}${item.description ? `: ${item.description}` : ''}`).join('\n') || '- なし'}`,
      `ローカルサービス:\n${draft.environmentSetup.services.map((item) => `- ${item.name}${item.endpoint ? `: ${item.endpoint}` : ''}${item.command ? ` / ${item.command}` : ''}`).join('\n') || '- なし'}`,
      `初回セットアップ:\n${draft.environmentSetup.steps.map((item, index) => `${index + 1}. ${item.title}${item.description ? `: ${item.description}` : ''}${item.command ? `\n${item.command}` : ''}`).join('\n') || '- なし'}`,
      `環境変数:\n${draft.environmentSetup.variables.map((item) => `- ${item.name}${item.location ? ` (${item.location})` : ''}${item.required ? ' [必須]' : ' [任意]'}${item.description ? `: ${item.description}` : ''}`).join('\n') || '- なし'}`,
      `動作確認:\n${draft.environmentSetup.checks.map((item) => `- ${item.label}`).join('\n') || '- なし'}`,
    ].join('\n\n')
    const members = project?.members?.map((member) => `- ${member.displayName}（${member.role === 'owner' ? '作成者' : 'メンバー'}）`).join('\n') || '- 保存後に確定'
    const value = `# Project情報\n\nプロジェクト: ${draft.name}\n開発体制: ${developmentModeLabels[draft.developmentMode]}\n状態: ${statusLabels[draft.status]}\n概要:\n${draft.summary || '未設定'}\n\nシステム構成図（Mermaid）:\n${draft.systemDiagramSource || '未設定'}\n\nファイル構成:\n${draft.fileStructure || '未設定'}\n\n技術スタック:\n${detailText(draft.technologyStack)}\n\nDB情報:\n${detailText(draft.databaseInfo)}\n\n開発環境:\n${environment}\n\nよく使うコマンド:\n${commands}\n\nリンク集:\n${links}\n\n開発メモ:\n${draft.developmentNotes || '未設定'}\n\nプロジェクトルール:\n${detailText(draft.projectRules)}\n\nメンバー:\n${members}\n\n関連資料:\n${documents}`
    try { await navigator.clipboard.writeText(value); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.project.contextCopied) }
    catch { showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.project.contextCopyFailed) }
  }

  const copyDocumentUrl = async (document: AIDesktopProjectDocument) => {
    const url = new URL('/ai-desktop', window.location.origin)
    url.searchParams.set('service', document.serviceId); url.searchParams.set('category', document.categoryId); url.searchParams.set('content', document.contentId)
    try { await navigator.clipboard.writeText(url.toString()); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.content.shareUrlCopied) }
    catch { showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.content.shareUrlCopyFailed) }
  }

  if (!canManage) return <div className="ad-auth-required"><span>◆</span><h1>Projects</h1><p>プロジェクトの作成・設計・開発情報を管理するには、Hundredへサインインしてください。</p></div>

  const documentHelp = <details className="ad-project-document-help"><summary aria-label="関連資料について">?</summary><div><strong>関連資料の拡張</strong><p>現在はHundredで作成した資料を関連付けられます。参照元は今後追加できる設計です。</p><ol><li><b>対応中</b> Hundredで作成した資料</li><li>外部URL</li><li>PDF・Excel・画像などの添付ファイル</li><li>GitHubのIssueやPull Request</li><li>Figmaの画面設計</li><li>D1のDDLやマイグレーション</li></ol></div></details>
  const documentCategoryTitle = (document: AIDesktopProjectDocument) => documentOptions.find((option) => option.serviceId === document.serviceId && option.categoryId === document.categoryId && option.contentId === document.contentId)?.categoryTitle ?? document.categoryId
  const documentList = (editable: boolean) => {
    if (draft.relatedDocuments.length === 0) return <EmptyValue>関連資料はありません。</EmptyValue>
    if (editable) return <div className="ad-project-document-editor-list">{draft.relatedDocuments.map((document, index) => <article key={`${document.serviceId}:${document.categoryId}:${document.contentId}`}><header><div><small>{catalog[document.serviceId]?.name ?? document.serviceId} / {documentCategoryTitle(document)}</small><strong>{document.title}</strong></div><nav><button type="button" onClick={() => onOpenDocument(document)}>開く</button><button type="button" className="danger" onClick={() => setDraft((current) => ({ ...current, relatedDocuments: current.relatedDocuments.filter((_, documentIndex) => documentIndex !== index) }))}>解除</button></nav></header><div><label><span>工程フェーズ</span><select value={document.phase || 'common'} onChange={(event) => updateRelatedDocument(index, { phase: event.target.value })}>{documentPhases.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>資料種別</span><select value={document.documentType || 'other'} onChange={(event) => updateRelatedDocument(index, { documentType: event.target.value })}>{documentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="note"><span>メモ</span><input maxLength={1000} value={document.note ?? ''} placeholder="この資料の役割や確認ポイント" onChange={(event) => updateRelatedDocument(index, { note: event.target.value })} /></label></div></article>)}</div>
    const availablePhases = documentPhases.filter(([phase]) => draft.relatedDocuments.some((document) => (document.phase || 'common') === phase))
    const activePhase = documentPhaseFilter === 'all' || availablePhases.some(([phase]) => phase === documentPhaseFilter) ? documentPhaseFilter : 'all'
    const documents = draft.relatedDocuments.filter((document) => activePhase === 'all' || (document.phase || 'common') === activePhase)
    const groupedPhases = documentPhases.filter(([phase]) => documents.some((document) => (document.phase || 'common') === phase))
    return <div className="ad-project-document-library"><nav className="ad-project-document-filters"><button type="button" className={activePhase === 'all' ? 'active' : ''} onClick={() => setDocumentPhaseFilter('all')}>すべて <span>{draft.relatedDocuments.length}</span></button>{availablePhases.map(([phase, label]) => <button type="button" className={activePhase === phase ? 'active' : ''} onClick={() => setDocumentPhaseFilter(phase)} key={phase}>{label} <span>{draft.relatedDocuments.filter((document) => (document.phase || 'common') === phase).length}</span></button>)}</nav>{groupedPhases.map(([phase, label]) => { const phaseDocuments = documents.filter((document) => (document.phase || 'common') === phase); return <section key={phase}><header><h4>{label}</h4><span>{phaseDocuments.length}件</span></header><div>{phaseDocuments.map((document) => <article key={`${document.serviceId}:${document.categoryId}:${document.contentId}`}><button type="button" onClick={() => onOpenDocument(document)}><span>{documentTypeLabel(document.documentType)}</span><strong>{document.title}</strong><small>{catalog[document.serviceId]?.name ?? document.serviceId} / {documentCategoryTitle(document)}</small>{document.note && <p>{document.note}</p>}</button><nav><button type="button" onClick={() => onOpenDocument(document)}>開く</button><button type="button" onClick={() => void copyDocumentUrl(document)}>URLをコピー</button></nav></article>)}</div></section>})}</div>
  }
  const detailTab: ProjectDetailTab | null = workspaceTab === 'technologyStack' || workspaceTab === 'databaseInfo' || workspaceTab === 'projectRules' ? workspaceTab : null
  const workspaceItems = detailTab ? draft[detailTab] : []
  const workspaceEmptyText: Record<ProjectDetailTab, string> = { technologyStack: '使用技術を追加してください。', databaseInfo: 'DB名と用途を追加してください。', projectRules: 'プロジェクトルールを追加してください。' }
  const workspaceNamePlaceholder: Record<ProjectDetailTab, string> = { technologyStack: '名前（例：React 19）', databaseInfo: '名前（例：ai_desktop_projects）', projectRules: 'ルール名（例：コミットメッセージ）' }
  const workspaceDescriptionPlaceholder: Record<ProjectDetailTab, string> = { technologyStack: '説明（例：AI Desktopと各アプリのUI）', databaseInfo: '説明（例：Project情報を保存）', projectRules: '説明（例：日本語で記載する）' }
  const workspaceTabs = <nav className="ad-project-workspace-tabs" aria-label="プロジェクト情報">{(Object.entries(workspaceTabLabels) as Array<[ProjectWorkspaceTab, string]>).map(([key, label]) => <button type="button" className={workspaceTab === key ? 'active' : ''} aria-pressed={workspaceTab === key} onClick={() => setWorkspaceTab(key)} key={key}>{label}</button>)}</nav>
  const visibleMembers = project?.members ?? []
  const ownerCount = visibleMembers.filter((member) => member.role === 'owner').length
  const addedMemberCount = visibleMembers.filter((member) => member.role === 'member').length
  const technologyGroups = draft.technologyStack.reduce<Record<string, AIDesktopProjectDetail[]>>((groups, item) => { const category = item.category?.trim() || 'その他'; (groups[category] ??= []).push(item); return groups }, {})
  const commandCategories = [...new Set(draft.commands.map((command) => command.category?.trim() || 'その他'))]
  const activeCommandCategory = commandCategory === 'すべて' || commandCategories.includes(commandCategory) ? commandCategory : 'すべて'
  const visibleCommands = draft.commands.map((command, index) => ({ command, index })).filter(({ command }) => activeCommandCategory === 'すべて' || (command.category?.trim() || 'その他') === activeCommandCategory)
  const pinnedCommands = draft.commands.map((command, index) => ({ command, index })).filter(({ command }) => command.pinned).slice(0, 4)
  const linkCategories = [...new Set(draft.links.map((link) => link.type.trim() || 'その他'))]
  const activeLinkCategory = linkCategory === 'すべて' || linkCategories.includes(linkCategory) ? linkCategory : 'すべて'
  const visibleLinks = draft.links.map((link, index) => ({ link, index })).filter(({ link }) => activeLinkCategory === 'すべて' || (link.type.trim() || 'その他') === activeLinkCategory)
  const ruleCategories = [...new Set(draft.projectRules.map((rule) => rule.category?.trim() || 'その他'))]
  const activeRuleCategory = ruleCategory === 'すべて' || ruleCategories.includes(ruleCategory) ? ruleCategory : 'すべて'
  const visibleRules = draft.projectRules.map((rule, index) => ({ rule, index })).filter(({ rule }) => activeRuleCategory === 'すべて' || (rule.category?.trim() || 'その他') === activeRuleCategory)
  const architectureTabs = <nav className="ad-project-architecture-tabs" aria-label="全体図の種類"><button type="button" className={architectureTab === 'system' ? 'active' : ''} onClick={() => setArchitectureTab('system')}>システム構成</button><button type="button" className={architectureTab === 'files' ? 'active' : ''} onClick={() => setArchitectureTab('files')}>ファイル構成</button></nav>
  const dashboardWorkspaceContent = workspaceTab === 'technologyStack'
    ? (draft.technologyStack.length ? <div className="ad-project-technology-groups">{Object.entries(technologyGroups).map(([category, items]) => <section key={category}><header><h4>{category}</h4><span>{items.length}件</span></header><div>{items.map((item, index) => <article key={`${item.name}:${index}`}><strong>{item.name}</strong>{item.description && <p>{item.description}</p>}</article>)}</div></section>)}</div> : <EmptyValue>技術スタックはまだ登録されていません。</EmptyValue>)
    : workspaceTab === 'databaseInfo'
      ? (draft.databaseInfo.length ? <div className="ad-project-database-design"><header><span>テーブル</span><span>分類</span><span>詳細</span></header>{draft.databaseInfo.map((item, index) => { const expanded = expandedDatabaseIndex === index; return <article className={expanded ? 'expanded' : ''} key={`${item.name}:${index}`}><button type="button" aria-expanded={expanded} onClick={() => setExpandedDatabaseIndex(expanded ? null : index)}><code>{item.name}</code><span>{item.category?.trim() || '未分類'}</span><b>{expanded ? '−' : '＋'}</b></button>{expanded && <div className="ad-project-database-expanded"><section><strong>保存内容・役割</strong><p>{item.description || '詳細は登録されていません。'}</p></section><DatabaseDdlView ddl={item.ddl ?? ''} /></div>}</article> })}</div> : <EmptyValue>DB情報はまだ登録されていません。</EmptyValue>)
      : workspaceTab === 'environmentSetup'
        ? <ProjectEnvironmentDashboard environment={draft.environmentSetup} onCopy={(command) => void copyCommand(command)} />
      : workspaceTab === 'projectRules'
        ? (draft.projectRules.length ? <div className="ad-project-rule-workspace"><nav className="ad-project-compact-filters" aria-label="ルールのカテゴリ"><button type="button" className={activeRuleCategory === 'すべて' ? 'active' : ''} onClick={() => setRuleCategory('すべて')}>すべて <span>{draft.projectRules.length}</span></button>{ruleCategories.map((category) => <button type="button" className={activeRuleCategory === category ? 'active' : ''} onClick={() => setRuleCategory(category)} key={category}>{category} <span>{draft.projectRules.filter((rule) => (rule.category?.trim() || 'その他') === category).length}</span></button>)}</nav><div className="ad-project-rule-table"><header><span>分類</span><span>重要度</span><span>ルール</span><span>内容</span></header>{visibleRules.map(({ rule, index }) => { const expanded = expandedRuleIndex === index; return <article className={expanded ? 'expanded' : ''} key={`${rule.name}:${index}`}><button type="button" aria-expanded={expanded} onClick={() => setExpandedRuleIndex(expanded ? null : index)}><span>{rule.category?.trim() || 'その他'}</span><b className={rule.importance === 'required' ? 'required' : 'recommended'}>{rule.importance === 'required' ? '必須' : '推奨'}</b><strong>{rule.name}</strong><p>{rule.description || '説明は登録されていません。'}</p></button>{expanded && <div>{rule.description || '説明は登録されていません。'}</div>}</article>})}</div></div> : <EmptyValue>プロジェクトルールはまだ登録されていません。</EmptyValue>)
      : detailTab
    ? (workspaceItems.length ? <div className="ad-project-detail-list">{workspaceItems.map((item, index) => <article key={`${item.name}:${index}`}><strong>{item.name}</strong>{item.description && <p>{item.description}</p>}</article>)}</div> : <EmptyValue>{workspaceTabLabels[workspaceTab]}はまだ登録されていません。</EmptyValue>)
    : workspaceTab === 'commands'
        ? (draft.commands.length ? <div className="ad-project-command-workspace">{activeCommandCategory === 'すべて' && pinnedCommands.length > 0 && <section className="ad-project-pinned-commands"><header><strong>固定コマンド</strong><span>最大4件表示</span></header><div>{pinnedCommands.map(({ command, index }) => <article key={`${command.name}:${index}`}><div><span>{command.category?.trim() || 'その他'}</span><strong>{command.name}</strong><code title={command.command}>{command.command}</code></div><button type="button" onClick={() => void copyCommand(command.command)}>コピー</button></article>)}</div></section>}<nav className="ad-project-command-filters" aria-label="コマンドのカテゴリ"><button type="button" className={activeCommandCategory === 'すべて' ? 'active' : ''} onClick={() => setCommandCategory('すべて')}>すべて <span>{draft.commands.length}</span></button>{commandCategories.map((category) => <button type="button" className={activeCommandCategory === category ? 'active' : ''} onClick={() => setCommandCategory(category)} key={category}>{category} <span>{draft.commands.filter((command) => (command.category?.trim() || 'その他') === category).length}</span></button>)}</nav><div className="ad-project-command-table"><header><span>用途</span><span>環境</span><span>実行場所</span><span>コマンド</span><span>操作</span></header>{visibleCommands.map(({ command, index }) => { const expanded = expandedCommandIndex === index; return <article className={expanded ? 'expanded' : ''} key={`${command.name}:${index}`}><div className="ad-project-command-row"><button type="button" className="ad-project-command-expand" aria-expanded={expanded} onClick={() => setExpandedCommandIndex(expanded ? null : index)}><strong>{command.pinned && <span title="固定">★</span>}{command.name}</strong><span>{command.environment || '—'}</span><small>{command.directory || '—'}</small><code title={command.command}>{command.command}</code></button><button type="button" className="ad-project-command-copy" onClick={() => void copyCommand(command.command)}>コピー</button></div>{expanded && <div className="ad-project-command-detail"><div><span>カテゴリ</span><strong>{command.category?.trim() || 'その他'}</strong></div><p>{command.description || '説明は登録されていません。'}</p><pre>{command.command}</pre></div>}</article>})}</div></div> : <EmptyValue>よく使うコマンドはまだ登録されていません。</EmptyValue>)
        : workspaceTab === 'links'
          ? (draft.links.length ? <div className="ad-project-link-workspace"><nav className="ad-project-compact-filters" aria-label="リンクのカテゴリ"><button type="button" className={activeLinkCategory === 'すべて' ? 'active' : ''} onClick={() => setLinkCategory('すべて')}>すべて <span>{draft.links.length}</span></button>{linkCategories.map((category) => <button type="button" className={activeLinkCategory === category ? 'active' : ''} onClick={() => setLinkCategory(category)} key={category}>{category} <span>{draft.links.filter((link) => (link.type.trim() || 'その他') === category).length}</span></button>)}</nav><div className="ad-project-link-grid">{visibleLinks.map(({ link, index }) => { const expanded = expandedLinkIndex === index; return <article className={expanded ? 'expanded' : ''} key={`${link.name}:${index}`}><div><button type="button" aria-expanded={expanded} onClick={() => setExpandedLinkIndex(expanded ? null : index)}><span>{link.type || 'その他'}</span><strong>{link.name}</strong><small>{new URL(link.url).hostname}</small></button><a href={link.url} target="_blank" rel="noreferrer" aria-label={`${link.name}を開く`}>開く ↗</a></div>{expanded && <section><p>{link.description || '説明は登録されていません。'}</p><code>{link.url}</code></section>}</article>})}</div></div> : <EmptyValue>リンクはまだ登録されていません。</EmptyValue>)
          : workspaceTab === 'developmentNotes'
            ? (draft.developmentNotes ? <pre className="ad-project-development-notes">{draft.developmentNotes}</pre> : <EmptyValue>開発メモはまだ登録されていません。</EmptyValue>)
            : visibleMembers.length ? <div className="ad-project-member-workspace">
              <header>
                <div><strong>メンバー</strong><p>{draft.developmentMode === 'personal' && addedMemberCount === 0 ? '現在は作成者のみが閲覧できます。' : '追加されたメンバーだけがこのProjectを閲覧できます。'}</p></div>
                <div className="ad-project-member-summary"><b>{visibleMembers.length}人</b><span>作成者 {ownerCount}人</span><span>メンバー {addedMemberCount}人</span></div>
              </header>
              <div className="ad-project-member-table">
                <div className="ad-project-member-table-head"><span>ユーザー</span><span>役割</span><span>権限</span></div>
                {visibleMembers.map((member) => <article key={member.userId}>
                  <div className="ad-project-member-person"><span>{member.displayName.charAt(0).toUpperCase()}</span><strong>{member.displayName}</strong></div>
                  <b className={`ad-project-member-role ${member.role}`}>{member.role === 'owner' ? '作成者' : 'メンバー'}</b>
                  <small>{member.role === 'owner' ? '閲覧・編集' : '閲覧のみ'}</small>
                </article>)}
              </div>
              {addedMemberCount === 0 && <div className="ad-project-member-empty"><strong>追加メンバーはいません</strong><span>作成者が編集画面からメンバーを追加できます。</span></div>}
            </div> : <EmptyValue>メンバーはまだ登録されていません。</EmptyValue>
  const editorWorkspaceContent = workspaceTab === 'environmentSetup'
    ? <ProjectEnvironmentEditor environment={draft.environmentSetup} onChange={(environmentSetup) => setDraft((current) => ({ ...current, environmentSetup }))} />
    : detailTab === 'databaseInfo'
    ? <div className="ad-project-database-editor">{draft.databaseInfo.map((item, index) => <article key={index}><header><input maxLength={200} value={item.name} placeholder={workspaceNamePlaceholder.databaseInfo} onChange={(event) => updateList('databaseInfo', index, 'name', event.target.value)} /><input maxLength={100} value={item.category ?? ''} placeholder="分類（例：Project）" onChange={(event) => updateList('databaseInfo', index, 'category', event.target.value)} /><button type="button" aria-label="削除" onClick={() => removeListItem('databaseInfo', index)}>×</button></header><input maxLength={1000} value={item.description} placeholder={workspaceDescriptionPlaceholder.databaseInfo} onChange={(event) => updateList('databaseInfo', index, 'description', event.target.value)} /><label><span>DDL・マイグレーション</span><textarea spellCheck={false} rows={10} maxLength={50000} value={item.ddl ?? ''} placeholder={'CREATE TABLE table_name (\n  id TEXT PRIMARY KEY\n);'} onChange={(event) => updateList('databaseInfo', index, 'ddl', event.target.value)} /></label></article>)}{draft.databaseInfo.length === 0 && <EmptyValue>{workspaceEmptyText.databaseInfo}</EmptyValue>}</div>
    : detailTab === 'projectRules'
    ? <div className="ad-project-rule-editor">{draft.projectRules.map((rule, index) => <article key={index}><header><input maxLength={200} value={rule.name} placeholder={workspaceNamePlaceholder.projectRules} onChange={(event) => updateList('projectRules', index, 'name', event.target.value)} /><input maxLength={100} value={rule.category ?? ''} placeholder="カテゴリ（例：セキュリティ）" onChange={(event) => updateList('projectRules', index, 'category', event.target.value)} /><select value={rule.importance ?? 'recommended'} aria-label="重要度" onChange={(event) => setDraft((current) => ({ ...current, projectRules: current.projectRules.map((entry, ruleIndex) => ruleIndex === index ? { ...entry, importance: event.target.value === 'required' ? 'required' : 'recommended' } : entry) }))}><option value="required">必須</option><option value="recommended">推奨</option></select><button type="button" aria-label="削除" onClick={() => removeListItem('projectRules', index)}>×</button></header><textarea rows={2} maxLength={1000} value={rule.description} placeholder={workspaceDescriptionPlaceholder.projectRules} onChange={(event) => updateList('projectRules', index, 'description', event.target.value)} /></article>)}{draft.projectRules.length === 0 && <EmptyValue>{workspaceEmptyText.projectRules}</EmptyValue>}</div>
    : detailTab
    ? <div className={`ad-project-edit-list ${detailTab === 'technologyStack' ? 'ad-project-categorized-editor' : ''}`}>{workspaceItems.map((item, index) => <div key={index}><input maxLength={200} value={item.name} placeholder={workspaceNamePlaceholder[detailTab]} onChange={(event) => updateList(detailTab, index, 'name', event.target.value)} />{detailTab === 'technologyStack' && <input maxLength={100} value={item.category ?? ''} placeholder="カテゴリ（例：フロントエンド）" onChange={(event) => updateList(detailTab, index, 'category', event.target.value)} />}<input maxLength={1000} value={item.description} placeholder={workspaceDescriptionPlaceholder[detailTab]} onChange={(event) => updateList(detailTab, index, 'description', event.target.value)} /><button type="button" aria-label="削除" onClick={() => removeListItem(detailTab, index)}>×</button></div>)}{workspaceItems.length === 0 && <EmptyValue>{workspaceEmptyText[detailTab]}</EmptyValue>}</div>
    : workspaceTab === 'commands'
        ? <div className="ad-project-command-editor">{draft.commands.map((command, index) => <article key={index}><header><input maxLength={200} value={command.name} placeholder="名前（例：フロントエンドを起動）" onChange={(event) => updateCommand(index, 'name', event.target.value)} /><input maxLength={100} value={command.category ?? ''} placeholder="カテゴリ（例：起動）" onChange={(event) => updateCommand(index, 'category', event.target.value)} /><input maxLength={100} value={command.environment} placeholder="環境（例：ローカル）" onChange={(event) => updateCommand(index, 'environment', event.target.value)} /><label><input type="checkbox" checked={command.pinned === true} onChange={(event) => setDraft((current) => ({ ...current, commands: current.commands.map((entry, commandIndex) => commandIndex === index ? { ...entry, pinned: event.target.checked } : entry) }))} />固定</label><button type="button" aria-label="削除" onClick={() => removeCommand(index)}>×</button></header><div><input maxLength={500} value={command.directory} placeholder="実行場所（例：frontend）" onChange={(event) => updateCommand(index, 'directory', event.target.value)} /><input maxLength={1000} value={command.description} placeholder="説明" onChange={(event) => updateCommand(index, 'description', event.target.value)} /></div><textarea rows={2} maxLength={4000} value={command.command} placeholder="コマンド（例：npm run dev）" onChange={(event) => updateCommand(index, 'command', event.target.value)} /></article>)}{draft.commands.length === 0 && <EmptyValue>よく使うコマンドを追加してください。</EmptyValue>}</div>
        : workspaceTab === 'links'
          ? <div className="ad-project-edit-list ad-project-link-editor">{draft.links.map((link, index) => <div key={index}><input maxLength={200} value={link.name} placeholder="名前（例：Cloudflare Dashboard）" onChange={(event) => updateLink(index, 'name', event.target.value)} /><input maxLength={100} value={link.type} placeholder="種類（例：インフラ）" onChange={(event) => updateLink(index, 'type', event.target.value)} /><input maxLength={2000} type="url" value={link.url} placeholder="URL" onChange={(event) => updateLink(index, 'url', event.target.value)} /><input maxLength={1000} value={link.description} placeholder="説明" onChange={(event) => updateLink(index, 'description', event.target.value)} /><button type="button" aria-label="削除" onClick={() => removeLink(index)}>×</button></div>)}{draft.links.length === 0 && <EmptyValue>リンクを追加してください。</EmptyValue>}</div>
          : workspaceTab === 'developmentNotes'
            ? <textarea className="ad-project-development-editor" rows={14} maxLength={50000} value={draft.developmentNotes} placeholder={'例：\nnpm run dev\nnpx wrangler d1 migrations apply hundred-apps-prod --local'} onChange={(event) => setDraft({ ...draft, developmentNotes: event.target.value })} />
            : <div className="ad-project-member-editor"><section><h4>プロジェクトメンバー</h4>{!project && <p>作成者は保存時に自動追加されます。</p>}{(project?.members ?? []).filter((member) => member.role === 'owner').map((member) => <article key={member.userId}><span>{member.displayName.charAt(0).toUpperCase()}</span><strong>{member.displayName}</strong><small>作成者</small></article>)}{draft.memberUserIds.map((userId) => <article key={userId}><span>{(knownMembers[userId] ?? userId).charAt(0).toUpperCase()}</span><strong>{knownMembers[userId] ?? userId}</strong><small>メンバー</small><button type="button" onClick={() => removeMember(userId)}>解除</button></article>)}</section><section><h4>Hundredユーザーを検索</h4><input type="search" maxLength={100} value={memberQuery} placeholder="表示名を入力" onChange={(event) => setMemberQuery(event.target.value)} />{searchingMembers ? <p>検索しています…</p> : <div className="ad-project-member-results">{memberResults.map((user) => { const added = draft.memberUserIds.includes(user.userId); return <button type="button" key={user.userId} disabled={user.isCurrentUser || added} onClick={() => addMember(user)}><span>{user.displayName.charAt(0).toUpperCase()}</span><strong>{user.displayName}</strong><small>{user.isCurrentUser ? '自分' : added ? '追加済み' : '追加'}</small></button> })}</div>}</section></div>

  return <div className="ad-projects">
    <aside className="ad-project-list"><header><div><small>PROJECT WORKSPACE</small><h1>Projects</h1></div><button type="button" onClick={startCreate}>＋ 新規</button></header><div className="ad-project-list-body">{loading && projects.length === 0 ? <p>読み込んでいます…</p> : projects.length === 0 ? <div className="ad-project-empty"><span>◇</span><strong>プロジェクトがありません</strong></div> : projects.map((item) => <button type="button" key={item.id} className={item.id === selectedId ? 'active' : ''} onClick={() => selectProject(item.id)}><span className={`status ${item.status}`}>{statusLabels[item.status]}</span><strong>{item.name}</strong><small>{developmentModeLabels[item.developmentMode]} ・ {new Date(item.updatedAt).toLocaleDateString('ja-JP')}</small></button>)}</div></aside>
    <main className="ad-project-main">{!creating && !project ? <div className="ad-project-welcome"><span>◆</span><h2>プロジェクトを選択してください</h2><button type="button" onClick={startCreate}>新しいプロジェクトを作成</button></div> : <>
      <header className="ad-project-header">
        <div className="ad-project-header-title"><small>{creating ? 'NEW PROJECT' : `PROJECT · ${developmentModeLabels[draft.developmentMode]}`}</small><h2>{draft.name || '新しいプロジェクト'}</h2></div>
        <nav className="ad-project-toolbar">
          {project && <div className="ad-project-view-switch" aria-label="Projectの表示モード">
            <button type="button" className={view === 'dashboard' ? 'active' : ''} onClick={() => { if (dirty && !window.confirm('保存していない変更があります。変更を破棄してダッシュボードへ移動しますか？')) return; if (dirty) setDraft(projectInput(project)); setView('dashboard') }}>ダッシュボード</button>
            {project.canEdit !== false && <button type="button" className={view === 'edit' ? 'active' : ''} onClick={() => setView('edit')}>編集</button>}
          </div>}
          <div className="ad-project-toolbar-actions">
            <button type="button" onClick={() => void copyProjectInfo()} disabled={!draft.name.trim()}>コンテキストをコピー</button>
            {view === 'edit' && (creating || project?.canEdit !== false) && <>
              {(dirty || creating) && <span className="ad-project-unsaved"><i />未保存</span>}
              <details className="ad-project-json-menu ad-project-json-menu--labeled">
                <summary>JSON連携 <span aria-hidden="true">⌄</span></summary>
                <div>
                  <section><strong>連携ファイル</strong><button type="button" onClick={() => void writeWorkspaceTemplate()}>JSONへ書き出す</button><button type="button" onClick={() => void readWorkspaceTemplate()}>JSONから読み込む</button><button type="button" onClick={() => void changeWorkspaceFile()}>連携ファイルを変更</button></section>
                  <section><strong>ファイル操作</strong><button type="button" onClick={() => downloadProjectJson()}>JSONをダウンロード</button><button type="button" onClick={() => importInputRef.current?.click()}>JSONをインポート</button><button type="button" onClick={downloadProjectTemplate}>テンプレートをダウンロード</button></section>
                  {project && <section className="danger-zone"><button type="button" className="danger" onClick={() => void remove()} disabled={saving}>Projectを削除</button></section>}
                </div>
              </details>
              <button type="button" className="primary" onClick={() => void save()} disabled={!draft.name.trim() || saving || (!dirty && !creating)}>{saving ? '保存中…' : '保存'}</button>
              <input ref={importInputRef} className="ad-project-import-input" type="file" accept="application/json,.json" onChange={(event) => void importTemplate(event)} />
            </>}
          </div>
        </nav>
      </header>
      {view === 'dashboard' && project ? <div className="ad-project-scroll ad-project-dashboard">
        <section className="ad-project-dashboard-summary"><div className="ad-project-summary-content"><header><small>OVERVIEW</small><h3>概要</h3></header>{draft.summary ? <p>{draft.summary}</p> : <EmptyValue>概要はまだ登録されていません。</EmptyValue>}</div><dl><div><dt>開発体制</dt><dd>{developmentModeLabels[draft.developmentMode]}</dd></div><div><dt>状態</dt><dd>{statusLabels[draft.status]}</dd></div></dl></section>
        <section className="ad-project-architecture"><header><div><small>PROJECT MAP</small><h3>全体図</h3></div>{architectureTabs}</header>{architectureTab === 'system' ? (draft.systemDiagramSource.trim() ? <MermaidDiagram id={`project-${project.id}`} kind="flowchart" title="" source={draft.systemDiagramSource} /> : <EmptyValue>システム構成図はまだ登録されていません。</EmptyValue>) : (draft.fileStructure.trim() ? <pre className="ad-project-file-structure">{draft.fileStructure}</pre> : <EmptyValue>ファイル構成はまだ登録されていません。</EmptyValue>)}</section>
        <section className="ad-project-workspace-panel">{workspaceTabs}{dashboardWorkspaceContent}</section>
        <section className="ad-project-documents ad-project-dashboard-documents"><header><div><span>DOCUMENTS</span><h3>関連資料</h3></div><div>{documentHelp}<strong>{draft.relatedDocuments.length}件</strong></div></header>{documentList(false)}</section>
      </div> : <div className="ad-project-scroll ad-project-editor">
        <section className="ad-project-fields"><div className="ad-project-form-row"><label><span>プロジェクト名</span><input maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>開発体制</span><select value={draft.developmentMode} onChange={(event) => setDraft({ ...draft, developmentMode: event.target.value as AIDesktopProjectDevelopmentMode })}>{Object.entries(developmentModeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>状態</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AIDesktopProjectStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label><span>概要</span><textarea rows={3} maxLength={2000} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label></section>
        <section className="ad-project-architecture-editor"><header><div><small>PROJECT MAP</small><h3>全体図</h3></div>{architectureTabs}</header>{architectureTab === 'system' ? <div><label><span>Mermaid構文（flowchart）</span><textarea spellCheck={false} rows={12} maxLength={50000} value={draft.systemDiagramSource} onChange={(event) => setDraft({ ...draft, systemDiagramSource: event.target.value })} /></label><div className="ad-project-architecture-preview">{draft.systemDiagramSource.trim() ? <MermaidDiagram id="project-editor" kind="flowchart" title="" source={draft.systemDiagramSource} /> : <EmptyValue>Mermaid構文を入力してください。</EmptyValue>}</div></div> : <label className="ad-project-file-structure-editor"><span>ディレクトリ・ファイル構成</span><textarea spellCheck={false} rows={16} maxLength={50000} value={draft.fileStructure} placeholder={initialFileStructure} onChange={(event) => setDraft({ ...draft, fileStructure: event.target.value })} /></label>}</section>
        <section className="ad-project-workspace-editor"><header>{workspaceTabs}{detailTab ? <button type="button" onClick={() => addListItem(detailTab)}>＋ 追加</button> : workspaceTab === 'commands' ? <button type="button" onClick={addCommand}>＋ 追加</button> : workspaceTab === 'links' ? <button type="button" onClick={addLink}>＋ 追加</button> : null}</header>{editorWorkspaceContent}</section>
        <section className="ad-project-documents"><header><div><span>DOCUMENTS</span><h3>関連資料</h3></div><div>{documentHelp}<strong>{draft.relatedDocuments.length}件</strong></div></header>{documentList(true)}<div className="ad-project-document-tools"><article><h4>Hundredの資料を追加</h4>{documentOptions.length ? <div className="ad-project-document-form"><label><span>資料</span><select value={selectedDocumentServiceId} onChange={(event) => { setDocumentServiceId(event.target.value); setDocumentCategoryId(''); setDocumentContentId('') }}>{documentServiceIds.map((id) => <option value={id} key={id}>{catalog[id]?.name ?? id}</option>)}</select></label><label><span>カテゴリ</span><select value={selectedCategoryId} onChange={(event) => { setDocumentCategoryId(event.target.value); setDocumentContentId('') }}>{categories.map((category) => <option value={category.id} key={category.id}>{category.title}</option>)}</select></label><label><span>ページ</span><select value={selectedContentId} onChange={(event) => setDocumentContentId(event.target.value)}>{contents.map((item) => <option value={item.contentId} key={item.contentId}>{item.title}</option>)}</select></label><label><span>工程フェーズ</span><select value={documentPhase} onChange={(event) => setDocumentPhase(event.target.value)}>{documentPhases.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>資料種別</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{documentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="note"><span>メモ（任意）</span><input maxLength={1000} value={documentNote} placeholder="資料の役割や確認ポイント" onChange={(event) => setDocumentNote(event.target.value)} /></label><button type="button" className="primary" onClick={addExistingDocument} disabled={!selectedContentId}>追加</button></div> : <p className="ad-project-document-no-options">公開中の資料がありません。マイ資料で資料を公開すると追加できます。</p>}</article></div></section>
      </div>}</>}</main>
  </div>
}
