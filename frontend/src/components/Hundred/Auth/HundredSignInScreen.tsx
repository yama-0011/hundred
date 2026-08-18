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
 * - サインイン、サインアップ、ゲスト利用の入口を表示する
 * - 選択された認証方法を親へ通知する
 * - 選択中の壁紙とテーマを認証画面にも適用する
 */

type HundredSignInScreenProps = {
  wallpaper: WallpaperId
  onSignIn: () => void
  onSignUp: () => void
  onGuestSignIn: () => void
}

/**
 * 概要: Hundredの認証方法を選択する起動画面を表示する。
 * 責務: いずれかの認証操作が行われるまでHomeへの入口を制限する。
 */
function HundredSignInScreen({
  wallpaper,
  onSignIn,
  onSignUp,
  onGuestSignIn,
}: HundredSignInScreenProps) {
  const wallpaperTheme = getWallpaperTheme(wallpaper)

  return (
    <main
      className="hundred-home hundred-sign-in"
      data-theme-strategy={hundredThemeConfig.strategy}
      data-theme={wallpaperTheme}
      data-wallpaper={wallpaper}
      aria-label="Hundred sign in"
    >
      <HundredWallpaperBackground wallpaper={wallpaper} />
      <div className="hundred-home__ambient" aria-hidden="true" />

      <section className="hundred-sign-in__panel" aria-labelledby="hundred-sign-in-title">
        <header className="hundred-sign-in__header">
          <span>Welcome to</span>
          <h1 id="hundred-sign-in-title">Hundred</h1>
          <p>アカウントを選択してHomeを開始します</p>
        </header>

        <div className="hundred-sign-in__actions">
          <button
            className="hundred-sign-in__primary"
            type="button"
            onClick={onSignIn}
          >
            <strong>Sign in</strong>
            <small>既存のHundredアカウントを使用</small>
          </button>
          <button type="button" onClick={onSignUp}>
            <strong>Sign up</strong>
            <small>新しいHundredアカウントを作成</small>
          </button>
          <button type="button" onClick={onGuestSignIn}>
            <strong>Continue as guest</strong>
            <small>アカウントを作成せずに試す</small>
          </button>
        </div>

        <p className="hundred-sign-in__notice">
          現在はUI確認用のモックです。実際の認証やデータ保存は行いません。
        </p>
      </section>
    </main>
  )
}

export default HundredSignInScreen
