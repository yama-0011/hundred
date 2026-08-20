import '../../../styles/Hundred/hundred-notification-dialog.css'

/**
 * 概要:
 * Hundred Homeの通知設定ダイアログを表示する。
 *
 * 責務:
 * - 通知全体のオン・オフを表示する
 * - インストール済みAppごとの通知設定を一覧表示する
 * - 全体設定、App別設定、閉じる操作を親へ通知する
 */

export type HundredNotificationApp = {
  id: string
  name: string
}

type HundredNotificationDialogProps = {
  notificationsEnabled: boolean
  apps: readonly HundredNotificationApp[]
  appNotifications: Record<string, boolean>
  onEnabledChange: (enabled: boolean) => void
  onAppChange: (appId: string, enabled: boolean) => void
  onClose: () => void
}

/**
 * 概要: 通知全体とAppごとの通知設定を表示する。
 * 責務: 現在値を描画し、各スイッチの変更を親コンポーネントへ通知する。
 */
function HundredNotificationDialog({
  notificationsEnabled,
  apps,
  appNotifications,
  onEnabledChange,
  onAppChange,
  onClose,
}: HundredNotificationDialogProps) {
  /**
   * 概要: ダイアログ外側のクリックを処理する。
   * 責務: 背景部分が直接押された場合だけダイアログを閉じる。
   */
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  /**
   * 概要: ダイアログ内のキーボード入力を処理する。
   * 責務: Escapeキーで閉じ、キー操作がHundred Homeへ伝わるのを防ぐ。
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()

    if (event.key === 'Escape') onClose()
  }

  return (
    <div
      className="hundred-notification-dialog"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section
        className="hundred-notification-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hundred-notification-dialog-title"
      >
        <header className="hundred-notification-dialog__header">
          <div>
            <span>設定</span>
            <h2 id="hundred-notification-dialog-title">通知</h2>
          </div>
          <button
            className="hundred-notification-dialog__close"
            type="button"
            onClick={onClose}
            aria-label="通知設定を閉じる"
            autoFocus
          >
            ×
          </button>
        </header>

        <label className="hundred-notification-master">
          <span className="hundred-notification-master__copy">
            <strong>すべての通知</strong>
            <small>すべてのアプリの通知に適用されます</small>
          </span>
          <span className="hundred-notification-switch">
            <input
              type="checkbox"
              role="switch"
              checked={notificationsEnabled}
              onChange={(event) => onEnabledChange(event.currentTarget.checked)}
              aria-label="すべての通知を切り替える"
            />
            <span aria-hidden="true" />
          </span>
        </label>

        <section aria-labelledby="hundred-notification-apps-title">
          <div className="hundred-notification-dialog__section-header">
            <h3 id="hundred-notification-apps-title">アプリ</h3>
            {!notificationsEnabled && <span>すべての通知がオフです</span>}
          </div>
          <div className="hundred-notification-apps">
            {apps.map((app) => (
              <label className="hundred-notification-app" key={app.id}>
                <span className="hundred-notification-app__icon" aria-hidden="true">
                  {app.name.slice(0, 1)}
                </span>
                <span className="hundred-notification-app__copy">
                  <strong>{app.name}</strong>
                </span>
                <span className="hundred-notification-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={appNotifications[app.id] ?? true}
                    onChange={(event) =>
                      onAppChange(app.id, event.currentTarget.checked)
                    }
                    aria-label={`${app.name}の通知を切り替える`}
                  />
                  <span aria-hidden="true" />
                </span>
              </label>
            ))}
          </div>
        </section>
      </section>
    </div>
  )
}

export default HundredNotificationDialog
