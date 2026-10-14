/**
 * 概要:
 * マイ資料のJSON連携で、利用者が選んだワークスペースのフォルダ（ai-desktop-workspace）へ、ページのJSONを書き出す・読み込む。
 *
 * 責務:
 * - ワークスペースのフォルダをブラウザへ記録し、次回から選び直さずに使えるようにする
 * - ページごとに、ai-desktop:pull と同じ場所（<local|remote>/<資料ID>/<カテゴリID>/<ページID>.json）へ書き出す
 * - Screen Mapのページは、画面ごとの画像を「<ページID>-images」へ書き出し、画面IDと画像のパスの対応をJSONのscreenImagesに書く
 *
 * 同じページは同じ名前で上書きする。版の履歴はAI Desktopの下書き履歴で残す。
 * フォルダへの書き込みはChrome・Edgeなどだけが対応している。対応していないブラウザでは、呼び出し側でJSONをダウンロードする。
 */
import type { ScreenMapData } from './screenMap'

const DATABASE_NAME = 'hundred-ai-desktop'
const STORE_NAME = 'workspace-files'
const STORAGE_KEY = 'content-workspace-folder'

type PermissionMode = 'read' | 'readwrite'
type PersistentDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (descriptor?: { mode?: PermissionMode }) => Promise<PermissionState>
  requestPermission: (descriptor?: { mode?: PermissionMode }) => Promise<PermissionState>
}
type DirectoryPickerWindow = Window & { showDirectoryPicker?: (options?: { id?: string; mode?: PermissionMode }) => Promise<PersistentDirectoryHandle> }
type WritableFileHandle = FileSystemFileHandle & { createWritable: () => Promise<{ write: (content: string | Blob) => Promise<void>; close: () => Promise<void> }> }

export type ContentWorkspaceTarget = { databaseTarget: 'local' | 'remote'; serviceId: string; categoryId: string; contentId: string }
export type ScreenMapImageEntry = { name: string; path: string; masked: boolean }
export type ContentWorkspaceWriteResult = { path: string; imageCount: number; failedScreens: string[] }

// ai-desktop:pull（workers/apps-api/scripts/ai-desktop-content.mjs）のsafeNameと同じ規則にする。
const safeName = (value: string) => value.replace(/[\\/:*?"<>|]/gu, '-').replace(/\s+/gu, '-')
const folderPath = (target: ContentWorkspaceTarget) => [target.databaseTarget, safeName(target.serviceId), safeName(target.categoryId)]
const fileName = (target: ContentWorkspaceTarget) => `${safeName(target.contentId)}.json`
const imageFolderName = (target: ContentWorkspaceTarget) => `${safeName(target.contentId)}-images`
/** 画面に表示する、ワークスペースの中でのファイルの場所。 */
export const contentWorkspacePath = (target: ContentWorkspaceTarget) => [...folderPath(target), fileName(target)].join('/')

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function storedFolder() {
  const database = await openDatabase()
  return new Promise<PersistentDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(STORAGE_KEY)
    request.onsuccess = () => resolve(request.result instanceof FileSystemDirectoryHandle ? request.result as PersistentDirectoryHandle : null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
    transaction.onabort = () => database.close()
  })
}

async function storeFolder(handle: PersistentDirectoryHandle) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(handle, STORAGE_KEY)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
    transaction.onabort = () => { database.close(); reject(transaction.error) }
  })
}

async function hasPermission(handle: PersistentDirectoryHandle, mode: PermissionMode) {
  if (await handle.queryPermission({ mode }) === 'granted') return true
  return await handle.requestPermission({ mode }) === 'granted'
}

async function pickFolder() {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) throw new Error('FILE_SYSTEM_ACCESS_UNSUPPORTED')
  const handle = await picker({ id: 'ai-desktop-workspace', mode: 'readwrite' })
  if (!await hasPermission(handle, 'readwrite')) throw new Error('FILE_PERMISSION_DENIED')
  await storeFolder(handle).catch(() => undefined)
  return handle
}

async function workspaceFolder(mode: PermissionMode) {
  const stored = await storedFolder().catch(() => null)
  if (stored && await hasPermission(stored, mode)) return stored
  return pickFolder()
}

async function descend(root: FileSystemDirectoryHandle, names: string[], create: boolean) {
  let current = root
  for (const name of names) current = await current.getDirectoryHandle(name, { create })
  return current
}

async function writeFile(folder: FileSystemDirectoryHandle, name: string, content: string | Blob) {
  const handle = await folder.getFileHandle(name, { create: true }) as WritableFileHandle
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

/** フォルダへの書き出しに対応したブラウザかを返す。 */
export function supportsContentWorkspaceFolder() {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function' && 'indexedDB' in window
}

/** ワークスペースのフォルダを選び直す。 */
export async function selectContentWorkspaceFolder() {
  return (await pickFolder()).name
}

/**
 * ページのJSONを書き出す。Screen Mapのページなら、画面ごとの画像も書き出し、パスの対応をcreatePayloadへ渡す。
 * 取得できなかった画像があっても、残りの画像とJSONは書き出し、取得できなかった画面名を返す。
 */
export async function writeContentWorkspace(target: ContentWorkspaceTarget, screenMap: ScreenMapData | null, createPayload: (screenImages: Record<string, ScreenMapImageEntry> | null) => unknown): Promise<ContentWorkspaceWriteResult> {
  const root = await workspaceFolder('readwrite')
  const folder = await descend(root, folderPath(target), true)
  let screenImages: Record<string, ScreenMapImageEntry> | null = null
  const failedScreens: string[] = []
  if (screenMap) {
    // 前回の画像が残って、削除した画面の画像をAIが読まないよう、画像のフォルダは作り直す。
    await folder.removeEntry(imageFolderName(target), { recursive: true }).catch(() => undefined)
    const imageFolder = await folder.getDirectoryHandle(imageFolderName(target), { create: true })
    screenImages = {}
    for (const screen of screenMap.screens) {
      const image = screen.images[0]
      if (!image?.url) continue
      try {
        // 画面の表示で読み込んだ画像は、CORSの許可がない応答としてキャッシュされていることがある。書き出しではキャッシュを使わずに取り直す。
        const response = await fetch(image.url, { cache: 'reload' })
        if (!response.ok) throw new Error(`IMAGE_${response.status}`)
        const imageName = `${safeName(screen.id)}.${image.imageId.split('.').pop() || 'png'}`
        await writeFile(imageFolder, imageName, await response.blob())
        screenImages[screen.id] = { name: screen.name || '名称未設定', path: `${imageFolderName(target)}/${imageName}`, masked: image.masked }
      } catch (error) {
        console.warn('Screen Mapの画像を書き出せませんでした', screen.id, image.url, error)
        failedScreens.push(screen.name || '名称未設定')
      }
    }
  }
  await writeFile(folder, fileName(target), `${JSON.stringify(createPayload(screenImages), null, 2)}\n`)
  return { path: `${root.name}/${contentWorkspacePath(target)}`, imageCount: screenImages ? Object.keys(screenImages).length : 0, failedScreens }
}

/** 開いているページのJSONを、ワークスペースから読み込む。 */
export async function readContentWorkspace(target: ContentWorkspaceTarget) {
  const root = await workspaceFolder('read')
  const folder = await descend(root, folderPath(target), false).catch(() => { throw new Error('WORKSPACE_FILE_NOT_FOUND') })
  const file = await (await folder.getFileHandle(fileName(target)).catch(() => { throw new Error('WORKSPACE_FILE_NOT_FOUND') })).getFile()
  return { name: `${root.name}/${contentWorkspacePath(target)}`, content: await file.text() }
}
