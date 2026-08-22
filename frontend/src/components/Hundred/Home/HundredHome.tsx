import {
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  signInWithRedirect,
  signOut,
  updateUserAttributes,
} from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { useNavigate } from 'react-router-dom'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import HundredSignInScreen from '../Auth/HundredSignInScreen'
import HundredNotificationDialog from '../Notification/HundredNotificationDialog'
import HundredProfileDialog, {
  type HundredMemberProfile,
  type HundredProfileSession,
} from '../Profile/HundredProfileDialog'
import HundredSoundDialog from '../Sound/HundredSoundDialog'
import HundredCursorSoundPlayer from '../Sound/HundredCursorSoundPlayer'
import {
  defaultCursorSoundId,
  getCursorSound,
  resolveCursorSoundId,
  type CursorSoundId,
} from '../Sound/hundredCursorSoundOptions'
import { hundredThemeConfig } from '../Theme/hundredThemeConfig'
import HundredWallpaperBackground from '../Wallpaper/HundredWallpaperBackground'
import HundredWallpaperDialog from '../Wallpaper/HundredWallpaperDialog'
import {
  getWallpaper,
  getWallpaperTheme,
  isWallpaperId,
  type WallpaperId,
} from '../Wallpaper/hundredWallpaperOptions'
import '../../../styles/Hundred/hundred-home.css'
import '../../../styles/Hundred/hundred-home-navigation.css'
import '../../../styles/Hundred/hundred-home-settings.css'

/**
 * Hundred HomeのXMB型UIを構成するコンポーネント。
 *
 * 責務:
 * - カテゴリとインストール済みAppをデータから描画する
 * - 選択中のカテゴリとAppの状態を管理する
 * - スワイプ、クリック、キーボード、ホイールによる選択操作を処理する
 * - プロフィール認証モックと、サウンド、通知、壁紙の設定を管理する
 */

// IDを文字列の自由入力にせず、扱えるカテゴリとAppを型で限定する。
type CategoryId = 'profile' | 'apps' | 'store' | 'mail' | 'settings'
type AppId = 'record-hub' | 'creative-ia' | 'memo' | 'game'

type Category = {
  id: CategoryId
  label: string
}

type InstalledApp = {
  id: AppId
  name: string
  detail: string
}

type NotificationSettings = {
  enabled: boolean
  apps: Record<AppId, boolean>
}

// 表示内容をデータとして分離し、項目追加時にJSXを書き換えずに済むようにする。
const categories: Category[] = [
  { id: 'profile', label: 'プロフィール' },
  { id: 'apps', label: 'アプリ' },
  { id: 'store', label: 'ストア' },
  { id: 'mail', label: 'メール' },
  { id: 'settings', label: '設定' },
]

const installedApps: InstalledApp[] = [
  { id: 'record-hub', name: 'Record Hub', detail: '記録をひとつの場所に' },
  {
    id: 'creative-ia',
    name: 'Creative IA',
    detail: 'ブログ記事をかんたんに作成',
  },
  { id: 'memo', name: 'Memo', detail: '考えをすばやく残す' },
  { id: 'game', name: 'Game', detail: 'ひと息つく時間' },
]

const initialCategoryIndex = categories.findIndex(({ id }) => id === 'apps')
const swipeThreshold = 38
const wallpaperStorageKey = 'hundred-wallpaper'
const cursorSoundStorageKey = 'hundred-cursor-sound'
const effectVolumeStorageKey = 'hundred-effect-volume'
const notificationStorageKey = 'hundred-notification-settings'

/** Cognitoやブラウザから返された認証エラーを日本語の案内へ変換する。 */
function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'UserCancelledException') return null
    if (error.name === 'NotAuthorizedException') {
      return 'サインインの有効期限が切れました。もう一度お試しください。'
    }

    if (import.meta.env.DEV && error.message.trim()) {
      return `サインインできませんでした。（開発情報: ${error.name}: ${error.message}）`
    }
  }

  return 'サインインできませんでした。通信状態を確認して、もう一度お試しください。'
}

/** Cognito内部ユーザー名を表示せず、名前またはメールアドレスから表示名を決定する。 */
function resolveMemberDisplayName(name?: string, email?: string) {
  const normalizedName = name?.trim()

  if (normalizedName) return normalizedName

  const emailLocalPart = email?.split('@', 1)[0]?.trim()
  return emailLocalPart || 'Hundredユーザー'
}

/** 保存済みの壁紙を読み込み、未保存または不正な値の場合はMistを返す。 */
function getInitialWallpaper(): WallpaperId {
  try {
    const savedWallpaper = localStorage.getItem(wallpaperStorageKey)
    return isWallpaperId(savedWallpaper) ? savedWallpaper : 'mist'
  } catch {
    return 'mist'
  }
}

/** 保存済みのカーソル音を読み込み、不正な値の場合は利用可能な先頭音源を返す。 */
function getInitialCursorSound(): CursorSoundId {
  try {
    const savedSound = localStorage.getItem(cursorSoundStorageKey)
    return resolveCursorSoundId(savedSound) ?? defaultCursorSoundId
  } catch {
    return defaultCursorSoundId
  }
}

/**
 * 概要: 保存済みの効果音音量を読み込む。
 * 責務: 0〜1の保存値を返し、不正な値または未保存の場合は最大音量を返す。
 */
function getInitialEffectVolume() {
  try {
    const savedVolume = localStorage.getItem(effectVolumeStorageKey)
    if (savedVolume === null) return 1

    const volume = Number(savedVolume)
    return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 1
  } catch {
    return 1
  }
}

/**
 * 概要: 現在のインストール済みAppから通知設定の初期値を作成する。
 * 責務: 通知全体と各Appをオンにした新規ユーザー向け設定を返す。
 */
function createDefaultNotificationSettings(): NotificationSettings {
  return {
    enabled: true,
    apps: Object.fromEntries(
      installedApps.map((app) => [app.id, true]),
    ) as Record<AppId, boolean>,
  }
}

/**
 * 概要: 保存済みの通知設定を読み込む。
 * 責務: 保存値を検証し、新しく追加されたAppにはオンの初期値を補完する。
 */
function getInitialNotificationSettings(): NotificationSettings {
  const defaultSettings = createDefaultNotificationSettings()

  try {
    const savedSettings = localStorage.getItem(notificationStorageKey)
    if (savedSettings === null) return defaultSettings

    const parsedSettings: unknown = JSON.parse(savedSettings)
    if (!parsedSettings || typeof parsedSettings !== 'object') {
      return defaultSettings
    }

    const candidate = parsedSettings as {
      enabled?: unknown
      apps?: unknown
    }
    const savedApps =
      candidate.apps && typeof candidate.apps === 'object'
        ? (candidate.apps as Record<string, unknown>)
        : {}

    return {
      enabled:
        typeof candidate.enabled === 'boolean'
          ? candidate.enabled
          : defaultSettings.enabled,
      apps: Object.fromEntries(
        installedApps.map((app) => [
          app.id,
          typeof savedApps[app.id] === 'boolean'
            ? savedApps[app.id]
            : defaultSettings.apps[app.id],
        ]),
      ) as Record<AppId, boolean>,
    }
  } catch {
    return defaultSettings
  }
}

/** カテゴリIDに対応するSVGアイコンを表示する。 */
function CategoryIcon({ id }: { id: CategoryId }) {
  // 選択されたIDに対応するSVGの中身を取り出す。
  const paths: Record<CategoryId, ReactNode> = {
    profile: (
      <>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 19c.7-3.6 3-5.4 6.5-5.4s5.8 1.8 6.5 5.4" />
      </>
    ),
    apps: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1.5" />
        <rect x="14" y="4" width="6" height="6" rx="1.5" />
        <rect x="4" y="14" width="6" height="6" rx="1.5" />
        <rect x="14" y="14" width="6" height="6" rx="1.5" />
      </>
    ),
    store: (
      <>
        <path d="M5 9h14l-1 11H6L5 9Z" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3" />
      </>
    ),
    mail: (
      <>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m5 8 7 5 7-5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
      </>
    ),
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[id]}
    </svg>
  )
}

/** App IDに対応するSVGアイコンを表示する。 */
function AppIcon({ id }: { id: AppId }) {
  // Appごとのアイコンを同じ大きさのSVGとして描画する。
  const paths: Record<AppId, ReactNode> = {
    'record-hub': (
      <>
        <path d="M7 5.5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
        <path d="M8.5 10h7M8.5 14h4.5" />
        <path d="M9 3.5v4M15 3.5v4" />
      </>
    ),
    'creative-ia': (
      <>
        <path d="M6 18.5 7.2 14l8.9-8.9a1.9 1.9 0 0 1 2.7 2.7L9.9 16.7 6 18.5Z" />
        <path d="m14.8 6.4 2.8 2.8M5 6.5h4M7 4.5v4M15.5 15v4M13.5 17h4" />
      </>
    ),
    memo: (
      <>
        <path d="M6 4.5h9l3 3v12H6v-15Z" />
        <path d="M14.5 4.5V8H18M9 11h6M9 14.5h6" />
      </>
    ),
    game: (
      <>
        <path d="M8.5 8h7a5 5 0 0 1 4.7 3.3l1 2.9a3.1 3.1 0 0 1-5 3.3L14.6 16H9.4l-1.6 1.5a3.1 3.1 0 0 1-5-3.3l1-2.9A5 5 0 0 1 8.5 8Z" />
        <path d="M8 11v4M6 13h4" />
        <circle cx="16" cy="12" r=".7" fill="currentColor" stroke="none" />
        <circle cx="18" cy="14" r=".7" fill="currentColor" stroke="none" />
      </>
    ),
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[id]}
    </svg>
  )
}

/** Hundred Homeの表示、選択状態、ユーザー操作をまとめて管理する。 */
function HundredHome() {
  const navigate = useNavigate()

  // 配列の何番目を選択しているかをstateとして保持する。
  const [selectedCategoryIndex, setSelectedCategoryIndex] =
    useState(initialCategoryIndex)
  const [selectedAppIndex, setSelectedAppIndex] = useState(0)
  const [selectedWallpaper, setSelectedWallpaper] =
    useState<WallpaperId>(getInitialWallpaper)
  const [selectedCursorSound, setSelectedCursorSound] =
    useState<CursorSoundId>(getInitialCursorSound)
  const [effectVolume, setEffectVolume] = useState(getInitialEffectVolume)
  const [notificationSettings, setNotificationSettings] =
    useState(getInitialNotificationSettings)
  const [profileSession, setProfileSession] =
    useState<HundredProfileSession | null>(null)
  const [memberProfile, setMemberProfile] =
    useState<HundredMemberProfile | null>(null)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [signingInMethod, setSigningInMethod] = useState<
    'google' | 'email' | null
  >(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isUpdatingDisplayName, setIsUpdatingDisplayName] = useState(false)
  const [displayNameError, setDisplayNameError] = useState<string | null>(null)
  const [displayNameNotice, setDisplayNameNotice] = useState<string | null>(null)
  const [isWallpaperDialogOpen, setIsWallpaperDialogOpen] = useState(false)
  const [isSoundDialogOpen, setIsSoundDialogOpen] = useState(false)
  const [isNotificationDialogOpen, setIsNotificationDialogOpen] = useState(false)
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false)

  // 操作中の一時値や音声要素は、再描画を起こさないuseRefで保持する。
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const selectedCategoryIndexRef = useRef(initialCategoryIndex)
  const selectedAppIndexRef = useRef(0)
  const cursorSoundPlayer = useRef<HundredCursorSoundPlayer | null>(null)
  const categoryWheelArea = useRef<HTMLElement | null>(null)
  const appWheelArea = useRef<HTMLDivElement | null>(null)

  const selectedCategory = categories[selectedCategoryIndex]
  const selectedWallpaperTheme = getWallpaperTheme(selectedWallpaper)
  const enabledNotificationAppCount = installedApps.filter(
    (app) => notificationSettings.apps[app.id],
  ).length
  const memberDisplayName = memberProfile?.displayName ?? 'Hundredユーザー'
  const memberSignInLabel =
    memberProfile?.authProvider === 'google'
      ? 'Googleでサインイン中'
      : 'メールアドレスでサインイン中'
  const memberAvatarLabel =
    memberDisplayName.trim().charAt(0).toUpperCase() || 'H'

  useEffect(() => {
    let isActive = true

    /** 保存済みCognitoセッションを確認し、実ユーザー情報を画面へ反映する。 */
    const syncAuthSession = async () => {
      try {
        const user = await getCurrentUser()

        if (!isActive) return

        // プロフィール属性の取得に失敗しても、成立済みの認証セッションは維持する。
        setMemberProfile({
          userId: user.userId,
          displayName: resolveMemberDisplayName(),
          email: 'メールアドレス未取得',
          authProvider: user.username.toLowerCase().startsWith('google_')
            ? 'google'
            : 'email',
        })
        setProfileSession('member')
        setAuthError(null)

        try {
          const authSession = await fetchAuthSession()
          const claims = authSession.tokens?.idToken?.payload
          const tokenName =
            typeof claims?.name === 'string' ? claims.name.trim() : ''
          const tokenEmail =
            typeof claims?.email === 'string' ? claims.email : ''

          if (!isActive) return

          setMemberProfile({
            userId: user.userId,
            displayName: resolveMemberDisplayName(tokenName, tokenEmail),
            email: tokenEmail || 'メールアドレス未取得',
            authProvider: user.username.toLowerCase().startsWith('google_')
              ? 'google'
              : 'email',
          })
        } catch {
          // IDトークンを参照できない場合は、Cognito内部名の仮表示を維持する。
        }

        try {
          const attributes = await fetchUserAttributes()

          if (!isActive) return

          setMemberProfile({
            userId: user.userId,
            displayName: resolveMemberDisplayName(
              attributes.name,
              attributes.email,
            ),
            email: attributes.email ?? 'メールアドレス未取得',
            authProvider: user.username.toLowerCase().startsWith('google_')
              ? 'google'
              : 'email',
          })
        } catch {
          // 認証済みであれば、属性は未取得表示のままHomeを利用できるようにする。
        }

        if (window.location.pathname === '/auth/callback') {
          navigate('/', { replace: true })
        }
      } catch {
        if (!isActive) return
        setMemberProfile(null)
        setProfileSession(null)
      } finally {
        if (isActive) {
          setIsAuthChecking(false)
          setSigningInMethod(null)
        }
      }
    }

    const cancelAuthListener = Hub.listen('auth', ({ payload }) => {
      if (
        payload.event === 'signedIn' ||
        payload.event === 'signInWithRedirect' ||
        payload.event === 'tokenRefresh'
      ) {
        void syncAuthSession()
        return
      }

      if (payload.event === 'signedOut') {
        setMemberProfile(null)
        setProfileSession(null)
        setSigningInMethod(null)
        return
      }

      if (payload.event === 'signInWithRedirect_failure') {
        setAuthError(getAuthErrorMessage(payload.data.error))
        setIsAuthChecking(false)
        setSigningInMethod(null)
      }
    })

    void syncAuthSession()

    // OAuthリスナーはReactより先に動き始めるため、開発時のStrictModeを含め、
    // コールバック完了イベントとuseEffectの購読がすれ違った場合も再同期する。
    const callbackRetryTimer =
      window.location.pathname === '/auth/callback'
        ? window.setTimeout(() => void syncAuthSession(), 750)
        : null

    return () => {
      isActive = false
      cancelAuthListener()
      if (callbackRetryTimer !== null) {
        window.clearTimeout(callbackRetryTimer)
      }
    }
  }, [navigate])

  /** カーソル音の再生機能を必要になった時だけ作成して返す。 */
  const getCursorSoundPlayer = () => {
    cursorSoundPlayer.current ??= new HundredCursorSoundPlayer()
    return cursorSoundPlayer.current
  }

  /** 指定したカーソル音をWeb Audio APIで再生する。 */
  const playCursorSound = (soundId: CursorSoundId = selectedCursorSound) => {
    getCursorSoundPlayer().play(soundId, effectVolume)
  }

  /** 選択した壁紙を画面へ反映し、次回表示用にブラウザへ保存する。 */
  const handleWallpaperSelect = (wallpaper: WallpaperId) => {
    setSelectedWallpaper(wallpaper)

    try {
      localStorage.setItem(wallpaperStorageKey, wallpaper)
    } catch {
      // 保存できない環境でも、現在の画面内では選択を反映する。
    }
  }

  /** 選択したカーソル音を保存し、その場で一度試聴する。 */
  const handleCursorSoundSelect = (sound: CursorSoundId) => {
    setSelectedCursorSound(sound)
    playCursorSound(sound)

    try {
      localStorage.setItem(cursorSoundStorageKey, sound)
    } catch {
      // 保存できない環境でも、現在の画面内では選択を反映する。
    }
  }

  /** 選択した効果音音量を画面へ反映し、次回表示用にブラウザへ保存する。 */
  const handleEffectVolumeChange = (volume: number) => {
    setEffectVolume(volume)

    try {
      localStorage.setItem(effectVolumeStorageKey, String(volume))
    } catch {
      // 保存できない環境でも、現在の画面内では音量を反映する。
    }
  }

  /** 通知全体の設定を更新し、次回表示用にブラウザへ保存する。 */
  const handleNotificationsEnabledChange = (enabled: boolean) => {
    setNotificationSettings((currentSettings) => {
      const nextSettings = { ...currentSettings, enabled }

      try {
        localStorage.setItem(notificationStorageKey, JSON.stringify(nextSettings))
      } catch {
        // 保存できない環境でも、現在の画面内では設定を反映する。
      }

      return nextSettings
    })
  }

  /** 指定したAppの通知設定を更新し、次回表示用にブラウザへ保存する。 */
  const handleAppNotificationChange = (appId: string, enabled: boolean) => {
    if (!installedApps.some((app) => app.id === appId)) return

    setNotificationSettings((currentSettings) => {
      const nextSettings = {
        ...currentSettings,
        apps: { ...currentSettings.apps, [appId]: enabled },
      }

      try {
        localStorage.setItem(notificationStorageKey, JSON.stringify(nextSettings))
      } catch {
        // 保存できない環境でも、現在の画面内では設定を反映する。
      }

      return nextSettings
    })
  }

  /** Cognitoを経由してGoogleのサインイン画面へ移動する。 */
  const handleGoogleSignIn = async () => {
    getCursorSoundPlayer().prepare()
    setAuthError(null)
    setSigningInMethod('google')

    try {
      await signInWithRedirect({
        provider: 'Google',
        options: { lang: 'ja' },
      })
    } catch (error) {
      setAuthError(getAuthErrorMessage(error))
      setSigningInMethod(null)
    }
  }

  /** Cognito User Poolのマネージドログインへ移動する。 */
  const handleEmailSignIn = async () => {
    getCursorSoundPlayer().prepare()
    setAuthError(null)
    setSigningInMethod('email')

    try {
      await signInWithRedirect({ options: { lang: 'ja' } })
    } catch (error) {
      setAuthError(getAuthErrorMessage(error))
      setSigningInMethod(null)
    }
  }

  /** ゲストとしてサインインし、アカウントを作らずHomeへ移動する。 */
  const handleGuestSignIn = () => {
    getCursorSoundPlayer().prepare()
    setAuthError(null)
    setProfileSession('guest')
  }

  /** 現在の会員・ゲストセッションを終了し、サインイン画面へ戻す。 */
  const handleSignOut = async () => {
    setIsProfileDialogOpen(false)

    if (profileSession === 'member') {
      try {
        await signOut()
      } catch (error) {
        setAuthError(getAuthErrorMessage(error))
      }
    }

    setMemberProfile(null)
    setProfileSession(null)
  }

  /** メール利用者の表示名をCognitoのname属性へ保存する。 */
  const handleDisplayNameChange = async (displayName: string) => {
    const normalizedDisplayName = displayName.trim()

    setDisplayNameError(null)
    setDisplayNameNotice(null)

    if (profileSession !== 'member' || memberProfile?.authProvider !== 'email') {
      setDisplayNameError('このアカウントでは表示名を変更できません。')
      return
    }

    if (!normalizedDisplayName) {
      setDisplayNameError('表示名を入力してください。')
      return
    }

    if (normalizedDisplayName.length > 50) {
      setDisplayNameError('表示名は50文字以内で入力してください。')
      return
    }

    setIsUpdatingDisplayName(true)

    try {
      await updateUserAttributes({
        userAttributes: { name: normalizedDisplayName },
      })
      setMemberProfile((currentProfile) =>
        currentProfile
          ? { ...currentProfile, displayName: normalizedDisplayName }
          : currentProfile,
      )
      setDisplayNameNotice('表示名を更新しました。')
    } catch {
      setDisplayNameError(
        '表示名を更新できませんでした。通信状態を確認して、もう一度お試しください。',
      )
    } finally {
      setIsUpdatingDisplayName(false)
    }
  }

  /** 指定位置のカテゴリを選択し、位置が変わった場合だけカーソル音を鳴らす。 */
  const selectCategory = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), categories.length - 1)
    if (nextIndex === selectedCategoryIndexRef.current) return

    selectedCategoryIndexRef.current = nextIndex
    setSelectedCategoryIndex(nextIndex)
    playCursorSound()
  }

  /** 指定位置のAppを選択し、位置が変わった場合だけカーソル音を鳴らす。 */
  const selectApp = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), installedApps.length - 1)
    if (nextIndex === selectedAppIndexRef.current) return

    selectedAppIndexRef.current = nextIndex
    setSelectedAppIndex(nextIndex)
    playCursorSound()
  }

  /** Appを選択し、選択済みのCreative IAが押された場合は画面を開く。 */
  const handleAppClick = (app: InstalledApp, index: number) => {
    if (
      app.id === 'creative-ia' &&
      index === selectedAppIndexRef.current
    ) {
      navigate('/creative-ia')
      return
    }

    selectApp(index)
  }

  /** 現在のカテゴリから指定方向へ選択を移動する。 */
  const moveCategory = (direction: -1 | 1) => {
    selectCategory(selectedCategoryIndexRef.current + direction)
  }

  /** Apps選択中に、現在のAppから指定方向へ選択を移動する。 */
  const moveApp = (direction: -1 | 1) => {
    const currentCategory = categories[selectedCategoryIndexRef.current]
    if (currentCategory.id !== 'apps') return

    selectApp(selectedAppIndexRef.current + direction)
  }

  // Reactのpassiveなwheelイベントを避け、スクロール抑止可能なイベントを直接登録する。
  useEffect(() => {
    const categoryElement = categoryWheelArea.current
    const appElement = appWheelArea.current

    /** カテゴリ領域の縦・横ホイール入力を、左右のカテゴリ移動へ変換する。 */
    const handleCategoryWheel = (event: WheelEvent) => {
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY
      if (delta === 0) return

      event.preventDefault()
      event.stopPropagation()
      moveCategory(delta < 0 ? -1 : 1)
    }

    /** App領域の縦ホイール入力を、上下のApp移動へ変換する。 */
    const handleAppWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return

      event.preventDefault()
      event.stopPropagation()
      moveApp(event.deltaY < 0 ? -1 : 1)
    }

    categoryElement?.addEventListener('wheel', handleCategoryWheel, {
      passive: false,
    })
    appElement?.addEventListener('wheel', handleAppWheel, { passive: false })

    return () => {
      categoryElement?.removeEventListener('wheel', handleCategoryWheel)
      appElement?.removeEventListener('wheel', handleAppWheel)
    }
  })

  if (profileSession === null) {
    return (
      <HundredSignInScreen
        wallpaper={selectedWallpaper}
        isCheckingSession={isAuthChecking}
        signingInMethod={signingInMethod}
        authError={authError}
        onGoogleSignIn={() => void handleGoogleSignIn()}
        onEmailSignIn={() => void handleEmailSignIn()}
        onGuestSignIn={handleGuestSignIn}
      />
    )
  }

  /** 矢印キーを横カテゴリ移動と縦App移動へ割り当てる。 */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    // 矢印キーによるページスクロールを止め、XMBの移動に割り当てる。
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      moveCategory(event.key === 'ArrowLeft' ? -1 : 1)
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveApp(event.key === 'ArrowUp' ? -1 : 1)
    }
  }

  /** スワイプ開始時のポインター座標を記録する。 */
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    getCursorSoundPlayer().prepare()
    pointerStart.current = { x: event.clientX, y: event.clientY }
  }

  /** 開始位置との差からスワイプの方向を判定して選択を移動する。 */
  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!pointerStart.current) return

    const deltaX = event.clientX - pointerStart.current.x
    const deltaY = event.clientY - pointerStart.current.y
    pointerStart.current = null

    // 小さな指の動きはスワイプではなくタップとして扱う。
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < swipeThreshold) return

    suppressClick.current = true

    // 移動量が大きい軸を採用し、斜めスワイプの誤操作を減らす。
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      moveCategory(deltaX < 0 ? 1 : -1)
      return
    }

    moveApp(deltaY < 0 ? 1 : -1)
  }

  /** スワイプ直後に発生する不要なクリックイベントを抑止する。 */
  const handleClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return

    // スワイプ終了直後に同じ要素のclickが発火して選択が戻るのを防ぐ。
    event.preventDefault()
    event.stopPropagation()
    suppressClick.current = false
  }

  // Reactの選択位置をCSSカスタムプロパティへ渡し、CSS側で移動量を計算する。
  const categoryTrackStyle = {
    '--hundred-selected-category': selectedCategoryIndex,
  } as CSSProperties

  const appTrackStyle = {
    '--hundred-selected-app': selectedAppIndex,
  } as CSSProperties

  return (
    <main
      className="hundred-home"
      data-theme-strategy={hundredThemeConfig.strategy}
      data-theme={selectedWallpaperTheme}
      data-wallpaper={selectedWallpaper}
      aria-label="Hundredのホーム"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => (pointerStart.current = null)}
      onClickCapture={handleClickCapture}
    >
      <HundredWallpaperBackground wallpaper={selectedWallpaper} />
      <div className="hundred-home__ambient" aria-hidden="true" />

      <header className="hundred-home__header">
        <h1>Hundred</h1>
      </header>

      <section className="hundred-xmb" aria-label="ホームナビゲーション">
        <nav
          ref={categoryWheelArea}
          className="hundred-category-window"
          aria-label="カテゴリ"
        >
          <div className="hundred-category-track" style={categoryTrackStyle}>
            {categories.map((category, index) => {
              const isSelected = index === selectedCategoryIndex

              return (
                <button
                  className="hundred-category"
                  type="button"
                  key={category.id}
                  aria-pressed={isSelected}
                  onClick={() => selectCategory(index)}
                >
                  <span className="hundred-category__icon">
                    <CategoryIcon id={category.id} />
                  </span>
                  <span className="hundred-category__label">{category.label}</span>
                </button>
              )
            })}
          </div>
        </nav>

        <div className="hundred-xmb__axis" aria-hidden="true">
          <span />
        </div>

        <div className="hundred-item-window">
          {selectedCategory.id === 'profile' ? (
            <div className="hundred-profile-panel">
              <button
                className="hundred-profile-entry"
                type="button"
                onClick={() => setIsProfileDialogOpen(true)}
              >
                <span className="hundred-profile-entry__avatar" aria-hidden="true">
                  {profileSession === 'member' ? memberAvatarLabel : 'G'}
                </span>
                <span className="hundred-profile-entry__copy">
                  <strong>
                    {profileSession === 'member' ? memberDisplayName : 'ゲスト'}
                  </strong>
                  <small>
                    {profileSession === 'member'
                      ? memberSignInLabel
                      : 'ゲストとして利用中'}
                  </small>
                </span>
                <span className="hundred-profile-entry__arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            </div>
          ) : selectedCategory.id === 'apps' ? (
            <div
              ref={appWheelArea}
              className="hundred-app-track"
              style={appTrackStyle}
              aria-label="インストール済みアプリ"
            >
              {installedApps.map((app, index) => {
                const isSelected = index === selectedAppIndex

                return (
                  <button
                    className="hundred-app-item"
                    type="button"
                    key={app.id}
                    aria-pressed={isSelected}
                    onClick={() => handleAppClick(app, index)}
                  >
                    <span className="hundred-app-item__marker" aria-hidden="true" />
                    <span className="hundred-app-item__icon">
                      <AppIcon id={app.id} />
                    </span>
                    <span className="hundred-app-item__copy">
                      <strong>{app.name}</strong>
                      <small>{app.detail}</small>
                    </span>
                    <span className="hundred-app-item__index" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : selectedCategory.id === 'settings' ? (
            <div className="hundred-settings-list">
              <button
                className="hundred-settings-item"
                type="button"
                onClick={() => setIsWallpaperDialogOpen(true)}
              >
                <span className="hundred-settings-item__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <rect x="3.5" y="5" width="17" height="14" rx="2" />
                    <circle cx="9" cy="10" r="1.5" />
                    <path d="m5.5 17 4.5-4 3 2.5 2.5-2 3 3.5" />
                  </svg>
                </span>
                <span className="hundred-settings-item__copy">
                  <strong>壁紙</strong>
                  <small>{getWallpaper(selectedWallpaper)?.name}</small>
                </span>
                <span className="hundred-settings-item__arrow" aria-hidden="true">
                  ›
                </span>
              </button>

              <button
                className="hundred-settings-item"
                type="button"
                onClick={() => setIsSoundDialogOpen(true)}
              >
                <span className="hundred-settings-item__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 10v4h3l4 3V7L8 10H5Z" />
                    <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" />
                  </svg>
                </span>
                <span className="hundred-settings-item__copy">
                  <strong>サウンド</strong>
                  <small>
                    {selectedCursorSound === 'none'
                      ? 'オフ'
                      : `${getCursorSound(selectedCursorSound)?.name} · ${Math.round(effectVolume * 100)}%`}
                  </small>
                </span>
                <span className="hundred-settings-item__arrow" aria-hidden="true">
                  ›
                </span>
              </button>

              <button
                className="hundred-settings-item"
                type="button"
                onClick={() => setIsNotificationDialogOpen(true)}
              >
                <span className="hundred-settings-item__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M7 10a5 5 0 0 1 10 0c0 5 2 5 2 7H5c0-2 2-2 2-7Z" />
                    <path d="M10 20h4" />
                  </svg>
                </span>
                <span className="hundred-settings-item__copy">
                  <strong>通知</strong>
                  <small>
                    {notificationSettings.enabled
                      ? `${enabledNotificationAppCount}/${installedApps.length} アプリ`
                      : 'オフ'}
                  </small>
                </span>
                <span className="hundred-settings-item__arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            </div>
          ) : (
            <div className="hundred-category-placeholder" key={selectedCategory.id}>
              <span>選択中</span>
              <strong>{selectedCategory.label}</strong>
              <p>このカテゴリは準備中です</p>
            </div>
          )}
        </div>
      </section>

      {isWallpaperDialogOpen && (
        <HundredWallpaperDialog
          selectedWallpaper={selectedWallpaper}
          onSelect={handleWallpaperSelect}
          onClose={() => setIsWallpaperDialogOpen(false)}
        />
      )}

      {isSoundDialogOpen && (
        <HundredSoundDialog
          effectVolume={effectVolume}
          selectedSound={selectedCursorSound}
          onVolumeChange={handleEffectVolumeChange}
          onSelect={handleCursorSoundSelect}
          onClose={() => setIsSoundDialogOpen(false)}
        />
      )}

      {isNotificationDialogOpen && (
        <HundredNotificationDialog
          notificationsEnabled={notificationSettings.enabled}
          apps={installedApps}
          appNotifications={notificationSettings.apps}
          onEnabledChange={handleNotificationsEnabledChange}
          onAppChange={handleAppNotificationChange}
          onClose={() => setIsNotificationDialogOpen(false)}
        />
      )}

      {isProfileDialogOpen && (
        <HundredProfileDialog
          session={profileSession}
          memberProfile={memberProfile}
          isUpdatingDisplayName={isUpdatingDisplayName}
          displayNameError={displayNameError}
          displayNameNotice={displayNameNotice}
          onGoogleSignIn={() => void handleGoogleSignIn()}
          onEmailSignIn={() => void handleEmailSignIn()}
          onDisplayNameChange={handleDisplayNameChange}
          onSignOut={() => void handleSignOut()}
          onClose={() => {
            setIsProfileDialogOpen(false)
            setDisplayNameError(null)
            setDisplayNameNotice(null)
          }}
        />
      )}
    </main>
  )
}

export default HundredHome
