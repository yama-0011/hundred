import {
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  signOut,
} from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import '../../../styles/Hundred/hundred-login-status.css'

type LoginStatus = {
  displayName: string
  providerLabel: string
}

function resolveDisplayName(
  cognitoUsername: string,
  name?: string,
  preferredUsername?: string,
  email?: string,
) {
  const normalizedName = name?.trim()
  if (normalizedName) return normalizedName

  const normalizedPreferredUsername = preferredUsername?.trim()
  if (normalizedPreferredUsername) return normalizedPreferredUsername

  const emailLocalPart = email?.split('@', 1)[0]?.trim()
  return emailLocalPart || cognitoUsername
}

/** Hundred共通ヘッダーで現在の表示名とサインイン導線を表示する。 */
function HundredLoginStatus() {
  const navigate = useNavigate()
  const [loginStatus, setLoginStatus] = useState<LoginStatus | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    const syncLoginStatus = async () => {
      try {
        const user = await getCurrentUser()
        let preferredUsername: string | undefined
        let name: string | undefined
        let email: string | undefined

        try {
          const authSession = await fetchAuthSession()
          const claims = authSession.tokens?.idToken?.payload
          preferredUsername =
            typeof claims?.preferred_username === 'string'
              ? claims.preferred_username
              : undefined
          name = typeof claims?.name === 'string' ? claims.name : undefined
          email = typeof claims?.email === 'string' ? claims.email : undefined
        } catch {
          // IDトークンを参照できない場合はCognito属性の取得を続ける。
        }

        try {
          const attributes = await fetchUserAttributes()
          preferredUsername =
            attributes.preferred_username ?? preferredUsername
          name = attributes.name ?? name
          email = attributes.email ?? email
        } catch {
          // 認証セッションが有効なら、属性を取得できなくても状態表示は維持する。
        }

        if (!isActive) return
        setLoginStatus({
          displayName: resolveDisplayName(
            user.username,
            name,
            preferredUsername,
            email,
          ),
          providerLabel: user.username.toLowerCase().startsWith('google_')
            ? 'Googleアカウント'
            : 'メールアドレス',
        })
      } catch {
        if (isActive) setLoginStatus(null)
      }
    }

    const cancelAuthListener = Hub.listen('auth', ({ payload }) => {
      if (
        payload.event === 'signedIn' ||
        payload.event === 'signInWithRedirect'
      ) {
        setIsCollapsed(false)
        void syncLoginStatus()
        return
      }

      if (payload.event === 'tokenRefresh') {
        void syncLoginStatus()
        return
      }

      if (payload.event === 'signedOut') {
        setLoginStatus(null)
        setIsCollapsed(false)
        setIsDialogOpen(false)
      }
    })

    void syncLoginStatus()
    const retryTimer = window.setTimeout(() => {
      void syncLoginStatus()
    }, 750)

    return () => {
      isActive = false
      window.clearTimeout(retryTimer)
      cancelAuthListener()
    }
  }, [])

  useEffect(() => {
    if (!isDialogOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSigningOut) setIsDialogOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDialogOpen, isSigningOut])

  if (!loginStatus) return null

  const handleGoToSignIn = async () => {
    setIsSigningOut(true)
    setDialogError(null)
    try {
      await signOut()
      setIsDialogOpen(false)
      navigate('/', { replace: true })
    } catch {
      setDialogError(
        'サインイン画面へ移動できませんでした。時間をおいて再度お試しください。',
      )
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <>
      <aside
        className="hundred-login-status"
        data-collapsed={isCollapsed}
        aria-label="Hundredログイン状態"
      >
        <button
          className="hundred-login-status__profile"
          type="button"
          aria-label={`${loginStatus.displayName}でログイン中。サインイン画面への移動を確認する`}
          title={
            isCollapsed ? `${loginStatus.displayName}でログイン中` : undefined
          }
          onClick={() => {
            setDialogError(null)
            setIsDialogOpen(true)
          }}
        >
          <span className="hundred-login-status__avatar" aria-hidden="true">
            {loginStatus.displayName.charAt(0).toUpperCase() || 'H'}
          </span>
          <span className="hundred-login-status__copy">
            <strong>{loginStatus.displayName}でログイン中</strong>
            <small>{loginStatus.providerLabel}・サインイン画面を開く</small>
          </span>
        </button>
        <button
          className="hundred-login-status__toggle"
          type="button"
          aria-expanded={!isCollapsed}
          aria-label={
            isCollapsed ? 'ログイン情報を展開する' : 'ログイン情報を折りたたむ'
          }
          title={isCollapsed ? '展開' : '折りたたむ'}
          onClick={() => setIsCollapsed((current) => !current)}
        >
          <span aria-hidden="true">{isCollapsed ? '‹' : '›'}</span>
        </button>
      </aside>

      {isDialogOpen &&
        createPortal(
          <div
            className="hundred-login-confirm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !isSigningOut) {
                setIsDialogOpen(false)
              }
            }}
          >
            <section
              className="hundred-login-confirm__panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="hundred-login-confirm-title"
            >
              <p>ACCOUNT</p>
              <h2 id="hundred-login-confirm-title">
                サインイン画面へ移動しますか？
              </h2>
              <p>
                現在は<strong>{loginStatus.displayName}</strong>
                でログインしています。
                移動すると現在のアカウントからサインアウトします。
              </p>
              {dialogError && (
                <p className="hundred-login-confirm__error" role="alert">
                  {dialogError}
                </p>
              )}
              <div className="hundred-login-confirm__actions">
                <button
                  type="button"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isSigningOut}
                  autoFocus
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  data-primary="true"
                  onClick={() => void handleGoToSignIn()}
                  disabled={isSigningOut}
                >
                  {isSigningOut ? '移動中…' : 'サインイン画面へ'}
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  )
}

export default HundredLoginStatus
