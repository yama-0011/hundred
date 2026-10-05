/**
 * 概要:
 * AI向けのファイル一式を、利用者が選んだリポジトリのフォルダへ直接書き出す。
 *
 * 責務:
 * - 書き出し先のフォルダをプロジェクトごとにブラウザへ記録し、次回から選び直さずに使えるようにする
 * - AGENTS.md・CLAUDE.mdは、AI Desktopが生成した範囲だけを書き換え、手書きの内容を残す
 * - 前回書き出したファイルの一覧を記録し、AI Desktopで削除した設計書のファイルだけを片付ける
 * - AI Desktopが作っていない同名のファイルは上書きしない
 */
import { GENERATED_END, GENERATED_START, type AgentExportFile } from './aiDesktopAgentExport'

const DATABASE_NAME = 'hundred-ai-desktop'
const STORE_NAME = 'workspace-files'
const MANIFEST_PATH = 'docs/ai-desktop/manifest.json'
// 生成した範囲だけを書き換えるファイル。手書きの内容と同じファイルに同居する。
const MERGED_FILES = new Set(['AGENTS.md', 'CLAUDE.md'])

type PermissionMode = 'read' | 'readwrite'
type PersistentDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (descriptor?: { mode?: PermissionMode }) => Promise<PermissionState>
  requestPermission: (descriptor?: { mode?: PermissionMode }) => Promise<PermissionState>
}
type DirectoryPickerWindow = Window & { showDirectoryPicker?: (options?: { id?: string; mode?: PermissionMode }) => Promise<PersistentDirectoryHandle> }
type WritableFileHandle = FileSystemFileHandle & { createWritable: () => Promise<{ write: (content: string) => Promise<void>; close: () => Promise<void> }> }

export type RepositoryWriteResult = { folderName: string; written: number; removed: number; skipped: string[] }

const storageKey = (projectId: string) => `agent-export-folder:${projectId}`

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function storedFolder(projectId: string) {
  const database = await openDatabase()
  return new Promise<PersistentDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(storageKey(projectId))
    request.onsuccess = () => resolve(request.result instanceof FileSystemDirectoryHandle ? request.result as PersistentDirectoryHandle : null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
    transaction.onabort = () => database.close()
  })
}

async function storeFolder(projectId: string, handle: PersistentDirectoryHandle) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(handle, storageKey(projectId))
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
    transaction.onabort = () => { database.close(); reject(transaction.error) }
  })
}

async function hasWritePermission(handle: PersistentDirectoryHandle) {
  if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true
  return await handle.requestPermission({ mode: 'readwrite' }) === 'granted'
}

/** 概要: フォルダへの直接書き出しに対応したブラウザかを返す。 責務: 対応していない場合はZIPのダウンロードを使ってもらう。 */
export function supportsRepositoryFolder() {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function' && 'indexedDB' in window
}

/** 概要: 記録済みの書き出し先のフォルダ名を返す。 責務: 許可を求めずに名前だけを読む。 */
export async function storedRepositoryFolderName(projectId: string) {
  return (await storedFolder(projectId).catch(() => null))?.name ?? null
}

/** 概要: 書き出し先のフォルダを選び直す。 責務: 書き込みの許可を得て、プロジェクトごとに記録する。Gitリポジトリかどうかも返す。 */
export async function selectRepositoryFolder(projectId: string) {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) throw new Error('FILE_SYSTEM_ACCESS_UNSUPPORTED')
  const handle = await picker({ id: 'ai-desktop-agent-export', mode: 'readwrite' })
  if (!await hasWritePermission(handle)) throw new Error('FILE_PERMISSION_DENIED')
  await storeFolder(projectId, handle)
  const isGitRepository = await handle.getDirectoryHandle('.git').then(() => true, () => false)
  return { folderName: handle.name, isGitRepository }
}

/** 概要: 記録済みの書き出し先を、書き込みの許可付きで返す。 責務: 記録がない、または許可されない場合はnullを返す。 */
export async function repositoryFolderWithPermission(projectId: string) {
  const handle = await storedFolder(projectId).catch(() => null)
  if (!handle || !await hasWritePermission(handle)) return null
  return handle
}

async function directoryFor(root: FileSystemDirectoryHandle, segments: string[], create: boolean) {
  let current = root
  for (const segment of segments) current = await current.getDirectoryHandle(segment, { create })
  return current
}

async function readText(root: FileSystemDirectoryHandle, path: string) {
  const segments = path.split('/')
  try {
    const directory = await directoryFor(root, segments.slice(0, -1), false)
    return await (await (await directory.getFileHandle(segments.at(-1)!)).getFile()).text()
  } catch { return null }
}

async function writeText(root: FileSystemDirectoryHandle, path: string, content: string) {
  const segments = path.split('/')
  const directory = await directoryFor(root, segments.slice(0, -1), true)
  const writable = await (await directory.getFileHandle(segments.at(-1)!, { create: true }) as WritableFileHandle).createWritable()
  await writable.write(content)
  await writable.close()
}

// ファイルを削除し、空になったフォルダも上へ向かって片付ける。docs/ そのものは残す。
async function removeFile(root: FileSystemDirectoryHandle, path: string) {
  const segments = path.split('/')
  try {
    const directory = await directoryFor(root, segments.slice(0, -1), false)
    await directory.removeEntry(segments.at(-1)!)
  } catch { return false }
  for (let depth = segments.length - 1; depth > 1; depth -= 1) {
    try {
      const parent = await directoryFor(root, segments.slice(0, depth - 1), false)
      const directory = await parent.getDirectoryHandle(segments[depth - 1])
      const entries = (directory as FileSystemDirectoryHandle & { keys: () => AsyncIterableIterator<string> }).keys()
      if (!(await entries.next()).done) break
      await parent.removeEntry(segments[depth - 1])
    } catch { break }
  }
  return true
}

type Manifest = { files: string[]; documents: Record<string, number> }
function parseManifest(source: string | null): Manifest {
  try {
    const value: unknown = JSON.parse(source ?? 'null')
    if (!value || typeof value !== 'object') return { files: [], documents: {} }
    const { files, documents } = value as Partial<Manifest>
    return { files: Array.isArray(files) ? files.filter((item): item is string => typeof item === 'string') : [], documents: documents && typeof documents === 'object' ? documents : {} }
  } catch { return { files: [], documents: {} } }
}

/**
 * 概要: 前回の書き出しより後に更新・追加・削除された文書の数を返す。
 * 責務: 許可を求めずに読める場合だけ数える。読めない場合はnullを返し、表示しない。
 */
export async function pendingAgentExportCount(projectId: string, documents: Array<{ id: string; updatedAt: number }>) {
  const handle = await storedFolder(projectId).catch(() => null)
  if (!handle || await handle.queryPermission({ mode: 'read' }) !== 'granted') return null
  const previous = parseManifest(await readText(handle, MANIFEST_PATH)).documents
  const currentIds = new Set(documents.map((item) => item.id))
  return documents.filter((item) => previous[item.id] !== item.updatedAt).length + Object.keys(previous).filter((id) => !currentIds.has(id)).length
}

/** 生成した範囲だけを差し替える。目印がなければ、手書きの内容の後ろに追加する。 */
function mergeGeneratedBlock(existing: string | null, generated: string) {
  if (existing === null || !existing.trim()) return generated
  const start = existing.indexOf(GENERATED_START)
  const end = existing.indexOf(GENERATED_END)
  if (start >= 0 && end > start) return `${existing.slice(0, start)}${generated.trimEnd()}${existing.slice(end + GENERATED_END.length)}`
  return `${existing.trimEnd()}\n\n${generated}`
}

/**
 * 概要: ファイル一式をリポジトリのフォルダへ書き出す。
 * 責務: 前回の一覧と比べて、AI Desktopが作ったファイルだけを更新・削除する。手書きのファイルは上書きせず、skippedとして返す。
 */
export async function writeAgentExportToFolder(root: FileSystemDirectoryHandle, files: AgentExportFile[], documentVersions: Record<string, number>): Promise<RepositoryWriteResult> {
  const previous = new Set<string>(parseManifest(await readText(root, MANIFEST_PATH)).files)
  const generatedPaths = files.filter((file) => !MERGED_FILES.has(file.path)).map((file) => file.path)
  const skipped: string[] = []
  let written = 0
  for (const file of files) {
    const existing = await readText(root, file.path)
    if (MERGED_FILES.has(file.path)) {
      const merged = mergeGeneratedBlock(existing, file.content)
      if (merged !== existing) { await writeText(root, file.path, merged); written += 1 }
      continue
    }
    // AI Desktopが前回作っていないファイルが同じ場所にある場合は、手書きの可能性があるため上書きしない。
    if (existing !== null && !previous.has(file.path) && existing !== file.content) { skipped.push(file.path); continue }
    if (existing !== file.content) { await writeText(root, file.path, file.content); written += 1 }
  }
  const current = new Set(generatedPaths.filter((path) => !skipped.includes(path)))
  let removed = 0
  for (const path of previous) if (!current.has(path) && path.startsWith('docs/') && await removeFile(root, path)) removed += 1
  const manifest = `${JSON.stringify({ note: 'AI Desktopが書き出したファイルの一覧と、各設計書のAI Desktop上の最終更新日時です。次の書き出しで、不要になったファイルの片付けと、書き出し待ちの確認に使います。', files: [...current].sort(), documents: Object.fromEntries(Object.entries(documentVersions).sort(([left], [right]) => left.localeCompare(right))) }, null, 2)}\n`
  if (manifest !== await readText(root, MANIFEST_PATH)) await writeText(root, MANIFEST_PATH, manifest)
  return { folderName: root.name, written, removed, skipped }
}
