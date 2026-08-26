import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  disconnectCreativeIAInstagram,
  getCreativeIAInstagramAuthorizationUrl,
  getCreativeIAInstagramStoryInsights,
  getCreativeIAInstagramStatus,
  type CreativeIAInstagramStoryInsight,
  type CreativeIAInstagramStatus,
} from '../../services/CreativeIA/creativeIaInstagramApi'
import '../../styles/CreativeIA/creative-ia-connection.css'

type PageState = 'loading' | 'ready' | 'error'

function getOAuthMessage(result: string | null) {
  if (result === 'connected') return 'Instagramと接続しました。'
  if (result === 'denied') return 'Instagramとの接続をキャンセルしました。'
  if (result === 'failed') {
    return 'Instagramと接続できませんでした。もう一度お試しください。'
  }
  return null
}

function formatDate(unixTime: number | null) {
  if (!unixTime) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
  }).format(new Date(unixTime * 1000))
}

/** Instagram Business Loginの接続状態と接続解除を管理する。 */
function CreativeIAInstagramConnectionPage() {
  const [searchParams] = useSearchParams()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [connection, setConnection] =
    useState<CreativeIAInstagramStatus | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [storyInsights, setStoryInsights] =
    useState<CreativeIAInstagramStoryInsight[] | null>(null)
  const [isStoryInsightsLoading, setIsStoryInsightsLoading] = useState(false)
  const oauthMessage = getOAuthMessage(searchParams.get('instagram'))

  const loadConnection = async () => {
    try {
      const status = await getCreativeIAInstagramStatus()
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
  }

  useEffect(() => {
    let active = true

    void getCreativeIAInstagramStatus()
      .then((status) => {
        if (!active) return
        setConnection(status)
        setPageState('ready')
      })
      .catch((error: unknown) => {
        if (!active) return
        setConnection(null)
        setPageState('error')
        setErrorMessage(
          error instanceof Error && error.message === 'AUTH_REQUIRED'
            ? 'Creative IAを利用するには、Hundredへサインインしてください。'
            : '接続状態を取得できませんでした。時間をおいてお試しください。',
        )
      })

    return () => {
      active = false
    }
  }, [])

  const handleConnect = async () => {
    setIsConnecting(true)
    setErrorMessage(null)
    try {
      window.location.assign(await getCreativeIAInstagramAuthorizationUrl())
    } catch (error) {
      setIsConnecting(false)
      setErrorMessage(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してからお試しください。'
          : 'Instagramとの接続を開始できませんでした。',
      )
    }
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    setErrorMessage(null)
    try {
      await disconnectCreativeIAInstagram()
      setConnection({
        connected: false,
        tokenExpired: false,
        account: null,
        connectedAt: null,
        tokenExpiresAt: null,
        grantedScopes: [],
      })
      setPageState('ready')
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してからお試しください。'
          : 'Instagramとの接続を解除できませんでした。',
      )
    } finally {
      setIsDisconnecting(false)
    }
  }

  const handleStoryInsights = async () => {
    setIsStoryInsightsLoading(true)
    setErrorMessage(null)
    try {
      const result = await getCreativeIAInstagramStoryInsights()
      setStoryInsights(result.stories)
    } catch (error) {
      setStoryInsights(null)
      const providerError = error as Error & {
        providerCode?: string
        providerStage?: string
        providerMessage?: string
      }
      const diagnostic = [
        providerError.providerStage,
        providerError.providerCode,
        providerError.providerMessage,
      ]
        .filter(Boolean)
        .join(' / ')
      setErrorMessage(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Instagramへ再接続してからお試しください。'
          : `Storyの反応を取得できませんでした。${diagnostic ? `（${diagnostic}）` : '権限と投稿状態を確認してください。'}`,
      )
    } finally {
      setIsStoryInsightsLoading(false)
    }
  }

  return (
    <main className="creative-ia-connection">
      <div className="creative-ia-connection__glow" aria-hidden="true" />
      <header className="creative-ia-connection__header">
        <Link to="/creative-ia">← Creative IAへ戻る</Link>
        <span>Creative IA</span>
      </header>

      <section className="creative-ia-connection__panel">
        <p className="creative-ia-connection__eyebrow">外部サービス接続</p>
        <h1>Instagram連携</h1>
        <p className="creative-ia-connection__lead">
          作成した画像とキャプションを、確認後にInstagramへ投稿するアカウントを接続します。
        </p>

        {oauthMessage && (
          <p className="creative-ia-connection__notice" role="status">
            {oauthMessage}
          </p>
        )}

        <div className="creative-ia-connection__status">
          <span
            className="creative-ia-connection__status-mark"
            data-connected={connection?.connected === true}
          />
          <span>
            <small>接続状態</small>
            <strong>
              {pageState === 'loading'
                ? '確認中'
                : connection?.connected
                  ? '接続済み'
                  : connection?.tokenExpired
                    ? '再接続が必要'
                    : '未接続'}
            </strong>
          </span>
        </div>

        {connection?.account && (
          <dl className="creative-ia-connection__site">
            <div>
              <dt>Instagramアカウント</dt>
              <dd>@{connection.account.username}</dd>
            </div>
            <div>
              <dt>アカウントID</dt>
              <dd>{connection.account.id}</dd>
            </div>
            <div>
              <dt>トークン有効期限</dt>
              <dd>{formatDate(connection.tokenExpiresAt)}</dd>
            </div>
          </dl>
        )}

        {connection?.connected && (
          <section className="creative-ia-connection__insights">
            <div className="creative-ia-connection__draft-heading">
              <div>
                <p className="creative-ia-connection__eyebrow">技術検証</p>
                <h2>Story反応</h2>
              </div>
              <button
                type="button"
                onClick={() => void handleStoryInsights()}
                disabled={isStoryInsightsLoading}
              >
                {isStoryInsightsLoading ? '確認中' : '反応を確認'}
              </button>
            </div>
            {storyInsights !== null &&
              (storyInsights.length === 0 ? (
                <p className="creative-ia-connection__privacy-note">
                  公開中のStoryが見つかりませんでした。
                </p>
              ) : (
                <dl className="creative-ia-connection__site">
                  {storyInsights.map((story) => (
                    <div key={story.id}>
                      <dt>
                        {story.timestamp
                          ? new Intl.DateTimeFormat('ja-JP', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(story.timestamp))
                          : 'Story'}
                      </dt>
                      <dd>総反応 {story.interactions ?? '取得なし'}件</dd>
                    </div>
                  ))}
                </dl>
              ))}
          </section>
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
              ? 'Instagramへ移動中'
              : connection?.connected
                ? 'Instagramへ再接続'
                : 'Instagramと接続'}
          </button>
          {connection?.account && (
            <button
              className="creative-ia-connection__danger"
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? '接続を解除中' : 'Instagram接続を解除'}
            </button>
          )}
          {pageState === 'error' && (
            <button
              className="creative-ia-connection__secondary"
              type="button"
              onClick={() => void loadConnection()}
            >
              もう一度確認
            </button>
          )}
        </div>

        <p className="creative-ia-connection__footnote">
          Creative IAから確認なしに自動公開することはありません。
        </p>
        <p className="creative-ia-connection__footnote">
          接続情報はWorkerで暗号化し、ブラウザへアクセストークンを返しません。
        </p>
      </section>
    </main>
  )
}

export default CreativeIAInstagramConnectionPage
