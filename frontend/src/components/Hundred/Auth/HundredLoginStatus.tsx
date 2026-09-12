import { fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../../styles/Hundred/hundred-login-status.css'

type LoginStatus = {
  displayName: string
  providerLabel: string
}

function resolveDisplayName(name?: string, email?: string) {
  const normalizedName = name?.trim()
  if (normalizedName) return normalizedName

  const emailLocalPart = email?.split('@', 1)[0]?.trim()
  return emailLocalPart || 'Hundredユーザー'
}

/** Hundred配下のどのAppでも現在のログイン状態を確認できる固定表示。 */
function HundredLoginStatus() {
  const navigate = useNavigate()
  const [loginStatus, setLoginStatus] = useState<LoginStatus | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    let isActive = true

    const syncLoginStatus = async () => {
      try {
        const user = await getCurrentUser()
        let name: string | undefined
        let email: string | undefined

        try {
          const attributes = await fetchUserAttributes()
          name = attributes.name
          email = attributes.email
        } catch {
          // 認証セッションが有効なら、属性を取得できなくても状態表示は維持する。
        }

        if (!isActive) return
        setLoginStatus({
          displayName: resolveDisplayName(name, email),
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
        setIsDismissed(false)
        void syncLoginStatus()
        return
      }

      if (payload.event === 'tokenRefresh') {
        void syncLoginStatus()
        return
      }

      if (payload.event === 'signedOut') {
        setLoginStatus(null)
        setIsDismissed(false)
      }
    })

    void syncLoginStatus()

    return () => {
      isActive = false
      cancelAuthListener()
    }
  }, [])

  if (!loginStatus || isDismissed) return null

  return (
    <aside className="hundred-login-status" aria-label="Hundredログイン状態">
      <button
        className="hundred-login-status__profile"
        type="button"
        onClick={() => navigate('/?profile=open')}
      >
        <span className="hundred-login-status__avatar" aria-hidden="true">
          {loginStatus.displayName.charAt(0).toUpperCase() || 'H'}
        </span>
        <span className="hundred-login-status__copy">
          <strong>{loginStatus.displayName}でログイン中</strong>
          <small>{loginStatus.providerLabel}・プロフィールを表示</small>
        </span>
      </button>
      <button
        className="hundred-login-status__dismiss"
        type="button"
        aria-label="ログイン表示を非表示にする"
        title="非表示"
        onClick={() => setIsDismissed(true)}
      >
        ×
      </button>
    </aside>
  )
}

export default HundredLoginStatus
