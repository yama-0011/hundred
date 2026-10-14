/**
 * 概要:
 * Chrome拡張（browser-extension/hundred-screen-capture）で撮ったスクリーンショットを、登録するまで「取り込み待ち」として溜める。
 *
 * 責務:
 * - 拡張から届いた画像・URL・画面名の候補を受け取る（同じページからの window.postMessage だけを受け付ける）
 * - 取り込み待ちを、このブラウザの中（IndexedDB）にだけ保存する。サーバーには送らない
 * - 取り込み待ちが変わったことを画面へ知らせる
 *
 * 既存のIndexedDB（hundred-ai-desktop）の版を上げると、ほかの部品の開き方と食い違うため、別のデータベースにする。
 */
import { useEffect, useState } from 'react'

const DATABASE_NAME = 'hundred-ai-desktop-captures'
const STORE_NAME = 'queue'
const CHANGED_EVENT = 'ad:screen-capture-queue-changed'
const MESSAGE_SOURCE = 'hundred-screen-capture'
const maxImageBytes = 30 * 1024 * 1024

export type ScreenCapture = { id: string; blob: Blob; url: string; title: string; name: string; capturedAt: number }

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = run(transaction.objectStore(STORE_NAME))
    transaction.oncomplete = () => { database.close(); resolve(request.result) }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
    transaction.onabort = () => { database.close(); reject(transaction.error) }
  })
}

const notifyChanged = () => window.dispatchEvent(new Event(CHANGED_EVENT))

export async function listScreenCaptures() {
  const items = await withStore<ScreenCapture[]>('readonly', (store) => store.getAll() as IDBRequest<ScreenCapture[]>)
  return items.sort((a, b) => a.capturedAt - b.capturedAt)
}

export async function removeScreenCapture(id: string) {
  await withStore('readwrite', (store) => store.delete(id))
  notifyChanged()
}

async function addScreenCapture(capture: Omit<ScreenCapture, 'id'>) {
  const item: ScreenCapture = { ...capture, id: `capture-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }
  await withStore('readwrite', (store) => store.put(item))
  notifyChanged()
  return listScreenCaptures()
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : ''

/**
 * 拡張から届いたメッセージを取り込み待ちへ入れる。AI Desktopの画面を開いている間だけ受け付ける。
 * onAddedには、追加後の取り込み待ちの件数を渡す。
 */
export function listenScreenCaptures(onAdded: (count: number) => void, onError: () => void) {
  const receive = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin || !isRecord(event.data) || event.data.source !== MESSAGE_SOURCE || !isRecord(event.data.capture)) return
    const capture = event.data.capture
    if (typeof capture.dataUrl !== 'string' || !capture.dataUrl.startsWith('data:image/png;base64,')) return
    void (async () => {
      const blob = await (await fetch(capture.dataUrl as string)).blob()
      if (blob.size === 0 || blob.size > maxImageBytes) throw new Error('IMAGE')
      const items = await addScreenCapture({ blob, url: text(capture.url, 2_000), title: text(capture.title, 200), name: text(capture.name, 100), capturedAt: typeof capture.capturedAt === 'number' ? capture.capturedAt : Date.now() })
      onAdded(items.length)
    })().catch(onError)
  }
  window.addEventListener('message', receive)
  return () => window.removeEventListener('message', receive)
}

/**
 * 画像（Blob）を表示するための一時的なURL。表示しなくなったら破棄する。
 * 開発時のStrictModeは effect を「実行 → 片付け → 再実行」するため、作ってすぐ破棄したURLを表示しないよう、作るのを次のタイミングにずらす。
 */
export function useObjectUrl(blob: Blob | null) {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!blob) return
    let created: string | null = null
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      created = URL.createObjectURL(blob)
      setEntry({ blob, url: created })
    })
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created) }
  }, [blob])
  // 別の画像に変わった直後は、前の画像のURL（破棄済み）を返さない。
  return blob && entry?.blob === blob ? entry.url : null
}

/** 取り込み待ちの一覧。拡張から届いたり、登録・破棄したりすると更新される。 */
export function useScreenCaptures() {
  const [items, setItems] = useState<ScreenCapture[]>([])
  useEffect(() => {
    let active = true
    const refresh = () => { void listScreenCaptures().then((next) => { if (active) setItems(next) }).catch(() => undefined) }
    refresh()
    window.addEventListener(CHANGED_EVENT, refresh)
    return () => { active = false; window.removeEventListener(CHANGED_EVENT, refresh) }
  }, [])
  return items
}
