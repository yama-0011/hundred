import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteAnigramInstagramSyncHistory,
  getAnigramAdminAccess,
  getAnigramAdminSettings,
  getAnigramInstagramSyncRuns,
  runAnigramInstagramSync,
  type AnigramInstagramDeliverySettings,
  type AnigramInstagramSyncRun,
} from '../../services/Anigram/anigramApi'
import '../../styles/Anigram/anigram.css'

type PageState = 'loading' | 'ready' | 'forbidden' | 'error'

function formatDateTime(value: number | null) {
  if (value === null) return '記録なし'
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function statusLabel(status: AnigramInstagramSyncRun['status']) {
  if (status === 'success') return '成功'
  if (status === 'partial') return '部分成功'
  return '失敗'
}

function triggerLabel(trigger: AnigramInstagramSyncRun['triggerType']) {
  return trigger === 'cron' ? '自動実行' : '手動実行'
}

function failureLabel(code: string) {
  if (code === 'CONNECTION_REQUIRED') return 'Instagram未接続'
  if (code === 'TOKEN_EXPIRED') return 'トークン期限切れ'
  if (code === 'PROVIDER_FAILED') return 'Instagram APIエラー'
  return '同期処理エラー'
}

/** 登録済み管理者向けにInstagram同期の状態と実行履歴を表示する。 */
function AnigramInstagramSyncPage() {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [settings, setSettings] =
    useState<AnigramInstagramDeliverySettings | null>(null)
  const [runs, setRuns] = useState<AnigramInstagramSyncRun[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [deletingHistory, setDeletingHistory] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const lastSuccessfulRun = useMemo(
    () => runs.find((run) => run.status === 'success') ?? null,
    [runs],
  )

  const loadPage = async () => {
    setPageState('loading')
    setErrorMessage(null)
    try {
      const access = await getAnigramAdminAccess()
      if (!access.allowed) {
        setPageState('forbidden')
        return
      }
      const [adminSettings, syncRuns] = await Promise.all([
        getAnigramAdminSettings(),
        getAnigramInstagramSyncRuns(),
      ])
      setSettings(adminSettings.instagramDelivery)
      setRuns(syncRuns)
      setPageState('ready')
    } catch (error) {
      setPageState('error')
      const responseMessage = (
        error as Error & { responseMessage?: string }
      ).responseMessage
      setErrorMessage(responseMessage ?? '同期情報を取得できませんでした。')
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPage(), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  const handleSync = async () => {
    if (!settings?.reactionSyncEnabled || isSyncing) return
    setIsSyncing(true)
    setMessage(null)
    setErrorMessage(null)
    try {
      const run = await runAnigramInstagramSync()
      setRuns((current) => [run, ...current].slice(0, 20))
      const refreshed = await getAnigramAdminSettings()
      setSettings(refreshed.instagramDelivery)
      setMessage(
        `同期が完了しました（${statusLabel(run.status)}・反応増加 ${run.reactionIncrease}件・加算 ${run.appliedPoints}ポイント）。`,
      )
    } catch (error) {
      const responseMessage = (
        error as Error & { responseMessage?: string }
      ).responseMessage
      setErrorMessage(responseMessage ?? '手動同期を実行できませんでした。')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleDeleteHistory = async (id?: string) => {
    if (deletingHistory) return
    const target = id
      ? 'この同期履歴を削除します。削除後は復元できません。よろしいですか？'
      : '同期履歴をDBからすべて削除します。削除後は復元できません。よろしいですか？'
    if (!window.confirm(target)) return
    setDeletingHistory(id ?? 'all')
    setMessage(null)
    setErrorMessage(null)
    try {
      const result = await deleteAnigramInstagramSyncHistory(id)
      setRuns((current) => id ? current.filter((run) => run.id !== id) : [])
      setMessage(`同期履歴を${result.deletedCount}件削除しました。`)
    } catch (error) {
      const responseMessage = (
        error as Error & { responseMessage?: string }
      ).responseMessage
      setErrorMessage(responseMessage ?? '同期履歴を削除できませんでした。')
    } finally {
      setDeletingHistory(null)
    }
  }

  const latestRun = runs[0] ?? null

  return (
    <main className="anigram-page anigram-subpage">
      <header className="anigram-header">
        <Link to="/anigram/admin">← 管理画面へ戻る</Link>
        <span>Instagram同期管理</span>
      </header>

      <section className="anigram-subpage__heading">
        <p className="anigram-eyebrow">SYNC MANAGEMENT</p>
        <h1>Instagram同期管理</h1>
        <p>自動同期の稼働状況、取得結果、失敗理由を確認できます。</p>
      </section>

      {pageState === 'loading' ? (
        <p className="anigram-panel">同期情報を読み込んでいます…</p>
      ) : null}
      {pageState === 'forbidden' ? (
        <p className="anigram-admin-readonly">
          この画面は登録済みAnigram管理者だけが利用できます。
        </p>
      ) : null}
      {errorMessage ? (
        <p className="anigram-status__error" role="alert">{errorMessage}</p>
      ) : null}
      {message ? (
        <p className="anigram-admin-message" role="status">{message}</p>
      ) : null}

      {pageState === 'ready' && settings ? (
        <>
          <section className="anigram-summary-grid anigram-sync-summary-grid">
            <article className="anigram-summary-card">
              <span>現在の状態</span>
              <strong>{settings.reactionSyncEnabled ? '稼働中' : '停止中'}</strong>
              <small>{settings.syncPauseReason ?? '停止理由なし'}</small>
            </article>
            <article className="anigram-summary-card">
              <span>最終実行</span>
              <strong>{latestRun ? statusLabel(latestRun.status) : '未実行'}</strong>
              <small>{formatDateTime(latestRun?.completedAt ?? null)}</small>
            </article>
            <article className="anigram-summary-card">
              <span>最終成功</span>
              <strong>{lastSuccessfulRun ? '成功' : '記録なし'}</strong>
              <small>{formatDateTime(lastSuccessfulRun?.completedAt ?? null)}</small>
            </article>
            <article className="anigram-summary-card">
              <span>連続失敗</span>
              <strong>
                {runs.findIndex((run) => run.status === 'success') === -1
                  ? runs.length
                  : runs.findIndex((run) => run.status === 'success')}
                回
              </strong>
              <small>部分成功を含む</small>
            </article>
          </section>

          <section className="anigram-panel anigram-sync-manual-panel">
            <div>
              <p className="anigram-eyebrow">MANUAL SYNC</p>
              <h2>今すぐ同期</h2>
              <p>接続中のInstagramアカウントを対象に、Cronと同じ同期処理を実行します。</p>
            </div>
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={!settings.reactionSyncEnabled || isSyncing}
            >
              {isSyncing ? '同期しています…' : '今すぐ同期'}
            </button>
          </section>

          <section className="anigram-panel">
            <div className="anigram-panel__heading">
              <div>
                <p className="anigram-eyebrow">SYNC HISTORY</p>
                <h2>同期履歴</h2>
              </div>
              <div className="anigram-history-heading-actions">
                <span>直近{runs.length}件</span>
                {runs.length > 0 ? (
                  <button
                    type="button"
                    className="anigram-history-delete-all"
                    disabled={deletingHistory !== null}
                    onClick={() => void handleDeleteHistory()}
                  >
                    {deletingHistory === 'all' ? '削除中…' : 'すべて削除'}
                  </button>
                ) : null}
              </div>
            </div>

            {runs.length === 0 ? (
              <p className="anigram-instagram-note">
                新しい履歴は次回Cronまたは手動同期から記録されます。
              </p>
            ) : (
              <div className="anigram-sync-run-list">
                {runs.map((run) => (
                  <article key={run.id} className="anigram-sync-run">
                    <header>
                      <div>
                        <span className="anigram-sync-run__status" data-status={run.status}>
                          {statusLabel(run.status)}
                        </span>
                        <strong>{triggerLabel(run.triggerType)}</strong>
                      </div>
                      <time>{formatDateTime(run.completedAt)}</time>
                      <button
                        type="button"
                        className="anigram-history-delete"
                        disabled={deletingHistory !== null}
                        aria-label={`${formatDateTime(run.completedAt)}の同期履歴を削除`}
                        onClick={() => void handleDeleteHistory(run.id)}
                      >
                        {deletingHistory === run.id ? '削除中…' : '削除'}
                      </button>
                    </header>
                    <dl>
                      <div><dt>接続</dt><dd>{run.succeededConnections}/{run.processedConnections}成功</dd></div>
                      <div><dt>Story</dt><dd>{run.storiesChecked}件</dd></div>
                      <div><dt>反応増加</dt><dd>{run.reactionIncrease}件</dd></div>
                      <div><dt>実加算</dt><dd>{run.appliedPoints}ポイント</dd></div>
                    </dl>
                    {run.failures.length > 0 ? (
                      <ul className="anigram-sync-failures">
                        {run.failures.map((failure, index) => (
                          <li key={`${run.id}-${index}`}>
                            <strong>
                              {failure.accountUsername
                                ? `@${failure.accountUsername}`
                                : 'アカウント不明'}
                            </strong>
                            <span>
                              {failureLabel(failure.code)}
                              {failure.stage ? `・${failure.stage}` : ''}
                              {failure.providerCode
                                ? `・コード ${failure.providerCode}`
                                : ''}
                            </span>
                            {failure.message ? <small>{failure.message}</small> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}

export default AnigramInstagramSyncPage
