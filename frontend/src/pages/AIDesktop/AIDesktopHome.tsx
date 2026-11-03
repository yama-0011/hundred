import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAIDesktopDesignDocuments, listAIDesktopProjects, type AIDesktopDesignDocumentSummary, type AIDesktopDocument, type AIDesktopProjectDocument, type AIDesktopProjectSummary } from '../../services/AIDesktop/aiDesktopApi'
import { AI_DESKTOP_MESSAGES } from './aiDesktopMessages'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import { pendingAgentExportCount } from './aiDesktopRepositoryFolder'

/**
 * 概要:
 * AI Desktopのホーム。続きから、対応が必要なもの、自分のプロジェクトを表示する。
 *
 * 責務:
 * - プロジェクト・ドキュメント・資料を更新順に並べ、前回の作業へすぐ戻れるようにする
 * - リポジトリへの書き出し待ちがあるプロジェクトを知らせる
 *
 * 表示するたびに読み直し、ホームから離れている間の変更を反映する。
 */
const RECENT_LIMIT = 3

const formatUpdatedAt = (value: number) => {
  const date = new Date(value)
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(value).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return `今日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (days === 1) return '昨日'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

type PendingExport = { projectId: string; projectName: string; count: number }

export default function AIDesktopHome({ canEdit, documents, onOpenDocument, onOpenProject, onOpenDesignDocuments }: {
  canEdit: boolean
  documents: AIDesktopDocument[]
  onOpenDocument: (document: AIDesktopProjectDocument) => void
  onOpenProject: (projectId: string) => void
  onOpenDesignDocuments: (projectId: string, documentId?: string) => void
}) {
  const [projects, setProjects] = useState<AIDesktopProjectSummary[]>([])
  const [designDocuments, setDesignDocuments] = useState<AIDesktopDesignDocumentSummary[]>([])
  const [pendingExports, setPendingExports] = useState<PendingExport[]>([])

  useEffect(() => {
    if (!canEdit) return
    let active = true
    void (async () => {
      const [projectResult, documentResult] = await Promise.all([listAIDesktopProjects(), listAIDesktopDesignDocuments()])
      if (!active) return
      setProjects(projectResult.projects)
      setDesignDocuments(documentResult.documents)
      const pending = await Promise.all(projectResult.projects.map(async (project) => ({
        projectId: project.id,
        projectName: project.name,
        count: await pendingAgentExportCount(project.id, project.updatedAt, documentResult.documents.filter((item) => item.projectId === project.id)).catch(() => null) ?? 0,
      })))
      if (active) setPendingExports(pending.filter((item) => item.count > 0))
    })().catch(() => { if (active) showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.home.loadFailed) })
    return () => { active = false }
  }, [canEdit])

  const sortedProjects = [...projects].sort((left, right) => right.updatedAt - left.updatedAt)
  const documentCount = (projectId: string) => designDocuments.filter((item) => item.projectId === projectId).length
  const recent = [
    ...projects.map((project) => ({ key: `project:${project.id}`, title: project.name, where: 'プロジェクト', updatedAt: project.updatedAt, open: () => onOpenProject(project.id) })),
    ...designDocuments.map((item) => ({ key: `design:${item.id}`, title: item.title, where: `${item.projectName} ・ ドキュメント`, updatedAt: item.updatedAt, open: () => onOpenDesignDocuments(item.projectId, item.id) })),
    ...documents.map((item) => ({ key: `content:${item.serviceId}:${item.categoryId}:${item.contentId}`, title: item.title, where: `${item.serviceName} ・ 資料`, updatedAt: item.updatedAt, open: () => onOpenDocument(item) })),
  ].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, RECENT_LIMIT)

  return <div className="ad-home">
    <section>
      <h1>続きから</h1>
      {recent.length ? <div className="ad-home__recent">{recent.map((item) => <button key={item.key} type="button" onClick={item.open}><strong>{item.title}</strong><span>{item.where}</span><small>{formatUpdatedAt(item.updatedAt)}</small></button>)}</div> : <p className="ad-home__empty">最近の更新はありません。</p>}
    </section>
    {canEdit ? <>
      <section>
        <h2>対応が必要なもの</h2>
        {pendingExports.length ? <div className="ad-home__attention">{pendingExports.map((item) => <button key={item.projectId} type="button" onClick={() => onOpenDesignDocuments(item.projectId)}><span>{item.projectName}に、リポジトリへ書き出していない変更があります</span><strong>書き出し待ち {item.count}件</strong></button>)}</div> : <p className="ad-home__empty">ありません。</p>}
      </section>
      <section>
        <h2>自分のプロジェクト</h2>
        {sortedProjects.length ? <div className="ad-home__list">{sortedProjects.map((project) => <button key={project.id} type="button" onClick={() => onOpenProject(project.id)}><strong>{project.name}</strong><span>ドキュメント {documentCount(project.id)}件 ・ {formatUpdatedAt(project.updatedAt)}更新</span></button>)}</div> : <p className="ad-home__empty">プロジェクトはまだありません。<Link to="/ai-desktop/projects">プロジェクトを作成</Link></p>}
      </section>
    </> : <p className="ad-home__empty">プロジェクトを使うには、Hundredへサインインしてください。</p>}
  </div>
}
