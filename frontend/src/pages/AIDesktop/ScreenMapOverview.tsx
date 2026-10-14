import { lazy, Suspense, useState } from 'react'
import ScreenMapImageLightbox from './ScreenMapImageLightbox'
import ScreenMapViewSettings from './ScreenMapViewSettings'
import { readScreenMapLabelMode, saveScreenMapLabelMode, SCREEN_MAP_NODE_SCALE, screenMapVerificationLabels, type ScreenMapData, type ScreenMapSelection } from './screenMap'

const ScreenMapCanvas = lazy(() => import('./ScreenMapCanvas'))

/**
 * 概要: 閲覧画面の「画面遷移の全体図」。編集画面で整えた配置のキャンバスで、Screen Map全体を見る。
 * 画面を押すと、大きな画像と詳細を1つの表示で開く。遷移を押すと、右に遷移の詳細を表示する。
 * 表が必要なときは、同じカテゴリに資料のページとして作る（Screen Mapの中には表の表示を持たない）。
 */

function ScreenMapOverview({ data, title, minimapTarget }: { data: ScreenMapData; title: string; minimapTarget?: HTMLElement | null }) {
  const [selection, setSelection] = useState<ScreenMapSelection | null>(null)
  const [labelMode, setLabelMode] = useState(readScreenMapLabelMode)
  const [viewerScreenId, setViewerScreenId] = useState<string | null>(null)
  const names = new Map(data.screens.map((screen) => [screen.id, screen.name || '名称未設定']))
  const transition = selection?.kind === 'transition' ? data.transitions.find((candidate) => candidate.id === selection.id) ?? null : null
  // 画面を選んだら、その画面の遷移を強調したまま、大きな画像と詳細を開く。
  const select = (next: ScreenMapSelection | null) => { setSelection(next); if (next?.kind === 'screen') setViewerScreenId(next.id) }
  const showScreen = (screenId: string) => { setSelection({ kind: 'screen', id: screenId }); setViewerScreenId(screenId) }

  return <div className="ad-sm-overview">
    <div className="ad-sm-overview-head">
      <h1>{title}</h1>
      <ScreenMapViewSettings labelMode={labelMode} onLabelMode={(value) => { setLabelMode(value); saveScreenMapLabelMode(value) }} />
    </div>
    {data.screens.length === 0 ? <p className="ad-screen-map-empty">まだ画面がありません。</p> : <div className="ad-sm-overview-body">
      <div className="ad-sm-overview-canvas">
        <Suspense fallback={<p className="ad-sm-loading">全体図を読み込んでいます…</p>}>
          <ScreenMapCanvas data={data} mode="layout" selection={selection} labelMode={labelMode} scale={SCREEN_MAP_NODE_SCALE} onSelect={select} onOpenImage={showScreen} minimapTarget={minimapTarget} />
        </Suspense>
      </div>
      {transition && <aside className="ad-sm-panel ad-sm-overview-panel" aria-label="遷移の詳細">
        <button type="button" className="ad-sm-panel-close" aria-label="閉じる" onClick={() => setSelection(null)}>×</button>
        <p className="ad-sm-panel-eyebrow">画面遷移</p>
        <h2>{names.get(transition.from)} → {names.get(transition.to)}</h2>
        <dl className="ad-sm-panel-list">
          <dt>操作</dt><dd>{transition.action || '操作名なし'}</dd>
          {transition.condition && <><dt>条件</dt><dd>{transition.condition}</dd></>}
          <dt>確認状態</dt><dd><span className={`ad-screen-map-verification ${transition.verification}`}>{screenMapVerificationLabels[transition.verification]}</span></dd>
        </dl>
        <section className="ad-sm-panel-section">
          <button type="button" className="ad-sm-panel-link" onClick={() => showScreen(transition.from)}>遷移元：{names.get(transition.from)}<span>画像と詳細を見る</span></button>
          <button type="button" className="ad-sm-panel-link" onClick={() => showScreen(transition.to)}>遷移先：{names.get(transition.to)}<span>画像と詳細を見る</span></button>
        </section>
      </aside>}
    </div>}
    {viewerScreenId && <ScreenMapImageLightbox data={data} screenId={viewerScreenId} onNavigate={showScreen} onClose={() => setViewerScreenId(null)} />}
  </div>
}

export default ScreenMapOverview
