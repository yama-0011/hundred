import { useId } from 'react'
import type { ScreenMapLabelMode } from './screenMap'

/** 概要: キャンバスの「操作名」の表示の切り替え。編集画面と閲覧の全体図で共通に使う。 */
function ScreenMapViewSettings({ labelMode, onLabelMode }: { labelMode: ScreenMapLabelMode; onLabelMode: (value: ScreenMapLabelMode) => void }) {
  const id = useId()
  return <div className="ad-sm-view-settings">
    <div className="ad-sm-view-setting"><span id={`${id}-labels`}>操作名</span><div className="ad-sm-segmented" role="group" aria-labelledby={`${id}-labels`}>
      <button type="button" aria-pressed={labelMode === 'icon'} className={labelMode === 'icon' ? 'active' : ''} onClick={() => onLabelMode('icon')}>アイコン</button>
      <button type="button" aria-pressed={labelMode === 'all'} className={labelMode === 'all' ? 'active' : ''} onClick={() => onLabelMode('all')}>すべて表示</button>
    </div></div>
  </div>
}

export default ScreenMapViewSettings
