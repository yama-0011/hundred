import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import {
  createCreativeIAWordPressDraft,
  generateCreativeIAArticle,
  getCreativeIAWordPressStatus,
  type CreativeIAGeneratedArticle,
  type CreativeIAWordPressDraft,
  type CreativeIAWordPressStatus,
} from '../../services/CreativeIA/creativeIaWordPressApi'
import '../../styles/CreativeIA/creative-ia-workspace.css'

type CreativeIASection = 'create' | 'content' | 'references' | 'settings'
type CreativeIATheme = 'auto' | 'light' | 'dark'
type Message = {
  id: string
  role: 'assistant' | 'user'
  text: string
}

const navigationItems: Array<{
  id: CreativeIASection
  label: string
  icon: ReactNode
}> = [
  {
    id: 'create',
    label: '作成',
    icon: <PathIcon path="M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />,
  },
  {
    id: 'content',
    label: '下書き',
    icon: <PathIcon path="M6 3h9l4 4v14H6Z M14 3v5h5 M9 13h7 M9 17h5" />,
  },
  {
    id: 'references',
    label: '参照データ',
    icon: <PathIcon path="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z M4 5.5v15A2.5 2.5 0 0 1 6.5 18 M8 7h8 M8 11h6" />,
  },
  {
    id: 'settings',
    label: '設定',
    icon: <PathIcon path="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.55V21h-4v-.09A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15.04 1.7 1.7 0 0 0 3.09 14H3v-4h.09A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.87l-.06-.06L7.03 4.2l.06.06a1.7 1.7 0 0 0 1.87.34A1.7 1.7 0 0 0 10 3.09V3h4v.09a1.7 1.7 0 0 0 1.04 1.51 1.7 1.7 0 0 0 1.87-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.87A1.7 1.7 0 0 0 20.91 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z" />,
  },
]

const quickPrompts = [
  { label: '商品紹介', prompt: '商品を紹介するブログ記事を作りたい' },
  { label: '施術紹介', prompt: '施術やサービスを紹介するブログ記事を作りたい' },
  { label: '相談', prompt: '何を発信すればよいか相談したい' },
]

function PathIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

function createMessage(role: Message['role'], text: string): Message {
  return { id: crypto.randomUUID(), role, text }
}

function getStoredTheme(): CreativeIATheme {
  const stored = window.localStorage.getItem('creative-ia-theme')
  return stored === 'light' || stored === 'dark' ? stored : 'auto'
}

/** 会話を中心に記事作成、下書き、参照データ、設定を扱うCreative IA本体。 */
function CreativeIAWorkspacePage() {
  const [activeSection, setActiveSection] =
    useState<CreativeIASection>('create')
  const [theme, setTheme] = useState<CreativeIATheme>(getStoredTheme)
  const [messages, setMessages] = useState<Message[]>([
    createMessage(
      'assistant',
      '今日は何を作りますか？ 作りたい内容をそのまま話してください。',
    ),
  ])
  const [composer, setComposer] = useState('')
  const [article, setArticle] =
    useState<CreativeIAGeneratedArticle | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [connection, setConnection] =
    useState<CreativeIAWordPressStatus | null>(null)
  const [isConnectionLoading, setIsConnectionLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedDraft, setSavedDraft] =
    useState<CreativeIAWordPressDraft | null>(null)
  const [isArtifactOpen, setIsArtifactOpen] = useState(false)
  const draftRequestKeyRef = useRef<string | null>(null)
  const messageEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.localStorage.setItem('creative-ia-theme', theme)
  }, [theme])

  useEffect(() => {
    let active = true

    void getCreativeIAWordPressStatus()
      .then((status) => {
        if (active) setConnection(status)
      })
      .catch(() => {
        if (active) setConnection(null)
      })
      .finally(() => {
        if (active) setIsConnectionLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isGenerating])

  const selectedSiteLabel = useMemo(
    () =>
      connection?.selectedSite?.name ||
      connection?.selectedSite?.url ||
      'WordPress',
    [connection],
  )

  const handleGenerate = async (request: string) => {
    const normalizedRequest = request.trim()
    if (!normalizedRequest || isGenerating) return
    const isRevision = article !== null

    setMessages((current) => [
      ...current,
      createMessage('user', normalizedRequest),
    ])
    setComposer('')
    setGenerationError(null)
    setSavedDraft(null)
    setSaveError(null)
    setIsGenerating(true)

    try {
      const result = await generateCreativeIAArticle({
        topic: isRevision
          ? draftTitle.slice(0, 200) || '作成中の記事の修正'
          : normalizedRequest.slice(0, 200),
        keyPoints: isRevision
          ? [
              `現在の記事概要: ${article.excerpt}`,
              `利用者の修正依頼: ${normalizedRequest}`,
            ]
              .join('\n')
              .slice(0, 2000)
          : normalizedRequest.slice(200, 2200),
        audience: '',
        tone: 'friendly',
      })
      setArticle(result)
      setDraftTitle(result.title)
      setDraftContent(result.content)
      setIsArtifactOpen(true)
      draftRequestKeyRef.current = null
      setMessages((current) => [
        ...current,
        createMessage(
          'assistant',
          isRevision
            ? '修正内容を反映しました。右側の記事案をもう一度確認してください。'
            : '記事案を作成しました。右側の記事案を確認してください。直したいところは、このまま会話で伝えられます。',
        ),
      ])
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      const message =
        code === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してからお試しください。'
          : code === 'RATE_LIMITED'
            ? '生成回数の上限に達しました。時間をおいてお試しください。'
            : code === 'SERVICE_BUSY'
              ? 'AIが混雑しています。時間をおいてもう一度お試しください。'
              : '記事案を生成できませんでした。入力内容は保持されています。'
      setGenerationError(message)
      setComposer(normalizedRequest)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleGenerate(composer)
  }

  const handleSave = async () => {
    if (!connection?.connected) {
      setSaveError('保存するには、設定からWordPressへ接続してください。')
      return
    }

    setIsSaving(true)
    setSaveError(null)
    setSavedDraft(null)

    try {
      const requestKey = draftRequestKeyRef.current ?? crypto.randomUUID()
      draftRequestKeyRef.current = requestKey
      const result = await createCreativeIAWordPressDraft(
        { title: draftTitle, content: draftContent },
        requestKey,
      )
      setSavedDraft(result)
      draftRequestKeyRef.current = null
    } catch (error) {
      setSaveError(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してからお試しください。'
          : 'WordPressへ下書きを保存できませんでした。内容は画面に保持されています。',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleSectionChange = (section: CreativeIASection) => {
    setActiveSection(section)
    setIsArtifactOpen(false)
  }

  return (
    <main className="creative-ia" data-theme={theme}>
      <header className="creative-ia__mobile-header">
        <Link to="/" aria-label="Hundredへ戻る">
          <span aria-hidden="true">←</span> Hundred
        </Link>
        <strong>Creative IA</strong>
      </header>

      <aside className="creative-ia__sidebar" aria-label="Creative IA">
        <div className="creative-ia__brand">
          <span className="creative-ia__brand-mark">C</span>
          <span>
            <strong>Creative IA</strong>
            <small>Content workspace</small>
          </span>
        </div>

        <nav className="creative-ia__navigation" aria-label="メイン">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="creative-ia__nav-item"
              data-active={activeSection === item.id}
              aria-current={activeSection === item.id ? 'page' : undefined}
              onClick={() => handleSectionChange(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <Link className="creative-ia__home-link" to="/">
          <span aria-hidden="true">←</span>
          Hundredへ戻る
        </Link>
      </aside>

      <div className="creative-ia__workspace">
        {activeSection === 'create' && (
          <CreateView
            messages={messages}
            composer={composer}
            article={article}
            isGenerating={isGenerating}
            error={generationError}
            messageEndRef={messageEndRef}
            onComposerChange={setComposer}
            onSubmit={handleSubmit}
            onQuickPrompt={setComposer}
            onOpenArtifact={() => setIsArtifactOpen(true)}
          />
        )}

        {activeSection === 'content' && (
          <ContentView
            article={article}
            title={draftTitle}
            content={draftContent}
            savedDraft={savedDraft}
            onOpen={() => {
              setActiveSection('create')
              setIsArtifactOpen(true)
            }}
          />
        )}

        {activeSection === 'references' && <ReferencesView />}

        {activeSection === 'settings' && (
          <SettingsView
            theme={theme}
            connection={connection}
            isConnectionLoading={isConnectionLoading}
            selectedSiteLabel={selectedSiteLabel}
            onThemeChange={setTheme}
          />
        )}
      </div>

      {activeSection === 'create' && article && (
        <ArtifactPanel
          open={isArtifactOpen}
          title={draftTitle}
          content={draftContent}
          warnings={article.warnings}
          isSaving={isSaving}
          connection={connection}
          saveError={saveError}
          savedDraft={savedDraft}
          onClose={() => setIsArtifactOpen(false)}
          onTitleChange={(value) => {
            setDraftTitle(value)
            draftRequestKeyRef.current = null
          }}
          onContentChange={(value) => {
            setDraftContent(value)
            draftRequestKeyRef.current = null
          }}
          onSave={() => void handleSave()}
          onOpenSettings={() => {
            setActiveSection('settings')
            setIsArtifactOpen(false)
          }}
        />
      )}

      <nav className="creative-ia__bottom-navigation" aria-label="メイン">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            type="button"
            data-active={activeSection === item.id}
            aria-current={activeSection === item.id ? 'page' : undefined}
            onClick={() => handleSectionChange(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  )
}

function CreateView({
  messages,
  composer,
  article,
  isGenerating,
  error,
  messageEndRef,
  onComposerChange,
  onSubmit,
  onQuickPrompt,
  onOpenArtifact,
}: {
  messages: Message[]
  composer: string
  article: CreativeIAGeneratedArticle | null
  isGenerating: boolean
  error: string | null
  messageEndRef: React.RefObject<HTMLDivElement | null>
  onComposerChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onQuickPrompt: (prompt: string) => void
  onOpenArtifact: () => void
}) {
  return (
    <section className="creative-ia__create" aria-labelledby="create-title">
      <header className="creative-ia__section-header">
        <div>
          <p>作成</p>
          <h1 id="create-title">AIと一緒に作る</h1>
        </div>
        {article && (
          <button
            className="creative-ia__artifact-toggle"
            type="button"
            onClick={onOpenArtifact}
          >
            記事案を見る
          </button>
        )}
      </header>

      <div className="creative-ia__conversation" aria-live="polite">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className="creative-ia__message"
            data-role={message.role}
          >
            {message.role === 'assistant' && (
              <span className="creative-ia__avatar" aria-hidden="true">
                AI
              </span>
            )}
            <div>
              <small>{message.role === 'assistant' ? 'Creative IA' : 'あなた'}</small>
              <p>{message.text}</p>
              {index === 0 && (
                <div className="creative-ia__quick-prompts">
                  {quickPrompts.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => onQuickPrompt(item.prompt)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isGenerating && (
          <div className="creative-ia__message" data-role="assistant">
            <span className="creative-ia__avatar" aria-hidden="true">
              AI
            </span>
            <div>
              <small>Creative IA</small>
              <p className="creative-ia__thinking">記事案を考えています</p>
            </div>
          </div>
        )}
        <div ref={messageEndRef} />
      </div>

      <form className="creative-ia__composer" onSubmit={onSubmit}>
        {error && <p role="alert">{error}</p>}
        <div>
          <label htmlFor="creative-ia-prompt">AIに相談する</label>
          <textarea
            id="creative-ia-prompt"
            value={composer}
            rows={2}
            maxLength={2000}
            placeholder="例：このトリートメントを紹介する記事を書きたい"
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
          />
          <button
            type="submit"
            disabled={!composer.trim() || isGenerating}
            aria-label="AIへ送信"
          >
            <PathIcon path="M5 12h14 M13 6l6 6-6 6" />
          </button>
        </div>
        <small>Enterで送信・Shift + Enterで改行</small>
      </form>
    </section>
  )
}

function ArtifactPanel({
  open,
  title,
  content,
  warnings,
  isSaving,
  connection,
  saveError,
  savedDraft,
  onClose,
  onTitleChange,
  onContentChange,
  onSave,
  onOpenSettings,
}: {
  open: boolean
  title: string
  content: string
  warnings: string[]
  isSaving: boolean
  connection: CreativeIAWordPressStatus | null
  saveError: string | null
  savedDraft: CreativeIAWordPressDraft | null
  onClose: () => void
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onSave: () => void
  onOpenSettings: () => void
}) {
  return (
    <aside
      className="creative-ia__artifact"
      data-open={open}
      aria-label="現在の記事案"
    >
      <header>
        <div>
          <p>現在の成果物</p>
          <h2>記事案</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="記事案を閉じる">
          ×
        </button>
      </header>

      <div className="creative-ia__artifact-body">
        <label>
          <span>タイトル</span>
          <input
            value={title}
            maxLength={200}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </label>

        {warnings.length > 0 && (
          <div className="creative-ia__artifact-warning">
            <strong>確認してください</strong>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <label className="creative-ia__article-content">
          <span>本文</span>
          <textarea
            value={content}
            maxLength={20000}
            onChange={(event) => onContentChange(event.target.value)}
          />
        </label>
      </div>

      <footer>
        {saveError && <p role="alert">{saveError}</p>}
        {savedDraft && (
          <p className="creative-ia__save-success" role="status">
            下書きを保存しました。
            {savedDraft.postUrl && (
              <a href={savedDraft.postUrl} target="_blank" rel="noreferrer">
                WordPressで確認
              </a>
            )}
          </p>
        )}
        {connection?.connected ? (
          <button
            type="button"
            disabled={isSaving || !title.trim() || !content.trim()}
            onClick={onSave}
          >
            {isSaving ? '保存中' : 'WordPressへ下書き保存'}
          </button>
        ) : (
          <button type="button" onClick={onOpenSettings}>
            WordPressを接続
          </button>
        )}
      </footer>
    </aside>
  )
}

function ContentView({
  article,
  title,
  content,
  savedDraft,
  onOpen,
}: {
  article: CreativeIAGeneratedArticle | null
  title: string
  content: string
  savedDraft: CreativeIAWordPressDraft | null
  onOpen: () => void
}) {
  return (
    <section className="creative-ia__page" aria-labelledby="content-title">
      <header className="creative-ia__section-header">
        <div>
          <p>Content</p>
          <h1 id="content-title">下書き</h1>
        </div>
      </header>
      {article ? (
        <button className="creative-ia__content-card" type="button" onClick={onOpen}>
          <span data-status={savedDraft ? 'saved' : 'editing'}>
            {savedDraft ? 'WordPress下書き' : '編集中'}
          </span>
          <strong>{title || 'タイトル未入力'}</strong>
          <p>{content.slice(0, 110)}</p>
          <small>現在のセッション</small>
        </button>
      ) : (
        <div className="creative-ia__empty-state">
          <span aria-hidden="true">✦</span>
          <h2>まだ下書きはありません</h2>
          <p>「作成」でAIへ話しかけると、作成中の記事がここに表示されます。</p>
        </div>
      )}
    </section>
  )
}

function ReferencesView() {
  return (
    <section className="creative-ia__page" aria-labelledby="references-title">
      <header className="creative-ia__section-header">
        <div>
          <p>References</p>
          <h1 id="references-title">参照データ</h1>
        </div>
      </header>
      <p className="creative-ia__page-lead">
        AIが記事を作るときに参照する素材と、守るべきルールを分けて管理します。
      </p>
      <div className="creative-ia__reference-groups">
        <section>
          <header>
            <span>01</span>
            <div>
              <h2>コンテンツ素材</h2>
              <p>記事へ書く事実や素材</p>
            </div>
          </header>
          <ul>
            <li>商品</li>
            <li>サービス</li>
            <li>写真</li>
            <li>会社・店舗</li>
          </ul>
        </section>
        <section>
          <header>
            <span>02</span>
            <div>
              <h2>AIルール</h2>
              <p>書き方と安全性の基準</p>
            </div>
          </header>
          <ul>
            <li>想定読者</li>
            <li>表記ルール</li>
            <li>使用可能な事実</li>
            <li>禁止表現</li>
            <li>AIへの送信ルール</li>
          </ul>
        </section>
      </div>
    </section>
  )
}

function SettingsView({
  theme,
  connection,
  isConnectionLoading,
  selectedSiteLabel,
  onThemeChange,
}: {
  theme: CreativeIATheme
  connection: CreativeIAWordPressStatus | null
  isConnectionLoading: boolean
  selectedSiteLabel: string
  onThemeChange: (theme: CreativeIATheme) => void
}) {
  return (
    <section className="creative-ia__page" aria-labelledby="settings-title">
      <header className="creative-ia__section-header">
        <div>
          <p>Settings</p>
          <h1 id="settings-title">設定</h1>
        </div>
      </header>
      <div className="creative-ia__settings-list">
        <section>
          <div>
            <p>外部サービス接続</p>
            <h2>WordPress</h2>
            <span>
              {isConnectionLoading
                ? '接続状態を確認中'
                : connection?.connected
                  ? `${selectedSiteLabel}へ接続済み`
                  : '未接続'}
            </span>
          </div>
          <Link to="/creative-ia/settings/wordpress">接続を管理</Link>
        </section>

        <section className="creative-ia__theme-setting">
          <div>
            <p>表示</p>
            <h2>テーマ</h2>
            <span>Creative IAだけに適用されます。</span>
          </div>
          <div role="group" aria-label="表示テーマ">
            {(['auto', 'light', 'dark'] as const).map((value) => (
              <button
                key={value}
                type="button"
                data-active={theme === value}
                onClick={() => onThemeChange(value)}
              >
                {value === 'auto'
                  ? '自動'
                  : value === 'light'
                    ? 'ライト'
                    : 'ダーク'}
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}

export default CreativeIAWorkspacePage
