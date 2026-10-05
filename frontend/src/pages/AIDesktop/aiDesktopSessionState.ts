/**
 * 概要:
 * AI Desktopの表示状態（開いているウィンドウや各アプリの画面）を、ブラウザのタブ単位で保つ。
 *
 * 責務:
 * - sessionStorageへ表示状態を保存・読み込みする
 * - 保存できない環境でも画面の動作を止めない
 *
 * 業務データや編集中の入力内容は保存しない。リロードしても同じ画面に戻ることだけを目的とし、新しいタブでは初期画面から始まる。
 */
import { useEffect, useState } from 'react'

const storageKey = (key: string) => `hundred.aiDesktop.session.${key}`

/** 概要: 保存済みの表示状態を読み込む。 責務: 形式が正しいものだけを返し、それ以外はnullを返す。 */
export function readAIDesktopSessionState<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey(key)) ?? 'null')
    return isValid(value) ? value : null
  } catch { return null }
}

/** 概要: 表示状態を保存する。 責務: 保存できない環境では何もしない。 */
export function writeAIDesktopSessionState(key: string, value: unknown) {
  try { sessionStorage.setItem(storageKey(key), JSON.stringify(value)) } catch { /* 保存できない環境では、リロード時に初期画面へ戻るだけにする。 */ }
}

/**
 * 概要: 表示状態を、変更が落ち着いてからまとめて保存する。
 * 責務: ウィンドウのドラッグ中など、短い間隔の変更で毎回書き込まないようにする。
 */
export function useAIDesktopSessionStateSaver(key: string, value: unknown, delay = 300) {
  const serialized = JSON.stringify(value)
  useEffect(() => {
    const timer = window.setTimeout(() => { try { sessionStorage.setItem(storageKey(key), serialized) } catch { /* 保存できない環境では何もしない。 */ } }, delay)
    return () => window.clearTimeout(timer)
  }, [key, serialized, delay])
}

/** 概要: 保存済みの表示状態を初期値として使うstate。 責務: 初回描画時に一度だけ読み込む。 */
export function useAIDesktopRestoredState<T>(key: string, isValid: (value: unknown) => value is T) {
  const [restored] = useState(() => readAIDesktopSessionState(key, isValid))
  return restored
}

export const isRecordValue = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
