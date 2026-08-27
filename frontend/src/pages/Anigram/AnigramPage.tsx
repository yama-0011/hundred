import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AnigramUnityView, {
  type AnigramDisplayState,
} from '../../components/Anigram/AnigramUnityView'
import '../../styles/Anigram/anigram.css'

/** AnigramのUnity・React間連携を確認するための技術検証ページ。 */
function AnigramPage() {
  const [fullnessPercent, setFullnessPercent] = useState(50)
  const [status, setStatus] = useState<'alive' | 'dead'>('alive')
  const [motion, setMotion] = useState<'idle' | 'feed'>('idle')

  const displayState = useMemo<AnigramDisplayState>(
    () => ({
      fullnessPercent,
      status,
      motion,
      evolutionStage: fullnessPercent >= 100 ? 2 : 1,
    }),
    [fullnessPercent, motion, status],
  )

  const feed = () => {
    setStatus('alive')
    setFullnessPercent((current) => Math.min(current + 10, 100))
    setMotion('feed')
    window.setTimeout(() => setMotion('idle'), 900)
  }

  return (
    <main className="anigram-page">
      <header className="anigram-header">
        <Link to="/">← Hundredへ戻る</Link>
        <span>技術検証</span>
      </header>

      <section className="anigram-hero">
        <div className="anigram-hero__copy">
          <p className="anigram-eyebrow">USER APP</p>
          <h1>Anigram</h1>
          <p>みんなの反応で、ハリネズミを育てる。</p>
        </div>

        <AnigramUnityView displayState={displayState} />

        <aside className="anigram-status">
          <div className="anigram-status__heading">
            <div>
              <p>ハリネズミ</p>
              <h2>{status === 'dead' ? '眠っています' : '元気です'}</h2>
            </div>
            <strong>{fullnessPercent}%</strong>
          </div>

          <label htmlFor="anigram-fullness">満腹度</label>
          <input
            id="anigram-fullness"
            type="range"
            min="0"
            max="100"
            value={fullnessPercent}
            onChange={(event) => {
              setFullnessPercent(Number(event.target.value))
              setMotion('idle')
            }}
          />

          <div className="anigram-status__actions">
            <button type="button" onClick={feed}>
              ごはんをあげる
            </button>
            <button
              type="button"
              className="anigram-button--secondary"
              onClick={() => setStatus(status === 'alive' ? 'dead' : 'alive')}
            >
              {status === 'alive' ? '死亡表示を確認' : '元気に戻す'}
            </button>
          </div>

          <p className="anigram-status__note">
            現在は表示連携の仮状態です。ゲーム状態は今後Worker / D1から取得します。
          </p>
        </aside>
      </section>
    </main>
  )
}

export default AnigramPage
