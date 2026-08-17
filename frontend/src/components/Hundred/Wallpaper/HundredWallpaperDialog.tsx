import {
  wallpaperOptions,
  type WallpaperId,
} from './hundredWallpaperOptions'

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
      className="wallpaper-dialog"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section
        className="wallpaper-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallpaper-dialog-title"
      >
        <header className="wallpaper-dialog__header">
          <div>
            <span>Settings</span>
            <h2 id="wallpaper-dialog-title">Wallpaper</h2>
          </div>
          <button
            className="wallpaper-dialog__close"
            type="button"
            onClick={onClose}
            aria-label="壁紙選択を閉じる"
            autoFocus
          >
            ×
          </button>
        </header>

        <div className="wallpaper-dialog__options">
          {wallpaperOptions.map((wallpaper) => {
            const isSelected = wallpaper.id === selectedWallpaper

            return (
              <button
                className="wallpaper-option"
                type="button"
                key={wallpaper.id}
                aria-pressed={isSelected}
                onClick={() => onSelect(wallpaper.id)}
              >
                <span
                  className="wallpaper-option__preview"
                  data-wallpaper-preview={wallpaper.id}
                  aria-hidden="true"
                />
                <span className="wallpaper-option__copy">
                  <strong>{wallpaper.name}</strong>
                  <small>{wallpaper.description}</small>
                </span>
                <span className="wallpaper-option__check" aria-hidden="true">
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
