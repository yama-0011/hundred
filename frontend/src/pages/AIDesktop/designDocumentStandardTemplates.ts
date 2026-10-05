import type { AIDesktopDesignDomain, AIDesktopDesignPhase } from '../../services/AIDesktop/aiDesktopApi'
import type { ContentBlock, ContentItem } from './contentBlocks'

export type DesignDocumentContent = { schemaVersion: 2; pages: ContentItem[] }

export type StandardDesignTemplate = {
  id: string
  version: number
  name: string
  description: string
  domain: AIDesktopDesignDomain
  phase: AIDesktopDesignPhase
  documentType: string
  required: boolean
  create: (title: string) => ContentItem
  createContent?: (title: string) => DesignDocumentContent
}

type PageSpec = { title: string; guidance: string; columns?: never } | { title: string; columns: string[]; guidance?: never }

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const heading = (value: string, level: 1 | 2 | 3 = 2): ContentBlock => ({ id: uid('heading'), type: 'heading', data: { text: value, level } })
const text = (value: string): ContentBlock => ({ id: uid('text'), type: 'text', data: { text: value } })
const table = (columns: string[]): ContentBlock => ({ id: uid('table'), type: 'table', data: { columns: columns.map((label) => ({ id: uid('column'), label, width: Math.round(100 / columns.length) })), rows: Array.from({ length: 3 }, () => ({ id: uid('row'), cells: columns.map(() => '') })), rowHeight: 'standard', tableWidth: 100 } })
const image = (caption: string): ContentBlock => ({ id: uid('image'), type: 'image', data: { imageId: '', url: '', alt: '', caption } })
const code = (filename: string): ContentBlock => ({ id: uid('code'), type: 'code', data: { code: '', language: 'sql', filename } })
const page = (navTitle: string, blocks: ContentBlock[], parentId?: string): ContentItem => ({ id: uid('page'), navTitle, parentId, blocks: [heading(navTitle, 1), ...blocks] })
const pages = (items: ContentItem[]): DesignDocumentContent => ({ schemaVersion: 2, pages: items })
const pageWithTable = (navTitle: string, columns: string[], parentId?: string): ContentItem => page(navTitle, [table(columns)], parentId)

const designBook = (title: string, purpose: string, pages: PageSpec[]): ContentItem => ({
  id: uid('design'),
  navTitle: title,
  blocks: [
    heading(title, 1),
    { id: uid('callout'), type: 'callout', data: { tone: 'info', title: 'この設計書の目的', text: purpose } },
    ...pages.flatMap((page, index) => [heading(`${index + 1}. ${page.title}`), page.columns ? table(page.columns) : text(page.guidance)]),
  ],
})

export const basicDesignMasterTemplates: StandardDesignTemplate[] = [
  {
    id: 'master-common-basic-document-management', version: 2, name: '文書管理', description: '基本設計の文書体系と共通の命名規則を整理します。', domain: 'common', phase: 'basic-design', documentType: 'document-management', required: true,
    create: (title) => designBook(title, '基本設計で作成する文書と、設計対象を識別するための共通ルールを定義します。', [
      { title: '文書体系', columns: ['文書ID', '設計書名', '記載内容', '作成条件'] },
      { title: '命名規則', columns: ['対象', '形式', '例', '用途'] },
    ]),
    createContent: () => pages([
      pageWithTable('文書体系', ['文書ID', '設計書名', '記載内容', '作成条件']),
      pageWithTable('命名規則', ['対象', '形式', '例', '用途']),
    ]),
  },
  {
    id: 'master-common-basic-system-overview', version: 3, name: 'システム概要設計書', description: 'システムの概要、目的、利用者、構成、機能と前提を整理します。', domain: 'common', phase: 'basic-design', documentType: 'system-overview', required: true,
    create: (title) => designBook(title, 'システム全体の概要、構成、機能と前提を関係者で共有します。', [
      { title: 'システム概要', columns: ['項目', '内容'] },
      { title: '要件対応表', columns: ['要件ID', '要件', '対応する設計・機能'] },
      { title: 'システム構成', guidance: 'システム内外の構成要素、配置、接続関係と各要素の役割を図と一覧で記載してください。' },
      { title: '機能構成', guidance: 'システムが提供する機能の関係を図で示し、機能ID、機能名、機能説明を一覧で記載してください。' },
      { title: '前提・制約事項', columns: ['項目', '内容', '影響'] },
      { title: '変更履歴', columns: ['版', '変更内容', '更新者', '更新日'] },
    ]),
    createContent: () => pages([
      page('システム概要', [table(['項目', '内容'])]),
      pageWithTable('要件対応表', ['要件ID', '要件', '対応する設計・機能']),
      page('システム構成', [heading('システム構成図', 2), image('システムを構成する要素と接続関係'), heading('構成要素・外部システム一覧', 2), table(['構成要素', '役割', '連携内容', '管理主体'])]),
      page('機能構成', [heading('機能構成図', 2), image('機能のまとまりと関係'), heading('機能一覧', 2), table(['機能ID', '機能名', '機能説明'])]),
      pageWithTable('前提・制約事項', ['区分', '項目', '内容', 'プロジェクトへの影響']),
      pageWithTable('変更履歴', ['版', '変更内容', '更新者', '更新日']),
    ]),
  },
  {
    id: 'master-application-basic-screen-design', version: 2, name: '画面設計書', description: '画面一覧、遷移、共通仕様と画面ごとの詳細を整理します。', domain: 'application', phase: 'basic-design', documentType: 'screen-design', required: true,
    create: (title) => designBook(title, '画面の構成、表示、入力、操作、状態と遷移を定義します。', [
      { title: '文書概要', guidance: 'この文書の目的、対象読者、記載範囲を記載してください。' },
      { title: '画面一覧', columns: ['画面ID', '画面名', '目的', '利用者'] },
      { title: '画面遷移図', guidance: '画面間の遷移、分岐、開始・終了地点を図で記載してください。' },
      { title: '画面共通仕様', columns: ['項目', '共通仕様', '確認方法'] },
      { title: '画面詳細（複製用）', columns: ['項目', '内容', '補足'] },
      { title: '変更履歴', columns: ['版', '変更内容', '更新者', '更新日'] },
    ]),
    createContent: () => pages([
      pageWithTable('画面一覧', ['画面ID', '画面名', '画面種別', '概要']),
      page('画面遷移図', [image('画面間の遷移関係')]),
      pageWithTable('画面共通仕様', ['分類', '適用先', '共通仕様']),
      page('画面詳細（複製用）', [heading('PC', 2), image('PC画面'), heading('スマホ', 2), image('スマホ画面'), heading('画面項目定義', 2), table(['項目ID', '項目名', '種別', '入出力', '必須', '表示・入力内容', '備考']), heading('画面イベント定義', 2), table(['イベントID', 'イベント名', '発生条件', '処理内容', '遷移先', 'エラー時の動作'])]),
      pageWithTable('変更履歴', ['版', '変更内容', '更新者', '更新日']),
    ]),
  },
  {
    id: 'master-application-basic-report-design', version: 1, name: '帳票設計書', description: '帳票、PDF、Excel、CSVなどの出力仕様を整理します。', domain: 'application', phase: 'basic-design', documentType: 'report-design', required: false,
    create: (title) => designBook(title, 'システムから出力する帳票やファイルの形式、項目、条件を定義します。', [
      { title: '文書概要', guidance: 'この文書の目的、対象読者、記載範囲を記載してください。' },
      { title: '帳票一覧', columns: ['帳票ID', '帳票名', '形式', '利用者'] },
      { title: '帳票共通仕様', columns: ['項目', '共通仕様', '補足'] },
      { title: '帳票詳細（複製用）', columns: ['項目', '内容', '補足'] },
      { title: '変更履歴', columns: ['版', '変更内容', '更新者', '更新日'] },
    ]),
  },
  {
    id: 'master-application-basic-database-design', version: 2, name: 'データベース設計書', description: 'ER図、テーブルとビューの一覧・定義を整理します。', domain: 'application', phase: 'basic-design', documentType: 'database-design', required: false,
    create: (title) => designBook(title, '業務で扱うデータ、その関係、保存と削除の方針を定義します。', [
      { title: '文書概要', guidance: 'この文書の目的、対象読者、記載範囲を記載してください。' },
      { title: 'データ概要', guidance: '扱うデータの全体像、正本、利用範囲を記載してください。' },
      { title: 'データ一覧', columns: ['データID', '名称', '概要', '正本'] },
      { title: 'ER図', guidance: '主要なデータと関係をER図で記載してください。' },
      { title: 'データの関係', columns: ['データ', '関連データ', '関係', '補足'] },
      { title: 'データ管理ルール', columns: ['データ', '作成・更新', '削除・保持', '履歴'] },
      { title: '変更履歴', columns: ['版', '変更内容', '更新者', '更新日'] },
    ]),
    createContent: () => {
      const tableDefinitionId = uid('page')
      const viewDefinitionId = uid('page')
      return pages([
        page('ER図', [image('テーブル間の関係')]),
        pageWithTable('テーブル一覧', ['テーブルID', '論理名', '物理名', '用途']),
        { id: tableDefinitionId, navTitle: 'テーブル定義', blocks: [heading('テーブル定義', 1), text('テーブルごとに「テーブル定義（複製用）」を複製して記載してください。')] },
        page('テーブル定義（複製用）', [heading('基本情報', 2), table(['項目', '内容']), heading('カラム定義', 2), table(['No.', '論理名', '物理名', 'データ型', '桁数', 'NULL', '初期値', 'キー・制約', '説明']), heading('インデックス定義', 2), table(['インデックス名', '対象カラム', '一意', '用途'])], tableDefinitionId),
        pageWithTable('ビュー一覧', ['ビューID', '論理名', '物理名', '用途']),
        { id: viewDefinitionId, navTitle: 'ビュー定義', blocks: [heading('ビュー定義', 1), text('ビューごとに「ビュー定義（複製用）」を複製して記載してください。')] },
        page('ビュー定義（複製用）', [heading('基本情報', 2), table(['項目', '内容']), heading('出力項目', 2), table(['No.', '論理名', '物理名', 'データ型', '参照元', '説明']), heading('定義SQL', 2), code('view.sql')], viewDefinitionId),
        pageWithTable('変更履歴', ['版', '変更内容', '更新者', '更新日']),
      ])
    },
  },
  {
    id: 'master-application-basic-external-interface', version: 1, name: '外部インターフェース設計書', description: '外部システムやサービスとの連携仕様を整理します。', domain: 'application', phase: 'basic-design', documentType: 'external-interface', required: false,
    create: (title) => designBook(title, 'システム外部とのデータ連携、接続条件、エラー時の扱いを定義します。', [
      { title: '文書概要', guidance: 'この文書の目的、対象読者、記載範囲を記載してください。' },
      { title: '外部連携一覧', columns: ['連携ID', '連携名', '連携先', '方式'] },
      { title: '外部連携の全体図', guidance: '送信側、受信側と連携方向を図で記載してください。' },
      { title: '共通連携ルール', columns: ['項目', '共通仕様', '補足'] },
      { title: '外部連携詳細（複製用）', columns: ['項目', '内容', '補足'] },
      { title: '変更履歴', columns: ['版', '変更内容', '更新者', '更新日'] },
    ]),
  },
  {
    id: 'master-application-basic-batch-design', version: 1, name: 'バッチ設計書', description: '定時処理、集計、同期などのバッチ仕様を整理します。', domain: 'application', phase: 'basic-design', documentType: 'batch-design', required: false,
    create: (title) => designBook(title, '画面操作とは別に実行される処理の条件、流れ、結果確認と再実行を定義します。', [
      { title: '文書概要', guidance: 'この文書の目的、対象読者、記載範囲を記載してください。' },
      { title: 'バッチ一覧', columns: ['バッチID', 'バッチ名', '目的', '実行方式'] },
      { title: '実行スケジュール', columns: ['バッチID', '実行日時・間隔', '開始条件', '担当'] },
      { title: 'バッチ処理の関係図', guidance: 'バッチ間の前後関係、依存、データの流れを図で記載してください。' },
      { title: 'バッチ共通仕様', columns: ['項目', '共通仕様', '補足'] },
      { title: 'バッチ詳細（複製用）', columns: ['項目', '内容', '補足'] },
      { title: '変更履歴', columns: ['版', '変更内容', '更新者', '更新日'] },
    ]),
  },
  {
    id: 'master-application-basic-security-design', version: 2, name: '権限・セキュリティ設計書', description: '認証、権限、データ保護、監査と問題発生時の対応を整理します。', domain: 'application', phase: 'basic-design', documentType: 'security-design', required: true,
    create: (title) => designBook(title, '利用者とデータを守るための認証、権限、記録と対応方針を定義します。', [
      { title: '文書概要', guidance: 'この文書の目的、対象読者、記載範囲を記載してください。' },
      { title: 'セキュリティ方針', columns: ['対象', '方針', '確認方法'] },
      { title: '利用者・ロール一覧', columns: ['ロール', '利用者', '責任・用途'] },
      { title: '機能別の権限一覧', columns: ['機能', 'ロール', '許可する操作', '条件'] },
      { title: 'ログイン・認証方式', columns: ['対象', '認証方式', '追加条件', '失敗時'] },
      { title: 'データのアクセス制御', columns: ['データ', '参照権限', '更新権限', '制御単位'] },
      { title: '機密情報の取り扱い', columns: ['情報', '保存・表示', '送信', '廃棄'] },
      { title: 'セッション管理', columns: ['項目', '仕様', '補足'] },
      { title: '操作履歴・監査ログ', columns: ['操作', '記録内容', '保存期間', '確認者'] },
      { title: 'セキュリティ問題発生時の対応', columns: ['事象', '初動', '連絡先', '復旧・記録'] },
      { title: '変更履歴', columns: ['版', '変更内容', '更新者', '更新日'] },
    ]),
    createContent: () => pages([
      pageWithTable('保護対象と方針', ['保護対象', '区分', '重要度', '想定する問題', '保護方針']),
      pageWithTable('利用者・ロール一覧', ['ロールID', 'ロール名', '対象利用者', '役割', '備考']),
      pageWithTable('権限一覧', ['対象ID', '機能・データ', 'ロール', '参照', '登録', '更新', '削除', '管理', '条件・範囲']),
      pageWithTable('認証設計', ['項目', '方式・ルール', '成功時の動作', '失敗時の動作', '備考']),
      pageWithTable('セッション・トークン管理', ['対象', '保存場所', '有効期限', '更新方法', '無効化条件・方法', '備考']),
      pageWithTable('データ保護', ['データ', '区分', '保存時の保護', '通信時の保護', '表示・マスキング', '保持・削除']),
      pageWithTable('通信・外部連携の保護', ['連携先', '通信経路', '認証方式', '送受信データ', '秘密情報の管理', '異常時の動作']),
      pageWithTable('入力・ファイルの保護', ['対象', '検証内容', '許可する形式・範囲', '制限', '不正データの扱い']),
      pageWithTable('監査ログ・監視', ['対象イベント', '記録内容', '記録しない情報', '保存期間', '確認・検知方法', '対応']),
      pageWithTable('セキュリティ問題への対応', ['段階', '開始条件', '対応内容', '担当', '記録・連絡先', '完了条件']),
      pageWithTable('変更履歴', ['版', '変更内容', '更新者', '更新日']),
    ]),
  },
]

export const defaultInitialBasicDesignTypes = basicDesignMasterTemplates.filter((template) => template.required || template.documentType === 'database-design').map((template) => template.documentType)

export function createStandardDesignContent(template: StandardDesignTemplate, title: string): DesignDocumentContent {
  if (template.createContent) return template.createContent(title)
  const source = template.create(title)
  const pages: ContentItem[] = []
  let current: ContentItem = { id: uid('page'), navTitle: '概要', blocks: [] }
  source.blocks.forEach((block) => {
    if (block.type === 'heading' && block.data.level === 2) {
      const navTitle = block.data.text.replace(/^\d+\.\s*/u, '')
      const alreadyHasSection = current.blocks.some((item) => item.type === 'heading' && item.data.level === 2)
      if (alreadyHasSection) {
        pages.push(current)
        current = { id: uid('page'), navTitle, blocks: [block] }
      } else {
        current = { ...current, navTitle, blocks: [...current.blocks, block] }
      }
    } else current.blocks.push(block)
  })
  if (current.blocks.length) pages.push(current)
  return { schemaVersion: 2, pages }
}
