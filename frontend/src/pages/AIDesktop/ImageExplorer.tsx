import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { deleteAIDesktopImage, listAIDesktopImages, uploadAIDesktopImage, type AIDesktopCustomApp, type AIDesktopImageAsset } from '../../services/AIDesktop/aiDesktopApi'
import { AI_DESKTOP_MESSAGES } from './aiDesktopMessages'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import { confirmAIDesktop } from './aiDesktopConfirmBus'

type ServiceId = 'chatgpt' | 'codex' | 'claude' | 'ai-desktop'
type ImageFolderId = ServiceId | 'unfiled'
type ExplorerLocation = { kind: 'images' } | { kind: 'image-folder'; folderId: ImageFolderId } | { kind: 'apps' }
type BuiltInApp = { id: string; name: string; mark: string; color: string }
type AppDraft = { id?: string; name: string; url: string; mark: string; color: string; visible: boolean }

const serviceMeta: Record<ServiceId, { name: string; mark: string; color: string }> = {
  chatgpt: { name: 'ChatGPT', mark: '◎', color: '#10a37f' },
  codex: { name: 'Codex', mark: '⌘', color: '#171717' },
  claude: { name: 'Claude Code', mark: 'C', color: '#d97757' },
  'ai-desktop': { name: 'AI Desktop', mark: '▦', color: '#3975cf' },
}
const imageFolders: Array<{ id: ImageFolderId; name: string; description: string; mark: string; color: string }> = [
  ...(Object.keys(serviceMeta) as ServiceId[]).map((id) => ({ id, name: serviceMeta[id].name, description: `${serviceMeta[id].name}の画像`, mark: serviceMeta[id].mark, color: serviceMeta[id].color })),
  { id: 'unfiled', name: '未分類', description: '保存先が未設定の画像', mark: '▧', color: '#6b7280' },
]
const blankApp = (): AppDraft => ({ name: '', url: 'https://', mark: 'A', color: '#3975cf', visible: true })
const foldersForImage = (image: AIDesktopImageAsset) => image.folders ?? ['unfiled']
const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`

function FolderButton({ name, detail, mark, color, onOpen }: { name: string; detail: string; mark: string; color: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen}><i style={{ background: color }}>{mark}</i><div><strong>{name}</strong><small>{detail}</small></div></button>
}

export default function ImageExplorer({ canManage, builtInApps, customApps, visibility, onSaveApps }: {
  canManage: boolean
  builtInApps: readonly BuiltInApp[]
  customApps: AIDesktopCustomApp[]
  visibility: Record<string, boolean>
  onSaveApps: (apps: AIDesktopCustomApp[], visibility: Record<string, boolean>) => void
}) {
  const [images, setImages] = useState<AIDesktopImageAsset[]>([])
  const [loading, setLoading] = useState(canManage)
  const [location, setLocation] = useState<ExplorerLocation>({ kind: 'images' })
  const [appDraft, setAppDraft] = useState<AppDraft | null>(null)
  const load = () => { if (!canManage) return; setLoading(true); void listAIDesktopImages().then((result) => setImages(result.images)).catch(() => showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.image.listFailed)).finally(() => setLoading(false)) }
  useEffect(() => {
    if (!canManage) return
    let active = true
    void listAIDesktopImages().then((result) => { if (active) setImages(result.images) }).catch(() => showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.image.listFailed)).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [canManage])

  const upload = (folderId: ImageFolderId) => { if (folderId === 'unfiled') return; const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif'; picker.multiple = true; picker.onchange = () => { const files = [...(picker.files ?? [])]; if (!files.length) return; setLoading(true); void Promise.all(files.map((file) => uploadAIDesktopImage(file, folderId))).then(load).catch(() => { setLoading(false); showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.image.uploadFailed) }) }; picker.click() }
  const remove = async (image: AIDesktopImageAsset) => { if (image.references.length || !(await confirmAIDesktop({ title: `「${image.name}」を完全に削除しますか？`, confirmLabel: '削除', tone: 'danger' }))) return; void deleteAIDesktopImage(image.id).then(() => setImages((current) => current.filter((candidate) => candidate.id !== image.id))).catch(() => showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.image.deleteFailed)) }
  const copy = (url: string) => void navigator.clipboard.writeText(url).catch(() => showAIDesktopNotification('error', AI_DESKTOP_MESSAGES.image.copyUrlFailed))
  const setVisible = (id: string, checked: boolean) => onSaveApps(customApps, { ...visibility, [id]: checked })
  const editApp = (app: AIDesktopCustomApp) => setAppDraft({ ...app, visible: visibility[app.id] !== false })
  const deleteApp = async (app: AIDesktopCustomApp) => {
    if (!(await confirmAIDesktop({ title: `「${app.name}」を削除しますか？`, confirmLabel: '削除', tone: 'danger' }))) return
    const nextVisibility = { ...visibility }; delete nextVisibility[app.id]
    onSaveApps(customApps.filter((candidate) => candidate.id !== app.id), nextVisibility)
  }
  const submitApp = (event: FormEvent) => {
    event.preventDefault()
    if (!appDraft) return
    let url: URL
    try { url = new URL(appDraft.url) } catch { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.app.invalidUrl); return }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.app.httpUrlRequired); return }
    const id = appDraft.id ?? `custom-${crypto.randomUUID()}`
    const app: AIDesktopCustomApp = { id, name: appDraft.name.trim(), url: url.toString(), mark: appDraft.mark.trim() || 'A', color: appDraft.color }
    if (!app.name) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.app.nameRequired); return }
    const nextApps = appDraft.id ? customApps.map((candidate) => candidate.id === id ? app : candidate) : [...customApps, app]
    onSaveApps(nextApps, { ...visibility, [id]: appDraft.visible })
    setAppDraft(null)
  }

  const breadcrumbs = ['AI Desktop', location.kind === 'apps' ? 'APP' : '画像']
  if (location.kind === 'image-folder') breadcrumbs.push(imageFolders.find((folder) => folder.id === location.folderId)?.name ?? '')
  let main
  if (location.kind === 'images') {
    main = <main className="ad-explorer-home ad-explorer-flat"><section><h2>フォルダー ({imageFolders.length})</h2><div className="ad-exe-folders">{imageFolders.map((folder) => <FolderButton key={folder.id} name={folder.name} detail={canManage ? `${images.filter((image) => foldersForImage(image).includes(folder.id)).length} 個の画像` : 'サインインして管理'} mark={folder.mark} color={folder.color} onOpen={() => setLocation({ kind: 'image-folder', folderId: folder.id })} />)}</div></section></main>
  } else if (location.kind === 'apps') {
    main = <main className="ad-app-manager"><header><div><h1>APP</h1><p>デスクトップに表示するAPPと、URLから起動するAPPを管理します。</p></div><button type="button" disabled={!canManage} onClick={() => setAppDraft(blankApp())}>＋ APPを追加</button></header><section className="ad-app-list">{builtInApps.map((app) => <article key={app.id}><span className="ad-app-icon small" style={{ '--app-color': app.color } as CSSProperties}>{app.mark}</span><div><strong>{app.name}</strong><small>標準APP</small></div><label><input type="checkbox" checked={visibility[app.id] !== false} disabled={!canManage} onChange={(event) => setVisible(app.id, event.target.checked)} />デスクトップに表示</label></article>)}{customApps.map((app) => <article key={app.id}><span className="ad-app-icon small" style={{ '--app-color': app.color } as CSSProperties}>{app.mark}</span><div><strong>{app.name}</strong><small title={app.url}>{app.url}</small></div><label><input type="checkbox" checked={visibility[app.id] !== false} disabled={!canManage} onChange={(event) => setVisible(app.id, event.target.checked)} />デスクトップに表示</label><nav><button type="button" onClick={() => editApp(app)}>編集</button><button type="button" className="danger" onClick={() => deleteApp(app)}>削除</button></nav></article>)}</section>{!canManage && <p className="ad-media-state">APPの追加・設定変更にはサインインが必要です。</p>}</main>
  } else {
    const folder = imageFolders.find((candidate) => candidate.id === location.folderId)!
    const visibleImages = images.filter((image) => foldersForImage(image).includes(location.folderId))
    main = !canManage ? <main className="ad-media-locked"><span>▧</span><h1>{folder.name}</h1><p>Hundredへサインインすると画像を管理できます。</p></main> : <main className="ad-media-explorer"><header><div><h1>{folder.name}</h1><p>{folder.description}</p></div>{location.folderId !== 'unfiled' && <button onClick={() => upload(location.folderId)}>＋ 画像を追加</button>}</header>{loading ? <p className="ad-media-state">画像を読み込んでいます…</p> : visibleImages.length === 0 ? <p className="ad-media-state">このフォルダに画像はありません。</p> : <section className="ad-media-grid">{visibleImages.map((image) => <article key={image.id}><img src={image.url} alt="" /><div><strong title={image.name}>{image.name}</strong><small>{formatSize(image.size)} ・ {new Date(image.uploadedAt).toLocaleDateString('ja-JP')}</small>{image.references.length ? <p className="used">使用中：{image.references.join('、')}</p> : <p>未使用</p>}<footer><button onClick={() => copy(image.url)}>URLをコピー</button><button className="danger" disabled={image.references.length > 0} title={image.references.length ? '使用中の画像は削除できません' : undefined} onClick={() => remove(image)}>削除</button></footer></div></article>)}</section>}</main>
  }

  return <div className="ad-windows-explorer"><div className="ad-explorer-toolbar"><button aria-label="戻る" disabled={location.kind !== 'image-folder'} onClick={() => setLocation({ kind: 'images' })}>←</button><button aria-label="進む" disabled>→</button><button aria-label="上へ" disabled={location.kind !== 'image-folder'} onClick={() => setLocation({ kind: 'images' })}>↑</button><div className="ad-explorer-address">{breadcrumbs.map((crumb, index) => <span key={`${crumb}-${index}`} className="ad-explorer-crumb">{index > 0 && <b>›</b>}<span>{crumb}</span></span>)}</div></div><div className="ad-explorer-shell"><aside><button className={location.kind === 'images' || location.kind === 'image-folder' ? 'active' : ''} onClick={() => setLocation({ kind: 'images' })}><span>▧</span> 画像</button><button className={location.kind === 'apps' ? 'active' : ''} onClick={() => setLocation({ kind: 'apps' })}><span>▦</span> APP</button></aside>{main}</div>{appDraft && <div className="ad-app-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAppDraft(null) }}><form role="dialog" aria-modal="true" onSubmit={submitApp}><header><div><small>APP</small><h2>{appDraft.id ? 'APPを編集' : 'APPを追加'}</h2></div><button type="button" aria-label="閉じる" onClick={() => setAppDraft(null)}>×</button></header><label><span>APP名</span><input autoFocus maxLength={80} value={appDraft.name} onChange={(event) => setAppDraft({ ...appDraft, name: event.target.value })} /></label><label><span>URL</span><input type="url" maxLength={2000} value={appDraft.url} onChange={(event) => setAppDraft({ ...appDraft, url: event.target.value })} /></label><div className="ad-app-dialog-row"><label><span>アイコン文字</span><input maxLength={10} value={appDraft.mark} onChange={(event) => setAppDraft({ ...appDraft, mark: event.target.value })} /></label><label><span>アイコン色</span><input type="color" value={appDraft.color} onChange={(event) => setAppDraft({ ...appDraft, color: event.target.value })} /></label></div><label className="ad-app-visible"><input type="checkbox" checked={appDraft.visible} onChange={(event) => setAppDraft({ ...appDraft, visible: event.target.checked })} /><span>デスクトップに表示する</span></label><footer><button type="button" onClick={() => setAppDraft(null)}>キャンセル</button><button type="submit" className="primary">保存</button></footer></form></div>}</div>
}
