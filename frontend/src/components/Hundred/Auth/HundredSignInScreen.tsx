import { hundredThemeConfig } from '../Theme/hundredThemeConfig'
import HundredWallpaperBackground from '../Wallpaper/HundredWallpaperBackground'
import {
  getWallpaperTheme,
  type WallpaperId,
} from '../Wallpaper/hundredWallpaperOptions'
import '../../../styles/Hundred/hundred-sign-in.css'

/**
 * 概要:
 * Hundred Homeへ入る前のサインイン選択画面を表示する。
 *
 * 責務:
 * - Googleサインイン、メール認証、ゲスト利用の入口を表示する
 * - セッション確認中と認証失敗を利用者へ通知する
 * - 選択された認証方法を親へ通知する
 * - 選択中の壁紙とテーマを認証画面にも適用する
 */

type HundredSignInScreenProps = {
  wallpaper: WallpaperId
  isCheckingSession: boolean
  signingInMethod: 'google' | 'email' | null
  authError: string | null
  onGoogleSignIn: () => void
  onEmailSignIn: () => void
  onGuestSignIn: () => void
}

/**
 * 概要: Hundredの認証方法を選択する起動画面を表示する。
 * 責務: いずれかの認証操作が行われるまでHomeへの入口を制限する。
 */
function HundredSignInScreen({
  wallpaper,
  isCheckingSession,
  signingInMethod,
  authError,
  onGoogleSignIn,
  onEmailSignIn,
  onGuestSignIn,
}: HundredSignInScreenProps) {
  const wallpaperTheme = getWallpaperTheme(wallpaper)
  const isSigningIn = signingInMethod !== null

  return (
    <main
      className="hundred-home hundred-sign-in"
      data-theme-strategy={hundredThemeConfig.strategy}
      data-theme={wallpaperTheme}
      data-wallpaper={wallpaper}
      aria-label="Hundredのサインイン画面"
    >
      <HundredWallpaperBackground wallpaper={wallpaper} />
      <div className="hundred-home__ambient" aria-hidden="true" />

      <section className="hundred-sign-in__panel" aria-labelledby="hundred-sign-in-title">
        <header className="hundred-sign-in__header">
          <h1 id="hundred-sign-in-title">Hundred</h1>
          <p>
            {isCheckingSession
              ? 'サインイン状態を確認しています'
              : '利用方法を選択してHundredを開始します'}
          </p>
        </header>

        {isCheckingSession ? (
          <div
            className="hundred-sign-in__checking"
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" />
            <strong>確認中</strong>
          </div>
        ) : (
          <>
            <div className="hundred-sign-in__actions">
              <button
                className="hundred-sign-in__primary"
                type="button"
                onClick={onGoogleSignIn}
                disabled={isSigningIn}
              >
                <strong>
                  {isSigningIn
                    ? 'Googleへ移動しています'
                    : 'Googleアカウントで続ける'}
                </strong>
                <small>Googleで本人確認してHundredを利用</small>
              </button>
              <button
                type="button"
                onClick={onEmailSignIn}
                disabled={isSigningIn}
              >
                <strong>
                  {signingInMethod === 'email'
                    ? 'メール認証へ移動しています'
                    : 'メールアドレスで続ける'}
                </strong>
                <small>サインイン、アカウント作成、パスワード再設定</small>
              </button>
              <button
                type="button"
                onClick={onGuestSignIn}
                disabled={isSigningIn}
              >
                <strong>ゲストとして続ける</strong>
                <small>アカウントを作成せずに試す</small>
              </button>
            </div>

            {authError && (
              <p className="hundred-sign-in__error" role="alert">
                {authError}
              </p>
            )}
          </>
        )}

        <p className="hundred-sign-in__notice">
          認証はAmazon Cognitoで安全に処理されます。Hundredがパスワードを保存することはありません。
        </p>
      </section>
    </main>
  )
}

export default HundredSignInScreen
