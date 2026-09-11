import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getAnigramHistory,
  type AnigramHistory,
} from '../../services/Anigram/anigramApi'
import '../../styles/Anigram/anigram.css'

function formatDateTime(value: number | null) {
  if (value === null) return '記録なし'
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function sourceLabel(source: string) {
  if (source === 'instagram_story') return 'Instagram Story'
  if (source === 'hundred_validation') return '管理者テスト'
  return source
}

function targetLabel(target: string) {
  if (target === 'hatch') return '孵化ポイント'
  if (target === 'fullness') return '満腹ポイント'
  return '反映なし'
}

function stateEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    life_stage_changed: '生育状態が変化',
    evolution_stage_changed: '進化',
    status_changed: '生死状態が変化',
    validation_reset: '育成状態を初期化',
    starvation_validation_prepared: '死亡検証を開始',
    starvation_validation_advanced: '死亡検証を進行',
    evolution_validation_prepared: '進化検証を開始',
    evolution_validation_advanced: '進化検証を進行',
  }
  return labels[eventType] ?? eventType
}

/** 餌の獲得と孵化・進化・死亡の推移を確認する画面。 */
function AnigramHistoryPage() {
  const [history, setHistory] = useState<AnigramHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestEvolutionAt =
    history?.stateEvents.find(
      (event) => event.eventType === 'evolution_stage_changed',
    )?.occurredAt ?? null

  useEffect(() => {
    let cancelled = false
    void getAnigramHistory()
      .then((nextHistory) => {
        if (cancelled) return
        setHistory(nextHistory)
        setError(null)
      })
      .catch((requestError: unknown) => {
        if (cancelled) return
        setError(
          requestError instanceof Error && requestError.message === 'AUTH_REQUIRED'
            ? '履歴を見るにはHundredへのサインインが必要です。'
            : 'Anigramの履歴を取得できませんでした。',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="anigram-page anigram-subpage">
      <header className="anigram-header">
        <Link to="/anigram">← Anigramへ戻る</Link>
        <span>育成履歴</span>
      </header>

      <section className="anigram-subpage__heading">
        <p className="anigram-eyebrow">HISTORY</p>
        <h1>育成の記録</h1>
        <p>反応から得たポイントと、ペットの成長を時系列で確認できます。</p>
      </section>

      {loading ? <p className="anigram-panel">履歴を読み込んでいます…</p> : null}
      {error ? <p className="anigram-status__error">{error}</p> : null}

      {history ? (
        <>
          <section className="anigram-summary-grid" aria-label="今日の概要">
            <article className="anigram-summary-card">
              <span>今日のいいね・反応</span>
              <strong>{history.today.instagramReactions}</strong>
              <small>Instagramの総反応増加数</small>
            </article>
            <article className="anigram-summary-card">
              <span>今日の実加算</span>
              <strong>{history.today.appliedPoints}</strong>
              <small>上限到達分を除いたポイント</small>
            </article>
            <article className="anigram-summary-card">
              <span>今日のイベント</span>
              <strong>{history.today.eventCount}</strong>
              <small>すべての獲得元を含む</small>
            </article>
            <article className="anigram-summary-card">
              <span>現在の満腹度</span>
              <strong>
                {history.pet.fullnessPercent === null
                  ? '—'
                  : `${history.pet.fullnessPercent}%`}
              </strong>
              <small>{history.pet.displayName}の現在値</small>
            </article>
          </section>

          <section className="anigram-panel">
            <div className="anigram-panel__heading">
              <div>
                <p className="anigram-eyebrow">MILESTONES</p>
                <h2>成長の節目</h2>
              </div>
            </div>
            <dl className="anigram-milestones">
              <div>
                <dt>孵化した日時</dt>
                <dd>{formatDateTime(history.pet.hatchedAt)}</dd>
              </div>
              <div>
                <dt>進化した日時</dt>
                <dd>{formatDateTime(latestEvolutionAt)}</dd>
              </div>
              <div>
                <dt>現在の進化段階</dt>
                <dd>{history.pet.evolutionStage}</dd>
              </div>
              <div>
                <dt>最終給餌</dt>
                <dd>{formatDateTime(history.pet.lastFedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="anigram-panel">
            <div className="anigram-panel__heading">
              <div>
                <p className="anigram-eyebrow">FOOD</p>
                <h2>餌・成長ポイント</h2>
              </div>
              <span>{history.growthEvents.length}件</span>
            </div>
            <div className="anigram-table-wrap">
              <table className="anigram-table">
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>獲得元</th>
                    <th>反映先</th>
                    <th>獲得</th>
                    <th>実加算</th>
                  </tr>
                </thead>
                <tbody>
                  {history.growthEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDateTime(event.occurredAt)}</td>
                      <td>{sourceLabel(event.source)}</td>
                      <td>{targetLabel(event.appliedTarget)}</td>
                      <td>+{event.requestedPoints}</td>
                      <td>+{event.appliedPoints}</td>
                    </tr>
                  ))}
                  {history.growthEvents.length === 0 ? (
                    <tr>
                      <td colSpan={5}>まだ成長イベントはありません。</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="anigram-panel">
            <div className="anigram-panel__heading">
              <div>
                <p className="anigram-eyebrow">LIFE CYCLE</p>
                <h2>状態の変化</h2>
              </div>
              <span>{history.stateEvents.length}件</span>
            </div>
            <ol className="anigram-timeline">
              {history.stateEvents.map((event) => (
                <li key={event.id}>
                  <time>{formatDateTime(event.occurredAt)}</time>
                  <strong>{stateEventLabel(event.eventType)}</strong>
                  <span>
                    {event.previousValue ?? '—'} → {event.nextValue ?? '—'}
                  </span>
                </li>
              ))}
              {history.stateEvents.length === 0 ? (
                <li>まだ状態変更の記録はありません。</li>
              ) : null}
            </ol>
          </section>
        </>
      ) : null}
    </main>
  )
}

export default AnigramHistoryPage
