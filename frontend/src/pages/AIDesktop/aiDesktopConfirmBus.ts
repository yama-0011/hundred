/**
 * 概要:
 * AI Desktop共通の確認ダイアログを、画面のどこからでも呼び出すための窓口。
 *
 * 責務:
 * - 確認内容を表示側（AIDesktopConfirmDialog）へ渡す
 * - 利用者の選択結果をPromiseで呼び出し元へ返す
 */

export type AIDesktopConfirmTone = 'default' | 'danger'
export type AIDesktopConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: AIDesktopConfirmTone
}
export type AIDesktopConfirmRequest = AIDesktopConfirmOptions & { id: number; resolve: (confirmed: boolean) => void }
type Listener = (request: AIDesktopConfirmRequest) => void

const listeners = new Set<Listener>()
let requestId = 0

/**
 * 概要: 確認ダイアログを表示し、利用者の選択を待つ。
 * 責務: 「実行する」ならtrue、キャンセルならfalseを返す。表示側がない場合はブラウザ標準の確認で代替する。
 */
export function confirmAIDesktop(options: AIDesktopConfirmOptions): Promise<boolean> {
  if (!listeners.size) return Promise.resolve(window.confirm([options.title, options.message].filter(Boolean).join('\n\n')))
  return new Promise((resolve) => {
    const request = { ...options, id: ++requestId, resolve }
    listeners.forEach((listener) => listener(request))
  })
}

/** 概要: 確認要求を受け取る表示側を登録する。 責務: 登録解除用の関数を返す。 */
export function subscribeToAIDesktopConfirms(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
