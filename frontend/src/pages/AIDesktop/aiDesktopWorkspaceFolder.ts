/**
 * 概要:
 * マイ資料・ドキュメント・プロジェクトのJSON連携で、利用者が選んだワークスペースのフォルダ（ai-desktop-workspace）へ、JSONを書き出す・読み込む。
 *
 * 責務:
 * - ワークスペースのフォルダをブラウザへ記録し、3つのAppで共通に使う（選ぶのは1回だけ）
 * - 書き出す場所を、対象の種類とタイトルから自動で決める
 *   - マイ資料：<local|remote>/マイ資料/<資料名>/<カテゴリ名>/<番号> <ページ名>.json（ai-desktop:pull と同じ場所）
 *   - プロジェクト：<local|remote>/プロジェクト/<プロジェクト名>/プロジェクト.json
 *   - ドキュメント：<local|remote>/プロジェクト/<プロジェクト名>/ドキュメント/<カテゴリ名>/<ドキュメント名>.json
 * - Screen Mapのページは、画面ごとの画像を「<番号> <ページ名> の画像」へ書き出し、画面IDと画像のパスの対応をJSONのscreenImagesに書く
 * - タイトルや表示順が変わっていたら、JSONのtargetのIDで以前のフォルダとファイルを探し、名前を付け直す
 *
 * IDはフォルダ名やファイル名に使わず、JSONのtargetだけに持つ（ai-desktop:pushはtargetで登録先を決める）。
 * 版の履歴はAI Desktopの下書き履歴で残す。
 * フォルダへの書き込みはChrome・Edgeなどだけが対応している。対応していないブラウザでは、呼び出し側でJSONをダウンロードする。
 */
import type { ScreenMapData } from './screenMap'

const DATABASE_NAME = 'hundred-ai-desktop'
const STORE_NAME = 'workspace-files'
const STORAGE_KEY = 'content-workspace-folder'
const CONTENT_SECTION = 'マイ資料'
const PROJECT_SECTION = 'プロジェクト'
const PROJECT_FILE = 'プロジェクト.json'
const DOCUMENT_FOLDER = 'ドキュメント'
const UNCATEGORIZED = '未分類'

type PermissionMode = 'read' | 'readwrite'
type PersistentDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (descriptor?: { mode?: PermissionMode }) => Promise<PermissionState>
  requestPermission: (descriptor?: { mode?: PermissionMode }) => Promise<PermissionState>
}
type DirectoryPickerWindow = Window & { showDirectoryPicker?: (options?: { id?: string; mode?: PermissionMode }) => Promise<PersistentDirectoryHandle> }
type WritableFileHandle = FileSystemFileHandle & { createWritable: () => Promise<{ write: (content: string | Blob) => Promise<void>; close: () => Promise<void> }> }
type IterableDirectoryHandle = FileSystemDirectoryHandle & { values: () => AsyncIterable<FileSystemHandle> }
type MovableHandle = FileSystemHandle & { move?: (parent: FileSystemDirectoryHandle, name: string) => Promise<void> }
type JsonTarget = Record<string, unknown>
export type WorkspaceDatabase = 'local' | 'remote'

/** siblingsは、書き出すページを含む同じカテゴリのページの名前と番号。ファイル名の決定と、ほかのページの名前の付け直しに使う。 */
export type ContentWorkspaceTarget = {
  databaseTarget: WorkspaceDatabase
  serviceId: string
  serviceName: string
  categoryId: string
  categoryName: string
  contentId: string
  siblings: { id: string; name: string; number: string }[]
}
/** 保存前の新しいプロジェクトはprojectIdがnull。そのときはプロジェクト名のフォルダを使う。 */
export type ProjectWorkspaceTarget = { databaseTarget: WorkspaceDatabase; projectId: string | null; projectName: string }
export type DesignDocumentWorkspaceTarget = ProjectWorkspaceTarget & { designDocumentId: string; title: string; categoryName: string | null }
export type ScreenMapImageEntry = { name: string; path: string; masked: boolean }
export type ContentWorkspaceWriteResult = { path: string; imageCount: number; failedScreens: string[]; orphanFiles: string[] }
export type WorkspaceFile = { name: string; content: string }

// ai-desktop:pull（workers/apps-api/scripts/ai-desktop-content.mjs）のworkspaceNameと同じ規則にする。
// ファイル名に使えない文字は全角に置き換え、タイトルの見た目をできるだけ残す。
const fullWidth: Record<string, string> = { '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？', '"': '＂', '<': '＜', '>': '＞', '|': '｜' }
const workspaceName = (value: string) => value.replace(/[\\/:*?"<>|]/gu, (character) => fullWidth[character]).replace(/\s+/gu, ' ').trim().replace(/[. ]+$/u, '').slice(0, 80) || '名称未設定'
const pageStem = (page: { name: string; number: string }) => `${page.number} ${workspaceName(page.name)}`
const imageFolderName = (stem: string) => `${stem} の画像`
const imageFileName = (index: number, name: string, extension: string) => `${String(index + 1).padStart(2, '0')} ${workspaceName(name)}.${extension}`
const currentPage = (target: ContentWorkspaceTarget) => target.siblings.find((page) => page.id === target.contentId) ?? { id: target.contentId, name: '名称未設定', number: '99' }
const distinctName = (name: string, id: string | null) => `${name}（${(id ?? 'new').slice(0, 8)}）`

/**
 * カテゴリ内のページの番号（2桁）。AI Desktopでの表示順に合わせる。
 * 先頭がScreen Mapのカテゴリは00から（Screen Mapが00）、そうでなければ01から振る。
 */
export const workspacePageNumbers = (pages: { id: string }[], startsWithScreenMap: boolean) => new Map(pages.map((page, index) => [page.id, String(startsWithScreenMap ? index : index + 1).padStart(2, '0')]))
/** 画面に表示する、ワークスペースの中でのファイルの場所（名前が重なってIDを付けた場合は異なる）。 */
export const contentWorkspacePath = (target: ContentWorkspaceTarget) => [target.databaseTarget, CONTENT_SECTION, workspaceName(target.serviceName), workspaceName(target.categoryName), `${pageStem(currentPage(target))}.json`].join('/')
export const projectWorkspacePath = (target: ProjectWorkspaceTarget) => [target.databaseTarget, PROJECT_SECTION, workspaceName(target.projectName), PROJECT_FILE].join('/')
export const designDocumentWorkspacePath = (target: DesignDocumentWorkspaceTarget) => [target.databaseTarget, PROJECT_SECTION, workspaceName(target.projectName), DOCUMENT_FOLDER, workspaceName(target.categoryName ?? UNCATEGORIZED), `${workspaceName(target.title)}.json`].join('/')

/** フォルダやファイルの選択を利用者が取り消したか。 */
export function isWorkspaceCancelled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

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

async function writeFile(folder: FileSystemDirectoryHandle, name: string, content: string | Blob) {
  const handle = await folder.getFileHandle(name, { create: true }) as WritableFileHandle
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}
const writeJson = (folder: FileSystemDirectoryHandle, name: string, payload: unknown) => writeFile(folder, name, `${JSON.stringify(payload, null, 2)}\n`)

async function entries(folder: FileSystemDirectoryHandle) {
  const result: FileSystemHandle[] = []
  for await (const entry of (folder as IterableDirectoryHandle).values()) result.push(entry)
  return result
}
const directories = async (folder: FileSystemDirectoryHandle) => (await entries(folder)).filter((entry): entry is FileSystemDirectoryHandle => entry.kind === 'directory')
const exists = async (folder: FileSystemDirectoryHandle, name: string, kind: 'file' | 'directory') => (kind === 'file' ? folder.getFileHandle(name) : folder.getDirectoryHandle(name)).then(() => true, () => false)
const childFolder = (folder: FileSystemDirectoryHandle, name: string) => folder.getDirectoryHandle(name).catch(() => null)

/** フォルダ直下のJSONのうち、ワークスペースのJSON（targetを持つもの）のファイル名とtarget。 */
async function jsonTargets(folder: FileSystemDirectoryHandle) {
  const result: { name: string; target: JsonTarget }[] = []
  for (const entry of await entries(folder)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    try {
      const payload = JSON.parse(await (await (entry as FileSystemFileHandle).getFile()).text()) as { target?: JsonTarget }
      if (payload?.target && typeof payload.target === 'object') result.push({ name: entry.name, target: payload.target })
    } catch { /* ワークスペースのJSONでないファイルは対象にしない。 */ }
  }
  return result
}
const readText = async (folder: FileSystemDirectoryHandle, name: string) => (await (await folder.getFileHandle(name)).getFile()).text()

async function copyDirectory(source: FileSystemDirectoryHandle, destination: FileSystemDirectoryHandle) {
  for (const entry of await entries(source)) {
    if (entry.kind === 'directory') await copyDirectory(entry as FileSystemDirectoryHandle, await destination.getDirectoryHandle(entry.name, { create: true }))
    else await writeFile(destination, entry.name, await (entry as FileSystemFileHandle).getFile())
  }
}

/**
 * ファイルやフォルダを、別の名前や別のフォルダへ移す。移動に対応していないブラウザでは、複製してから元を消す。
 * フォルダは、移動先が既にあれば中身を合わせる。ファイルは、移動先が既にあれば移さない。
 */
async function moveEntry(from: FileSystemDirectoryHandle, name: string, to: FileSystemDirectoryHandle, newName: string, kind: 'file' | 'directory') {
  if (await from.isSameEntry(to) && name === newName) return
  const occupied = await exists(to, newName, kind)
  if (occupied && kind === 'file') return
  const handle = (kind === 'file' ? await from.getFileHandle(name) : await from.getDirectoryHandle(name)) as MovableHandle
  if (!occupied && handle.move) {
    try { await handle.move(to, newName); return } catch { /* 複製して移す。 */ }
  }
  if (kind === 'file') await writeFile(to, newName, await (handle as unknown as FileSystemFileHandle).getFile())
  else await copyDirectory(handle as unknown as FileSystemDirectoryHandle, await to.getDirectoryHandle(newName, { create: true }))
  await from.removeEntry(name, { recursive: true })
}

/** フォルダの中のJSON（depthの階層まで）のtargetから持ち主を判定する。JSONがなければnull（だれのものでもない）。 */
async function ownerOf(folder: FileSystemDirectoryHandle, matches: (target: JsonTarget) => boolean, depth: number): Promise<boolean | null> {
  const targets = await jsonTargets(folder)
  if (targets.some(({ target }) => matches(target))) return true
  let owner: boolean | null = targets.length ? false : null
  if (depth > 0) for (const child of await directories(folder)) {
    const result = await ownerOf(child, matches, depth - 1)
    if (result) return true
    if (result === false) owner = false
  }
  return owner
}

/**
 * 対象のフォルダを用意する。ownsは、そのフォルダが対象のものか（JSONのtargetで判定）を返す。
 * 以前の名前のフォルダがあれば新しい名前へ付け直す。legacyParentsには、構成を変える前に置いていた親フォルダを渡し、見つかれば移す。
 * 新しい名前のフォルダが別の対象のものなら、IDの先頭を付けて区別する。
 */
async function placeFolder(parent: FileSystemDirectoryHandle, desired: string, id: string | null, owns: (folder: FileSystemDirectoryHandle) => Promise<boolean | null>, legacyParents: { folder: FileSystemDirectoryHandle; skip: string[] }[] = []) {
  let previous: { parent: FileSystemDirectoryHandle; name: string } | null = null
  const occupied = new Set<string>()
  for (const folder of await directories(parent)) {
    const owner = id ? await owns(folder) : null
    if (owner === true) previous ??= { parent, name: folder.name }
    else if (owner === false) occupied.add(folder.name)
  }
  if (!previous && id) for (const legacy of legacyParents) {
    for (const folder of await directories(legacy.folder)) {
      if (!legacy.skip.includes(folder.name) && await owns(folder) === true) { previous = { parent: legacy.folder, name: folder.name }; break }
    }
    if (previous) break
  }
  const name = occupied.has(desired) ? distinctName(desired, id) : desired
  if (previous && !(await previous.parent.isSameEntry(parent) && previous.name === name)) await moveEntry(previous.parent, previous.name, parent, name, 'directory')
  return parent.getDirectoryHandle(name, { create: true })
}

const databaseFolder = (root: FileSystemDirectoryHandle, database: WorkspaceDatabase) => root.getDirectoryHandle(database, { create: true })

// マイ資料

async function contentCategoryFolder(root: FileSystemDirectoryHandle, target: ContentWorkspaceTarget) {
  const database = await databaseFolder(root, target.databaseTarget)
  const section = await database.getDirectoryHandle(CONTENT_SECTION, { create: true })
  // 以前は資料のフォルダを <local|remote> の直下に置いていた。見つかればマイ資料の下へ移す。
  const service = await placeFolder(section, workspaceName(target.serviceName), target.serviceId, (folder) => ownerOf(folder, (candidate) => candidate.serviceId === target.serviceId, 1), [{ folder: database, skip: [CONTENT_SECTION, PROJECT_SECTION] }])
  return placeFolder(service, workspaceName(target.categoryName), target.categoryId, (folder) => ownerOf(folder, (candidate) => candidate.serviceId === target.serviceId && candidate.categoryId === target.categoryId, 0))
}

/**
 * カテゴリのフォルダの中のページのファイルを、現在の名前と番号に付け直す。画像のフォルダも合わせる。
 * AI Desktopにないページのファイルは消さずに返す（利用者が確認して消す）。
 */
async function renamePages(folder: FileSystemDirectoryHandle, target: ContentWorkspaceTarget) {
  const pages = new Map(target.siblings.map((page) => [page.id, pageStem(page)]))
  const orphanFiles: string[] = []
  for (const { name, target: fileTarget } of await jsonTargets(folder)) {
    if (fileTarget.serviceId !== target.serviceId || fileTarget.categoryId !== target.categoryId || typeof fileTarget.contentId !== 'string') continue
    const stem = pages.get(fileTarget.contentId)
    if (!stem) { orphanFiles.push(name); continue }
    if (name === `${stem}.json`) continue
    if (await exists(folder, `${stem}.json`, 'file')) {
      // 以前の書き出しのファイル（同じページの古い名前）は、新しい名前のファイルがあれば不要になる。
      if (fileTarget.contentId === target.contentId) await folder.removeEntry(name)
      continue
    }
    await moveEntry(folder, name, folder, `${stem}.json`, 'file')
    const previousStem = name.replace(/\.json$/u, '')
    for (const previousImages of [imageFolderName(previousStem), `${previousStem}-images`]) {
      if (await exists(folder, previousImages, 'directory')) await moveEntry(folder, previousImages, folder, imageFolderName(stem), 'directory')
    }
  }
  return orphanFiles
}

/** フォルダへの書き出しに対応したブラウザかを返す。 */
export function supportsWorkspaceFolder() {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function' && 'indexedDB' in window
}

/** ワークスペースのフォルダを選び直す。3つのAppで共通。 */
export async function selectWorkspaceFolder() {
  return (await pickFolder()).name
}

/**
 * ページのJSONを書き出す。Screen Mapのページなら、画面ごとの画像も書き出し、パスの対応をcreatePayloadへ渡す。
 * 取得できなかった画像があっても、残りの画像とJSONは書き出し、取得できなかった画面名を返す。
 */
export async function writeContentWorkspace(target: ContentWorkspaceTarget, screenMap: ScreenMapData | null, createPayload: (screenImages: Record<string, ScreenMapImageEntry> | null) => unknown): Promise<ContentWorkspaceWriteResult> {
  const root = await workspaceFolder('readwrite')
  const folder = await contentCategoryFolder(root, target)
  const orphanFiles = await renamePages(folder, target)
  const stem = pageStem(currentPage(target))
  let screenImages: Record<string, ScreenMapImageEntry> | null = null
  const failedScreens: string[] = []
  if (screenMap) {
    // 前回の画像が残って、削除した画面の画像をAIが読まないよう、画像のフォルダは作り直す。
    await folder.removeEntry(imageFolderName(stem), { recursive: true }).catch(() => undefined)
    const imageFolder = await folder.getDirectoryHandle(imageFolderName(stem), { create: true })
    screenImages = {}
    for (const [index, screen] of screenMap.screens.entries()) {
      const image = screen.images[0]
      if (!image?.url) continue
      try {
        // 画面の表示で読み込んだ画像は、CORSの許可がない応答としてキャッシュされていることがある。書き出しではキャッシュを使わずに取り直す。
        const response = await fetch(image.url, { cache: 'reload' })
        if (!response.ok) throw new Error(`IMAGE_${response.status}`)
        const imageName = imageFileName(index, screen.name || '名称未設定', image.imageId.split('.').pop() || 'png')
        await writeFile(imageFolder, imageName, await response.blob())
        screenImages[screen.id] = { name: screen.name || '名称未設定', path: `${imageFolderName(stem)}/${imageName}`, masked: image.masked }
      } catch (error) {
        console.warn('Screen Mapの画像を書き出せませんでした', screen.id, image.url, error)
        failedScreens.push(screen.name || '名称未設定')
      }
    }
  }
  await writeJson(folder, `${stem}.json`, createPayload(screenImages))
  return { path: `${root.name}/${contentWorkspacePath(target)}`, imageCount: screenImages ? Object.keys(screenImages).length : 0, failedScreens, orphanFiles }
}

/** 開いているページのJSONを、ワークスペースから読み込む。名前が変わっていても、targetのIDで探す。 */
export async function readContentWorkspace(target: ContentWorkspaceTarget): Promise<WorkspaceFile> {
  const root = await workspaceFolder('read')
  const section = await childFolder(await databaseFolder(root, target.databaseTarget), CONTENT_SECTION)
  if (section) for (const service of await directories(section)) {
    for (const category of await directories(service)) {
      const found = (await jsonTargets(category)).find(({ target: fileTarget }) => fileTarget.serviceId === target.serviceId && fileTarget.categoryId === target.categoryId && fileTarget.contentId === target.contentId)
      if (found) return { name: `${root.name}/${target.databaseTarget}/${CONTENT_SECTION}/${service.name}/${category.name}/${found.name}`, content: await readText(category, found.name) }
    }
  }
  throw new Error('WORKSPACE_FILE_NOT_FOUND')
}

// プロジェクトとドキュメント

const ownsProject = (projectId: string | null) => (folder: FileSystemDirectoryHandle) => ownerOf(folder, (candidate) => candidate.projectId === projectId, 2)

async function projectFolder(root: FileSystemDirectoryHandle, target: ProjectWorkspaceTarget) {
  const section = await (await databaseFolder(root, target.databaseTarget)).getDirectoryHandle(PROJECT_SECTION, { create: true })
  return placeFolder(section, workspaceName(target.projectName), target.projectId, ownsProject(target.projectId))
}

/** 書き出したことのあるプロジェクトのフォルダを探す。保存前の新しいプロジェクトは、プロジェクト名のフォルダを使う。 */
async function existingProjectFolder(root: FileSystemDirectoryHandle, target: ProjectWorkspaceTarget) {
  const section = await childFolder(await databaseFolder(root, target.databaseTarget), PROJECT_SECTION)
  if (!section) return null
  if (!target.projectId) return childFolder(section, workspaceName(target.projectName))
  for (const folder of await directories(section)) if (await ownsProject(target.projectId)(folder)) return folder
  return null
}

export async function writeProjectWorkspace(target: ProjectWorkspaceTarget, payload: unknown) {
  const root = await workspaceFolder('readwrite')
  const folder = await projectFolder(root, target)
  await writeJson(folder, PROJECT_FILE, payload)
  return `${root.name}/${target.databaseTarget}/${PROJECT_SECTION}/${folder.name}/${PROJECT_FILE}`
}

export async function readProjectWorkspace(target: ProjectWorkspaceTarget): Promise<WorkspaceFile> {
  const root = await workspaceFolder('read')
  const folder = await existingProjectFolder(root, target)
  if (!folder || !await exists(folder, PROJECT_FILE, 'file')) throw new Error('WORKSPACE_FILE_NOT_FOUND')
  return { name: `${root.name}/${target.databaseTarget}/${PROJECT_SECTION}/${folder.name}/${PROJECT_FILE}`, content: await readText(folder, PROJECT_FILE) }
}

/** ドキュメントのフォルダの中から、同じドキュメントIDのJSONを探す（カテゴリ名や名前が変わっていても見つける）。 */
async function documentFiles(documents: FileSystemDirectoryHandle, designDocumentId: string) {
  const result: { folder: FileSystemDirectoryHandle; name: string }[] = []
  for (const category of await directories(documents)) {
    for (const { name, target } of await jsonTargets(category)) if (target.designDocumentId === designDocumentId) result.push({ folder: category, name })
  }
  return result
}

export async function writeDesignDocumentWorkspace(target: DesignDocumentWorkspaceTarget, payload: unknown) {
  const root = await workspaceFolder('readwrite')
  const project = await projectFolder(root, target)
  const documents = await project.getDirectoryHandle(DOCUMENT_FOLDER, { create: true })
  const category = await documents.getDirectoryHandle(workspaceName(target.categoryName ?? UNCATEGORIZED), { create: true })
  const previous = await documentFiles(documents, target.designDocumentId)
  let name = `${workspaceName(target.title)}.json`
  if (await exists(category, name, 'file') && !previous.some((file) => file.name === name)) {
    const owner = (await jsonTargets(category)).find((file) => file.name === name)?.target.designDocumentId
    if (owner !== target.designDocumentId) name = `${distinctName(workspaceName(target.title), target.designDocumentId)}.json`
  }
  await writeJson(category, name, payload)
  // 名前やカテゴリが変わる前のファイルは消す。空になったカテゴリのフォルダも消す。
  for (const file of previous) {
    if (await file.folder.isSameEntry(category) && file.name === name) continue
    await file.folder.removeEntry(file.name)
    if (!(await entries(file.folder)).length) await documents.removeEntry(file.folder.name).catch(() => undefined)
  }
  return `${root.name}/${target.databaseTarget}/${PROJECT_SECTION}/${project.name}/${DOCUMENT_FOLDER}/${category.name}/${name}`
}

export async function readDesignDocumentWorkspace(target: DesignDocumentWorkspaceTarget): Promise<WorkspaceFile> {
  const root = await workspaceFolder('read')
  const project = await existingProjectFolder(root, target)
  const documents = project && await childFolder(project, DOCUMENT_FOLDER)
  const [found] = documents ? await documentFiles(documents, target.designDocumentId) : []
  if (!project || !found) throw new Error('WORKSPACE_FILE_NOT_FOUND')
  return { name: `${root.name}/${target.databaseTarget}/${PROJECT_SECTION}/${project.name}/${DOCUMENT_FOLDER}/${found.folder.name}/${found.name}`, content: await readText(found.folder, found.name) }
}

/**
 * プロジェクト・ドキュメントの「コンテキストをコピー」の内容。マイ資料と違いDBから取得するコマンドがないため、
 * AIがワークスペースのJSONを直接編集し、利用者が「JSONから読み込む」で反映する流れにする。
 */
export function workspaceContextText(options: { subject: string; editFields: string; path: string; target: unknown; withPrompt: boolean }) {
  const context = JSON.stringify({ target: options.target, workspaceFile: options.path }, null, 2)
  if (!options.withPrompt) return context
  return `HundredのAI Desktopの${options.subject}を編集してください。

ワークスペースのフォルダ（ai-desktop-workspace）にある次のJSONを開き、私の依頼に沿って${options.editFields}を編集してください。
format・version・resourceType・targetは変更しないでください。項目の意味と書き方は、JSONのguideとreferenceを参照してください。
JSONが見つからない場合は、AI Desktopで「JSONへ書き出す」を実行するよう私に伝えてください。
編集後はJSONとして正しいことを確認し、変更した内容を報告してください。反映は、私がAI Desktopの「JSONから読み込む」で行います。

${context}

依頼内容:
（ここに作成・修正内容を記入してください）`
}
