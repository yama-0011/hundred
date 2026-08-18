import {
  cursorSoundOptions,
  type CursorSoundId,
} from './hundredCursorSoundOptions'
import '../../../styles/Hundred/hundred-cursor-sound.css'

type HundredCursorSoundDialogProps = {
  selectedSound: CursorSoundId
  onSelect: (sound: CursorSoundId) => void
  onClose: () => void
}

/** カーソル音の一覧と現在の選択状態をダイアログで表示する。 */
function HundredCursorSoundDialog({
  selectedSound,
  onSelect,
  onClose,
}: HundredCursorSoundDialogProps) {
  /** 背景部分が押された場合だけカーソル音選択を閉じる。 */
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  /** Escapeキーで選択画面を閉じ、矢印操作がHomeへ伝わるのを防ぐ。 */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()

    if (event.key === 'Escape') onClose()
  }

  return (
    <div
      className="hundred-cursor-sound-dialog"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section
        className="hundred-cursor-sound-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hundred-cursor-sound-dialog-title"
      >
        <header className="hundred-cursor-sound-dialog__header">
          <div>
            <span>Settings</span>
            <h2 id="hundred-cursor-sound-dialog-title">Cursor sound</h2>
          </div>
          <button
            className="hundred-cursor-sound-dialog__close"
            type="button"
            onClick={onClose}
            aria-label="カーソル音選択を閉じる"
            autoFocus
          >
            ×
          </button>
        </header>

        <div className="hundred-cursor-sound-dialog__options">
          {cursorSoundOptions.map((sound) => {
            const isSelected = sound.id === selectedSound

            return (
              <button
                className="hundred-cursor-sound-option"
                type="button"
                key={sound.id}
                aria-pressed={isSelected}
                onClick={() => onSelect(sound.id)}
              >
                <span className="hundred-cursor-sound-option__icon" aria-hidden="true">
                  {sound.id === 'none' ? '×' : '♪'}
                </span>
                <span className="hundred-cursor-sound-option__copy">
                  <strong>{sound.name}</strong>
                  <small>{sound.description}</small>
                </span>
                <span className="hundred-cursor-sound-option__check" aria-hidden="true">
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

export default HundredCursorSoundDialog
