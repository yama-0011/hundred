import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  connectCreativeIAWordPressWithApplicationPassword,
  createCreativeIAWordPressDraft,
  disconnectCreativeIAWordPress,
  generateCreativeIAArticle,
  getCreativeIAWordPressAuthorizationUrl,
  getCreativeIAWordPressStatus,
  type CreativeIAWordPressDraft,
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

/** Creative IAのWordPress接続状態と接続操作を表示する。 */
function CreativeIAConnectionPage() {
  const [searchParams] = useSearchParams()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [connection, setConnection] =
    useState<CreativeIAWordPressStatus | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [siteUrl, setSiteUrl] = useState('')
  const [wordpressUsername, setWordpressUsername] = useState('')
  const [applicationPassword, setApplicationPassword] = useState('')
  const [isConnectingApplicationPassword, setIsConnectingApplicationPassword] =
    useState(false)
  const [connectionFormError, setConnectionFormError] = useState<string | null>(
    null,
  )
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [topic, setTopic] = useState('')
  const [keyPoints, setKeyPoints] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState<
    'friendly' | 'professional' | 'casual'
  >('friendly')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([])
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [draftResult, setDraftResult] =
    useState<CreativeIAWordPressDraft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const draftRequestKeyRef = useRef<string | null>(null)
  const oauthResultMessage = getOAuthResultMessage(
    searchParams.get('wordpress'),
  )

  /** Workerから現在のWordPress接続状態を読み込む。 */
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

  /** Application Passwordで認証確認し、Workerへ暗号化保存する。 */
  const handleApplicationPasswordConnect = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setIsConnectingApplicationPassword(true)
    setConnectionFormError(null)

    try {
      const status = await connectCreativeIAWordPressWithApplicationPassword({
        siteUrl,
        username: wordpressUsername,
        applicationPassword,
      })
      setConnection(status)
      setApplicationPassword('')
      setPageState('ready')
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setConnectionFormError(
        code === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してからお試しください。'
          : code === 'WORDPRESS_AUTH_FAILED'
            ? 'WordPressユーザー名またはApplication Passwordを確認してください。'
            : code === 'WORDPRESS_PERMISSION_DENIED'
              ? 'このWordPressユーザーには記事を作成する権限がありません。'
              : code === 'INVALID_INPUT'
                ? 'HTTPSのサイトURLと入力内容を確認してください。'
                : 'WordPressへ接続できませんでした。REST APIやセキュリティ設定を確認してください。',
      )
    } finally {
      setIsConnectingApplicationPassword(false)
    }
  }

  /** Workerに保存したWordPress認証情報を利用者の明示操作で削除する。 */
  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    setErrorMessage(null)

    try {
      await disconnectCreativeIAWordPress()
      setConnection({
        connected: false,
        authType: null,
        wordpressUsername: null,
        selectedSite: null,
      })
      setDraftResult(null)
    } catch {
      setErrorMessage('WordPress接続を解除できませんでした。')
    } finally {
      setIsDisconnecting(false)
    }
  }

  /** 利用者の明示操作で、入力内容をWordPressへdraft固定で保存する。 */
  const handleSaveTestDraft = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setIsSavingDraft(true)
    setDraftError(null)
    setDraftResult(null)

    try {
      const requestKey = draftRequestKeyRef.current ?? crypto.randomUUID()
      draftRequestKeyRef.current = requestKey
      const result = await createCreativeIAWordPressDraft(
        {
          title: draftTitle,
          content: draftContent,
        },
        requestKey,
      )
      setDraftResult(result)
      draftRequestKeyRef.current = null
    } catch (error) {
      setDraftError(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してからお試しください。'
          : 'WordPressへ下書きを保存できませんでした。入力内容は保持されています。',
      )
    } finally {
      setIsSavingDraft(false)
    }
  }

  /** 利用者の明示操作で入力内容をGeminiへ送り、編集可能な記事案を受け取る。 */
  const handleGenerateArticle = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setIsGenerating(true)
    setGenerationError(null)
    setGenerationWarnings([])
    setDraftResult(null)
    setDraftError(null)

    try {
      const result = await generateCreativeIAArticle({
        topic,
        keyPoints,
        audience,
        tone,
      })
      setDraftTitle(result.title)
      setDraftContent(result.content)
      setGenerationWarnings(result.warnings)
      draftRequestKeyRef.current = null
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : ''
      setGenerationError(
        errorCode === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してからお試しください。'
          : errorCode === 'RATE_LIMITED'
            ? '生成回数の上限に達しました。時間をおいてお試しください。'
            : errorCode === 'SERVICE_BUSY'
              ? 'Geminiが混雑しています。時間をおいてもう一度お試しください。'
            : '記事案を生成できませんでした。入力内容は保持されています。',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const selectedSiteLabel =
    connection?.selectedSite?.name ||
    connection?.selectedSite?.url ||
    connection?.selectedSite?.id ||
    'WordPressサイト'

  return (
    <main className="creative-ia-connection">
      <div className="creative-ia-connection__glow" aria-hidden="true" />

      <header className="creative-ia-connection__header">
        <Link to="/creative-ia" aria-label="Creative IAの設定に戻る">
          ← Creative IA
        </Link>
        <span>WordPress設定</span>
      </header>

      <section
        className="creative-ia-connection__panel"
        aria-labelledby="creative-ia-connection-title"
      >
        <p className="creative-ia-connection__eyebrow">設定</p>
        <h1 id="creative-ia-connection-title">WordPress連携</h1>
        <p className="creative-ia-connection__lead">
          記事を下書きとして保存するWordPressサイトを接続します。
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

        <details
          className="creative-ia-connection__connection-method"
          open={!connection?.connected}
        >
          <summary>
            {connection?.connected
              ? '別のWordPressへ接続'
              : '独自ドメインWordPressへ接続'}
          </summary>
          <form
            className="creative-ia-connection__credential-form"
            onSubmit={(event) =>
              void handleApplicationPasswordConnect(event)
            }
          >
            <div>
              <strong>Application Passwordを使用</strong>
              <p>
                通常のログインパスワードではなく、WordPressのプロフィール画面で発行したApplication Passwordを入力します。
              </p>
            </div>

            <label>
              <span>WordPressサイトURL</span>
              <input
                type="url"
                inputMode="url"
                value={siteUrl}
                maxLength={500}
                required
                placeholder="https://example.com"
                onChange={(event) => setSiteUrl(event.target.value)}
              />
            </label>

            <label>
              <span>WordPressユーザー名</span>
              <input
                type="text"
                value={wordpressUsername}
                maxLength={100}
                required
                autoComplete="username"
                onChange={(event) => setWordpressUsername(event.target.value)}
              />
            </label>

            <label>
              <span>Application Password</span>
              <input
                type="password"
                value={applicationPassword}
                maxLength={255}
                required
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setApplicationPassword(event.target.value)}
              />
            </label>

            <p className="creative-ia-connection__privacy-note">
              Workerで接続確認後に暗号化して保存します。画面への再表示、ログ出力、APIレスポンスへの返却は行いません。
            </p>

            {connectionFormError && (
              <p className="creative-ia-connection__error" role="alert">
                {connectionFormError}
              </p>
            )}

            <button
              type="submit"
              disabled={isConnectingApplicationPassword}
            >
              {isConnectingApplicationPassword
                ? '接続を確認中'
                : 'WordPressへ接続'}
            </button>
          </form>
        </details>

        {connection?.connected && (
          <>
            <dl className="creative-ia-connection__site">
              <div>
                <dt>投稿先</dt>
                <dd>{selectedSiteLabel}</dd>
              </div>
              <div>
                <dt>接続方式</dt>
                <dd>
                  {connection.authType === 'application_password'
                    ? 'Application Password'
                    : 'WordPress.com OAuth'}
                </dd>
              </div>
              {connection.wordpressUsername && (
                <div>
                  <dt>WordPressユーザー</dt>
                  <dd>{connection.wordpressUsername}</dd>
                </div>
              )}
              {connection.selectedSite?.id && (
                <div>
                  <dt>サイトID</dt>
                  <dd>{connection.selectedSite.id}</dd>
                </div>
              )}
            </dl>

            <form
              className="creative-ia-connection__draft-form"
              onSubmit={(event) => void handleGenerateArticle(event)}
            >
              <div className="creative-ia-connection__draft-heading">
                <div>
                  <p className="creative-ia-connection__eyebrow">記事作成</p>
                  <h2>記事案を生成</h2>
                </div>
                <span>生成後に編集できます</span>
              </div>

              <label>
                <span>テーマ</span>
                <input
                  type="text"
                  value={topic}
                  maxLength={200}
                  required
                  placeholder="例：朝の散歩を続けるコツ"
                  onChange={(event) => setTopic(event.target.value)}
                />
              </label>

              <label>
                <span>含めたい要点</span>
                <textarea
                  value={keyPoints}
                  maxLength={2000}
                  rows={4}
                  placeholder="1行ずつ、記事に含めたい内容を入力"
                  onChange={(event) => setKeyPoints(event.target.value)}
                />
              </label>

              <label>
                <span>想定読者</span>
                <input
                  type="text"
                  value={audience}
                  maxLength={200}
                  placeholder="例：運動を習慣にしたい初心者"
                  onChange={(event) => setAudience(event.target.value)}
                />
              </label>

              <label>
                <span>文体</span>
                <select
                  value={tone}
                  onChange={(event) =>
                    setTone(
                      event.target.value as
                        | 'friendly'
                        | 'professional'
                        | 'casual',
                    )
                  }
                >
                  <option value="friendly">親しみやすい</option>
                  <option value="professional">信頼感がある</option>
                  <option value="casual">カジュアル</option>
                </select>
              </label>

              <p className="creative-ia-connection__privacy-note">
                入力内容は記事案の生成に限ってGemini APIへ送信されます。個人情報や機密情報は入力しないでください。
              </p>

              {generationError && (
                <p className="creative-ia-connection__error" role="alert">
                  {generationError}
                </p>
              )}

              <button type="submit" disabled={isGenerating}>
                {isGenerating ? '記事案を生成中' : '記事案を生成'}
              </button>
            </form>

            {(draftTitle || draftContent) && (
            <form
              className="creative-ia-connection__draft-form"
              onSubmit={(event) => void handleSaveTestDraft(event)}
            >
              <div className="creative-ia-connection__draft-heading">
                <div>
                  <p className="creative-ia-connection__eyebrow">編集・確認</p>
                  <h2>記事案</h2>
                </div>
                <span>公開されません</span>
              </div>

              <label>
                <span>タイトル</span>
                <input
                  type="text"
                  value={draftTitle}
                  maxLength={200}
                  required
                  onChange={(event) => {
                    draftRequestKeyRef.current = null
                    setDraftTitle(event.target.value)
                  }}
                />
              </label>

              {generationWarnings.length > 0 && (
                <div className="creative-ia-connection__warnings" role="status">
                  <strong>確認してください</strong>
                  <ul>
                    {generationWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <details className="creative-ia-connection__preview">
                <summary>プレビュー</summary>
                <article>
                  <h3>{draftTitle || 'タイトル未入力'}</h3>
                  <p>{draftContent || '本文未入力'}</p>
                </article>
              </details>

              <label>
                <span>本文</span>
                <textarea
                  value={draftContent}
                  maxLength={20000}
                  rows={6}
                  required
                  onChange={(event) => {
                    draftRequestKeyRef.current = null
                    setDraftContent(event.target.value)
                  }}
                />
              </label>

              {draftError && (
                <p className="creative-ia-connection__error" role="alert">
                  {draftError}
                </p>
              )}

              {draftResult && (
                <div className="creative-ia-connection__draft-result" role="status">
                  <strong>WordPressへ下書きを保存しました。</strong>
                  <span>Post ID: {draftResult.postId}</span>
                  {draftResult.postUrl && (
                    <a
                      href={draftResult.postUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WordPressで確認
                    </a>
                  )}
                </div>
              )}

              <button type="submit" disabled={isSavingDraft}>
                {isSavingDraft ? '下書きを保存中' : 'WordPressへ下書きを保存'}
              </button>
            </form>
            )}
          </>
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
          {connection?.connected && (
            <button
              className="creative-ia-connection__danger"
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? '接続を解除中' : 'WordPress接続を解除'}
            </button>
          )}
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
        {connection?.authType === 'application_password' && (
          <p className="creative-ia-connection__footnote">
            接続解除ではCreative IA側の保存情報を削除します。WordPress側のApplication Passwordは、WordPressのプロフィール画面から別途取り消せます。
          </p>
        )}
      </section>
    </main>
  )
}

export default CreativeIAConnectionPage
