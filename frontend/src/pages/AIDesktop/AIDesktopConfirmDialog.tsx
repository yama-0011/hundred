/**
 * 概要:
 * AI Desktop共通の確認ダイアログを表示する。
 *
 * 責務:
 * - confirmAIDesktopで受け取った確認を1件ずつ順番に表示する
 * - 選択結果を呼び出し元へ返す
 * - Escでキャンセル、Enterで既定のボタンを押す
 */
import { useEffect, useRef, useState } from 'react'
import { subscribeToAIDesktopConfirms, type AIDesktopConfirmRequest } from './aiDesktopConfirmBus'

export default function AIDesktopConfirmDialog() {
  const [queue, setQueue] = useState<AIDesktopConfirmRequest[]>([])
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const current = queue[0] ?? null

  useEffect(() => subscribeToAIDesktopConfirms((request) => setQueue((items) => [...items, request])), [])
  // 削除などの取り消せない操作は、誤ってEnterで実行しないようキャンセルを既定にする。
  useEffect(() => { if (current) (current.tone === 'danger' ? cancelRef : confirmRef).current?.focus() }, [current])

  if (!current) return null
  const answer = (confirmed: boolean) => { current.resolve(confirmed); setQueue((items) => items.slice(1)) }
  return <div className="ad-confirm-overlay" onPointerDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) answer(false) }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); answer(false) } }}>
    <section className={`ad-confirm ${current.tone ?? 'default'}`} role="alertdialog" aria-modal="true" aria-labelledby="ad-confirm-title" aria-describedby={current.message ? 'ad-confirm-message' : undefined}>
      <h2 id="ad-confirm-title">{current.title}</h2>
      {current.message && <p id="ad-confirm-message">{current.message}</p>}
      <footer>
        <button ref={cancelRef} type="button" onClick={() => answer(false)}>{current.cancelLabel ?? 'キャンセル'}</button>
        <button ref={confirmRef} type="button" className={current.tone === 'danger' ? 'danger' : 'primary'} onClick={() => answer(true)}>{current.confirmLabel ?? 'OK'}</button>
      </footer>
    </section>
  </div>
}
