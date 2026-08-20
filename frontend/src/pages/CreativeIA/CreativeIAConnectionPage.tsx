import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  getCreativeIAWordPressAuthorizationUrl,
  getCreativeIAWordPressStatus,
  type CreativeIAWordPressStatus,
} from '../../services/CreativeIA/creativeIaWordPressApi'
import '../../styles/CreativeIA/creative-ia-connection.css'

type PageState = 'loading' | 'ready' | 'error'

function getOAuthResultMessage(result: string | null) {
  if (result === 'connected') return 'WordPress.comと接続しました。'
  if (result === 'denied') return 'WordPress.comとの接続をキャンセルしました。'
  if (result === 'failed') {
    return 'WordPress.comと接続できませんでした。もう一度お試しください。'
  }

  return null
}

/** Creative IAのWordPress.com接続状態と接続操作を表示する。 */
function CreativeIAConnectionPage() {
  const [searchParams] = useSearchParams()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [connection, setConnection] =
    useState<CreativeIAWordPressStatus | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const oauthResultMessage = getOAuthResultMessage(
    searchParams.get('wordpress'),
  )

  /** Workerから現在のWordPress.com接続状態を読み込む。 */
  const loadConnection = useCallback(async () => {
    try {
      const status = await getCreativeIAWordPressStatus()
      setConnection(status)
      setPageState('ready')
    } catch (error) {
      setConnection(null)
      setPageState('error')
      setErrorMessage(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Creative IAを利用するには、Hundredへサインインしてください。'
          : '接続状態を取得できませんでした。時間をおいてお試しください。',
      )
    }
  }, [])

  useEffect(() => {
    let isActive = true

    void getCreativeIAWordPressStatus()
      .then((status) => {
        if (!isActive) return
        setConnection(status)
        setPageState('ready')
      })
      .catch((error: unknown) => {
        if (!isActive) return
        setConnection(null)
        setPageState('error')
        setErrorMessage(
          error instanceof Error && error.message === 'AUTH_REQUIRED'
            ? 'Creative IAを利用するには、Hundredへサインインしてください。'
            : '接続状態を取得できませんでした。時間をおいてお試しください。',
        )
      })

    return () => {
      isActive = false
    }
  }, [])

  /** WorkerでOAuth stateを発行し、WordPress.comの認可画面へ移動する。 */
  const handleConnect = async () => {
    setIsConnecting(true)
    setErrorMessage(null)

    try {
      const authorizationUrl =
        await getCreativeIAWordPressAuthorizationUrl()
      window.location.assign(authorizationUrl)
    } catch (error) {
      setIsConnecting(false)
      setErrorMessage(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してからお試しください。'
          : 'WordPress.comとの接続を開始できませんでした。',
      )
    }
  }

  /** エラー表示を戻してWordPress.com接続状態を再取得する。 */
  const handleRetry = () => {
    setPageState('loading')
    setErrorMessage(null)
    void loadConnection()
  }

  const selectedSiteLabel =
    connection?.selectedSite?.name ||
    connection?.selectedSite?.url ||
    connection?.selectedSite?.id ||
    'WordPress.comサイト'

  return (
    <main className="creative-ia-connection">
      <div className="creative-ia-connection__glow" aria-hidden="true" />

      <header className="creative-ia-connection__header">
        <Link to="/" aria-label="Hundredのホームに戻る">
          ← ホーム
        </Link>
        <span>Creative IA</span>
      </header>

      <section
        className="creative-ia-connection__panel"
        aria-labelledby="creative-ia-connection-title"
      >
        <p className="creative-ia-connection__eyebrow">設定</p>
        <h1 id="creative-ia-connection-title">WordPress.com連携</h1>
        <p className="creative-ia-connection__lead">
          記事を下書きとして保存するWordPress.comサイトを接続します。
        </p>

        {oauthResultMessage && (
          <p className="creative-ia-connection__notice" role="status">
            {oauthResultMessage}
          </p>
        )}

        <div className="creative-ia-connection__status" aria-live="polite">
          <span
            className="creative-ia-connection__status-mark"
            data-connected={connection?.connected === true}
            aria-hidden="true"
          />
          <span>
            <small>接続状態</small>
            <strong>
              {pageState === 'loading'
                ? '確認中'
                : connection?.connected
                  ? '接続済み'
                  : '未接続'}
            </strong>
          </span>
        </div>

        {connection?.connected && (
          <dl className="creative-ia-connection__site">
            <div>
              <dt>投稿先</dt>
              <dd>{selectedSiteLabel}</dd>
            </div>
            {connection.selectedSite?.id && (
              <div>
                <dt>サイトID</dt>
                <dd>{connection.selectedSite.id}</dd>
              </div>
            )}
          </dl>
        )}

        {errorMessage && (
          <p className="creative-ia-connection__error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="creative-ia-connection__actions">
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={pageState === 'loading' || isConnecting}
          >
            {isConnecting
              ? 'WordPress.comへ移動中'
              : connection?.connected
                ? 'WordPress.comへ再接続'
                : 'WordPress.comと接続'}
          </button>
          {pageState === 'error' && (
            <button
              className="creative-ia-connection__secondary"
              type="button"
              onClick={handleRetry}
            >
              もう一度確認
            </button>
          )}
        </div>

        <p className="creative-ia-connection__footnote">
          Creative IAから保存する記事は、必ず下書きになります。
        </p>
      </section>
    </main>
  )
}

export default CreativeIAConnectionPage
