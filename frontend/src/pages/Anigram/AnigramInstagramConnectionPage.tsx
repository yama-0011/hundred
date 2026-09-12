import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAnigramAdminAccess } from '../../services/Anigram/anigramApi'
import {
  disconnectInstagram,
  getInstagramAuthorizationUrl,
  getInstagramConnectionStatus,
  type InstagramConnectionStatus,
} from '../../services/Instagram/instagramConnectionApi'
import '../../styles/Anigram/anigram.css'

type PageState = 'loading' | 'ready' | 'forbidden' | 'error'

function getOAuthMessage(result: string | null) {
  if (result === 'connected') return 'Instagramと接続しました。'
  if (result === 'denied') return 'Instagramとの接続をキャンセルしました。'
  if (result === 'failed') return 'Instagramと接続できませんでした。もう一度お試しください。'
  return null
}

function formatDate(unixTime: number | null) {
  if (!unixTime) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(unixTime * 1000))
}

/** 登録済みAnigram管理者だけが共通Instagram接続を管理する画面。 */
function AnigramInstagramConnectionPage() {
  const [searchParams] = useSearchParams()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [connection, setConnection] = useState<InstagramConnectionStatus | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const oauthMessage = getOAuthMessage(searchParams.get('instagram'))

  const loadConnection = async () => {
    setPageState('loading')
    setErrorMessage(null)
    try {
      const access = await getAnigramAdminAccess()
      if (!access.allowed) {
        setConnection(null)
        setPageState('forbidden')
        return
      }
      setConnection(await getInstagramConnectionStatus('anigramAdmin'))
      setPageState('ready')
    } catch (error) {
      setConnection(null)
      setPageState('error')
      setErrorMessage(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインしてください。'
          : '接続状態を取得できませんでした。時間をおいてお試しください。',
      )
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadConnection(), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  const handleConnect = async () => {
    setIsConnecting(true)
    setErrorMessage(null)
    try {
      window.location.assign(
        await getInstagramAuthorizationUrl(
          '/anigram/settings/instagram',
          'anigramAdmin',
        ),
      )
    } catch {
      setIsConnecting(false)
      setErrorMessage('Instagramとの接続を開始できませんでした。')
    }
  }

  const handleDisconnect = async () => {
    if (
      !window.confirm(
        'Instagram接続を解除しますか？同じHundredユーザーのCreative IAでも利用できなくなります。',
      )
    ) return

    setIsDisconnecting(true)
    setErrorMessage(null)
    try {
      await disconnectInstagram('anigramAdmin')
      setConnection({
        connected: false,
        tokenExpired: false,
        account: null,
        connectedAt: null,
        tokenExpiresAt: null,
        grantedScopes: [],
      })
    } catch {
      setErrorMessage('Instagramとの接続を解除できませんでした。')
    } finally {
      setIsDisconnecting(false)
    }
  }

  return (
    <main className="anigram-page anigram-subpage">
      <section className="anigram-subpage__heading anigram-connection-heading">
        <p className="anigram-eyebrow">INSTAGRAM CONNECTION</p>
        <h1>Instagram接続</h1>
        <p>Anigramが反応を取得するInstagramアカウントを管理します。</p>
      </section>

      <section className="anigram-panel anigram-connection-panel">
        {oauthMessage ? (
          <p className="anigram-admin-message" role="status">{oauthMessage}</p>
        ) : null}

        {pageState === 'forbidden' ? (
          <p className="anigram-admin-readonly">
            この画面は登録済みAnigram管理者だけが利用できます。
          </p>
        ) : (
          <>
            <div className="anigram-connection-summary">
              <span
                className="anigram-connection-mark"
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
                      : connection?.tokenExpired
                        ? '再接続が必要'
                        : '未接続'}
                </strong>
              </span>
            </div>

            {connection?.account ? (
              <dl className="anigram-connection-details">
                <div><dt>Instagramアカウント</dt><dd>@{connection.account.username}</dd></div>
                <div><dt>アカウントID</dt><dd>{connection.account.id}</dd></div>
                <div><dt>接続日時</dt><dd>{formatDate(connection.connectedAt)}</dd></div>
                <div><dt>トークン有効期限</dt><dd>{formatDate(connection.tokenExpiresAt)}</dd></div>
              </dl>
            ) : null}

            {errorMessage ? (
              <p className="anigram-status__error" role="alert">{errorMessage}</p>
            ) : null}

            <div className="anigram-connection-actions">
              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={pageState !== 'ready' || isConnecting}
              >
                {isConnecting
                  ? 'Instagramへ移動中…'
                  : connection?.connected
                    ? 'Instagramへ再接続'
                    : 'Instagramと接続'}
              </button>
              {connection?.account ? (
                <button
                  className="anigram-button--danger"
                  type="button"
                  onClick={() => void handleDisconnect()}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? '接続を解除中…' : 'Instagram接続を解除'}
                </button>
              ) : null}
              {pageState === 'error' ? (
                <button
                  className="anigram-button--secondary"
                  type="button"
                  onClick={() => void loadConnection()}
                >
                  もう一度確認
                </button>
              ) : null}
            </div>
          </>
        )}

        <aside className="anigram-connection-note">
          <strong>Creative IAとの共通接続</strong>
          <p>
            Instagram接続はHundredユーザー単位で共通です。この画面で接続先を変更・解除すると、同じユーザーのCreative IAにも反映されます。アクセストークンはWorkerで暗号化し、ブラウザには返しません。
          </p>
        </aside>
      </section>
    </main>
  )
}

export default AnigramInstagramConnectionPage
