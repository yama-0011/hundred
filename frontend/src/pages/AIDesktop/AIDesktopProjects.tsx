import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { listAIDesktopDesignDocuments, listAIDesktopProjects, type AIDesktopDocument, type AIDesktopProjectDocument, type AIDesktopProjectSummary } from '../../services/AIDesktop/aiDesktopApi'
import type { ServiceConfig } from './contentBlocks'
import { AI_DESKTOP_MESSAGES, localizedErrorMessage } from './aiDesktopMessages'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import { developmentModeLabels, statusLabels } from './aiDesktopProjectLabels'
import DesignDocumentsApp, { type DesignDocumentRequest } from './DesignDocumentsApp'
import ProjectsApp from './ProjectsApp'

/**
 * 概要:
 * プロジェクト一覧と、プロジェクトごとの画面（プロジェクト情報・ドキュメント）をまとめる。
 *
 * 責務:
 * - URL（/ai-desktop/projects/<ID>/documents）から、表示するプロジェクトとタブを決める
 * - 一度開いたプロジェクトは閉じずに隠し、編集中の内容を別のプロジェクトへ移っても残す
 */
const PROJECTS_PATH = '/ai-desktop/projects'
const NEW_PROJECT_KEY = 'new'

function ProjectList() {
  const [projects, setProjects] = useState<AIDesktopProjectSummary[] | null>(null)
  const [documentCounts, setDocumentCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let active = true
    void Promise.all([listAIDesktopProjects(), listAIDesktopDesignDocuments()]).then(([projectResult, documentResult]) => {
      if (!active) return
      setProjects([...projectResult.projects].sort((left, right) => right.updatedAt - left.updatedAt))
      const counts: Record<string, number> = {}
      for (const item of documentResult.documents) counts[item.projectId] = (counts[item.projectId] ?? 0) + 1
      setDocumentCounts(counts)
    }).catch((error) => showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.project.listFailed)))
    return () => { active = false }
  }, [])

  return <div className="ad-project-index">
    <header><h1>プロジェクト</h1><Link to={`${PROJECTS_PATH}/${NEW_PROJECT_KEY}`}>＋ 新規</Link></header>
    {projects === null ? <p className="ad-home__empty">読み込んでいます…</p> : projects.length === 0 ? <p className="ad-home__empty">プロジェクトはまだありません。</p> : <div className="ad-project-index__list">{projects.map((project) => <Link key={project.id} to={`${PROJECTS_PATH}/${project.id}`}><span><strong>{project.name}</strong><small>{project.summary}</small></span><span className="ad-project-index__meta"><b>{statusLabels[project.status]}</b>{developmentModeLabels[project.developmentMode]} ・ ドキュメント {documentCounts[project.id] ?? 0}件 ・ {new Date(project.updatedAt).toLocaleDateString('ja-JP')}更新</span></Link>)}</div>}
  </div>
}

export default function AIDesktopProjects({ active, canEdit, catalog, publishedDocuments, documentRequest, onOpenDocument }: {
  active: boolean
  canEdit: boolean
  catalog: Record<string, ServiceConfig>
  publishedDocuments: AIDesktopDocument[]
  documentRequest: (DesignDocumentRequest & { projectId: string }) | null
  onOpenDocument: (document: AIDesktopProjectDocument, edit?: boolean) => void
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [, , , routeKey, routeTab] = pathname.split('/')
  const currentKey = active && routeKey ? routeKey : null
  const [visited, setVisited] = useState<string[]>(currentKey ? [currentKey] : [])
  if (currentKey && !visited.includes(currentKey)) setVisited([...visited, currentKey])
  // 削除直後はURLが変わる前に描画されることがあるため、visitedから外さず、削除済みとして覚えて読み込み直しを防ぐ。
  const [deleted, setDeleted] = useState<string[]>([])
  // 作成が済んだら新規作成の画面を作り直し、次に開いたときは空の状態にする。
  const [newFormVersion, setNewFormVersion] = useState(0)

  if (!canEdit) return <div className="ad-auth-required"><span>◆</span><h1>プロジェクト</h1><p>プロジェクトとドキュメントを使うには、Hundredへサインインしてください。</p></div>
  return <>
    {active && !currentKey && <ProjectList />}
    {visited.filter((key) => !deleted.includes(key)).map((key) => {
      const visible = key === currentKey
      const documentsTab = routeTab === 'documents'
      const projectId = key === NEW_PROJECT_KEY ? null : key
      return <div key={projectId ?? `${NEW_PROJECT_KEY}-${newFormVersion}`} className="ad-project-workspace" hidden={!visible}>
        <nav className="ad-project-workspace__bar" aria-label="プロジェクト内メニュー">
          <Link to={PROJECTS_PATH}>← プロジェクト一覧</Link>
          {projectId && <div>
            <Link to={`${PROJECTS_PATH}/${key}`} className={documentsTab ? '' : 'active'} aria-current={documentsTab ? undefined : 'page'}>プロジェクト情報</Link>
            <Link to={`${PROJECTS_PATH}/${key}/documents`} className={documentsTab ? 'active' : ''} aria-current={documentsTab ? 'page' : undefined}>ドキュメント</Link>
          </div>}
        </nav>
        <div className="ad-project-workspace__panel" hidden={visible && documentsTab}>
          <ProjectsApp canManage={canEdit} projectId={projectId} catalog={catalog} publishedDocuments={publishedDocuments} onOpenDocument={onOpenDocument} onCreated={(id) => { setNewFormVersion((current) => current + 1); navigate(`${PROJECTS_PATH}/${id}`, { replace: true }) }} onDeleted={() => { setDeleted((current) => [...current, key]); navigate(PROJECTS_PATH) }} />
        </div>
        {projectId && <div className="ad-project-workspace__panel" hidden={!visible || !documentsTab}>
          <DesignDocumentsApp canManage={canEdit} projectId={projectId} visible={visible && documentsTab} documentRequest={documentRequest?.projectId === projectId ? documentRequest : null} />
        </div>}
      </div>
    })}
  </>
}
