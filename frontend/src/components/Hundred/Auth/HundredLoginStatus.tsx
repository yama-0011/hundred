import { fetchUserAttributes, getCurrentUser, signOut } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import '../../../styles/Hundred/hundred-login-status.css'

type LoginStatus = {
  username: string
  providerLabel: string
}

function resolveUsername(
  cognitoUsername: string,
  preferredUsername?: string,
  name?: string,
  email?: string,
) {
  const normalizedPreferredUsername = preferredUsername?.trim()
  if (normalizedPreferredUsername) return normalizedPreferredUsername

  const normalizedName = name?.trim()
  if (normalizedName) return normalizedName

  const emailLocalPart = email?.split('@', 1)[0]?.trim()
  return emailLocalPart || cognitoUsername
}

/** Hundred共通ヘッダーで現在のユーザー名とサインイン導線を表示する。 */
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
          const attributes = await fetchUserAttributes()
          preferredUsername = attributes.preferred_username
          name = attributes.name
          email = attributes.email
        } catch {
          // 認証セッションが有効なら、属性を取得できなくても状態表示は維持する。
        }

        if (!isActive) return
        setLoginStatus({
          username: resolveUsername(
            user.username,
            preferredUsername,
            name,
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

    return () => {
      isActive = false
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
          aria-label={`${loginStatus.username}でログイン中。サインイン画面への移動を確認する`}
          title={isCollapsed ? `${loginStatus.username}でログイン中` : undefined}
          onClick={() => {
            setDialogError(null)
            setIsDialogOpen(true)
          }}
        >
          <span className="hundred-login-status__avatar" aria-hidden="true">
            {loginStatus.username.charAt(0).toUpperCase() || 'H'}
          </span>
          <span className="hundred-login-status__copy">
            <strong>{loginStatus.username}でログイン中</strong>
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
                現在は<strong>{loginStatus.username}</strong>でログインしています。
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
