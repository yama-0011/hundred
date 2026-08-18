import '../../../styles/Hundred/hundred-profile-dialog.css'

/**
 * 概要:
 * Hundred Homeのプロフィール・認証モックダイアログを表示する。
 *
 * 責務:
 * - サインイン状態に応じた認証操作を表示する
 * - 連携アカウント一覧とアカウント詳細を表示する
 * - サインアップ、サインイン、サインアウト、閉じる操作を親へ通知する
 */

export type HundredProfileSession = 'member' | 'guest'

type HundredProfileDialogProps = {
  session: HundredProfileSession
  onSignUp: () => void
  onSignIn: () => void
  onSignOut: () => void
  onClose: () => void
}

/**
 * 概要: Profileの認証操作とアカウント情報を表示する。
 * 責務: サインイン状態に合うモック情報を描画し、各操作を親へ通知する。
 */
function HundredProfileDialog({
  session,
  onSignUp,
  onSignIn,
  onSignOut,
  onClose,
}: HundredProfileDialogProps) {
  const isMember = session === 'member'

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
      className="hundred-profile-dialog"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section
        className="hundred-profile-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hundred-profile-dialog-title"
      >
        <header className="hundred-profile-dialog__header">
          <div>
            <span>Profile</span>
            <h2 id="hundred-profile-dialog-title">Account</h2>
          </div>
          <button
            className="hundred-profile-dialog__close"
            type="button"
            onClick={onClose}
            aria-label="プロフィール設定を閉じる"
            autoFocus
          >
            ×
          </button>
        </header>

        <section className="hundred-profile-status" aria-label="サインイン状態">
          <span className="hundred-profile-status__avatar" aria-hidden="true">
            {isMember ? 'Y' : 'G'}
          </span>
          <span className="hundred-profile-status__copy">
            <strong>{isMember ? 'Yama' : 'Guest'}</strong>
            <small>{isMember ? 'Signed in' : 'Guest session'}</small>
          </span>
        </section>

        <div className="hundred-profile-actions">
          {isMember ? (
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          ) : (
            <>
              <button
                className="hundred-profile-actions__primary"
                type="button"
                onClick={onSignIn}
              >
                Sign in
              </button>
              <button type="button" onClick={onSignUp}>
                Sign up
              </button>
              <button type="button" onClick={onSignOut}>
                Sign out
              </button>
            </>
          )}
        </div>

        <section aria-labelledby="hundred-linked-accounts-title">
          <h3
            className="hundred-profile-dialog__section-title"
            id="hundred-linked-accounts-title"
          >
            Linked accounts
          </h3>
          {isMember ? (
            <div className="hundred-linked-account">
              <span className="hundred-linked-account__icon" aria-hidden="true">
                G
              </span>
              <span className="hundred-linked-account__copy">
                <strong>Google</strong>
                <small>yama@example.com</small>
              </span>
              <span className="hundred-linked-account__status">Connected</span>
            </div>
          ) : (
            <p className="hundred-profile-dialog__empty">
              ゲスト利用では連携アカウントは保存されません
            </p>
          )}
        </section>

        <section aria-labelledby="hundred-account-details-title">
          <h3
            className="hundred-profile-dialog__section-title"
            id="hundred-account-details-title"
          >
            Account details
          </h3>
          {isMember ? (
            <dl className="hundred-account-details">
              <div>
                <dt>Display name</dt>
                <dd>Yama</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>yama@example.com</dd>
              </div>
              <div>
                <dt>Member ID</dt>
                <dd>hundred-001</dd>
              </div>
            </dl>
          ) : (
            <p className="hundred-profile-dialog__empty">
              アカウント詳細を表示するにはSign inまたはSign upしてください
            </p>
          )}
        </section>
      </section>
    </div>
  )
}

export default HundredProfileDialog
