import '../../../styles/Hundred/hundred-profile-dialog.css'

/**
 * 概要:
 * Hundred Homeのプロフィール・認証ダイアログを表示する。
 *
 * 責務:
 * - サインイン状態に応じた認証操作を表示する
 * - 連携アカウント一覧とアカウント詳細を表示する
 * - Google・メールサインイン、サインアウト、閉じる操作を親へ通知する
 */

export type HundredProfileSession = 'member' | 'guest'

export type HundredMemberProfile = {
  userId: string
  displayName: string
  email: string
  authProvider: 'google' | 'email'
}

type HundredProfileDialogProps = {
  session: HundredProfileSession
  memberProfile: HundredMemberProfile | null
  onGoogleSignIn: () => void
  onEmailSignIn: () => void
  onSignOut: () => void
  onClose: () => void
}

/**
 * 概要: Profileの認証操作とアカウント情報を表示する。
 * 責務: サインイン状態に合うモック情報を描画し、各操作を親へ通知する。
 */
function HundredProfileDialog({
  session,
  memberProfile,
  onGoogleSignIn,
  onEmailSignIn,
  onSignOut,
  onClose,
}: HundredProfileDialogProps) {
  const isMember = session === 'member'
  const displayName = memberProfile?.displayName ?? 'Hundredユーザー'
  const email = memberProfile?.email ?? '未取得'
  const memberId = memberProfile?.userId ?? '未取得'
  const authProvider = memberProfile?.authProvider ?? 'email'
  const avatarLabel = displayName.trim().charAt(0).toUpperCase() || 'H'

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
            <span>プロフィール</span>
            <h2 id="hundred-profile-dialog-title">アカウント</h2>
          </div>
          <button
            className="hundred-profile-dialog__close"
            type="button"
            onClick={onClose}
            aria-label="アカウントを閉じる"
            autoFocus
          >
            ×
          </button>
        </header>

        <section className="hundred-profile-status" aria-label="サインイン状態">
          <span className="hundred-profile-status__avatar" aria-hidden="true">
            {isMember ? avatarLabel : 'G'}
          </span>
          <span className="hundred-profile-status__copy">
            <strong>{isMember ? displayName : 'ゲスト'}</strong>
            <small>{isMember ? 'サインイン中' : 'ゲストとして利用中'}</small>
          </span>
        </section>

        <div className="hundred-profile-actions">
          {isMember ? (
            <button type="button" onClick={onSignOut}>
              サインアウト
            </button>
          ) : (
            <>
              <button
                className="hundred-profile-actions__primary"
                type="button"
                onClick={onGoogleSignIn}
              >
                Googleアカウントで続ける
              </button>
              <button type="button" onClick={onEmailSignIn}>
                メールアドレスで続ける
              </button>
              <button type="button" onClick={onSignOut}>
                ゲスト利用を終了
              </button>
            </>
          )}
        </div>

        <section aria-labelledby="hundred-linked-accounts-title">
          <h3
            className="hundred-profile-dialog__section-title"
            id="hundred-linked-accounts-title"
          >
            連携アカウント
          </h3>
          {isMember ? (
            <div className="hundred-linked-account">
              <span className="hundred-linked-account__icon" aria-hidden="true">
                {authProvider === 'google' ? 'G' : '@'}
              </span>
              <span className="hundred-linked-account__copy">
                <strong>
                  {authProvider === 'google' ? 'Google' : 'メールアドレス'}
                </strong>
                <small>{email}</small>
              </span>
              <span className="hundred-linked-account__status">接続済み</span>
            </div>
          ) : (
            <p className="hundred-profile-dialog__empty">
              ゲスト利用では連携アカウントは保存されません。
            </p>
          )}
        </section>

        <section aria-labelledby="hundred-account-details-title">
          <h3
            className="hundred-profile-dialog__section-title"
            id="hundred-account-details-title"
          >
            アカウント詳細
          </h3>
          {isMember ? (
            <dl className="hundred-account-details">
              <div>
                <dt>表示名</dt>
                <dd>{displayName}</dd>
              </div>
              <div>
                <dt>メールアドレス</dt>
                <dd>{email}</dd>
              </div>
              <div>
                <dt>メンバーID</dt>
                <dd>{memberId}</dd>
              </div>
            </dl>
          ) : (
            <p className="hundred-profile-dialog__empty">
              アカウント詳細を表示するには、サインインまたはアカウントを作成してください。
            </p>
          )}
        </section>
      </section>
    </div>
  )
}

export default HundredProfileDialog
