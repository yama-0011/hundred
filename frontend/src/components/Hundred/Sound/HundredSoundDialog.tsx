import {
  cursorSoundOptions,
  type CursorSoundId,
} from './hundredCursorSoundOptions'
import '../../../styles/Hundred/hundred-sound-dialog.css'

/**
 * 概要:
 * Hundred Homeの効果音設定ダイアログを表示する。
 *
 * 責務:
 * - 効果音の全体音量を調整する
 * - 利用可能なカーソル音と現在の選択状態を表示する
 * - 音量変更、カーソル音選択、閉じる操作を親へ通知する
 */
type HundredSoundDialogProps = {
  effectVolume: number
  selectedSound: CursorSoundId
  onVolumeChange: (volume: number) => void
  onSelect: (sound: CursorSoundId) => void
  onClose: () => void
}

/**
 * 概要: 効果音の音量とカーソル音を設定するダイアログを表示する。
 * 責務: 現在値を描画し、各設定変更を親コンポーネントへ通知する。
 */
function HundredSoundDialog({
  effectVolume,
  selectedSound,
  onVolumeChange,
  onSelect,
  onClose,
}: HundredSoundDialogProps) {
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

  /**
   * 概要: 音量スライダーの入力値を取得する。
   * 責務: 文字列の入力値を0〜1の数値へ変換して親へ通知する。
   */
  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const volume = Number(event.currentTarget.value)
    onVolumeChange(Math.min(Math.max(volume, 0), 1))
  }

  return (
    <div
      className="hundred-sound-dialog"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section
        className="hundred-sound-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hundred-sound-dialog-title"
      >
        <header className="hundred-sound-dialog__header">
          <div>
            <span>設定</span>
            <h2 id="hundred-sound-dialog-title">サウンド</h2>
          </div>
          <button
            className="hundred-sound-dialog__close"
            type="button"
            onClick={onClose}
            aria-label="サウンド設定を閉じる"
            autoFocus
          >
            ×
          </button>
        </header>

        <section
          className="hundred-sound-volume"
          aria-labelledby="hundred-sound-volume-title"
        >
          <div className="hundred-sound-volume__header">
            <strong id="hundred-sound-volume-title">効果音の音量</strong>
            <span>{Math.round(effectVolume * 100)}%</span>
          </div>
          <input
            className="hundred-sound-volume__slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={effectVolume}
            onChange={handleVolumeChange}
            aria-label="効果音の音量"
            aria-valuetext={`${Math.round(effectVolume * 100)}%`}
          />
          <small>カーソル移動など、Hundredの効果音に反映されます</small>
        </section>

        <section aria-labelledby="hundred-cursor-sound-options-title">
          <h3
            className="hundred-sound-dialog__section-title"
            id="hundred-cursor-sound-options-title"
          >
            カーソル音
          </h3>
          <div className="hundred-sound-dialog__options">
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
                  <span
                    className="hundred-cursor-sound-option__icon"
                    aria-hidden="true"
                  >
                    {sound.id === 'none' ? '×' : '♪'}
                  </span>
                  <span className="hundred-cursor-sound-option__copy">
                    <strong>{sound.name}</strong>
                    <small>{sound.description}</small>
                  </span>
                  <span
                    className="hundred-cursor-sound-option__check"
                    aria-hidden="true"
                  >
                    {isSelected ? '✓' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      </section>
    </div>
  )
}

export default HundredSoundDialog
