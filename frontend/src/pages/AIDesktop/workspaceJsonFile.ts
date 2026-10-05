const DATABASE_NAME = 'hundred-ai-desktop'
const STORE_NAME = 'workspace-files'
// Keep the original key so existing browser selections remain available after this utility became shared.
const DEFAULT_WORKSPACE_JSON_KEY = 'project-workspace-json'

type WorkspaceJsonFileOptions = { storageKey?: string; suggestedName?: string }

type FilePermissionMode = 'read' | 'readwrite'

type PersistentFileHandle = FileSystemFileHandle & {
  queryPermission: (descriptor?: { mode?: FilePermissionMode }) => Promise<PermissionState>
  requestPermission: (descriptor?: { mode?: FilePermissionMode }) => Promise<PermissionState>
}

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean
    types?: Array<{ description?: string; accept: Record<string, string[]> }>
  }) => Promise<PersistentFileHandle[]>
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{ description?: string; accept: Record<string, string[]> }>
  }) => Promise<PersistentFileHandle>
}

const jsonFileTypes = [{ description: 'JSONファイル', accept: { 'application/json': ['.json'] } }]

function openWorkspaceDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getStoredHandle(storageKey: string) {
  const database = await openWorkspaceDatabase()
  return new Promise<PersistentFileHandle | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(storageKey)
    request.onsuccess = () => resolve(request.result instanceof FileSystemFileHandle ? request.result as PersistentFileHandle : null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
    transaction.onabort = () => database.close()
  })
}

async function storeHandle(handle: PersistentFileHandle, storageKey: string) {
  const database = await openWorkspaceDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(handle, storageKey)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
    transaction.onabort = () => { database.close(); reject(transaction.error) }
  })
}

async function hasPermission(handle: PersistentFileHandle, mode: FilePermissionMode) {
  if (await handle.queryPermission({ mode }) === 'granted') return true
  return await handle.requestPermission({ mode }) === 'granted'
}

async function storedHandleWithPermission(mode: FilePermissionMode, storageKey: string) {
  const handle = await getStoredHandle(storageKey).catch(() => null)
  if (!handle || !await hasPermission(handle, mode)) return null
  return handle
}

export function supportsWorkspaceJsonFile() {
  const pickerWindow = window as FilePickerWindow
  return typeof pickerWindow.showOpenFilePicker === 'function' && typeof pickerWindow.showSaveFilePicker === 'function' && 'indexedDB' in window
}

export async function writeWorkspaceJsonFile(content: string, options: WorkspaceJsonFileOptions = {}) {
  const pickerWindow = window as FilePickerWindow
  if (!supportsWorkspaceJsonFile() || !pickerWindow.showSaveFilePicker) throw new Error('FILE_SYSTEM_ACCESS_UNSUPPORTED')
  const storageKey = options.storageKey ?? DEFAULT_WORKSPACE_JSON_KEY
  const handle = await storedHandleWithPermission('readwrite', storageKey) ?? await pickerWindow.showSaveFilePicker({
    suggestedName: options.suggestedName ?? 'Workspace JSON.json',
    types: jsonFileTypes,
  })
  if (!await hasPermission(handle, 'readwrite')) throw new Error('FILE_PERMISSION_DENIED')
  await storeHandle(handle, storageKey).catch(() => undefined)
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
  return handle.name
}

export async function readWorkspaceJsonFile(options: WorkspaceJsonFileOptions = {}) {
  const pickerWindow = window as FilePickerWindow
  if (!supportsWorkspaceJsonFile() || !pickerWindow.showOpenFilePicker) throw new Error('FILE_SYSTEM_ACCESS_UNSUPPORTED')
  const storageKey = options.storageKey ?? DEFAULT_WORKSPACE_JSON_KEY
  const handle = await storedHandleWithPermission('read', storageKey) ?? (await pickerWindow.showOpenFilePicker({ multiple: false, types: jsonFileTypes }))[0]
  if (!handle || !await hasPermission(handle, 'read')) throw new Error('FILE_PERMISSION_DENIED')
  await storeHandle(handle, storageKey).catch(() => undefined)
  const file = await handle.getFile()
  return { name: file.name, content: await file.text() }
}

export async function selectWorkspaceJsonFile(options: WorkspaceJsonFileOptions = {}) {
  const pickerWindow = window as FilePickerWindow
  if (!supportsWorkspaceJsonFile() || !pickerWindow.showOpenFilePicker) throw new Error('FILE_SYSTEM_ACCESS_UNSUPPORTED')
  const storageKey = options.storageKey ?? DEFAULT_WORKSPACE_JSON_KEY
  const handle = (await pickerWindow.showOpenFilePicker({ multiple: false, types: jsonFileTypes }))[0]
  if (!handle || !await hasPermission(handle, 'readwrite')) throw new Error('FILE_PERMISSION_DENIED')
  await storeHandle(handle, storageKey)
  return handle.name
}

export function isWorkspaceJsonFileCancelled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
