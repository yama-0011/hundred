import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { uploadAIDesktopImage } from '../../services/AIDesktop/aiDesktopApi'
import { AI_DESKTOP_MESSAGES, localizedErrorMessage } from './aiDesktopMessages'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import { imageFileFrom, type ScreenMapData, type ScreenMapImage } from './screenMap'

/**
 * 概要:
 * スクリーンショットを取り込み、個人情報などを四角で隠してから登録する。
 *
 * 隠した部分は、アップロードの前にブラウザで画像へ焼き込む。元の画像はサーバーへ送らない。
 * 一覧の表示に使う縮小画像も、ここで作ってアップロードする。
 */

export type ScreenMapScreenFields = { name: string; url: string; groupId?: string; stateOf?: string; description: string }
type Mask = { x: number; y: number; width: number; height: number }

const maxUploadBytes = 10 * 1024 * 1024
// キャンバスで大きく表示しても読めるよう、縮小画像は高解像度の画面でも足りる幅にする。
const thumbnailWidth = 960


const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('IMAGE')); image.src = src })
const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('IMAGE')), type, quality))

async function maskedImages(source: string, sourceType: string, masks: Mask[]) {
  const image = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('IMAGE')
  context.drawImage(image, 0, 0)
  context.fillStyle = '#000000'
  for (const mask of masks) context.fillRect(mask.x * canvas.width, mask.y * canvas.height, mask.width * canvas.width, mask.height * canvas.height)
  const full = await canvasBlob(canvas, sourceType === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92)
  const scale = Math.min(1, thumbnailWidth / canvas.width)
  const thumbnail = document.createElement('canvas')
  thumbnail.width = Math.max(1, Math.round(canvas.width * scale))
  thumbnail.height = Math.max(1, Math.round(canvas.height * scale))
  const thumbnailContext = thumbnail.getContext('2d')
  if (!thumbnailContext) throw new Error('IMAGE')
  // JPEGは透明を持てないため、透明な部分は白にする。
  thumbnailContext.fillStyle = '#ffffff'
  thumbnailContext.fillRect(0, 0, thumbnail.width, thumbnail.height)
  thumbnailContext.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height)
  return { full, thumbnail: await canvasBlob(thumbnail, 'image/jpeg', 0.82), width: canvas.width, height: canvas.height }
}

type ScreenMapAddDialogProps = {
  mode: 'create' | 'replace'
  data: ScreenMapData
  initialFile: File | null
  defaultGroupId?: string
  targetName?: string
  imageFolder: string
  onCancel: () => void
  onSubmit: (image: ScreenMapImage, fields: ScreenMapScreenFields | null) => void
}

function ScreenMapAddDialog({ mode, data, initialFile, defaultGroupId, targetName, imageFolder, onCancel, onSubmit }: ScreenMapAddDialogProps) {
  const [file, setFile] = useState<File | null>(initialFile)
  const [masks, setMasks] = useState<Mask[]>([])
  const [draft, setDraft] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<ScreenMapScreenFields>({ name: '', url: '', groupId: defaultGroupId, description: '' })
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const chooseFile = (next: File | null) => {
    if (!next) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.screenMapImageInvalid); return }
    setFile(next)
    setMasks([])
  }
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const pasted = imageFileFrom(event.clipboardData?.files)
      if (!pasted) return
      event.preventDefault()
      setFile(pasted)
      setMasks([])
    }
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('paste', paste)
    window.addEventListener('keydown', close)
    return () => { window.removeEventListener('paste', paste); window.removeEventListener('keydown', close) }
  }, [busy, onCancel])

  const pickFile = () => {
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/png,image/jpeg,image/webp'
    picker.onchange = () => chooseFile(imageFileFrom(picker.files))
    picker.click()
  }
  const pointOf = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) }
  }
  const draftMask = (value: NonNullable<typeof draft>): Mask => ({ x: Math.min(value.startX, value.x), y: Math.min(value.startY, value.y), width: Math.abs(value.x - value.startX), height: Math.abs(value.y - value.startY) })
  const startMask = (event: ReactPointerEvent<HTMLDivElement>) => { if (busy) return; event.currentTarget.setPointerCapture(event.pointerId); const point = pointOf(event); setDraft({ startX: point.x, startY: point.y, ...point }) }
  const moveMask = (event: ReactPointerEvent<HTMLDivElement>) => { if (draft) { const point = pointOf(event); setDraft({ ...draft, ...point }) } }
  const endMask = () => {
    if (!draft) return
    const mask = draftMask(draft)
    // 誤タップで小さな四角ができないよう、ある程度の大きさがあるときだけ追加する。
    if (mask.width > 0.01 && mask.height > 0.01) setMasks((current) => [...current, mask])
    setDraft(null)
  }

  const submit = async () => {
    if (!file || !previewUrl) return
    if (mode === 'create' && !fields.name.trim()) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.screenMapNameRequired); return }
    setBusy(true)
    try {
      const { full, thumbnail, width, height } = await maskedImages(previewUrl, file.type, masks)
      if (full.size > maxUploadBytes) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.screenMapImageTooLarge); return }
      const baseName = (fields.name.trim() || targetName || 'screen').replace(/[\\/:*?"<>|]/gu, '-')
      const [uploaded, uploadedThumbnail] = await Promise.all([
        uploadAIDesktopImage(new File([full], `${baseName}.${full.type === 'image/jpeg' ? 'jpg' : 'png'}`, { type: full.type }), imageFolder),
        uploadAIDesktopImage(new File([thumbnail], `${baseName}-thumbnail.jpg`, { type: 'image/jpeg' }), imageFolder),
      ])
      const image: ScreenMapImage = { imageId: uploaded.id, url: uploaded.url, thumbnailImageId: uploadedThumbnail.id, thumbnailUrl: uploadedThumbnail.url, width, height, masked: masks.length > 0, capturedAt: Date.now() }
      onSubmit(image, mode === 'create' ? { ...fields, name: fields.name.trim(), url: fields.url.trim(), description: fields.description.trim() } : null)
    } catch (error) {
      showAIDesktopNotification('error', localizedErrorMessage(error, AI_DESKTOP_MESSAGES.content.screenMapUploadFailed))
    } finally {
      setBusy(false)
    }
  }

  const visibleMasks = draft ? [...masks, draftMask(draft)] : masks
  const step = file ? 2 : 1
  const stepClass = (value: number) => value < step ? 'done' : value === step ? 'current' : ''
  return <div className="ad-sm-dialog-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <section className="ad-sm-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-sm-dialog-title">
      <header>
        <div><small>{mode === 'create' ? 'NEW SCREEN' : 'REPLACE IMAGE'}</small><h2 id="ad-sm-dialog-title">{mode === 'create' ? '画面を追加' : `「${targetName || '名称未設定'}」の画像を差し替え`}</h2></div>
        <ol className="ad-sm-steps">
          <li className={stepClass(1)}><span>{step > 1 ? '✓' : '1'}</span>画像を選ぶ</li>
          <li className={stepClass(2)}><span>2</span>マスキング</li>
          {mode === 'create' && <li><span>3</span>画面の情報</li>}
        </ol>
        <button type="button" aria-label="閉じる" disabled={busy} onClick={onCancel}>×</button>
      </header>
      <div className="ad-sm-dialog-body">
        <div className="ad-sm-dialog-image">
          {previewUrl ? <>
            <div className="ad-sm-mask-toolbar" role="toolbar" aria-label="マスキングの操作">
              <span>ドラッグで、隠したい範囲を四角で囲みます。</span>
              <button type="button" disabled={busy || masks.length === 0} onClick={() => setMasks((current) => current.slice(0, -1))}>元に戻す</button>
              <button type="button" disabled={busy || masks.length === 0} onClick={() => setMasks([])}>すべて解除</button>
              <button type="button" disabled={busy} onClick={pickFile}>別の画像を選ぶ</button>
            </div>
            <div className="ad-sm-mask-stage">
              <div className="ad-sm-mask-area">
                <img src={previewUrl} alt="取り込む画像" draggable={false} />
                <div className="ad-sm-mask-overlay" onPointerDown={startMask} onPointerMove={moveMask} onPointerUp={endMask} onPointerCancel={() => setDraft(null)}>
                  {visibleMasks.map((mask, index) => <span key={index} style={{ left: `${mask.x * 100}%`, top: `${mask.y * 100}%`, width: `${mask.width * 100}%`, height: `${mask.height * 100}%` }}>{index < masks.length && `マスク ${index + 1}`}</span>)}
                </div>
              </div>
            </div>
            <p className="ad-sm-mask-note">隠した部分は画像に焼き込んでから保存します。元の画像は保存しません。</p>
          </> : <button type="button" className="ad-sm-drop-zone" onClick={pickFile} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(imageFileFrom(event.dataTransfer.files)) }}>
            <strong>スクリーンショットを貼り付け、またはドロップ</strong>
            <span>⌘V（Ctrl+V）で貼り付けるか、ここを押して画像を選びます。PNG・JPEG・WebP、10MBまで。</span>
          </button>}
        </div>
        {mode === 'create' && <div className="ad-sm-dialog-fields">
          <h3>画面の情報</h3>
          <label><span>画面名（必須）</span><input value={fields.name} maxLength={100} onChange={(event) => setFields({ ...fields, name: event.target.value })} placeholder="例：友だち一覧" /></label>
          <label><span>URL</span><input value={fields.url} maxLength={2000} onChange={(event) => setFields({ ...fields, url: event.target.value })} placeholder="例：/friends" /></label>
          <label><span>グループ</span><select value={fields.groupId ?? ''} onChange={(event) => setFields({ ...fields, groupId: event.target.value || undefined })}><option value="">グループなし</option>{data.groups.map((group) => <option key={group.id} value={group.id}>{group.name || '名称未設定'}</option>)}</select></label>
          <label><span>元の画面（同じ画面の別の状態のとき）</span><select value={fields.stateOf ?? ''} onChange={(event) => setFields({ ...fields, stateOf: event.target.value || undefined })}><option value="">なし</option>{data.screens.map((screen) => <option key={screen.id} value={screen.id}>{screen.name || '名称未設定'}</option>)}</select></label>
          <label><span>説明</span><textarea value={fields.description} maxLength={5000} onChange={(event) => setFields({ ...fields, description: event.target.value })} placeholder="この画面でできることを入力" /></label>
        </div>}
      </div>
      <footer>
        <button type="button" disabled={busy} onClick={onCancel}>キャンセル</button>
        <button type="button" className="primary" disabled={busy || !file || (mode === 'create' && !fields.name.trim())} onClick={() => void submit()}>{busy ? '登録中…' : masks.length ? 'マスキングして登録' : '登録'}</button>
      </footer>
    </section>
  </div>
}

export default ScreenMapAddDialog
