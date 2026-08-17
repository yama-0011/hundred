import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import HundredCursorSoundDialog from '../CursorSound/HundredCursorSoundDialog'
import HundredCursorSoundPlayer from '../CursorSound/HundredCursorSoundPlayer'
import {
  defaultCursorSoundId,
  getCursorSound,
  resolveCursorSoundId,
  type CursorSoundId,
} from '../CursorSound/hundredCursorSoundOptions'
import HundredWallpaperBackground from '../Wallpaper/HundredWallpaperBackground'
import HundredWallpaperDialog from '../Wallpaper/HundredWallpaperDialog'
import {
  isWallpaperId,
  type WallpaperId,
} from '../Wallpaper/hundredWallpaperOptions'
import '../../../styles/Hundred/hundred-home.css'

/**
 * Hundred HomeのXMB型UIを構成するコンポーネント。
 *
 * 責務:
 * - カテゴリとインストール済みAppをデータから描画する
 * - 選択中のカテゴリとAppの状態を管理する
 * - スワイプ、クリック、キーボード、ホイールによる選択操作を処理する
 * - カーソル移動音と壁紙の設定を管理する
 */

// IDを文字列の自由入力にせず、扱えるカテゴリとAppを型で限定する。
type CategoryId = 'profile' | 'apps' | 'store' | 'mail' | 'settings'
type AppId = 'record-hub' | 'memo' | 'game'

type Category = {
  id: CategoryId
  label: string
}

type InstalledApp = {
  id: AppId
  name: string
  detail: string
}

// 表示内容をデータとして分離し、項目追加時にJSXを書き換えずに済むようにする。
const categories: Category[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'apps', label: 'Apps' },
  { id: 'store', label: 'Store' },
  { id: 'mail', label: 'Mail' },
  { id: 'settings', label: 'Settings' },
]

const installedApps: InstalledApp[] = [
  { id: 'record-hub', name: 'Record Hub', detail: '記録をひとつの場所に' },
  { id: 'memo', name: 'Memo', detail: '考えをすばやく残す' },
  { id: 'game', name: 'Game', detail: 'ひと息つく時間' },
]

const initialCategoryIndex = categories.findIndex(({ id }) => id === 'apps')
const swipeThreshold = 38
const wallpaperStorageKey = 'hundred-wallpaper'
const cursorSoundStorageKey = 'hundred-cursor-sound'

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
  // 配列の何番目を選択しているかをstateとして保持する。
  const [selectedCategoryIndex, setSelectedCategoryIndex] =
    useState(initialCategoryIndex)
  const [selectedAppIndex, setSelectedAppIndex] = useState(0)
  const [selectedWallpaper, setSelectedWallpaper] =
    useState<WallpaperId>(getInitialWallpaper)
  const [selectedCursorSound, setSelectedCursorSound] =
    useState<CursorSoundId>(getInitialCursorSound)
  const [isWallpaperDialogOpen, setIsWallpaperDialogOpen] = useState(false)
  const [isCursorSoundDialogOpen, setIsCursorSoundDialogOpen] = useState(false)

  // 操作中の一時値や音声要素は、再描画を起こさないuseRefで保持する。
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const selectedCategoryIndexRef = useRef(initialCategoryIndex)
  const selectedAppIndexRef = useRef(0)
  const cursorSoundPlayer = useRef<HundredCursorSoundPlayer | null>(null)

  const selectedCategory = categories[selectedCategoryIndex]

  /** カーソル音の再生機能を必要になった時だけ作成して返す。 */
  const getCursorSoundPlayer = () => {
    cursorSoundPlayer.current ??= new HundredCursorSoundPlayer()
    return cursorSoundPlayer.current
  }

  /** 指定したカーソル音をWeb Audio APIで再生する。 */
  const playCursorSound = (soundId: CursorSoundId = selectedCursorSound) => {
    getCursorSoundPlayer().play(soundId)
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

  /** カテゴリ領域の縦・横ホイール入力を、左右のカテゴリ移動へ変換する。 */
  const handleCategoryWheel = (event: React.WheelEvent<HTMLElement>) => {
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
  const handleAppWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (event.deltaY === 0) return

    event.preventDefault()
    event.stopPropagation()
    moveApp(event.deltaY < 0 ? -1 : 1)
  }

  // Reactの選択位置をCSSカスタムプロパティへ渡し、CSS側で移動量を計算する。
  const categoryTrackStyle = {
    '--selected-category': selectedCategoryIndex,
  } as CSSProperties

  const appTrackStyle = {
    '--selected-app': selectedAppIndex,
  } as CSSProperties

  return (
    <main
      className="hundred-home"
      data-wallpaper={selectedWallpaper}
      aria-label="Hundred Home"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => (pointerStart.current = null)}
      onClickCapture={handleClickCapture}
    >
      <HundredWallpaperBackground wallpaper={selectedWallpaper} />
      <div className="hundred-home__ambient" aria-hidden="true" />

      <header className="hundred-header">
        <h1>Hundred</h1>
      </header>

      <section className="xmb" aria-label="Home navigation">
        <nav
          className="category-window"
          aria-label="Categories"
          onWheel={handleCategoryWheel}
        >
          <div className="category-track" style={categoryTrackStyle}>
            {categories.map((category, index) => {
              const isSelected = index === selectedCategoryIndex

              return (
                <button
                  className="category"
                  type="button"
                  key={category.id}
                  aria-pressed={isSelected}
                  onClick={() => selectCategory(index)}
                >
                  <span className="category__icon">
                    <CategoryIcon id={category.id} />
                  </span>
                  <span className="category__label">{category.label}</span>
                </button>
              )
            })}
          </div>
        </nav>

        <div className="xmb__axis" aria-hidden="true">
          <span />
        </div>

        <div className="item-window">
          {selectedCategory.id === 'apps' ? (
            <div
              className="app-track"
              style={appTrackStyle}
              aria-label="Installed apps"
              onWheel={handleAppWheel}
            >
              {installedApps.map((app, index) => {
                const isSelected = index === selectedAppIndex

                return (
                  <button
                    className="app-item"
                    type="button"
                    key={app.id}
                    aria-pressed={isSelected}
                    onClick={() => selectApp(index)}
                  >
                    <span className="app-item__marker" aria-hidden="true" />
                    <span className="app-item__icon">
                      <AppIcon id={app.id} />
                    </span>
                    <span className="app-item__copy">
                      <strong>{app.name}</strong>
                      <small>{app.detail}</small>
                    </span>
                    <span className="app-item__index" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : selectedCategory.id === 'settings' ? (
            <div className="settings-list">
              <button
                className="settings-item"
                type="button"
                onClick={() => setIsWallpaperDialogOpen(true)}
              >
                <span className="settings-item__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <rect x="3.5" y="5" width="17" height="14" rx="2" />
                    <circle cx="9" cy="10" r="1.5" />
                    <path d="m5.5 17 4.5-4 3 2.5 2.5-2 3 3.5" />
                  </svg>
                </span>
                <span className="settings-item__copy">
                  <strong>Wallpaper</strong>
                  <small>動く背景を選択</small>
                </span>
                <span className="settings-item__arrow" aria-hidden="true">
                  ›
                </span>
              </button>

              <button
                className="settings-item"
                type="button"
                onClick={() => setIsCursorSoundDialogOpen(true)}
              >
                <span className="settings-item__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 10v4h3l4 3V7L8 10H5Z" />
                    <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" />
                  </svg>
                </span>
                <span className="settings-item__copy">
                  <strong>Cursor sound</strong>
                  <small>{getCursorSound(selectedCursorSound)?.name}</small>
                </span>
                <span className="settings-item__arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            </div>
          ) : (
            <div className="category-placeholder" key={selectedCategory.id}>
              <span>Selected</span>
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

      {isCursorSoundDialogOpen && (
        <HundredCursorSoundDialog
          selectedSound={selectedCursorSound}
          onSelect={handleCursorSoundSelect}
          onClose={() => setIsCursorSoundDialogOpen(false)}
        />
      )}
    </main>
  )
}

export default HundredHome
