import {
  wallpaperOptions,
  type WallpaperId,
} from './hundredWallpaperOptions'
import '../../../styles/Hundred/hundred-wallpaper-dialog.css'

type HundredWallpaperDialogProps = {
  selectedWallpaper: WallpaperId
  onSelect: (wallpaper: WallpaperId) => void
  onClose: () => void
}

/** 壁紙プリセットの一覧と現在の選択状態をダイアログで表示する。 */
function HundredWallpaperDialog({
  selectedWallpaper,
  onSelect,
  onClose,
}: HundredWallpaperDialogProps) {
  /** 背景部分が押された場合だけ壁紙選択を閉じる。 */
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  /** Escapeキーで壁紙選択を閉じ、矢印操作がHomeへ伝わるのを防ぐ。 */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()

    if (event.key === 'Escape') onClose()
  }

  return (
    <div
      className="hundred-wallpaper-dialog"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section
        className="hundred-wallpaper-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hundred-wallpaper-dialog-title"
      >
        <header className="hundred-wallpaper-dialog__header">
          <div>
            <span>設定</span>
            <h2 id="hundred-wallpaper-dialog-title">壁紙</h2>
          </div>
          <button
            className="hundred-wallpaper-dialog__close"
            type="button"
            onClick={onClose}
            aria-label="壁紙設定を閉じる"
            autoFocus
          >
            ×
          </button>
        </header>

        <div className="hundred-wallpaper-dialog__options">
          {wallpaperOptions.map((wallpaper) => {
            const isSelected = wallpaper.id === selectedWallpaper

            return (
              <button
                className="hundred-wallpaper-option"
                type="button"
                key={wallpaper.id}
                aria-pressed={isSelected}
                onClick={() => onSelect(wallpaper.id)}
              >
                <span
                  className="hundred-wallpaper-option__preview"
                  data-wallpaper-preview={wallpaper.id}
                  aria-hidden="true"
                />
                <span className="hundred-wallpaper-option__copy">
                  <strong>{wallpaper.name}</strong>
                  <small>{wallpaper.description}</small>
                </span>
                <span className="hundred-wallpaper-option__check" aria-hidden="true">
                  {isSelected ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default HundredWallpaperDialog
