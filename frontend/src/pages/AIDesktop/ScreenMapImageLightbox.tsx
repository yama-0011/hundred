import { useEffect } from 'react'
import { screenMapVerificationLabels, type ScreenMapData, type ScreenMapTransition } from './screenMap'

/**
 * 概要: 画面のスクリーンショットを大きく表示し、横に画面の詳細と遷移を並べる。
 * 遷移を押すと、その画面の表示に切り替わる。Escキーか背景の操作で閉じる。
 */
function ScreenMapImageLightbox({ data, screenId, onNavigate, onClose }: { data: ScreenMapData; screenId: string; onNavigate: (screenId: string) => void; onClose: () => void }) {
  const screen = data.screens.find((candidate) => candidate.id === screenId)
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  if (!screen) return null
  const image = screen.images[0]
  const names = new Map(data.screens.map((candidate) => [candidate.id, candidate.name || '名称未設定']))
  const group = data.groups.find((candidate) => candidate.id === screen.groupId)
  const incoming = data.transitions.filter((transition) => transition.to === screen.id)
  const outgoing = data.transitions.filter((transition) => transition.from === screen.id)
  const states = data.screens.filter((candidate) => candidate.stateOf === screen.id)
  const transitionLink = (transition: ScreenMapTransition, direction: 'in' | 'out') => {
    const target = direction === 'in' ? transition.from : transition.to
    return <li key={transition.id}><button type="button" className={`ad-sm-panel-link ${transition.verification}`} onClick={() => onNavigate(target)}>
      {direction === 'in' ? `${names.get(target)} →` : `→ ${names.get(target)}`}<span>{transition.action ? `「${transition.action}」` : '操作名なし'}{transition.condition && `（${transition.condition}）`}{transition.verification === 'ai-inferred' ? '・AIの推測' : ''}</span>
    </button></li>
  }
  return <div className="ad-sm-lightbox" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="ad-sm-lightbox-title">
      <header>
        <div><small>{group?.name ?? 'グループなし'}</small><strong id="ad-sm-lightbox-title">{screen.name || '名称未設定'}</strong></div>
        <button type="button" aria-label="閉じる" onClick={onClose}>×</button>
      </header>
      <div className="ad-sm-lightbox-body">
        <div className="ad-sm-lightbox-image">{image ? <img src={image.url} alt={`${screen.name}のスクリーンショット`} /> : <p>この画面には画像がありません。</p>}</div>
        <aside className="ad-sm-lightbox-info">
          <dl className="ad-sm-panel-list">
            {screen.url && <><dt>URL</dt><dd>{screen.url}</dd></>}
            {screen.stateOf && <><dt>元の画面</dt><dd><button type="button" className="ad-sm-text-link" onClick={() => onNavigate(screen.stateOf!)}>{names.get(screen.stateOf)}</button></dd></>}
            {screen.description && <><dt>説明</dt><dd>{screen.description}</dd></>}
            <dt>確認状態</dt><dd><span className={`ad-screen-map-verification ${screen.verification}`}>{screenMapVerificationLabels[screen.verification]}</span></dd>
          </dl>
          {states.length > 0 && <section><h3>この画面の状態</h3><ul>{states.map((state) => <li key={state.id}><button type="button" className="ad-sm-panel-link" onClick={() => onNavigate(state.id)}>{state.name || '名称未設定'}</button></li>)}</ul></section>}
          <section><h3>この画面への遷移</h3>{incoming.length ? <ul>{incoming.map((transition) => transitionLink(transition, 'in'))}</ul> : <p>ありません。</p>}</section>
          <section><h3>この画面からの遷移</h3>{outgoing.length ? <ul>{outgoing.map((transition) => transitionLink(transition, 'out'))}</ul> : <p>ありません。</p>}</section>
        </aside>
      </div>
    </section>
  </div>
}

export default ScreenMapImageLightbox
