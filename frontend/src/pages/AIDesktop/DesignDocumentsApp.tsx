import { useEffect, useRef, useState } from 'react'
import { createAIDesktopDesignCategory, createAIDesktopDesignDocument, createAIDesktopDesignTemplate, deleteAIDesktopDesignDocument, deleteAIDesktopDesignTemplate, getAIDesktopDesignDocument, fetchAIDesktopDesignDocumentFile, markAIDesktopDesignDocumentEditing, clearAIDesktopDesignDocumentEditing, getAIDesktopAccessToken, getAIDesktopCurrentUserId, releaseAIDesktopDesignDocumentEditingOnExit, uploadAIDesktopDesignDocumentFile, listAIDesktopDesignCategories, listAIDesktopDesignDocuments, listAIDesktopDesignMasterTemplates, listAIDesktopDesignTemplates, getAIDesktopProject, listAIDesktopProjects, updateAIDesktopDesignDocument, updateAIDesktopDesignTemplate, type AIDesktopDesignCategory, designDeliveryStateLabels, type AIDesktopDesignDocument, type AIDesktopDesignDocumentFormat, type AIDesktopDesignDocumentInput, type AIDesktopDesignDocumentSummary, type AIDesktopDesignDomain, type AIDesktopDesignMasterTemplate, type AIDesktopDesignPhase, type AIDesktopDesignTemplate, type AIDesktopDesignTemplateInput, type AIDesktopProjectSummary } from '../../services/AIDesktop/aiDesktopApi'
import { BlockRenderer, ContentCanvas, type ContentBlock, type ContentItem } from './contentBlocks'
import { AI_DESKTOP_MESSAGES, localizedErrorMessage } from './aiDesktopMessages'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import DesignDeliverables from './DesignDeliverables'
import { AppContent, AppHeader, AppShell } from './AppLayout'
import { createDesignDocumentJson, parseDesignDocumentJson } from './designDocumentJson'
import { basicDesignMasterTemplates, createStandardDesignContent, type DesignDocumentContent, type StandardDesignTemplate } from './designDocumentStandardTemplates'
import { designDocumentWorkspacePath, isWorkspaceCancelled, readDesignDocumentWorkspace, selectWorkspaceFolder, supportsWorkspaceFolder, workspaceContextText, writeDesignDocumentWorkspace, type DesignDocumentWorkspaceTarget } from './aiDesktopWorkspaceFolder'
import '../../styles/AIDesktop/ai-desktop-design-documents.css'
import '../../styles/AIDesktop/ai-desktop-app-layout.css'
import { confirmAIDesktop } from './aiDesktopConfirmBus'
import { isRecordValue, readAIDesktopSessionState, useAIDesktopSessionStateSaver } from './aiDesktopSessionState'
import { AGENTS_FILE_LINE_BUDGET, buildAgentExport, createZip } from './aiDesktopAgentExport'
import { pendingAgentExportCount, repositoryFolderWithPermission, selectRepositoryFolder, storedRepositoryFolderName, supportsRepositoryFolder, writeAgentExportToFolder } from './aiDesktopRepositoryFolder'

const phaseLabels: Record<AIDesktopDesignPhase, string> = { common: '共通', planning: '企画', requirements: '要件定義', 'basic-design': '基本設計', 'detailed-design': '詳細設計', implementation: '実装', test: 'テスト', release: 'リリース', operation: '運用', research: '調査' }
const formatLabels: Record<AIDesktopDesignDocumentFormat, string> = { document: 'ドキュメント', pdf: 'PDF', word: 'Word', excel: 'Excel' }
const acceptedFileTypes = '.pdf,.doc,.docx,.xls,.xlsx,.xlsm'
const fileSizeLabel = (size: number) => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`
const editingLabel = (names: string[]) => `編集中：${names.join('、')}`
const timeLabel = (value: number) => new Date(value).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

// 未保存の編集内容をこのブラウザに控え、保存できなかった場合やブラウザが閉じた場合でも復元できるようにする。
// 控えは利用者ごと・文書ごとに1つだけ持ち、最後に控えてから一定日数たつと破棄する。
const DOCUMENT_BACKUP_DAYS = 7
const documentBackupPrefix = 'hundred.aiDesktop.documentBackup.'
type DocumentBackup = { draft: AIDesktopDesignDocumentInput<DesignDocumentContent>; baseUpdatedAt: number; savedAt: number }
const documentBackupKey = (owner: string, id: string) => `${documentBackupPrefix}${owner}.${id}`
const isExpiredBackup = (value: unknown) => !value || typeof value !== 'object' || typeof (value as DocumentBackup).savedAt !== 'number' || Date.now() - (value as DocumentBackup).savedAt > DOCUMENT_BACKUP_DAYS * 24 * 60 * 60 * 1000
const readDocumentBackup = (owner: string, id: string): DocumentBackup | null => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(documentBackupKey(owner, id)) ?? 'null')
    if (!value) return null
    if (isExpiredBackup(value) || !('draft' in (value as object))) { localStorage.removeItem(documentBackupKey(owner, id)); return null }
    return value as DocumentBackup
  } catch { return null }
}
const writeDocumentBackup = (owner: string, id: string, backup: DocumentBackup) => { try { localStorage.setItem(documentBackupKey(owner, id), JSON.stringify(backup)) } catch { /* 容量不足などで控えられない場合は、保存処理だけを続ける。 */ } }
const clearDocumentBackup = (owner: string, id: string) => { try { localStorage.removeItem(documentBackupKey(owner, id)) } catch { /* 削除できない環境では何もしない。 */ } }
// 期限切れの控えと、利用者で分ける前の形式の控えを削除し、ブラウザの保存領域を使い続けないようにする。
const pruneDocumentBackups = () => {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(documentBackupPrefix)) continue
      if (!key.slice(documentBackupPrefix.length).includes('.')) { localStorage.removeItem(key); continue }
      let value: unknown = null
      try { value = JSON.parse(localStorage.getItem(key) ?? 'null') } catch { value = null }
      if (isExpiredBackup(value)) localStorage.removeItem(key)
    }
  } catch { /* 保存領域を読めない環境では何もしない。 */ }
}
const phases = Object.keys(phaseLabels) as AIDesktopDesignPhase[]
const navigationPhases = [...phases.filter((phase) => phase !== 'common'), 'common'] as AIDesktopDesignPhase[]
const navigationPhaseLabel = (phase: AIDesktopDesignPhase) => phase === 'common' ? '設計判断（ADR）' : phaseLabels[phase]
const standardCategoryDefinitions = navigationPhases.map((key, index) => ({ key, name: navigationPhaseLabel(key), sortOrder: (index + 1) * 10 }))
type DocumentTypeDefinition = [type: string, label: string, sortOrder: number]
const documentTypes: Record<AIDesktopDesignDomain, DocumentTypeDefinition[]> = {
  common: [['project-plan', 'プロジェクト計画', 10], ['document-management', '文書管理', 10], ['system-overview', 'システム概要設計', 20], ['requirements', '要件定義', 10], ['non-functional', '非機能要件', 20], ['implementation-policy', '実装方針', 10], ['release-plan', 'リリース計画', 10], ['operation-procedure', '運用手順', 10], ['adr', '設計判断（ADR）', 10], ['research', '調査資料', 10]],
  application: [['screen-design', '画面設計', 30], ['report-design', '帳票設計', 40], ['database-design', 'データベース設計', 50], ['external-interface', '外部インターフェース設計', 60], ['batch-design', 'バッチ設計', 70], ['security-design', '権限・セキュリティ設計', 80], ['custom', '自由形式設計書', 90], ['internal-design', '内部設計', 10], ['api-design', 'API設計', 20], ['table-design', 'テーブル設計', 30], ['test-specification', 'テスト仕様書', 10]],
  infrastructure: [['basic-design', 'インフラ基本設計', 110], ['iam-design', 'IAM・権限設計', 40], ['monitoring-design', '監視設計', 50], ['backup-dr', 'バックアップ・DR', 60], ['operation-design', '運用設計', 20]],
}
const typeLabel = (domain: AIDesktopDesignDomain, value: string) => documentTypes[domain].find(([id]) => id === value)?.[1] ?? value
const documentTypeSortOrder = (domain: AIDesktopDesignDomain, value: string) => documentTypes[domain].find(([id]) => id === value)?.[2] ?? 10_000
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const heading = (value: string, level: 1 | 2 | 3 = 2): ContentBlock => ({ id: uid('heading'), type: 'heading', data: { text: value, level } })
const text = (value: string): ContentBlock => ({ id: uid('text'), type: 'text', data: { text: value } })
const table = (columns: string[], rows = 2): ContentBlock => ({ id: uid('table'), type: 'table', data: { columns: columns.map((label) => ({ id: uid('column'), label, width: Math.round(100 / columns.length) })), rows: Array.from({ length: rows }, () => ({ id: uid('row'), cells: columns.map(() => '') })), rowHeight: 'standard', tableWidth: 100 } })
type TemplateSection = { title: string; guidance?: string; columns?: string[] }
const structuredContent = (title: string, purpose: string, sections: TemplateSection[]): ContentItem => ({
  id: uid('design'),
  navTitle: title,
  blocks: [
    heading(title, 1),
    { id: uid('callout'), type: 'callout', data: { tone: 'info', title: 'この設計書の目的', text: purpose } },
    ...sections.flatMap((section, index) => [heading(`${index + 1}. ${section.title}`), section.columns ? table(section.columns, 3) : text(section.guidance ?? '内容を記載してください。')]),
  ],
})
const documentOpeningSections: TemplateSection[] = [
  { title: '文書概要', guidance: 'この文書の背景、目的、対象読者、対象範囲、対象外を記載してください。' },
]
const sharedClosingSections: TemplateSection[] = [
  { title: '未決事項', columns: ['項目', '検討内容', '担当', '期限'] },
  { title: '関連資料', columns: ['資料名', '関係', '参照先'] },
  { title: '変更履歴', columns: ['版', '変更内容', '更新者', '更新日'] },
]
const specificationContent = (title: string, purpose: string, sections: TemplateSection[]): ContentItem => structuredContent(title, purpose, [
  ...documentOpeningSections,
  ...sections,
  { title: '制約・前提条件', columns: ['項目', '内容', '影響'] },
  { title: '確認・テスト観点', columns: ['観点ID', '確認内容', '期待結果'] },
  ...sharedClosingSections,
])
const planningContent = (title: string): ContentItem => structuredContent(title, 'Projectの目的、進め方、体制、品質と完了条件を関係者で共有します。', [
  { title: 'Project概要', guidance: '背景、解決する課題、目的、成功と判断できる状態を記載してください。' }, { title: '対象範囲', columns: ['区分', '対象', '対象外・理由'] }, { title: '成果物・完了条件', columns: ['成果物', '担当', '完了条件'] }, { title: '体制・役割', columns: ['役割', '担当', '責任・決裁範囲'] }, { title: '進め方・工程', columns: ['工程', '開始', '終了', 'マイルストーン'] }, { title: 'コミュニケーション', columns: ['会議・連絡', '参加者', '頻度', '記録先'] }, { title: '品質・変更管理', columns: ['管理対象', '基準', '確認・承認方法'] }, { title: 'リスク・課題', columns: ['項目', '影響', '予防・対応', '担当'] }, ...sharedClosingSections,
])
const requirementsContent = (title: string, nonFunctional = false): ContentItem => structuredContent(title, nonFunctional ? '性能、可用性、セキュリティ、運用など、機能以外に求める品質を定義します。' : '利用者と業務が必要とする機能、制約、受入条件を定義します。', [
  ...documentOpeningSections, { title: '背景・業務課題', columns: ['利用者・業務', '現状', '解決したい課題'] }, { title: '用語・関係者', columns: ['名称', '定義・役割', '補足'] }, { title: '対象範囲', columns: ['区分', '対象', '対象外・理由'] }, ...(nonFunctional ? [{ title: '品質目標', columns: ['分類', '目標', '測定方法'] }, { title: '非機能要件一覧', columns: ['要件ID', '分類', '要件・基準値', '優先度'] }] : [{ title: '業務フロー', guidance: '開始条件、担当者、主な処理、判断、終了条件を業務の流れに沿って記載してください。' }, { title: '機能要件一覧', columns: ['要件ID', '利用者', '要件', '優先度'] }, { title: '業務ルール', columns: ['ルールID', '条件', 'ルール内容', '例外'] }]), { title: '制約・前提', columns: ['項目', '内容', '影響'] }, { title: '受入基準', columns: ['要件ID', '受入条件', '確認方法'] }, { title: 'トレーサビリティ', columns: ['要件ID', '設計・機能', 'テスト'] }, ...sharedClosingSections,
])
const requirementsPage = (navTitle: string, blocks: ContentBlock[]): ContentItem => ({ id: uid('page'), navTitle, blocks: [heading(navTitle, 1), ...blocks] })
const requirementsTablePage = (navTitle: string, columns: string[]): ContentItem => requirementsPage(navTitle, [table(columns, 3)])
const requirementsDocumentContent = (): DesignDocumentContent => ({ schemaVersion: 2, pages: [
  requirementsPage('文書の目的', [text('この文書で合意する内容、対象となるシステム・プロジェクト、対象読者を記載してください。')]),
  requirementsPage('背景・目的', [table(['項目', '内容'], 3), text('現在の問題、システム導入によって改善すること、達成したい状態を記載してください。')]),
  requirementsTablePage('対象範囲', ['区分', '対象', '対象外・理由']),
  requirementsTablePage('利用者・関係者', ['関係者・利用者', '役割', '利用目的', '決定・承認範囲']),
  requirementsPage('利用シナリオ・業務フロー', [text('開始条件、利用者、主な処理、判断、例外、終了条件を業務の流れに沿って記載してください。'), table(['シナリオID', '利用者', '目的', '開始条件', '基本的な流れ', '完了条件'], 3)]),
  requirementsTablePage('機能要件一覧', ['要件ID', '要件名', '要件内容', '優先度', '受入条件']),
  requirementsTablePage('データ要件', ['要件ID', '対象データ', '利用目的', '保存・履歴', '保持・削除']),
  requirementsTablePage('外部連携要件', ['要件ID', '連携先', '連携目的', '入出力・契機', '異常時の要件']),
  requirementsTablePage('権限要件', ['要件ID', '利用者・ロール', '対象', '許可する操作', '条件・範囲']),
  requirementsTablePage('制約・前提条件', ['区分', '項目', '内容', 'プロジェクトへの影響']),
  requirementsTablePage('対象外・将来対応', ['項目', '今回の扱い', '理由', '将来の検討条件']),
  requirementsTablePage('受入条件', ['要件ID', '受入条件', '確認方法', '判定者']),
  requirementsTablePage('未決事項', ['項目', '検討内容', '決定者', '決定期限']),
  requirementsTablePage('変更履歴', ['版', '変更内容', '更新者', '更新日']),
] })
const nonFunctionalRequirementsContent = (): DesignDocumentContent => ({ schemaVersion: 2, pages: [
  requirementsPage('文書の目的', [text('この文書で合意する非機能要件、対象となるシステム・環境、対象読者を記載してください。')]),
  requirementsTablePage('品質目標', ['分類', '品質目標', '優先度', '評価方法']),
  requirementsTablePage('利用環境・対応端末', ['要件ID', '対象', '要件・条件', '判定基準']),
  requirementsTablePage('性能・応答時間', ['要件ID', '対象処理', '利用条件・負荷', '目標値', '測定方法']),
  requirementsTablePage('利用規模・容量', ['要件ID', '対象', '初期値', '上限・増加量', '見直し条件']),
  requirementsTablePage('可用性', ['要件ID', '対象', '稼働時間・目標値', '停止許容条件', '測定方法']),
  requirementsTablePage('バックアップ・復旧', ['要件ID', '保護対象', 'RPO', 'RTO', '保持・復旧確認']),
  requirementsTablePage('セキュリティ', ['要件ID', '保護対象・脅威', '要件', '判定基準', '優先度']),
  requirementsTablePage('認証・認可', ['要件ID', '対象利用者・操作', '要件', '例外・失敗時', '判定基準']),
  requirementsTablePage('ログ・監査', ['要件ID', '対象イベント', '記録内容', '保持期間', '確認・利用方法']),
  requirementsTablePage('運用・監視', ['要件ID', '対象', '監視・運用要件', '通知・対応条件', '判定基準']),
  requirementsTablePage('保守性・変更容易性', ['要件ID', '対象', '要件', '判定基準', '優先度']),
  requirementsTablePage('外部サービス障害時', ['要件ID', '外部サービス', '想定事象', '継続・復旧要件', '利用者への影響']),
  requirementsTablePage('アクセシビリティ', ['要件ID', '対象', '要件・基準', '確認方法']),
  requirementsTablePage('制約・前提条件', ['区分', '項目', '内容', 'プロジェクトへの影響']),
  requirementsTablePage('未決事項', ['項目', '検討内容', '決定者', '決定期限']),
  requirementsTablePage('変更履歴', ['版', '変更内容', '更新者', '更新日']),
] })
const testContent = (title: string): ContentItem => structuredContent(title, '要求と設計に対する確認方法、条件、期待結果、証跡を定義します。', [
  { title: 'テスト概要', guidance: '目的、対象範囲、対象外、テストレベル、開始条件と終了条件を記載してください。' }, { title: '対象とトレーサビリティ', columns: ['要件・設計ID', '対象機能', 'テスト観点ID'] }, { title: 'テスト環境', columns: ['環境', '構成・バージョン', '外部接続', '制約'] }, { title: 'テストデータ', columns: ['データID', '用途・条件', '準備方法', '後処理'] }, { title: 'テスト観点', columns: ['観点ID', '分類', '確認内容', '優先度'] }, { title: 'テストケース', columns: ['ケースID', '事前条件', '操作・入力', '期待結果'] }, { title: '結果・証跡', columns: ['ケースID', '結果', '証跡・参照先', '実施者'] }, { title: '不具合管理', columns: ['不具合ID', '内容', '重要度', '対応状況'] }, { title: '終了判定', columns: ['判定項目', '基準', '結果・根拠'] }, ...sharedClosingSections,
])
const operationalContent = (title: string, purpose: string): ContentItem => structuredContent(title, purpose, [
  ...documentOpeningSections, { title: '対象システム・サービス', columns: ['対象', '環境', '責任範囲'] }, { title: '体制・連絡経路', columns: ['役割', '担当・連絡先', '責任範囲', '対応時間'] }, { title: '定常作業', columns: ['作業ID', '契機・頻度', '操作', '正常確認'] }, { title: '監視・通知', columns: ['対象', '検知条件', '通知先', '初動'] }, { title: '障害・例外対応', columns: ['事象', '切り分け', '復旧・回避手順', '連絡先'] }, { title: '変更・リリース作業', columns: ['作業', '事前確認', '実施手順', '切戻し条件'] }, { title: 'バックアップ・復旧', columns: ['対象', '方式・保持', '復旧手順', '復旧確認'] }, { title: '運用記録・証跡', columns: ['記録', '保存先', '保持期間', '確認者'] }, ...sharedClosingSections,
])
const adrContent = (title: string): ContentItem => structuredContent(title, '重要な設計判断について、背景、選択肢、決定理由と影響を記録します。', [
  { title: '状態', guidance: '提案中、採用、廃止、置換済みなどの状態を記載してください。' }, { title: '背景・課題', guidance: '判断が必要になった背景と解決すべき課題を記載してください。' }, { title: '判断基準', columns: ['基準', '優先度', '理由'] }, { title: '選択肢', columns: ['選択肢', '利点', '欠点'] }, { title: '決定', guidance: '採用した案と、その案を選んだ理由を記載してください。' }, { title: '影響・結果', columns: ['対象', '影響', '対応'] }, ...sharedClosingSections,
])
const researchContent = (title: string): ContentItem => structuredContent(title, '調査の目的、条件、結果、根拠と次の判断を再利用できる形で記録します。', [
  { title: '調査目的', guidance: '確認したいことと、調査結果を使う判断を記載してください。' }, { title: '前提・条件', columns: ['項目', '条件', '理由'] }, { title: '調査方法', columns: ['手順', '使用した環境・資料', '確認内容'] }, { title: '結果', columns: ['確認項目', '結果', '根拠・証跡'] }, { title: '比較・評価', columns: ['候補', '評価', '利点', '懸念'] }, { title: '結論・次の対応', columns: ['結論', '対応', '担当'] }, ...sharedClosingSections,
])
const implementationPolicyContent = (title: string): ContentItem => specificationContent(title, '実装時に共通して守る構成、規約、品質、セキュリティと開発手順を定義します。', [
  { title: '対象技術・バージョン', columns: ['区分', '技術・製品', 'バージョン', '採用理由'] }, { title: 'リポジトリ・モジュール構成', columns: ['パス・モジュール', '責務', '依存ルール'] }, { title: 'コーディング規約', columns: ['分類', '規約', '自動確認方法'] }, { title: 'ブランチ・レビュー方針', columns: ['工程', 'ルール', '完了条件'] }, { title: 'エラー・ログ方針', columns: ['対象', '実装方針', '禁止事項'] }, { title: 'セキュア実装', columns: ['観点', '実装方針', '確認方法'] }, { title: 'テスト・品質ゲート', columns: ['検査', '基準', '実行タイミング'] }, { title: 'ビルド・依存関係管理', columns: ['対象', '方式', '更新・固定方針'] },
])
const internalDesignContent = (title: string): ContentItem => specificationContent(title, '実装につながるモジュール構成、処理、状態、データと例外処理を定義します。', [
  { title: '外部設計との対応', columns: ['機能・設計ID', '実装単位', '責務'] }, { title: 'モジュール構成', columns: ['モジュール', '責務', '公開インターフェース', '依存先'] }, { title: '処理フロー', guidance: '正常系、分岐、非同期処理、外部呼出しの順序を記載してください。' }, { title: 'クラス・関数仕様', columns: ['名称', '入力', '出力', '処理・副作用'] }, { title: '状態・ライフサイクル', columns: ['状態', '遷移条件', '処理', '次の状態'] }, { title: 'データ・トランザクション', columns: ['処理', '参照・更新データ', '境界・整合性'] }, { title: '例外・再試行', columns: ['発生条件', '例外・戻り値', '再試行・補償'] }, { title: 'ログ・監査', columns: ['発生箇所', 'レベル', '記録内容・秘匿'] }, { title: '性能・並行性', columns: ['観点', '設計', '上限・確認方法'] },
])
const apiDesignContent = (title: string): ContentItem => specificationContent(title, 'APIの契約として、エンドポイント、入出力、認証、エラーと運用上の制約を定義します。', [
  { title: 'API概要', columns: ['項目', '内容', '補足'] }, { title: 'エンドポイント一覧', columns: ['API ID', 'Method', 'Path', '用途'] }, { title: '認証・認可', columns: ['対象', '認証方式', '必要権限', '失敗時'] }, { title: 'リクエスト仕様', columns: ['項目', '場所・型', '必須・制約', '例'] }, { title: 'レスポンス仕様', columns: ['状態', '項目・型', '説明', '例'] }, { title: 'エラー仕様', columns: ['HTTP', 'エラーコード', '条件', '利用側の対応'] }, { title: '整合性・冪等性', columns: ['操作', 'トランザクション', '冪等性・重複対策'] }, { title: '制限・互換性', columns: ['項目', '制限値・方針', '変更時の扱い'] }, { title: 'ログ・監視', columns: ['対象', '記録・指標', 'アラート条件'] },
])
const databaseDesignContent = (title: string): ContentItem => specificationContent(title, 'データ構造、関係、制約、索引、更新、移行と運用の方針を定義します。', [
  { title: 'データモデル概要', guidance: '主要エンティティ、関係、データの流れと正本を記載してください。' }, { title: 'エンティティ一覧', columns: ['エンティティ', '用途', '主キー', '関係'] }, { title: 'テーブル・項目定義', columns: ['テーブル.項目', '型・長さ', 'Null・既定値', '説明'] }, { title: 'キー・制約', columns: ['対象', '制約', '目的'] }, { title: 'インデックス', columns: ['対象', '列・順序', '対象クエリ', '注意点'] }, { title: '更新・トランザクション', columns: ['処理', '更新対象', '境界・ロック'] }, { title: 'データライフサイクル', columns: ['データ', '作成・更新', '保持', '削除・匿名化'] }, { title: '移行・マイグレーション', columns: ['変更', '適用手順', '互換性', '切戻し'] }, { title: '権限・監査', columns: ['主体', '権限', '監査・記録'] }, { title: '性能・容量', columns: ['対象', '見積り・上限', '監視・対策'] },
])
const iamDesignContent = (title: string): ContentItem => specificationContent(title, '人とサービスのID、認証、役割、最小権限、特権操作と監査を定義します。', [
  { title: 'ID・権限の原則', guidance: '最小権限、職務分離、個人ID、期限付き権限などの原則を記載してください。' }, { title: '利用主体一覧', columns: ['主体', '種別', '所属・用途', 'ライフサイクル'] }, { title: '認証方式', columns: ['対象', '認証方式', 'MFA・条件', '失敗・復旧'] }, { title: 'ロール・権限対応', columns: ['ロール', '対象資源', '許可操作', '付与条件'] }, { title: 'サービスID', columns: ['サービス', 'ID・ロール', '権限', '認証情報管理'] }, { title: '特権アクセス', columns: ['操作', '利用条件', '承認・期限', '記録'] }, { title: '権限申請・棚卸し', columns: ['契機', '申請・承認', '見直し頻度', '剥奪'] }, { title: 'シークレット管理', columns: ['対象', '保存先', '参照主体', '更新・失効'] }, { title: '監査', columns: ['操作', '監査ログ', '保存期間', '検知・確認'] },
])
const monitoringDesignContent = (title: string): ContentItem => specificationContent(title, 'サービス状態を把握し、異常を適切な担当へ通知して復旧につなげる監視を定義します。', [
  { title: 'サービス目標', columns: ['サービス・機能', 'SLI', 'SLO・基準', '測定期間'] }, { title: '監視対象一覧', columns: ['対象', '重要度', '監視方式', '責任者'] }, { title: 'メトリクス監視', columns: ['指標', '正常範囲', '警告', '重大'] }, { title: 'ログ監視', columns: ['ログ・イベント', '検知条件', '除外条件', '保存期間'] }, { title: '外形・死活監視', columns: ['対象', '確認内容', '頻度', '失敗判定'] }, { title: 'アラート・通知', columns: ['アラート', '重要度', '通知先・時間帯', '初動'] }, { title: 'ダッシュボード', columns: ['対象者', '表示内容', '利用場面'] }, { title: '可観測性データ管理', columns: ['データ', '収集・加工', '保持', '機密情報対策'] }, { title: '運用手順との連携', columns: ['アラート', 'Runbook', 'エスカレーション'] },
])
const backupDrContent = (title: string): ContentItem => specificationContent(title, '保護対象、復旧目標、バックアップ、復元と災害時の継続・復旧方法を定義します。', [
  { title: '復旧目標', columns: ['対象サービス', '重要度', 'RPO', 'RTO'] }, { title: '保護対象一覧', columns: ['データ・資源', '正本・場所', '保護方法', '責任者'] }, { title: 'バックアップ方針', columns: ['対象', '方式・頻度', '保持期間', '保存先'] }, { title: '暗号化・アクセス制御', columns: ['対象', '暗号化・鍵', '参照・復元権限'] }, { title: '復元手順', columns: ['対象', '開始条件', '復元・確認手順', '所要時間'] }, { title: '災害対策構成', guidance: '通常時と災害時の配置、データ複製、切替経路、依存サービスを記載してください。' }, { title: '切替・切戻し', columns: ['段階', '判断条件', '作業', '確認・責任者'] }, { title: '復旧テスト', columns: ['対象', '頻度', 'シナリオ', '合格基準'] }, { title: '保管・廃棄', columns: ['媒体・データ', '保管', '期限', '廃棄方法'] },
])
const infrastructureBasicDesignContent = (title: string): ContentItem => specificationContent(title, 'クラウド資源、ネットワーク、可用性、セキュリティと運用の基本方針を一冊で定義します。', [
  { title: '要求との対応', columns: ['要件ID', '設計方針', '対象資源'] },
  { title: '全体構成', guidance: '環境、クラウド資源、ネットワーク、外部接続と責任境界を図または文章で記載してください。' },
  { title: '環境・アカウント構成', columns: ['環境', 'アカウント・契約', '用途', '責任者'] },
  { title: 'クラウド資源一覧', columns: ['資源・サービス', '用途', '配置', '構成・サイズ'] },
  { title: 'ネットワーク構成', guidance: 'VPC・VNet、サブネット、拠点、外部接続、入口・出口と境界を記載してください。' },
  { title: 'アドレス・サブネット設計', columns: ['環境・セグメント', 'CIDR・範囲', '用途', '公開区分'] },
  { title: 'ルーティング・名前解決', columns: ['対象', '経路・解決先', '冗長化', '管理方法'] },
  { title: '通信制御', columns: ['送信元', '送信先', 'Protocol/Port', '許可理由'] },
  { title: '可用性・冗長化', columns: ['対象', '障害単位', '冗長化・切替', '目標'] },
  { title: '性能・容量', columns: ['対象', '想定負荷', '構成・上限', '拡張方法'] },
  { title: 'セキュリティ方針', columns: ['資産・境界', '脅威', 'アクセス・保護方針'] },
  { title: 'バックアップ・復旧方針', columns: ['対象', '方式・保持', 'RPO・RTO', '復旧方法'] },
  { title: '監視・ログ方針', columns: ['対象', '指標・ログ', '通知・保持', '確認方法'] },
  { title: '運用・保守方針', columns: ['作業', '実施方法', '責任者', '記録先'] },
  { title: 'コスト・ライフサイクル', columns: ['対象', '費用・契約', '更新・廃止方針'] },
])
type StandardTemplate = Omit<StandardDesignTemplate, 'required'> & { required?: boolean }
const builtInMasterTemplates: StandardTemplate[] = [
  { id: 'master-common-planning-project-plan', version: 2, name: 'プロジェクト計画書', description: '目的、範囲、体制、日程、品質、リスクを整理します。', domain: 'common', phase: 'planning', documentType: 'project-plan', create: planningContent },
  { id: 'master-common-requirements-requirements', version: 3, name: '要件定義書', description: '目的、対象範囲、利用者、機能・データ・連携要件と受入条件を整理します。', domain: 'common', phase: 'requirements', documentType: 'requirements', create: (title) => requirementsContent(title), createContent: requirementsDocumentContent },
  { id: 'master-common-requirements-non-functional', version: 3, name: '非機能要件定義書', description: '性能、可用性、セキュリティ、運用などの品質要件と判定基準を整理します。', domain: 'common', phase: 'requirements', documentType: 'non-functional', create: (title) => requirementsContent(title, true), createContent: nonFunctionalRequirementsContent },
  { id: 'master-common-implementation-policy', version: 2, name: '実装方針書', description: '実装規約、構成、品質と開発手順を整理します。', domain: 'common', phase: 'implementation', documentType: 'implementation-policy', create: implementationPolicyContent },
  { id: 'master-common-release-plan', version: 2, name: 'リリース計画書', description: 'リリース手順、判定、切戻し、体制を整理します。', domain: 'common', phase: 'release', documentType: 'release-plan', create: (title) => operationalContent(title, '安全にリリースするための対象、手順、判定条件、切戻し方法を定義します。') },
  { id: 'master-common-operation-procedure', version: 2, name: '運用手順書', description: '定常運用、監視、障害・復旧手順を整理します。', domain: 'common', phase: 'operation', documentType: 'operation-procedure', create: (title) => operationalContent(title, '日常運用と障害時の作業を、担当者が再現できる手順として定義します。') },
  { id: 'master-common-research', version: 2, name: '調査資料', description: '調査条件、結果、根拠、結論を整理します。', domain: 'common', phase: 'research', documentType: 'research', create: researchContent },
  { id: 'master-common-adr', version: 2, name: '設計判断記録（ADR）', description: '重要な設計判断と理由、影響を記録します。', domain: 'common', phase: 'common', documentType: 'adr', create: adrContent },
  { id: 'master-application-internal-design', version: 2, name: '内部設計書', description: 'モジュール、処理、データ、例外の詳細を整理します。', domain: 'application', phase: 'detailed-design', documentType: 'internal-design', create: internalDesignContent },
  { id: 'master-application-api-design', version: 2, name: 'API設計書', description: 'APIの入出力、認証、エラー、制約を整理します。', domain: 'application', phase: 'detailed-design', documentType: 'api-design', create: apiDesignContent },
  { id: 'master-application-table-design', version: 3, name: 'テーブル設計書', description: 'テーブル、カラム、制約、索引、運用を整理します。', domain: 'application', phase: 'detailed-design', documentType: 'table-design', create: databaseDesignContent },
  { id: 'master-application-test-specification', version: 2, name: 'テスト仕様書', description: '観点、ケース、期待結果、証跡を整理します。', domain: 'application', phase: 'test', documentType: 'test-specification', create: testContent },
  { id: 'master-infrastructure-basic-design', version: 4, name: 'インフラ基本設計書', description: 'クラウド構成とネットワーク設計を、ページで整理した一冊の基本設計書です。', domain: 'infrastructure', phase: 'basic-design', documentType: 'basic-design', create: infrastructureBasicDesignContent },
  { id: 'master-infrastructure-iam-design', version: 2, name: 'IAM・権限設計書', description: '主体、役割、権限、認証、監査を整理します。', domain: 'infrastructure', phase: 'detailed-design', documentType: 'iam-design', create: iamDesignContent },
  { id: 'master-infrastructure-monitoring-design', version: 2, name: '監視設計書', description: '監視対象、閾値、通知、初動を整理します。', domain: 'infrastructure', phase: 'detailed-design', documentType: 'monitoring-design', create: monitoringDesignContent },
  { id: 'master-infrastructure-backup-dr', version: 2, name: 'バックアップ・DR設計書', description: '保護対象、保持、復旧、災害対策を整理します。', domain: 'infrastructure', phase: 'detailed-design', documentType: 'backup-dr', create: backupDrContent },
  { id: 'master-infrastructure-operation-design', version: 2, name: '運用設計書', description: '運用体制、監視、保守、障害対応を整理します。', domain: 'infrastructure', phase: 'operation', documentType: 'operation-design', create: (title) => operationalContent(title, 'インフラの運用体制、監視、保守、障害対応、復旧手順を定義します。') },
  ...basicDesignMasterTemplates,
]
const blankCustomBasicTemplate: StandardTemplate = { id: 'blank-custom-basic-design', version: 1, name: '空の設計書', description: 'ページを追加しながら自由形式の基本設計書を作成します。', domain: 'application', phase: 'basic-design', documentType: 'custom', create: (title) => structuredContent(title, 'この設計書の目的と対象を記載してください。', [{ title: '文書概要', guidance: '目的、対象読者、記載範囲を記載してください。' }, { title: '変更履歴', columns: ['版', '変更内容', '更新者', '更新日'] }]) }
const isContentItem = (value: unknown): value is ContentItem => Boolean(value) && typeof value === 'object' && typeof (value as ContentItem).id === 'string' && typeof (value as ContentItem).navTitle === 'string' && Array.isArray((value as ContentItem).blocks)
const normalizeDesignContent = (value: unknown, fallbackTitle: string): DesignDocumentContent => {
  if (value && typeof value === 'object' && Array.isArray((value as DesignDocumentContent).pages)) {
    const pages = (value as DesignDocumentContent).pages.filter(isContentItem)
    if (pages.length) return { schemaVersion: 2, pages }
  }
  if (isContentItem(value)) return { schemaVersion: 2, pages: [value] }
  return { schemaVersion: 2, pages: [structuredContent(fallbackTitle, '設計内容を記載します。', documentOpeningSections)] }
}
type RuntimeMasterTemplate = StandardTemplate & { sortOrder: number; isActive: boolean; allowMultiple: boolean; createByDefault: boolean; standardCategoryKey: AIDesktopDesignPhase | null }
const fallbackMasterTemplates = (): RuntimeMasterTemplate[] => [...builtInMasterTemplates, blankCustomBasicTemplate].map((template) => ({
  ...template,
  sortOrder: documentTypeSortOrder(template.domain, template.documentType),
  isActive: true,
  allowMultiple: template.documentType === 'custom',
  createByDefault: Boolean(template.required),
  standardCategoryKey: template.phase,
}))
const hydrateMasterTemplates = (items: AIDesktopDesignMasterTemplate<unknown>[]): RuntimeMasterTemplate[] => items.map((item) => {
  const builtIn = [...builtInMasterTemplates, blankCustomBasicTemplate].find((template) => template.id === item.id)
  const databaseContent = item.content ? normalizeDesignContent(item.content, item.name) : null
  return {
    ...(builtIn ?? blankCustomBasicTemplate),
    id: item.id,
    name: item.name,
    description: item.description,
    domain: item.domain,
    phase: item.phase,
    documentType: item.documentType,
    version: item.version,
    required: item.createByDefault,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
    allowMultiple: item.allowMultiple,
    createByDefault: item.createByDefault,
    standardCategoryKey: item.standardCategoryKey,
    ...(databaseContent ? { createContent: () => structuredClone(databaseContent) } : {}),
  }
})
const contentFromMaster = (template: StandardTemplate, title: string): DesignDocumentContent => template.createContent ? template.createContent(title) : template.phase === 'basic-design' ? createStandardDesignContent(template as StandardDesignTemplate, title) : { schemaVersion: 2, pages: [template.create(title)] }
const cloneContent = (content: unknown, title: string): DesignDocumentContent => {
  const sourcePages = normalizeDesignContent(structuredClone(content), title).pages
  const pageIds = new Map(sourcePages.map((page) => [page.id, uid('page')]))
  return {
    schemaVersion: 2,
    pages: sourcePages.map((page) => ({
      ...page,
      id: pageIds.get(page.id)!,
      parentId: page.parentId ? pageIds.get(page.parentId) : undefined,
    })),
  }
}
const documentInput = (value: AIDesktopDesignDocument<unknown>): AIDesktopDesignDocumentInput<DesignDocumentContent> => ({ projectId: value.projectId, categoryId: value.categoryId, title: value.title, domain: value.domain, phase: value.phase, documentType: value.documentType, templateId: value.templateId, templateVersion: value.templateVersion, status: value.status, content: normalizeDesignContent(value.content, value.title) })
const dateLabel = (value: number) => new Intl.DateTimeFormat('ja-JP').format(value)
const documentPageNumber = (pages: ContentItem[], page: ContentItem, index: number) => {
  if (!page.parentId) return String(pages.slice(0, index + 1).filter((candidate) => !candidate.parentId).length).padStart(2, '0')
  const parentIndex = pages.findIndex((candidate) => candidate.id === page.parentId)
  if (parentIndex < 0) return String(index + 1).padStart(2, '0')
  const parentNumber = pages.slice(0, parentIndex + 1).filter((candidate) => !candidate.parentId).length
  const childNumber = pages.slice(parentIndex + 1, index + 1).filter((candidate) => candidate.parentId === page.parentId).length
  return `${parentNumber}.${childNumber}`
}
type ProjectSection = 'workspace' | 'templates' | 'deliverables'

function ProjectTabs({ current, onNavigate }: { current: ProjectSection; onNavigate: (destination: ProjectSection) => void }) {
  return <div className="ad-design-project-tabs" aria-label="プロジェクト内メニュー"><button type="button" className={current === 'workspace' ? 'active' : ''} onClick={() => onNavigate('workspace')}>ドキュメント</button><button type="button" className={current === 'templates' ? 'active' : ''} onClick={() => onNavigate('templates')}>テンプレート</button><button type="button" className={current === 'deliverables' ? 'active' : ''} onClick={() => onNavigate('deliverables')}>成果物・納品</button></div>
}

function ProjectSectionHeader({ projectName, title, current, breadcrumbSuffix, onBack, onNavigate }: { projectName: string; title: string; current: ProjectSection; breadcrumbSuffix?: string; onBack: () => void; onNavigate: (destination: ProjectSection) => void }) {
  return <AppHeader className="ad-design-workspace-header" breadcrumb={<>ドキュメント ＞ {projectName}{breadcrumbSuffix ? ` ＞ ${breadcrumbSuffix}` : ''}</>} title={title} titleAs="h2" actions={<nav className="ad-design-toolbar"><button onClick={onBack}>← プロジェクト一覧</button><ProjectTabs current={current} onNavigate={onNavigate} /></nav>} />
}

// リロードしても同じ画面に戻れるよう、開いている画面だけをタブ単位で保つ。編集モードは保たず、閲覧で開き直す。
type DocumentsScreen = 'projects' | 'workspace' | 'document' | 'file' | 'master-templates' | 'templates' | 'project-template-picker' | 'template-edit' | 'deliverables'
type DocumentsSession = { screen: DocumentsScreen; projectId: string | null; categoryFilter: string; selectedId: string | null }
const documentsScreens = new Set<string>(['projects', 'workspace', 'document', 'file', 'master-templates', 'templates', 'project-template-picker', 'template-edit', 'deliverables'])
const isDocumentsSession = (value: unknown): value is DocumentsSession => isRecordValue(value) && documentsScreens.has(String(value.screen)) && (value.projectId === null || typeof value.projectId === 'string') && typeof value.categoryFilter === 'string' && (value.selectedId === null || typeof value.selectedId === 'string')
// テンプレートの編集中は内容を保たないため、テンプレート一覧へ戻す。
const restoredScreen = (session: DocumentsSession | null): DocumentsScreen => !session ? 'projects' : session.screen === 'template-edit' ? 'templates' : session.screen

export type DesignDocumentsProjectRequest = { projectId: string; sequence: number }

const LAST_POSITION_STORAGE_KEY = 'hundred.aiDesktop.documents.lastPosition'
type LastDocumentsPosition = { projectId: string | null; categoryByProject: Record<string, string> }
const readLastPosition = (): LastDocumentsPosition => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LAST_POSITION_STORAGE_KEY) ?? 'null')
    if (value && typeof value === 'object') {
      const { projectId, categoryByProject } = value as Partial<LastDocumentsPosition>
      return { projectId: typeof projectId === 'string' ? projectId : null, categoryByProject: categoryByProject && typeof categoryByProject === 'object' ? categoryByProject : {} }
    }
  } catch { /* 保存できない環境では前回位置を復元しない。 */ }
  return { projectId: null, categoryByProject: {} }
}
const writeLastPosition = (projectId: string, categoryId: string) => {
  try {
    const current = readLastPosition()
    localStorage.setItem(LAST_POSITION_STORAGE_KEY, JSON.stringify({ projectId, categoryByProject: { ...current.categoryByProject, [projectId]: categoryId } }))
  } catch { /* 保存できない環境では前回位置を保存しない。 */ }
}
const rememberedCategory = (projectId: string, categories: AIDesktopDesignCategory[], documents: AIDesktopDesignDocumentSummary[]) => {
  const saved = readLastPosition().categoryByProject[projectId]
  if (saved === 'uncategorized') return documents.some((item) => item.projectId === projectId && !item.categoryId) ? saved : 'all'
  return saved && categories.some((item) => item.id === saved && item.projectId === projectId) ? saved : 'all'
}

export default function DesignDocumentsApp({ canManage, projectRequest }: { canManage: boolean; projectRequest: DesignDocumentsProjectRequest | null }) {
  const [projects, setProjects] = useState<AIDesktopProjectSummary[]>([])
  const [documents, setDocuments] = useState<AIDesktopDesignDocumentSummary[]>([])
  const [categories, setCategories] = useState<AIDesktopDesignCategory[]>([])
  const [templates, setTemplates] = useState<AIDesktopDesignTemplate<DesignDocumentContent>[]>([])
  const [includeAiPrompt, setIncludeAiPrompt] = useState(false)
  const [masterTemplates, setMasterTemplates] = useState<RuntimeMasterTemplate[]>(fallbackMasterTemplates)
  const [restoredSession] = useState(() => readAIDesktopSessionState('documents', isDocumentsSession))
  const [screen, setScreen] = useState<DocumentsScreen>(() => restoredScreen(restoredSession))
  const [projectId, setProjectId] = useState<string | null>(restoredSession?.projectId ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(restoredSession?.selectedId ?? null)
  const [document, setDocument] = useState<AIDesktopDesignDocument<DesignDocumentContent> | null>(null)
  const [draft, setDraft] = useState<AIDesktopDesignDocumentInput<DesignDocumentContent> | null>(null)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState('')
  const [jsonImportPending, setJsonImportPending] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'uncategorized' | string>(restoredSession?.categoryFilter ?? 'all')
  useAIDesktopSessionStateSaver('documents', { screen, projectId, categoryFilter, selectedId })
  const [loaded, setLoaded] = useState(false)
  const [appliedRequestSequence, setAppliedRequestSequence] = useState<number | null>(null)
  const [deliverySelectionMode, setDeliverySelectionMode] = useState(false)
  const [deliveryDocumentIds, setDeliveryDocumentIds] = useState<string[]>([])
  const [deliverySeedIds, setDeliverySeedIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [savingDocument, setSavingDocument] = useState(false)
  const [exportingAgents, setExportingAgents] = useState(false)
  const [agentFolderName, setAgentFolderName] = useState<string | null>(null)
  const [agentPendingCount, setAgentPendingCount] = useState<number | null>(null)
  const [createMode, setCreateMode] = useState<'template' | 'file'>('template')
  const [createFile, setCreateFile] = useState<File | null>(null)
  const [fileTitle, setFileTitle] = useState('')
  const [fileCategoryId, setFileCategoryId] = useState<string | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [creatingDocument, setCreatingDocument] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('文書管理')
  const [createDomain, setCreateDomain] = useState<AIDesktopDesignDomain>('common')
  const [createPhase, setCreatePhase] = useState<AIDesktopDesignPhase>('basic-design')
  const [createType, setCreateType] = useState('document-management')
  const [createTemplateId, setCreateTemplateId] = useState('master-common-basic-document-management')
  const [createCategoryId, setCreateCategoryId] = useState<string | null>(null)
  const [categoryWizardOpen, setCategoryWizardOpen] = useState(false)
  const [categoryWizardMode, setCategoryWizardMode] = useState<'standard' | 'custom'>('standard')
  const [selectedStandardKeys, setSelectedStandardKeys] = useState<AIDesktopDesignPhase[]>([])
  const [categoryWizardStep, setCategoryWizardStep] = useState(0)
  const [selectedMasterIds, setSelectedMasterIds] = useState<Record<string, string[]>>({})
  const [customCategoryName, setCustomCategoryName] = useState('')
  const [creatingCategories, setCreatingCategories] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<AIDesktopDesignTemplate<DesignDocumentContent> | null>(null)
  const [templateDraft, setTemplateDraft] = useState<AIDesktopDesignTemplateInput<DesignDocumentContent> | null>(null)
  const [activeTemplatePageId, setActiveTemplatePageId] = useState<string | null>(null)
  const normalizeTemplates = (items: AIDesktopDesignTemplate<unknown>[]) => items.map((item) => ({ ...item, content: normalizeDesignContent(item.content, item.name) }))
  const refresh = async () => {
    const [p, d, t, c] = await Promise.all([listAIDesktopProjects(), listAIDesktopDesignDocuments(), listAIDesktopDesignTemplates<unknown>(), listAIDesktopDesignCategories()])
    setProjects(p.projects)
    setDocuments(d.documents)
    setTemplates(normalizeTemplates(t.templates))
    setCategories(c.categories)
    const m = await listAIDesktopDesignMasterTemplates<unknown>().catch(() => null)
    setMasterTemplates(m ? hydrateMasterTemplates(m.masterTemplates) : fallbackMasterTemplates())
  }

  useEffect(() => {
    if (!canManage) return
    let active = true
    void Promise.all([listAIDesktopProjects(), listAIDesktopDesignDocuments(), listAIDesktopDesignTemplates<unknown>(), listAIDesktopDesignCategories()]).then(([p, d, t, c]) => {
      if (!active) return
      setProjects(p.projects)
      setDocuments(d.documents)
      setTemplates(normalizeTemplates(t.templates))
      setCategories(c.categories)
      setLoaded(true)
      if (restoredSession) {
        // リロード前のプロジェクトが削除されていた場合は、プロジェクト一覧へ戻す。
        if (restoredSession.projectId && !p.projects.some((item) => item.id === restoredSession.projectId)) { setProjectId(null); setSelectedId(null); setScreen('projects') }
      } else {
        const last = readLastPosition().projectId
        if (last && p.projects.some((item) => item.id === last)) { setProjectId(last); setCategoryFilter(rememberedCategory(last, c.categories, d.documents)); setScreen('workspace') }
      }
      void listAIDesktopDesignMasterTemplates<unknown>().then((m) => {
        if (active) setMasterTemplates(hydrateMasterTemplates(m.masterTemplates))
      }).catch(() => {
        if (active) setMasterTemplates(fallbackMasterTemplates())
      })
    }).catch((error) => showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.listFailed)))
    return () => { active = false }
  }, [canManage, restoredSession])
  const showLoadedDocument = (value: AIDesktopDesignDocument<unknown>) => { setFileTitle(value.title); setFileCategoryId(value.categoryId); const input = documentInput(value); setDocument({ ...value, content: input.content }); setDraft(input); setActivePageId(input.content.pages[0]?.id ?? null); setSnapshot(JSON.stringify(input)); setJsonImportPending(false) }
  useEffect(() => { if (projectId) writeLastPosition(projectId, categoryFilter) }, [projectId, categoryFilter])
  // 別ウィンドウで作成した直後のプロジェクトは一覧に無いため、取得し直してから切り替える。
  useEffect(() => { if (!projectRequest || !loaded || projects.some((item) => item.id === projectRequest.projectId)) return; let active = true; void listAIDesktopProjects().then((p) => { if (active) setProjects(p.projects) }).catch(() => undefined); return () => { active = false } }, [projectRequest, loaded]) // eslint-disable-line react-hooks/exhaustive-deps
  // 取り込んだPDFは、画面内でプレビューできるよう一時的なURLにする。
  useEffect(() => { if (screen !== 'file' || !document || document.id !== selectedId || document.format !== 'pdf') return; let active = true; let url: string | null = null; void fetchAIDesktopDesignDocumentFile(document.id).then((blob) => { if (!active) return; url = URL.createObjectURL(blob); setFilePreviewUrl(url) }).catch(() => undefined); return () => { active = false; if (url) URL.revokeObjectURL(url); setFilePreviewUrl(null) } }, [screen, document?.id, document?.format, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps
  // 編集画面を開いている間は20秒ごとにロックを延長する。画面を離れるとロックを外す。
  // ブラウザを閉じた場合などはWorker側で60秒後に自動で外れる。
  const editingDocumentId = screen === 'document' && mode === 'edit' && document?.canEdit ? document.id : null
  useEffect(() => {
    if (!editingDocumentId) return
    let active = true
    let lostNotified = false
    let accessToken: string | null = null
    // 延長と解除の通知は必ず順番に送る。順番が入れ替わると、外したロックが延長で作り直されてしまう。
    let pending: Promise<unknown> = Promise.resolve()
    const beat = () => {
      pending = pending.then(async () => {
        if (!active) return
        accessToken = await getAIDesktopAccessToken().catch(() => accessToken)
        await markAIDesktopDesignDocumentEditing(editingDocumentId)
        lostNotified = false
      }).catch((error: { code?: string; lockedBy?: string }) => {
        if (!active || error.code !== 'LOCKED' || lostNotified) return
        lostNotified = true
        setDocument((current) => current && current.id === editingDocumentId ? { ...current, editingBy: error.lockedBy ? [error.lockedBy] : current.editingBy } : current)
        showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.designDocument.lockLost(error.lockedBy ?? 'ほかのメンバー'))
      })
    }
    // 裏側のタブではタイマーが間引かれるため、画面に戻ったときにもすぐ延長する。
    const beatWhenVisible = () => { if (window.document.visibilityState === 'visible') beat() }
    // タブを閉じる・再読み込みするときもロックを外す。戻ってきた場合は、画面の表示時に延長し直す。
    const releaseOnExit = () => { if (accessToken) releaseAIDesktopDesignDocumentEditingOnExit(editingDocumentId, accessToken) }
    beat()
    const timer = window.setInterval(beat, 20_000)
    window.document.addEventListener('visibilitychange', beatWhenVisible)
    window.addEventListener('pagehide', releaseOnExit)
    return () => {
      active = false
      window.clearInterval(timer)
      window.document.removeEventListener('visibilitychange', beatWhenVisible)
      window.removeEventListener('pagehide', releaseOnExit)
      void pending.finally(() => clearAIDesktopDesignDocumentEditing(editingDocumentId).catch(() => undefined))
    }
  }, [editingDocumentId])
  // 控えを利用者ごとに分けるため、サインイン中の利用者IDを一度だけ取得する。
  const backupOwnerRef = useRef<Promise<string | null> | null>(null)
  const backupOwner = () => (backupOwnerRef.current ??= getAIDesktopCurrentUserId().catch(() => null))
  const withBackupOwner = (task: (owner: string) => void) => { void backupOwner().then((owner) => { if (owner) task(owner) }) }
  useEffect(() => { pruneDocumentBackups() }, [])
  // 編集を始める前にロックを取る。ほかの人がロック中なら閲覧のままにする。
  // ロックしている人の接続が一定時間途絶えている場合は、確認のうえで引き継げる。
  const acquireEditLock = async (documentId: string) => {
    const markLock = (lock: AIDesktopDesignDocument<DesignDocumentContent>['editingLock'], names: string[]) => setDocument((current) => current && current.id === documentId ? { ...current, editingBy: names, editingLock: lock } : current)
    try { await markAIDesktopDesignDocumentEditing(documentId); markLock(null, []); return true } catch (error) {
      const { code, lockedBy, lastSeenAt, canTakeOver } = error as { code?: string; lockedBy?: string; lastSeenAt?: number; canTakeOver?: boolean }
      if (code !== 'LOCKED') { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.loadFailed)); return false }
      const name = lockedBy ?? 'ほかのメンバー'
      markLock(lastSeenAt ? { name, lastSeenAt, canTakeOver: Boolean(canTakeOver) } : null, [name])
      if (!canTakeOver || !lastSeenAt) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.designDocument.lockedByOther(name)); return false }
      if (!(await confirmAIDesktop({ title: AI_DESKTOP_MESSAGES.designDocument.takeoverTitle(name), message: AI_DESKTOP_MESSAGES.designDocument.takeoverMessage(name, timeLabel(lastSeenAt)), confirmLabel: '引き継ぐ', tone: 'danger' }))) return false
      try { await markAIDesktopDesignDocumentEditing(documentId, true); markLock(null, []); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDocument.takenOver); return true } catch (retryError) { showAIDesktopNotification('error', localizedErrorMessage(retryError, AI_DESKTOP_MESSAGES.designDocument.loadFailed)); return false }
    }
  }
  const startEditing = async () => { if (document && await acquireEditLock(document.id)) setMode('edit') }
  // 一覧から文書を開く。同じ文書を開き直す場合も、ほかの人の更新を反映し、控えの確認を出すためにサーバーから読み直す。
  const openDocument = (item: AIDesktopDesignDocumentSummary) => {
    setScreen(item.format === 'document' ? 'document' : 'file')
    setMode('view')
    if (item.id !== selectedId) { setBusy(true); setSelectedId(item.id); return }
    setBusy(true)
    void getAIDesktopDesignDocument<unknown>(item.id).then(({ document: value }) => { showLoadedDocument(value); void offerBackupRestore(value) }).catch((error) => { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.loadFailed)); setSelectedId(null); setScreen('workspace') }).finally(() => setBusy(false))
  }
  // 文書を開いたときに控えが残っていれば、復元するか確認する。
  const offerBackupRestore = async (value: AIDesktopDesignDocument<unknown>) => {
    if (value.format !== 'document') return
    const owner = await backupOwner()
    if (!owner) return
    const backup = readDocumentBackup(owner, value.id)
    if (!backup) return
    if (JSON.stringify(backup.draft) === JSON.stringify(documentInput(value))) { clearDocumentBackup(owner, value.id); return }
    if (!(await confirmAIDesktop({ title: AI_DESKTOP_MESSAGES.designDocument.backupTitle, message: AI_DESKTOP_MESSAGES.designDocument.backupMessage(timeLabel(backup.savedAt), backup.baseUpdatedAt !== value.updatedAt), confirmLabel: '復元', cancelLabel: 'あとで' }))) return
    if (!(await acquireEditLock(value.id))) return
    // 復元した時点で古い控えは破棄する。保存するまでは、編集中の内容として新しく控え直す。
    clearDocumentBackup(owner, value.id)
    setDraft(backup.draft)
    setActivePageId(backup.draft.content.pages[0]?.id ?? null)
    setMode('edit')
    showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDocument.backupRestored)
  }
  // 一覧を開いている間は、ほかのメンバーの更新や編集中の状態を定期的に取り込む。
  useEffect(() => {
    if (screen !== 'workspace' || !canManage) return
    const timer = window.setInterval(() => { void listAIDesktopDesignDocuments().then((result) => setDocuments(result.documents)).catch(() => undefined) }, 30_000)
    return () => window.clearInterval(timer)
  }, [screen, canManage])
  useEffect(() => { if (!selectedId || !canManage) return; let active = true; void getAIDesktopDesignDocument<unknown>(selectedId).then(({ document: value }) => { if (!active) return; showLoadedDocument(value); setMode('view'); void offerBackupRestore(value) }).catch((error) => { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.loadFailed)); if (!active) return; setSelectedId(null); setScreen((current) => current === 'document' || current === 'file' ? 'workspace' : current) }).finally(() => { if (active) setBusy(false) }); return () => { active = false } }, [selectedId, canManage]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeMasterTemplates = masterTemplates.filter((item) => item.isActive)
  const runtimeTypeOptionsForPhase = (itemPhase: AIDesktopDesignPhase) => activeMasterTemplates.filter((item) => item.phase === itemPhase).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'ja')).map((item) => ({ key: `${item.domain}:${item.documentType}`, domain: item.domain, type: item.documentType, label: item.name, sortOrder: item.sortOrder }))
  const runtimeTypesForPhase = (itemDomain: AIDesktopDesignDomain, itemPhase: AIDesktopDesignPhase) => runtimeTypeOptionsForPhase(itemPhase).filter((item) => item.domain === itemDomain)
  const runtimePhasesForDomain = (itemDomain: AIDesktopDesignDomain) => phases.filter((itemPhase) => runtimeTypesForPhase(itemDomain, itemPhase).length > 0)
  const runtimeTypeLabel = (itemDomain: AIDesktopDesignDomain, itemType: string) => masterTemplates.find((item) => item.domain === itemDomain && item.documentType === itemType)?.name ?? typeLabel(itemDomain, itemType)
  const runtimeSortOrder = (itemDomain: AIDesktopDesignDomain, itemPhase: AIDesktopDesignPhase, itemType: string) => masterTemplates.find((item) => item.domain === itemDomain && item.phase === itemPhase && item.documentType === itemType)?.sortOrder ?? documentTypeSortOrder(itemDomain, itemType)
  const compareRuntimeItems = (left: { domain: AIDesktopDesignDomain; phase: AIDesktopDesignPhase; documentType: string; title?: string; name?: string }, right: { domain: AIDesktopDesignDomain; phase: AIDesktopDesignPhase; documentType: string; title?: string; name?: string }) => navigationPhases.indexOf(left.phase) - navigationPhases.indexOf(right.phase) || runtimeSortOrder(left.domain, left.phase, left.documentType) - runtimeSortOrder(right.domain, right.phase, right.documentType) || (left.title ?? left.name ?? '').localeCompare(right.title ?? right.name ?? '', 'ja', { numeric: true })
  const normalizeRuntimeClassification = (itemDomain: AIDesktopDesignDomain, requestedPhase: AIDesktopDesignPhase, requestedType: string) => { const availablePhases = runtimePhasesForDomain(itemDomain); const normalizedPhase = availablePhases.includes(requestedPhase) ? requestedPhase : availablePhases[0]; const availableTypes = runtimeTypesForPhase(itemDomain, normalizedPhase); return { phase: normalizedPhase, documentType: availableTypes.some((item) => item.type === requestedType) ? requestedType : availableTypes[0]?.type ?? requestedType } }
  const project = projects.find((item) => item.id === projectId) ?? null
  const projectDocuments = documents.filter((item) => item.projectId === projectId).sort(compareRuntimeItems)
  const projectCategories = categories.filter((item) => item.projectId === projectId).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'ja'))
  const selectedCategory = projectCategories.find((item) => item.id === categoryFilter) ?? null
  const draftCategoryName = projectCategories.find((item) => item.id === draft?.categoryId)?.name ?? '未分類'
  const filtered = projectDocuments.filter((item) => (categoryFilter === 'all' || (categoryFilter === 'uncategorized' ? !item.categoryId : item.categoryId === categoryFilter)) && (!query.trim() || `${item.title} ${item.updatedByName}`.toLowerCase().includes(query.trim().toLowerCase())))
  const eligibleDeliveryDocuments = filtered
  const allEligibleSelected = eligibleDeliveryDocuments.length > 0 && eligibleDeliveryDocuments.every((item) => deliveryDocumentIds.includes(item.id))
  const hasUncategorizedDocuments = projectDocuments.some((item) => !item.categoryId)
  const needsCategorySelection = categoryFilter === 'all' && !deliverySelectionMode
  const projectTemplates = templates.filter((item) => item.projectId === projectId).sort(compareRuntimeItems)
  const nextMultipleDesignTitle = (master: RuntimeMasterTemplate) => {
    const sameTypeDocuments = projectDocuments.filter((item) => item.domain === master.domain && item.phase === master.phase && item.documentType === master.documentType)
    const greatestNumber = sameTypeDocuments.reduce((greatest, item) => {
      const suffix = item.title.startsWith(master.name) ? item.title.slice(master.name.length).trim() : ''
      return Math.max(greatest, /^\d+$/u.test(suffix) ? Number(suffix) : 0)
    }, sameTypeDocuments.length)
    return `${master.name} ${String(greatestNumber + 1).padStart(2, '0')}`
  }
  const selectedCreateMaster = activeMasterTemplates.find((item) => item.domain === createDomain && item.phase === createPhase && item.documentType === createType)
  const designDocumentConflict = projectDocuments.some((item) => item.domain === createDomain && item.phase === createPhase && item.documentType === createType && (!selectedCreateMaster?.allowMultiple || item.title.trim().toLocaleLowerCase() === createTitle.trim().toLocaleLowerCase()))
  const createTypeOptions = runtimeTypeOptionsForPhase(createPhase)
  const availableCreatePhases = navigationPhases.filter((itemPhase) => runtimeTypeOptionsForPhase(itemPhase).length > 0)
  const dirty = draft ? jsonImportPending || JSON.stringify(draft) !== snapshot : false
  // 編集中は、保存していない内容を少し待ってからブラウザに控える。
  useEffect(() => {
    if (mode !== 'edit' || !document || !draft || !dirty) return
    const timer = window.setTimeout(() => withBackupOwner((owner) => writeDocumentBackup(owner, document.id, { draft, baseUpdatedAt: document.updatedAt, savedAt: Date.now() })), 1500)
    return () => window.clearTimeout(timer)
  }, [mode, document, draft, dirty]) // eslint-disable-line react-hooks/exhaustive-deps
  const navigateProjectSection = (destination: ProjectSection) => { if (destination === 'deliverables') setDeliverySeedIds([]); setScreen(destination) }
  const chooseProject = (id: string) => { setProjectId(id); setCategoryFilter(rememberedCategory(id, categories, documents)); setQuery(''); setDeliverySelectionMode(false); setDeliveryDocumentIds([]); setDeliverySeedIds([]); setScreen('workspace') }
  // プロジェクトから「ドキュメントを開く」で渡された対象へ、描画中に一度だけ切り替える。編集中の未保存内容は優先して残す。
  if (projectRequest && projectRequest.sequence !== appliedRequestSequence && loaded && projects.some((item) => item.id === projectRequest.projectId) && !(screen === 'document' && dirty)) {
    setAppliedRequestSequence(projectRequest.sequence)
    chooseProject(projectRequest.projectId)
  }
  const openCreateDialog = () => {
    setCreateMode('template')
    setCreateFile(null)
    const selectedPhase = selectedCategory?.standardKey ?? 'basic-design'
    changeCreate(selectedPhase, '')
    setCreateCategoryId(selectedCategory?.id ?? null)
    setCreateOpen(true)
  }
  const toggleDeliveryDocument = (id: string) => setDeliveryDocumentIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  const toggleAllDeliveryDocuments = () => setDeliveryDocumentIds((current) => allEligibleSelected ? current.filter((id) => !eligibleDeliveryDocuments.some((document) => document.id === id)) : [...new Set([...current, ...eligibleDeliveryDocuments.map((document) => document.id)])])
  const beginDeliverySelection = () => { setDeliveryDocumentIds([]); setDeliverySelectionMode(true) }
  const beginDeliveryFromHistory = () => { setCategoryFilter('all'); setDeliveryDocumentIds([]); setDeliverySelectionMode(true); setScreen('workspace') }
  const cancelDeliverySelection = () => { setDeliveryDocumentIds([]); setDeliverySelectionMode(false) }
  const createDeliveryFromSelection = () => { if (!deliveryDocumentIds.length) return; setDeliverySeedIds(deliveryDocumentIds); setDeliverySelectionMode(false); setScreen('deliverables') }
  const changeCreate = (requestedPhase: AIDesktopDesignPhase, requestedKey: string) => { const options = runtimeTypeOptionsForPhase(requestedPhase); const selected = options.find((item) => item.key === requestedKey) ?? options[0]; if (!selected) return; setCreateDomain(selected.domain); setCreatePhase(requestedPhase); setCreateType(selected.type); const master = activeMasterTemplates.find((item) => item.domain === selected.domain && item.phase === requestedPhase && item.documentType === selected.type); setCreateTitle(master?.allowMultiple ? nextMultipleDesignTitle(master) : master?.name ?? `${phaseLabels[requestedPhase]}書`); setCreateTemplateId(master?.id ?? '') }
  const availableTemplates = [...activeMasterTemplates, ...projectTemplates].filter((item) => item.domain === createDomain && item.phase === createPhase && item.documentType === createType)

  const createDocument = async () => { if (!projectId || !createTitle.trim() || designDocumentConflict || creatingDocument) return; const chosen = availableTemplates.find((item) => item.id === createTemplateId) ?? availableTemplates[0]; if (!chosen) return; const content = 'content' in chosen ? cloneContent(chosen.content, createTitle.trim()) : contentFromMaster(chosen, createTitle.trim()); setCreatingDocument(true); try { const result = await createAIDesktopDesignDocument<DesignDocumentContent>({ projectId, categoryId: createCategoryId, title: createTitle.trim(), domain: createDomain, phase: createPhase, documentType: createType, templateId: chosen.id, templateVersion: chosen.version, status: 'draft', content }); setCreateOpen(false); await refresh(); setSelectedId(result.document.id); setScreen('document'); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDocument.created) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.createFailed)) } finally { setCreatingDocument(false) } }

  const openCategoryWizard = () => {
    setCategoryWizardMode('standard')
    setSelectedStandardKeys([])
    setSelectedMasterIds({})
    setCategoryWizardStep(0)
    setCustomCategoryName('')
    setCategoryWizardOpen(true)
  }
  const beginCategoryTemplateSelection = () => {
    const ordered = standardCategoryDefinitions.filter((item) => selectedStandardKeys.includes(item.key)).map((item) => item.key)
    if (!ordered.length) return
    setSelectedStandardKeys(ordered)
    setSelectedMasterIds(Object.fromEntries(ordered.map((key) => [key, activeMasterTemplates.filter((master) => master.standardCategoryKey === key && master.createByDefault && !projectDocuments.some((document) => document.domain === master.domain && document.phase === master.phase && document.documentType === master.documentType)).map((master) => master.id)])))
    setCategoryWizardStep(1)
  }
  const toggleWizardMaster = (categoryKey: AIDesktopDesignPhase, masterId: string) => setSelectedMasterIds((current) => ({ ...current, [categoryKey]: (current[categoryKey] ?? []).includes(masterId) ? (current[categoryKey] ?? []).filter((id) => id !== masterId) : [...(current[categoryKey] ?? []), masterId] }))
  const finishStandardCategories = async () => {
    if (!projectId || creatingCategories) return
    setCreatingCategories(true)
    let createdDocumentCount = 0
    try {
      for (const key of selectedStandardKeys) {
        const definition = standardCategoryDefinitions.find((item) => item.key === key)!
        const result = await createAIDesktopDesignCategory({ projectId, name: definition.name, standardKey: key, sortOrder: definition.sortOrder })
        const masters = activeMasterTemplates.filter((master) => (selectedMasterIds[key] ?? []).includes(master.id))
        for (const master of masters) {
          await createAIDesktopDesignDocument({ projectId, categoryId: result.category.id, title: master.allowMultiple ? nextMultipleDesignTitle(master) : master.name, domain: master.domain, phase: master.phase, documentType: master.documentType, templateId: master.id, templateVersion: master.version, status: 'draft', content: contentFromMaster(master, master.name) })
          createdDocumentCount += 1
        }
      }
      setCategoryWizardOpen(false)
      await refresh()
      showAIDesktopNotification('success', `カテゴリ${selectedStandardKeys.length}件とドキュメント${createdDocumentCount}件を作成しました。`)
    } catch (error) {
      await refresh()
      showAIDesktopNotification('error', localizedErrorMessage(error, 'カテゴリまたはドキュメントを作成できませんでした。'))
    } finally { setCreatingCategories(false) }
  }
  const finishCustomCategory = async () => {
    if (!projectId || !customCategoryName.trim() || creatingCategories) return
    setCreatingCategories(true)
    try {
      const nextSort = Math.max(0, ...projectCategories.map((item) => item.sortOrder)) + 10
      const result = await createAIDesktopDesignCategory({ projectId, name: customCategoryName.trim(), standardKey: null, sortOrder: nextSort })
      setCategoryWizardOpen(false)
      await refresh()
      setCategoryFilter(result.category.id)
      showAIDesktopNotification('success', 'カテゴリを作成しました。')
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, 'カテゴリを作成できませんでした。'))
    } finally { setCreatingCategories(false) }
  }
  const saveDocument = async () => { if (!document || !draft || !draft.title.trim() || savingDocument) return; setSavingDocument(true); try { const input = { ...draft, title: draft.title.trim() }; const result = await updateAIDesktopDesignDocument(document.id, input, document.updatedAt); withBackupOwner((owner) => clearDocumentBackup(owner, document.id)); const saved = documentInput(result.document); setDocument({ ...result.document, content: saved.content }); setDraft(saved); setSnapshot(JSON.stringify(saved)); setJsonImportPending(false); await refresh(); setMode('view'); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDocument.saved) } catch (error) {
    if ((error as { code?: string }).code === 'STALE') {
      // ほかの画面で保存された内容を上書きしない。読み込み直すかどうかは利用者が決める。
      if (!(await confirmAIDesktop({ title: AI_DESKTOP_MESSAGES.designDocument.staleTitle, message: AI_DESKTOP_MESSAGES.designDocument.staleConfirm, confirmLabel: '最新を読み込む', cancelLabel: '編集を続ける' }))) { showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.designDocument.staleKept); return }
      try { const { document: latest } = await getAIDesktopDesignDocument<unknown>(document.id); withBackupOwner((owner) => clearDocumentBackup(owner, document.id)); showLoadedDocument(latest); await refresh(); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDocument.reloaded) } catch (reloadError) { showAIDesktopNotification('error', localizedErrorMessage(reloadError, AI_DESKTOP_MESSAGES.designDocument.loadFailed)) }
      return
    }
    showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.saveFailed))
  } finally { setSavingDocument(false) } }
  const removeDocument = async () => { if (!document || !(await confirmAIDesktop({ title: `「${document.title}」を削除しますか？`, confirmLabel: '削除', tone: 'danger' }))) return; setBusy(true); try { await deleteAIDesktopDesignDocument(document.id); await refresh(); setDocument(null); setDraft(null); setSelectedId(null); setScreen('workspace'); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDocument.deleted) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.deleteFailed)) } finally { setBusy(false) } }
  const createFromFile = async () => { if (!projectId || !createFile || !createTitle.trim() || creatingDocument) return; setCreatingDocument(true); try { const result = await uploadAIDesktopDesignDocumentFile({ projectId, categoryId: createCategoryId, title: createTitle.trim(), file: createFile }); setCreateOpen(false); await refresh(); setBusy(true); setSelectedId(result.document.id); setScreen('file'); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDocument.fileImported) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.fileImportFailed)) } finally { setCreatingDocument(false) } }
  const chooseCreateFile = (file: File | null) => { if (file && file.size > 25 * 1024 * 1024) { showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.designDocument.fileTooLarge); setCreateFile(null); return } setCreateFile(file); if (file) setCreateTitle(file.name.replace(/\.[^.]+$/u, '')) }
  const downloadDocumentFile = async () => { if (!document?.file) return; try { const blob = await fetchAIDesktopDesignDocumentFile(document.id); const url = URL.createObjectURL(blob); const link = window.document.createElement('a'); link.href = url; link.download = document.file.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.fileDownloadFailed)) } }
  const fileDirty = Boolean(document && (fileTitle !== document.title || fileCategoryId !== document.categoryId))
  const saveFileDocument = async () => { if (!document || !fileTitle.trim() || savingDocument) return; setSavingDocument(true); try { const result = await updateAIDesktopDesignDocument(document.id, { ...documentInput(document), title: fileTitle.trim(), categoryId: fileCategoryId }, document.updatedAt); showLoadedDocument(result.document); await refresh(); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDocument.saved) } catch (error) {
    if ((error as { code?: string }).code === 'STALE') { try { const { document: latest } = await getAIDesktopDesignDocument<unknown>(document.id); showLoadedDocument(latest); await refresh() } catch { /* 読み込み直せない場合も通知だけは表示する。 */ } showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.designDocument.fileStale); return }
    showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.saveFailed))
  } finally { setSavingDocument(false) } }
  // プロジェクト情報と設計書を、Claude Code・Codexが読めるファイル一式にする。
  const buildAgentFiles = async () => {
    if (!projectId) throw new Error('PROJECT_REQUIRED')
    const [detail, ...loaded] = await Promise.all([getAIDesktopProject(projectId), ...projectDocuments.map((item) => getAIDesktopDesignDocument<unknown>(item.id))])
    const exportDocuments = loaded.map(({ document: value }) => ({ document: { ...value, content: normalizeDesignContent(value.content, value.title) }, categoryName: projectCategories.find((category) => category.id === value.categoryId)?.name ?? '未分類' }))
    return buildAgentExport(detail.project, projectCategories, exportDocuments)
  }
  const warnIfAgentsFileTooLong = (lineCount: number) => { if (lineCount > AGENTS_FILE_LINE_BUDGET) showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.designDocument.agentFileTooLong(lineCount, AGENTS_FILE_LINE_BUDGET)) }
  const downloadAgentZip = async () => {
    if (!projectId || !project || exportingAgents) return
    if (!(await confirmAIDesktop({ title: 'AI向けのファイルをダウンロードしますか？', message: 'AGENTS.md・CLAUDE.md・docs/ をZIPでダウンロードします。リポジトリの直下に置くと、Claude CodeやCodexが読み込みます。\nメンバー・顧客名・AI Desktop内のURLは書き出しません。公開リポジトリに置く場合は、設計書に秘密の情報が含まれていないか確認してください。', confirmLabel: 'ダウンロード' }))) return
    setExportingAgents(true)
    try {
      const result = await buildAgentFiles()
      const url = URL.createObjectURL(createZip(result.files))
      const link = window.document.createElement('a')
      link.href = url
      link.download = `${safeJsonName(project.name)}-AI向けファイル.zip`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDocument.agentExported)
      warnIfAgentsFileTooLong(result.agentsLineCount)
    } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.agentExportFailed)) } finally { setExportingAgents(false) }
  }
  // 選んだリポジトリのフォルダへ直接書き出す。書き出し先はプロジェクトごとに覚えておく。
  const writeAgentFolder = async (changeFolder: boolean) => {
    if (!projectId || !project || exportingAgents) return
    if (changeFolder || !agentFolderName) {
      if (!(await confirmAIDesktop({ title: '書き出し先のリポジトリを選んでください', message: '選んだフォルダの直下に AGENTS.md・CLAUDE.md・docs/ を書き出します。手書きの内容は残し、AI Desktopが生成した部分だけを更新します。\nメンバー・顧客名・AI Desktop内のURLは書き出しません。公開リポジトリの場合は、設計書に秘密の情報が含まれていないか確認してください。', confirmLabel: 'フォルダを選ぶ' }))) return
      try {
        const selected = await selectRepositoryFolder(projectId)
        setAgentFolderName(selected.folderName)
        if (!selected.isGitRepository && !(await confirmAIDesktop({ title: `「${selected.folderName}」はGitリポジトリではないようです`, message: 'リポジトリの直下（.git があるフォルダ）を選ぶと、Claude CodeやCodexが読み込めます。このフォルダに書き出しますか？', confirmLabel: '書き出す' }))) return
      } catch (error) {
        if (isWorkspaceCancelled(error)) return
        showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.agentExportFailed))
        return
      }
    }
    setExportingAgents(true)
    try {
      const root = await repositoryFolderWithPermission(projectId)
      if (!root) { showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.designDocument.agentFolderPermissionDenied); return }
      const result = await buildAgentFiles()
      const written = await writeAgentExportToFolder(root, result.files, result.documentVersions)
      setAgentPendingCount(0)
      showAIDesktopNotification('success', written.written || written.removed ? AI_DESKTOP_MESSAGES.designDocument.agentWritten(written.folderName, written.written, written.removed) : AI_DESKTOP_MESSAGES.designDocument.agentUnchanged(written.folderName))
      if (written.skipped.length) showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.designDocument.agentSkipped(written.skipped))
      warnIfAgentsFileTooLong(result.agentsLineCount)
    } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designDocument.agentExportFailed)) } finally { setExportingAgents(false) }
  }
  // 前回リポジトリへ書き出したあとに更新された文書の数を数え、書き出し忘れに気付けるようにする。
  const documentVersionKey = JSON.stringify(projectDocuments.map((item) => [item.id, item.updatedAt]))
  useEffect(() => {
    if (!projectId || !agentFolderName) return
    let active = true
    const versions = (JSON.parse(documentVersionKey) as Array<[string, number]>).map(([id, updatedAt]) => ({ id, updatedAt }))
    void pendingAgentExportCount(projectId, versions).then((count) => { if (active) setAgentPendingCount(count) }).catch(() => undefined)
    return () => { active = false }
  }, [projectId, agentFolderName, documentVersionKey])
  // プロジェクトを切り替えたら、そのプロジェクトの書き出し先の名前を読み込む。
  useEffect(() => { if (!projectId) return; let active = true; void storedRepositoryFolderName(projectId).then((name) => { if (active) setAgentFolderName(name) }); return () => { active = false } }, [projectId])
  const safeJsonName = (value: string) => value.trim().replace(/[/:*?"<>|]/gu, '-') || 'ドキュメント'
  const designWorkspaceTarget = (): DesignDocumentWorkspaceTarget | null => draft && document && project ? { databaseTarget: import.meta.env.DEV ? 'local' : 'remote', projectId: project.id, projectName: project.name, designDocumentId: document.id, title: draft.title, categoryName: projectCategories.find((item) => item.id === draft.categoryId)?.name ?? null } : null
  const downloadDesignDocumentJson = (payload: unknown, fileName: string, message?: string) => { const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })); const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); if (message) showAIDesktopNotification('success', message) }
  const showDesignJsonError = (error: unknown) => { const code = error instanceof Error ? error.message : ''; const message = code === 'RESOURCE_TYPE' ? AI_DESKTOP_MESSAGES.designDocument.jsonWrongResource : code === 'CLASSIFICATION' ? AI_DESKTOP_MESSAGES.designDocument.jsonDifferentClassification : code === 'MERMAID' ? AI_DESKTOP_MESSAGES.designDocument.jsonMermaidInvalid : code === 'DUPLICATE_ID' ? AI_DESKTOP_MESSAGES.designDocument.jsonDuplicateId : AI_DESKTOP_MESSAGES.designDocument.jsonInvalid; showAIDesktopNotification(code === 'CLASSIFICATION' ? 'warning' : 'error', message) }
  const applyDesignDocumentJson = async (source: string) => { if (!draft) return; const next = await parseDesignDocumentJson(source, draft); setDraft(next); setJsonImportPending(true); setActivePageId(next.content.pages[0]?.id ?? null) }
  const importDesignDocumentJson = () => { if (!draft) return; const picker = window.document.createElement('input'); picker.type = 'file'; picker.accept = 'application/json,.json'; picker.onchange = () => { const file = picker.files?.[0]; if (!file) return; void file.text().then(async (source) => { await applyDesignDocumentJson(source); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designDocument.jsonImported) }).catch(showDesignJsonError) }; picker.click() }
  const downloadCurrentDesignDocumentJson = () => { if (!draft || !document) return; downloadDesignDocumentJson(createDesignDocumentJson(draft, document.id), `${safeJsonName(draft.title)}.json`, AI_DESKTOP_MESSAGES.designDocument.jsonDownloaded) }
  const downloadDesignDocumentTemplate = () => { if (!draft || !document) return; downloadDesignDocumentJson(createDesignDocumentJson(draft, document.id, true), `${safeJsonName(draft.title)}-テンプレート.json`, AI_DESKTOP_MESSAGES.designDocument.jsonTemplateDownloaded) }
  const writeDesignWorkspaceJson = async () => {
    const target = designWorkspaceTarget()
    if (!draft || !document || !target || !(await confirmAIDesktop({ title: '現在のドキュメントをワークスペースへ書き出しますか？', message: `${designDocumentWorkspacePath(target)} を上書きします。`, confirmLabel: '書き出す' }))) return
    const payload = createDesignDocumentJson(draft, document.id, true)
    if (!supportsWorkspaceFolder()) { downloadDesignDocumentJson(payload, `${safeJsonName(draft.title)}-テンプレート.json`); showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.workspace.unsupported); return }
    try { showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.workspace.written(await writeDesignDocumentWorkspace(target, payload))) }
    catch (error) { if (isWorkspaceCancelled(error)) return; showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.workspace.writeFailed) }
  }
  const readDesignWorkspaceJson = async () => {
    const target = designWorkspaceTarget()
    if (!draft || !target || !(await confirmAIDesktop({ title: 'ワークスペースのJSONを読み込みますか？', message: `${designDocumentWorkspacePath(target)} を読み込みます。現在の未保存の編集内容は置き換えられます。`, confirmLabel: '読み込む' }))) return
    if (!supportsWorkspaceFolder()) { importDesignDocumentJson(); return }
    try { const file = await readDesignDocumentWorkspace(target); await applyDesignDocumentJson(file.content); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.workspace.read(file.name)) }
    catch (error) {
      if (isWorkspaceCancelled(error)) return
      if (error instanceof Error && error.message === 'WORKSPACE_FILE_NOT_FOUND') { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.workspace.fileNotFound(designDocumentWorkspacePath(target))); return }
      if (error instanceof SyntaxError || error instanceof Error && ['FORMAT', 'RESOURCE_TYPE', 'CLASSIFICATION', 'CONTENT', 'DUPLICATE_ID', 'MERMAID'].includes(error.message)) { showDesignJsonError(error); return }
      showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.workspace.readFailed)
    }
  }
  const changeDesignWorkspaceFolder = async () => { if (!supportsWorkspaceFolder()) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.workspace.folderUnsupported); return } try { showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.workspace.folderSelected(await selectWorkspaceFolder())) } catch (error) { if (isWorkspaceCancelled(error)) return; showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.workspace.folderSelectFailed) } }
  const copyDesignWorkspaceContext = async () => {
    const target = designWorkspaceTarget()
    if (!target) return
    const value = workspaceContextText({ subject: 'ドキュメント', editFields: 'data.titleとdata.content', path: designDocumentWorkspacePath(target), target: { projectId: target.projectId, designDocumentId: target.designDocumentId, databaseTarget: target.databaseTarget }, withPrompt: includeAiPrompt })
    try { await navigator.clipboard.writeText(value); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.workspace.contextCopied) }
    catch { showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.workspace.contextCopyFailed) }
  }
  const editTemplate = (item: AIDesktopDesignTemplate<DesignDocumentContent>) => { setEditingTemplate(item); setTemplateDraft({ projectId: item.projectId, name: item.name, description: item.description, domain: item.domain, phase: item.phase, documentType: item.documentType, version: item.version, content: structuredClone(item.content) }); setActiveTemplatePageId(item.content.pages[0]?.id ?? null); setScreen('template-edit') }
  const saveTemplate = async () => { if (!templateDraft || !templateDraft.name.trim()) return; setBusy(true); try { const input = { ...templateDraft, name: templateDraft.name.trim(), version: editingTemplate ? editingTemplate.version + 1 : 1 }; if (editingTemplate) await updateAIDesktopDesignTemplate(editingTemplate.id, input); else await createAIDesktopDesignTemplate(input); await refresh(); setScreen('templates'); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designTemplate.saved) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designTemplate.saveFailed)) } finally { setBusy(false) } }
  const duplicateTemplate = async (item: StandardTemplate) => { if (!projectId || projectTemplates.some((template) => template.domain === item.domain && template.phase === item.phase && template.documentType === item.documentType)) return; setBusy(true); try { await createAIDesktopDesignTemplate({ projectId, name: `${item.name}（Project用）`, description: item.description, domain: item.domain, phase: item.phase, documentType: item.documentType, version: 1, content: contentFromMaster(item, item.name) }); await refresh(); setScreen('templates'); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designTemplate.created) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designTemplate.saveFailed)) } finally { setBusy(false) } }
  const removeTemplate = async (item: AIDesktopDesignTemplate<DesignDocumentContent>) => { if (!(await confirmAIDesktop({ title: `「${item.name}」を削除しますか？`, confirmLabel: '削除', tone: 'danger' }))) return; setBusy(true); try { await deleteAIDesktopDesignTemplate(item.id); await refresh(); showAIDesktopNotification('success', AI_DESKTOP_MESSAGES.designTemplate.deleted) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designTemplate.deleteFailed)) } finally { setBusy(false) } }
  const documentToTemplate = async () => { if (!document || !draft) return; const existing = projectTemplates.find((item) => item.domain === draft.domain && item.phase === draft.phase && item.documentType === draft.documentType); if (existing && !(await confirmAIDesktop({ title: `独自テンプレート「${existing.name}」を更新しますか？`, message: 'このドキュメントの内容で上書きします。', confirmLabel: '更新' }))) return; setBusy(true); try { const name = existing?.name ?? `${document.title}テンプレート`; const input = { projectId: document.projectId, name, description: `${document.title}を元に更新しました。`, domain: draft.domain, phase: draft.phase, documentType: draft.documentType, version: (existing?.version ?? 0) + 1, content: cloneContent(draft.content, name) }; if (existing) await updateAIDesktopDesignTemplate(existing.id, input); else await createAIDesktopDesignTemplate(input); await refresh(); showAIDesktopNotification('success', existing ? AI_DESKTOP_MESSAGES.designTemplate.saved : AI_DESKTOP_MESSAGES.designTemplate.created) } catch (error) { showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.designTemplate.saveFailed)) } finally { setBusy(false) } }

  const activePage = draft?.content.pages.find((page) => page.id === activePageId) ?? draft?.content.pages[0] ?? null
  const activeTemplatePage = templateDraft?.content.pages.find((page) => page.id === activeTemplatePageId) ?? templateDraft?.content.pages[0] ?? null
  const updateDocumentPage = (page: ContentItem) => { if (!draft) return; setDraft({ ...draft, content: { ...draft.content, pages: draft.content.pages.map((item) => item.id === page.id ? page : item) } }) }
  const addDocumentPage = () => { if (!draft) return; const page = structuredContent('新しいページ', 'このページで決める内容を記載してください。', [{ title: '仕様', guidance: '必要な内容を記載してください。' }]); setDraft({ ...draft, content: { ...draft.content, pages: [...draft.content.pages, page] } }); setActivePageId(page.id) }
  const duplicateDocumentPage = () => { if (!draft || !activePage) return; const page = { ...structuredClone(activePage), id: uid('page'), navTitle: `${activePage.navTitle}（コピー）` }; setDraft({ ...draft, content: { ...draft.content, pages: [...draft.content.pages, page] } }); setActivePageId(page.id) }
  const removeDocumentPage = async () => { if (!draft || !activePage || draft.content.pages.length === 1 || !(await confirmAIDesktop({ title: `ページ「${activePage.navTitle}」を削除しますか？`, confirmLabel: '削除', tone: 'danger' }))) return; const pages = draft.content.pages.filter((page) => page.id !== activePage.id); setDraft({ ...draft, content: { ...draft.content, pages } }); setActivePageId(pages[0]?.id ?? null) }
  const updateTemplatePage = (page: ContentItem) => { if (!templateDraft) return; setTemplateDraft({ ...templateDraft, content: { ...templateDraft.content, pages: templateDraft.content.pages.map((item) => item.id === page.id ? page : item) } }) }
  const addTemplatePage = () => { if (!templateDraft) return; const page = structuredContent('新しいページ', 'このページで決める内容を記載してください。', [{ title: '仕様', guidance: '必要な内容を記載してください。' }]); setTemplateDraft({ ...templateDraft, content: { ...templateDraft.content, pages: [...templateDraft.content.pages, page] } }); setActiveTemplatePageId(page.id) }
  const duplicateTemplatePage = () => { if (!templateDraft || !activeTemplatePage) return; const page = { ...structuredClone(activeTemplatePage), id: uid('page'), navTitle: `${activeTemplatePage.navTitle}（コピー）` }; setTemplateDraft({ ...templateDraft, content: { ...templateDraft.content, pages: [...templateDraft.content.pages, page] } }); setActiveTemplatePageId(page.id) }
  const removeTemplatePage = async () => { if (!templateDraft || !activeTemplatePage || templateDraft.content.pages.length === 1 || !(await confirmAIDesktop({ title: `ページ「${activeTemplatePage.navTitle}」を削除しますか？`, confirmLabel: '削除', tone: 'danger' }))) return; const pages = templateDraft.content.pages.filter((page) => page.id !== activeTemplatePage.id); setTemplateDraft({ ...templateDraft, content: { ...templateDraft.content, pages } }); setActiveTemplatePageId(pages[0]?.id ?? null) }

  if (!canManage) return <div className="ad-auth-required"><span>▧</span><h1>ドキュメント</h1><p>プロジェクトのドキュメントを閲覧・作成するには、Hundredへサインインしてください。</p></div>
  if (screen === 'projects') return <AppShell className="ad-design-home"><AppHeader eyebrow="DESIGN WORKSPACE" title="プロジェクト一覧" description="ドキュメントを確認・作成するプロジェクトを選択してください。" actions={<nav><button onClick={() => setScreen('master-templates')}>標準テンプレート</button></nav>} /><AppContent><div className="ad-design-project-grid">{projects.map((item) => { const count = documents.filter((doc) => doc.projectId === item.id); return <button key={item.id} onClick={() => chooseProject(item.id)}><span>◆</span><div><strong>{item.name}</strong><p>{item.summary || 'プロジェクトのドキュメントを管理します。'}</p><small>ドキュメント {count.length}件</small></div><b>›</b></button> })}</div></AppContent></AppShell>
  if (screen === 'master-templates') return <div className="ad-design-template-manager"><header><div><small>DESIGN WORKSPACE</small><h1>標準テンプレート</h1><p>すべてのプロジェクトで利用できる、最初から用意された構成です。</p></div><nav className="ad-design-toolbar"><button onClick={() => setScreen('projects')}>← プロジェクト一覧</button></nav></header>{navigationPhases.map((itemPhase) => { const phaseTemplates = activeMasterTemplates.filter((item) => item.phase === itemPhase).sort(compareRuntimeItems); if (!phaseTemplates.length) return null; return <section key={itemPhase}><div className="ad-design-section-title"><div><small>MASTER</small><h2>{navigationPhaseLabel(itemPhase)}</h2><p>{navigationPhaseLabel(itemPhase)}で使用するテンプレートです。</p></div><span>{phaseTemplates.length}件</span></div><div className="ad-design-template-grid">{phaseTemplates.map((item) => <article key={item.id}><h3>{item.name}</h3><p>{item.description}</p><small>表示順 {item.sortOrder} ・ v{item.version}</small></article>)}</div></section> })}</div>
  if (screen === 'templates' && project) return <div className="ad-design-template-manager ad-design-project-section-page"><ProjectSectionHeader projectName={project.name} title="テンプレート" current="templates" onBack={() => { setProjectId(null); setScreen('projects') }} onNavigate={navigateProjectSection} /><div className="ad-design-list-tools"><span>{projectTemplates.length}件</span>{project.canEdit && <div className="ad-design-list-actions"><button className="primary" onClick={() => setScreen('project-template-picker')}>標準テンプレートから作成</button></div>}</div><section><div className="ad-design-section-title"><div><small>PROJECT</small><h2>独自テンプレート</h2><p>同じ種類は1件だけ保持され、作成後も内容を編集できます。</p></div></div><div className="ad-design-template-grid">{projectTemplates.map((item) => <article key={item.id}><h3>{item.name}</h3><p>{item.description || '説明はありません。'}</p><small>{item.phase === 'basic-design' ? phaseLabels[item.phase] : `${phaseLabels[item.phase]} ・ ${runtimeTypeLabel(item.domain, item.documentType)}`} ・ v{item.version}</small>{item.canEdit && <footer><button onClick={() => editTemplate(item)}>編集</button><button className="danger" onClick={() => void removeTemplate(item)}>削除</button></footer>}</article>)}{!projectTemplates.length && <div className="ad-design-template-empty"><span>▧</span><strong>独自テンプレートはありません</strong><p>「標準テンプレートから作成」で元にする構成を選ぶか、ドキュメントの画面から「独自テンプレートとして保存」で作成できます。</p></div>}</div></section></div>
  if (screen === 'project-template-picker' && project) return <div className="ad-design-template-manager"><header><div><small>{project.name}</small><h1>標準テンプレートから作成</h1><p>このプロジェクト用に調整する標準テンプレートを選択してください。</p></div><nav className="ad-design-toolbar"><button onClick={() => setScreen('templates')}>← テンプレート</button></nav></header>{navigationPhases.map((itemPhase) => { const phaseTemplates = activeMasterTemplates.filter((item) => item.phase === itemPhase).sort(compareRuntimeItems); if (!phaseTemplates.length) return null; return <section key={itemPhase}><div className="ad-design-section-title"><div><small>MASTER</small><h2>{navigationPhaseLabel(itemPhase)}</h2><p>{navigationPhaseLabel(itemPhase)}の標準テンプレートから独自テンプレートを作成します。</p></div><span>{phaseTemplates.length}件</span></div><div className="ad-design-template-grid">{phaseTemplates.map((item) => { const existing = projectTemplates.find((template) => template.domain === item.domain && template.phase === item.phase && template.documentType === item.documentType); return <article key={item.id}><h3>{item.name}</h3><p>{item.description}</p><small>表示順 {item.sortOrder} ・ v{item.version}</small>{project.canEdit && <button disabled={busy || Boolean(existing)} onClick={() => void duplicateTemplate(item)}>{existing ? '作成済み' : '独自テンプレートを作成'}</button>}</article> })}</div></section> })}</div>
  if (screen === 'template-edit' && templateDraft && project) return <div className="ad-design-template-editor"><header><div><small>{project.name}</small><h1>独自テンプレートを編集</h1></div><nav className="ad-design-toolbar"><button onClick={() => setScreen('templates')}>← テンプレート一覧</button><button onClick={() => setScreen('templates')}>キャンセル</button><button className="primary" disabled={busy || !templateDraft.name.trim()} onClick={() => void saveTemplate()}>保存</button></nav></header><section className="ad-design-fields template"><label><span>テンプレート名</span><input value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} /></label><label><span>工程</span><select disabled value={templateDraft.phase}>{runtimePhasesForDomain(templateDraft.domain).map((value) => <option value={value} key={value}>{phaseLabels[value]}</option>)}</select></label>{templateDraft.phase !== 'basic-design' && <label><span>種別</span><select disabled value={templateDraft.documentType}>{runtimeTypesForPhase(templateDraft.domain, templateDraft.phase).map((item) => <option value={item.type} key={item.type}>{item.label}</option>)}</select></label>}<label className="description"><span>説明</span><input value={templateDraft.description} onChange={(event) => setTemplateDraft({ ...templateDraft, description: event.target.value })} /></label></section><div className="ad-design-page-workspace"><aside className="ad-design-page-nav"><header><strong>ページ</strong><button onClick={addTemplatePage}>＋ 追加</button></header><nav>{templateDraft.content.pages.map((page, index) => <button className={page.id === activeTemplatePage?.id ? 'active' : ''} key={page.id} onClick={() => setActiveTemplatePageId(page.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{page.navTitle}</strong></button>)}</nav><footer><button disabled={!activeTemplatePage} onClick={duplicateTemplatePage}>複製</button><button className="danger" disabled={templateDraft.content.pages.length === 1} onClick={removeTemplatePage}>削除</button></footer></aside><div className="ad-design-template-canvas">{activeTemplatePage && <ContentCanvas item={activeTemplatePage} nameLabel="ページ名" onChange={updateTemplatePage} />}</div></div></div>
  if (screen === 'deliverables' && project) return <DesignDeliverables project={project} documents={projectDocuments} initialDocumentIds={deliverySeedIds} header={<ProjectSectionHeader projectName={project.name} title="成果物・納品" current="deliverables" onBack={() => { setProjectId(null); setScreen('projects') }} onNavigate={navigateProjectSection} />} onCreateFromDocuments={beginDeliveryFromHistory} />
  if (screen === 'workspace' && project) return (
    <div className="ad-design-workspace ad-design-workspace--category-layout">
      <ProjectSectionHeader projectName={project.name} title="ドキュメント" current="workspace" breadcrumbSuffix={categoryFilter !== 'all' ? selectedCategory?.name ?? '未分類' : undefined} onBack={() => { setProjectId(null); setScreen('projects') }} onNavigate={navigateProjectSection} />
      <aside>
        <div className="ad-design-nav-label">カテゴリ</div>
        <nav>
          {projectCategories.map((category) => <section className={categoryFilter === category.id ? 'current' : ''} key={category.id}><button className={`ad-design-nav-group single ${categoryFilter === category.id ? 'active' : ''}`} onClick={() => setCategoryFilter(category.id)}><span>{category.name}</span></button></section>)}
          {hasUncategorizedDocuments && <section className={categoryFilter === 'uncategorized' ? 'current' : ''}><button className={`ad-design-nav-group single ${categoryFilter === 'uncategorized' ? 'active' : ''}`} onClick={() => setCategoryFilter('uncategorized')}><span>未分類</span></button></section>}
        </nav>
        {project.canEdit && <button className="ad-design-add-category" onClick={openCategoryWizard}>＋ カテゴリを追加</button>}
      </aside>
      <main>
        {deliverySelectionMode ? (
          <div className="ad-design-delivery-selection-tools">
            <div><strong>納品対象を選択</strong><span>成果物に含めるドキュメントをチェックしてください。追加した時点の内容で固定されます。</span></div>
            <b>{deliveryDocumentIds.length}件選択</b>
            <button onClick={cancelDeliverySelection}>キャンセル</button>
            <button className="primary" disabled={!deliveryDocumentIds.length} onClick={createDeliveryFromSelection}>成果物を作成</button>
          </div>
        ) : (
          <div className="ad-design-list-tools">
            {needsCategorySelection ? <span>カテゴリを選択してください</span> : <>
              <label>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ドキュメントを検索" /></label>
              <span>{filtered.length}件</span>
            </>}
            <div className="ad-design-list-actions">
              {projectDocuments.length > 0 && <details className="ad-project-json-menu ad-project-json-menu--labeled ad-agent-export-menu"><summary>{exportingAgents ? '書き出し中…' : agentFolderName && agentPendingCount ? `AI向けに書き出す（書き出し待ち ${agentPendingCount}件）` : 'AI向けに書き出す'} <span aria-hidden="true">⌄</span></summary><div>
                <section><strong>リポジトリ</strong>{supportsRepositoryFolder() ? <><button type="button" disabled={exportingAgents} onClick={() => void writeAgentFolder(false)}>{agentFolderName ? `「${agentFolderName}」に書き出す` : 'リポジトリを選んで書き出す'}</button>{agentFolderName && <button type="button" disabled={exportingAgents} onClick={() => void writeAgentFolder(true)}>書き出し先を変更</button>}</> : <p>このブラウザでは、フォルダへ直接書き出せません。ZIPをダウンロードしてください。</p>}</section>
                <section><strong>ファイル</strong><button type="button" disabled={exportingAgents} onClick={() => void downloadAgentZip()}>ZIPでダウンロード</button></section>
              </div></details>}
              {project.canEdit && projectDocuments.length > 0 && <button className="success" onClick={beginDeliverySelection}>成果物を作成</button>}
              {project.canEdit && <button className="primary" onClick={openCreateDialog}>＋ 新規</button>}
            </div>
          </div>
        )}
        {needsCategorySelection ? (
          <div className="ad-design-category-prompt">
            {projectCategories.length || hasUncategorizedDocuments ? <>
              <span>▧</span>
              <strong>カテゴリを選択してください</strong>
              <p>左のカテゴリを選択すると、そのカテゴリのドキュメントが表示されます。</p>
            </> : <>
              <span>▧</span>
              <strong>カテゴリとドキュメントはまだありません</strong>
              <p>{project.canEdit ? '左下の「カテゴリを追加」から構成を作成できます。' : 'カテゴリが作成されるとここに表示されます。'}</p>
            </>}
          </div>
        ) : <div className={`ad-design-table ${deliverySelectionMode ? 'selecting' : ''}`}>
          <div className="head">
            {deliverySelectionMode ? <label className="document-select all"><input type="checkbox" checked={allEligibleSelected} disabled={!eligibleDeliveryDocuments.length} onChange={toggleAllDeliveryDocuments} /><span>すべてチェック</span></label> : <span>ドキュメント名</span>}
            <span>形式</span><span>更新者</span><span>更新日</span>
          </div>
          {filtered.map((item) => deliverySelectionMode ? (
            <label className="delivery-row" key={item.id}><span className="document-select"><input type="checkbox" checked={deliveryDocumentIds.includes(item.id)} onChange={() => toggleDeliveryDocument(item.id)} /><strong>{item.title}</strong>{designDeliveryStateLabels[item.deliveryState] && <em className={`ad-design-delivery-state ${item.deliveryState}`}>{designDeliveryStateLabels[item.deliveryState]}</em>}</span><span>{formatLabels[item.format]}</span><span title={item.updatedByName}>{item.updatedByName}</span><time>{dateLabel(item.updatedAt)}</time></label>
          ) : (
            <button key={item.id} onClick={() => openDocument(item)}><strong><span>{item.title}</span>{item.editingBy.length > 0 && <em className="ad-design-editing">{editingLabel(item.editingBy)}</em>}</strong><span>{formatLabels[item.format]}</span><span title={item.updatedByName}>{item.updatedByName}</span><time>{dateLabel(item.updatedAt)}</time></button>
          ))}
          {!filtered.length && <div className="empty"><span>▧</span><strong>{projectCategories.length || projectDocuments.length ? '該当するドキュメントがありません' : 'カテゴリとドキュメントはまだありません'}</strong>{!projectCategories.length && !projectDocuments.length && <p>左下の「カテゴリを追加」から構成を作成できます。</p>}</div>}
        </div>}
      </main>
      {createOpen && CreateDialog()}
      {categoryWizardOpen && CategoryWizard()}
    </div>
  )
  if (screen === 'file' && project) return <div className="ad-design-file-screen"><main className="ad-design-main">{!document || document.id !== selectedId || !document.file ? <div className="ad-design-welcome"><h2>ファイルを読み込んでいます</h2></div> : <>
    <header className="ad-design-header"><div><small>ドキュメント ＞ {project.name} ＞ {projectCategories.find((item) => item.id === document.categoryId)?.name ?? '未分類'}</small><h2>{document.title}</h2></div><nav className="ad-design-toolbar"><button onClick={async () => { if (fileDirty && !(await confirmAIDesktop({ title: '保存していない変更を破棄しますか？', confirmLabel: '破棄して戻る', tone: 'danger' }))) return; setScreen('workspace') }}>← 一覧</button><button onClick={() => void downloadDocumentFile()}>ダウンロード</button>{document.canEdit && <><button className="danger" onClick={() => void removeDocument()}>削除</button><button className="primary" disabled={!fileDirty || savingDocument || !fileTitle.trim()} onClick={() => void saveFileDocument()}>保存</button></>}</nav></header>
    <div className="ad-design-file-body">
      {document.canEdit && <section className="ad-design-fields"><label><span>ドキュメント名</span><input value={fileTitle} maxLength={200} onChange={(event) => setFileTitle(event.target.value)} /></label><label><span>カテゴリ</span><select value={fileCategoryId ?? ''} onChange={(event) => setFileCategoryId(event.target.value || null)}><option value="">未分類</option>{projectCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></section>}
      <section className="ad-design-file-info"><div><span>形式</span><strong>{formatLabels[document.format]}</strong></div><div><span>ファイル名</span><strong>{document.file.name}</strong></div><div><span>サイズ</span><strong>{fileSizeLabel(document.file.size)}</strong></div></section>
      {document.format === 'pdf' ? filePreviewUrl ? <iframe className="ad-design-file-preview" title={document.title} src={filePreviewUrl} /> : <p className="ad-design-file-note">プレビューを読み込んでいます…</p> : <p className="ad-design-file-note">{formatLabels[document.format]}のファイルは、ダウンロードして開いてください。</p>}
    </div>
  </>}</main></div>

  if (screen === 'document' && project) return <div className="ad-design-workspace ad-design-document">{!draft || !document || !activePage ? <main className="ad-design-main"><div className="ad-design-welcome"><h2>ドキュメントを読み込んでいます</h2></div></main> : <><aside className="ad-design-document-sidebar"><header><small>PROJECT</small><h1>{project.name}</h1><p>ドキュメント {projectDocuments.length}件</p></header><div className="ad-design-nav-label"><span>ページ</span><b>{draft.content.pages.length}件</b></div><nav className="ad-design-document-pages">{draft.content.pages.map((page, index) => <button className={`${page.id === activePage.id ? 'active' : ''} ${page.parentId ? 'tree-child' : ''}`} key={page.id} onClick={() => setActivePageId(page.id)}><span><i>{documentPageNumber(draft.content.pages, page, index)}</i>{page.navTitle}</span></button>)}</nav>{mode === 'edit' && <footer className="ad-design-document-page-actions"><button onClick={addDocumentPage}>＋ 追加</button><button onClick={duplicateDocumentPage}>複製</button><button className="danger" disabled={draft.content.pages.length === 1} onClick={removeDocumentPage}>削除</button></footer>}</aside><main className="ad-design-main"><header className="ad-design-header"><div><small>ドキュメント ＞ {project.name} ＞ {draftCategoryName} ＞ {activePage.navTitle}</small><h2>{draft.title}</h2>{document.editingBy.length > 0 && <em className="ad-design-editing">{editingLabel(document.editingBy)}{document.editingLock?.canTakeOver ? `（${timeLabel(document.editingLock.lastSeenAt)}から接続なし）` : ''}</em>}</div><nav className="ad-design-toolbar"><button onClick={async () => { if (dirty && !(await confirmAIDesktop({ title: '保存していない変更を破棄しますか？', confirmLabel: '破棄して戻る', tone: 'danger' }))) return; if (dirty) { withBackupOwner((owner) => clearDocumentBackup(owner, document.id)); const saved = documentInput(document); setDraft(saved); setSnapshot(JSON.stringify(saved)); setJsonImportPending(false) } setScreen('workspace') }}>← 一覧</button>{document.canEdit && <button onClick={() => void documentToTemplate()}>独自テンプレートとして保存</button>}{mode === 'edit' && document.canEdit && <details className="ad-project-json-menu ad-project-json-menu--labeled"><summary>JSON連携 <span aria-hidden="true">⌄</span></summary><div><section><strong>ワークスペース</strong><button type="button" onClick={() => void writeDesignWorkspaceJson()}>JSONへ書き出す</button><button type="button" onClick={() => void readDesignWorkspaceJson()}>JSONから読み込む</button><button type="button" onClick={() => void changeDesignWorkspaceFolder()}>ワークスペースのフォルダを変更</button></section><section><strong>ファイル操作</strong><button type="button" onClick={downloadCurrentDesignDocumentJson}>JSONをダウンロード</button><button type="button" onClick={importDesignDocumentJson}>JSONをインポート</button><button type="button" onClick={downloadDesignDocumentTemplate}>テンプレートをダウンロード</button></section><section className="ad-json-menu-copy"><strong>AIへの依頼</strong><label><input type="checkbox" checked={includeAiPrompt} onChange={(event) => setIncludeAiPrompt(event.target.checked)} /><span>AI用指示付き</span></label><button type="button" onClick={() => void copyDesignWorkspaceContext()}>コンテキストをコピー</button></section></div></details>}<div className="ad-design-mode-switch"><button className={mode === 'view' ? 'active' : ''} onClick={async () => { if (dirty && !(await confirmAIDesktop({ title: '保存していない変更を破棄して閲覧へ戻りますか？', confirmLabel: '破棄して戻る', tone: 'danger' }))) return; if (dirty) { withBackupOwner((owner) => clearDocumentBackup(owner, document.id)); const saved = documentInput(document); setDraft(saved); setSnapshot(JSON.stringify(saved)); setJsonImportPending(false) } setMode('view') }}>閲覧</button>{document.canEdit && <button className={mode === 'edit' ? 'active' : ''} onClick={() => void startEditing()}>編集</button>}</div>{mode === 'edit' && document.canEdit && <><button className="danger" onClick={() => void removeDocument()}>削除</button><button className="primary" disabled={savingDocument || !draft.title.trim()} onClick={() => void saveDocument()}>保存</button></>}</nav></header>{mode === 'view' ? <div className="ad-design-view"><div className="ad-article-stage"><article className="ad-article">{activePage.blocks.map((block) => <BlockRenderer block={block} pageBlocks={activePage.blocks} key={block.id} />)}</article><section className="ad-design-meta"><div><span>カテゴリ</span><strong>{draftCategoryName}</strong></div><div><span>関連工程</span><strong>{phaseLabels[draft.phase]}</strong></div>{draft.phase !== 'basic-design' && <div><span>種別</span><strong>{runtimeTypeLabel(draft.domain, draft.documentType)}</strong></div>}<div><span>テンプレート</span><strong>v{draft.templateVersion}</strong></div></section></div></div> : <div className="ad-design-editor"><section className="ad-design-fields"><label><span>ドキュメント名</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label><span>カテゴリ</span><select value={draft.categoryId ?? ''} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value || null })}><option value="">未分類</option>{projectCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label><span>関連工程</span><select value={draft.phase} onChange={(event) => { const next = normalizeRuntimeClassification(draft.domain, event.target.value as AIDesktopDesignPhase, draft.documentType); setDraft({ ...draft, phase: next.phase, documentType: next.documentType }) }}>{runtimePhasesForDomain(draft.domain).map((value) => <option value={value} key={value}>{phaseLabels[value]}</option>)}</select></label>{draft.phase !== 'basic-design' && <label><span>種別</span><select value={draft.documentType} onChange={(event) => setDraft({ ...draft, documentType: event.target.value })}>{runtimeTypesForPhase(draft.domain, draft.phase).map((item) => <option value={item.type} key={item.type}>{item.label}</option>)}</select></label>}</section><ContentCanvas item={activePage} nameLabel="ページ名" onChange={updateDocumentPage} /></div>}</main></>}</div>
  // リロード直後は、プロジェクト一覧を読み込むまで復元した画面を表示できないため、読み込み中と表示する。
  return loaded ? null : <div className="ad-design-file-screen"><div className="ad-design-welcome"><h2>読み込んでいます</h2></div></div>

  function CreateDialog() {
    return <div className="ad-design-create-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false) }}>
      <section role="dialog" aria-modal="true">
        <header><div><small>NEW DESIGN DOCUMENT</small><h2>ドキュメントを作成</h2><p>{project?.name}へ追加します。</p></div><button onClick={() => setCreateOpen(false)}>×</button></header>
        <div className="ad-design-category-modes"><button className={createMode === 'template' ? 'active' : ''} onClick={() => setCreateMode('template')}>テンプレートから作成</button><button className={createMode === 'file' ? 'active' : ''} onClick={() => setCreateMode('file')}>ファイルを取り込む</button></div>
        {createMode === 'file' ? <>
          <div className="ad-design-create-grid">
            <label><span>ファイル（PDF・Word・Excel、25MBまで）</span><input type="file" accept={acceptedFileTypes} onChange={(event) => chooseCreateFile(event.target.files?.[0] ?? null)} /></label>
            <label><span>ドキュメント名</span><input value={createTitle} maxLength={200} onChange={(event) => setCreateTitle(event.target.value)} /></label>
            <label><span>カテゴリ</span><select value={createCategoryId ?? ''} onChange={(event) => setCreateCategoryId(event.target.value || null)}><option value="">未分類</option>{projectCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          </div>
          <footer><button onClick={() => setCreateOpen(false)}>キャンセル</button><button className="primary" disabled={creatingDocument || !createFile || !createTitle.trim()} onClick={() => void createFromFile()}>{creatingDocument ? '取り込み中…' : '取り込む'}</button></footer>
        </> : <>
        <div className="ad-design-create-grid">
          <label><span>ドキュメント名</span><input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} /></label>
          <label><span>カテゴリ</span><select value={createCategoryId ?? ''} onChange={(event) => setCreateCategoryId(event.target.value || null)}><option value="">未分類</option>{projectCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label><span>関連工程</span><select value={createPhase} onChange={(event) => changeCreate(event.target.value as AIDesktopDesignPhase, '')}>{availableCreatePhases.map((value) => <option value={value} key={value}>{phaseLabels[value]}</option>)}</select></label>
          <label><span>ドキュメントの種類</span><select value={`${createDomain}:${createType}`} onChange={(event) => changeCreate(createPhase, event.target.value)}>{createTypeOptions.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></label>
        </div>
        {designDocumentConflict && <p className="ad-design-create-conflict">同じ種類または同じ名前のドキュメントがすでにあります。</p>}
        <div className="ad-design-template-options"><strong>テンプレートを選択</strong>{availableTemplates.map((item) => { const projectTemplate = 'content' in item; return <button className={createTemplateId === item.id ? 'active' : ''} key={item.id} onClick={() => setCreateTemplateId(item.id)}><span>▧</span><div><b>{projectTemplate ? '独自テンプレート' : '標準テンプレート'}</b><small>{item.name} — {item.description}</small></div></button> })}</div>
        <footer><button onClick={() => setCreateOpen(false)}>キャンセル</button><button className="primary" disabled={creatingDocument || !createTitle.trim() || !createTemplateId || designDocumentConflict} onClick={() => void createDocument()}>作成して編集</button></footer>
        </>}
      </section>
    </div>
  }

  function CategoryWizard() {
    const currentKey = categoryWizardStep > 0 ? selectedStandardKeys[categoryWizardStep - 1] : null
    const currentDefinition = currentKey ? standardCategoryDefinitions.find((item) => item.key === currentKey) : null
    const currentMasters = currentKey ? activeMasterTemplates.filter((master) => master.standardCategoryKey === currentKey).sort(compareRuntimeItems) : []
    const unavailableStandardKeys = new Set(projectCategories.map((category) => category.standardKey).filter(Boolean))
    return <div className="ad-design-create-overlay" onPointerDown={(event) => { if (!creatingCategories && event.target === event.currentTarget) setCategoryWizardOpen(false) }}>
      <section className="ad-design-category-wizard" role="dialog" aria-modal="true">
        <header>
          <div><small>{categoryWizardStep ? `TEMPLATE ${categoryWizardStep}/${selectedStandardKeys.length}` : 'ADD CATEGORY'}</small><h2>{categoryWizardStep ? currentDefinition?.name : 'カテゴリを追加'}</h2><p>{categoryWizardStep ? 'このカテゴリに作成するドキュメントを選択してください。選択せず空のカテゴリも作成できます。' : '標準カテゴリをまとめて追加するか、独自のカテゴリを作成します。'}</p></div>
          <button disabled={creatingCategories} onClick={() => setCategoryWizardOpen(false)}>×</button>
        </header>
        {categoryWizardStep === 0 ? <>
          <div className="ad-design-category-modes"><button className={categoryWizardMode === 'standard' ? 'active' : ''} onClick={() => setCategoryWizardMode('standard')}>標準カテゴリ</button><button className={categoryWizardMode === 'custom' ? 'active' : ''} onClick={() => setCategoryWizardMode('custom')}>カテゴリを作成</button></div>
          {categoryWizardMode === 'standard' ? <div className="ad-design-category-grid">{standardCategoryDefinitions.map((definition) => { const disabled = unavailableStandardKeys.has(definition.key); const selected = selectedStandardKeys.includes(definition.key); return <label className={`${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`} key={definition.key}><input type="checkbox" disabled={disabled} checked={selected} onChange={() => setSelectedStandardKeys((current) => current.includes(definition.key) ? current.filter((key) => key !== definition.key) : [...current, definition.key])} /><span><strong>{definition.name}</strong><small>{disabled ? '作成済み' : 'テンプレートを次の画面で選択'}</small></span></label> })}</div> : <div className="ad-design-custom-category"><label><span>カテゴリ名</span><input autoFocus value={customCategoryName} maxLength={100} onChange={(event) => setCustomCategoryName(event.target.value)} placeholder="例：顧客提供資料" /></label><p>独自カテゴリは工程と切り離して、任意の資料を整理できます。</p></div>}
        </> : <div className="ad-design-wizard-templates">{currentMasters.map((master) => { const exists = projectDocuments.some((document) => document.domain === master.domain && document.phase === master.phase && document.documentType === master.documentType && !master.allowMultiple); const checked = (selectedMasterIds[currentKey!] ?? []).includes(master.id); return <label className={`${checked ? 'selected' : ''} ${exists ? 'disabled' : ''}`} key={master.id}><input type="checkbox" disabled={exists} checked={checked} onChange={() => toggleWizardMaster(currentKey!, master.id)} /><span><strong>{master.name}</strong><small>{exists ? '同じ種類のドキュメントを作成済み' : master.description}</small></span></label> })}{!currentMasters.length && <div className="ad-design-wizard-empty">このカテゴリの標準テンプレートはありません。空のカテゴリとして作成できます。</div>}</div>}
        <footer>
          {categoryWizardStep === 0 ? <><button disabled={creatingCategories} onClick={() => setCategoryWizardOpen(false)}>キャンセル</button>{categoryWizardMode === 'standard' ? <button className="primary" disabled={!selectedStandardKeys.length} onClick={beginCategoryTemplateSelection}>次へ</button> : <button className="primary" disabled={creatingCategories || !customCategoryName.trim()} onClick={() => void finishCustomCategory()}>作成</button>}</> : <><button disabled={creatingCategories} onClick={() => setCategoryWizardStep((step) => Math.max(0, step - 1))}>戻る</button>{categoryWizardStep < selectedStandardKeys.length ? <button className="primary" onClick={() => setCategoryWizardStep((step) => step + 1)}>次へ</button> : <button className="primary" disabled={creatingCategories} onClick={() => void finishStandardCategories()}>{creatingCategories ? '作成中…' : '完了'}</button>}</>}
        </footer>
      </section>
    </div>
  }

}
