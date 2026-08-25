import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import {
  appendCreativeIAChatMessage,
  createCreativeIAChat,
  createCreativeIAReferenceProduct,
  createCreativeIAReferenceContact,
  createCreativeIAReferenceOrganization,
  createCreativeIAReferenceService,
  createCreativeIAWordPressDraft,
  deleteCreativeIAChat,
  deleteCreativeIAReferenceProduct,
  deleteCreativeIAReferenceContact,
  deleteCreativeIAReferenceOrganization,
  deleteCreativeIAReferenceService,
  respondCreativeIAChat,
  getCreativeIAChats,
  getCreativeIAReferenceProducts,
  getCreativeIAReferenceContacts,
  getCreativeIAReferenceOrganizations,
  getCreativeIAReferenceServices,
  getCreativeIAWordPressStatus,
  updateCreativeIAChat,
  updateCreativeIAReferenceProduct,
  updateCreativeIAReferenceContact,
  updateCreativeIAReferenceOrganization,
  updateCreativeIAReferenceService,
  type CreativeIAChat,
  type CreativeIAChatMessage,
  type CreativeIAGeneratedArticle,
  type CreativeIAInstagramContentType,
  type CreativeIAProductionDestination,
  type CreativeIAProductionMemo,
  type CreativeIAReferenceProduct,
  type CreativeIAReferenceProductInput,
  type CreativeIAReferenceContact,
  type CreativeIAReferenceContactInput,
  type CreativeIAReferenceOrganization,
  type CreativeIAReferenceOrganizationInput,
  type CreativeIAReferenceService,
  type CreativeIAReferenceServiceInput,
  type CreativeIAWordPressDraft,
  type CreativeIAWordPressStatus,
} from '../../services/CreativeIA/creativeIaWordPressApi'
import {
  getCreativeIAInstagramPublication,
  getCreativeIAInstagramStatus,
  publishCreativeIAInstagramFeed,
  uploadCreativeIAInstagramFeedImage,
  type CreativeIAInstagramPublication,
  type CreativeIAInstagramStatus,
} from '../../services/CreativeIA/creativeIaInstagramApi'
import '../../styles/CreativeIA/creative-ia-workspace.css'

type CreativeIASection = 'create' | 'content' | 'references' | 'settings'
type CreativeIATheme = 'auto' | 'light' | 'dark'
type ArtifactView = 'article' | 'destination' | 'memo' | 'rules'
type Message = CreativeIAChatMessage
type ProductionMemo = CreativeIAProductionMemo
type ReferenceAIRule = {
  id: string
  label: string
  description?: string
}
type ChatSession = CreativeIAChat
type ChatState = {
  chats: ChatSession[]
  activeChatId: string | null
}

const instagramContentTypeLabels: Record<CreativeIAInstagramContentType, string> = {
  feed: 'フィード',
  stories: 'ストーリーズ',
  reels: 'Reels',
}

function getArtifactCopy(
  destination: CreativeIAProductionDestination | null,
  instagramContentType: CreativeIAInstagramContentType,
) {
  if (destination === null) {
    return {
      artifactLabel: '成果物',
      openLabel: '成果物を見る',
      titleLabel: '管理タイトル',
      contentLabel: '内容',
      thinkingLabel: '制作内容を確認しています',
      emptyLabel: '制作物未作成',
      destinationLabel: '未設定',
    }
  }

  if (destination === 'wordpress') {
    return {
      artifactLabel: '記事案',
      openLabel: '記事案を見る',
      titleLabel: 'タイトル',
      contentLabel: '本文',
      thinkingLabel: '記事案を考えています',
      emptyLabel: '記事未作成',
      destinationLabel: 'WordPress記事',
    }
  }

  const formatLabel = instagramContentTypeLabels[instagramContentType]
  const contentLabels: Record<CreativeIAInstagramContentType, string> = {
    feed: 'キャプション',
    stories: 'ストーリーズ構成',
    reels: '台本・構成',
  }

  return {
    artifactLabel: '投稿案',
    openLabel: '投稿案を見る',
    titleLabel: '管理タイトル',
    contentLabel: contentLabels[instagramContentType],
    thinkingLabel: '投稿案を考えています',
    emptyLabel: '投稿案未作成',
    destinationLabel: `Instagram・${formatLabel}`,
  }
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

const instagramQuickPrompts = [
  { label: '商品紹介', prompt: '商品を紹介するInstagram投稿案を作りたい' },
  { label: 'サービス紹介', prompt: 'サービスを紹介するInstagram投稿案を作りたい' },
  { label: '相談', prompt: 'Instagramで何を発信すればよいか相談したい' },
]

const unsetDestinationQuickPrompts = [
  { label: '商品紹介', prompt: '商品を紹介するコンテンツを作りたい' },
  { label: 'サービス紹介', prompt: 'サービスを紹介するコンテンツを作りたい' },
  { label: '相談', prompt: '何を発信すればよいか相談したい' },
]

// 参照データ機能の実装後は「02 AIルール」をAPIから取得する。
// 現時点で固定ルールは埋め込まず、記事ごとの選択UIだけ用意する。
const referenceAIRules: ReferenceAIRule[] = []

function PathIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

function createMessage(role: Message['role'], text: string): Message {
  return { id: crypto.randomUUID(), role, text, createdAt: Date.now() }
}

function createInitialChatState(): ChatState {
  return { chats: [], activeChatId: null }
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
  const [chatState, setChatState] =
    useState<ChatState>(createInitialChatState)
  const [isChatsLoading, setIsChatsLoading] = useState(true)
  const [isChatMutationPending, setIsChatMutationPending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [chatLimit, setChatLimit] = useState(10)
  const [composer, setComposer] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [connection, setConnection] =
    useState<CreativeIAWordPressStatus | null>(null)
  const [isConnectionLoading, setIsConnectionLoading] = useState(true)
  const [instagramConnection, setInstagramConnection] =
    useState<CreativeIAInstagramStatus | null>(null)
  const [isInstagramConnectionLoading, setIsInstagramConnectionLoading] =
    useState(true)
  const [instagramPublication, setInstagramPublication] =
    useState<CreativeIAInstagramPublication | null>(null)
  const [isInstagramPublicationLoading, setIsInstagramPublicationLoading] =
    useState(false)
  const [isInstagramImageUploading, setIsInstagramImageUploading] =
    useState(false)
  const [isInstagramPublishing, setIsInstagramPublishing] = useState(false)
  const [instagramPublishError, setInstagramPublishError] =
    useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isArtifactOpen, setIsArtifactOpen] = useState(false)
  const [artifactView, setArtifactView] = useState<ArtifactView>('article')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const draftRequestKeyRef = useRef<string | null>(null)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const chatStateRef = useRef(chatState)
  const chatSaveTimersRef = useRef(new Map<string, number>())
  const activeChat = chatState.activeChatId
    ? chatState.chats.find((chat) => chat.id === chatState.activeChatId)
    : undefined

  const updateChat = (
    chatId: string,
    updater: (chat: ChatSession) => ChatSession,
  ) => {
    setChatState((current) => ({
      ...current,
      chats: current.chats.map((chat) =>
        chat.id === chatId ? updater(chat) : chat,
      ),
    }))
  }

  useEffect(() => {
    window.localStorage.setItem('creative-ia-theme', theme)
  }, [theme])

  useEffect(() => {
    chatStateRef.current = chatState
  }, [chatState])

  useEffect(() => {
    const timers = chatSaveTimersRef.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

  useEffect(() => {
    let active = true

    void getCreativeIAInstagramStatus()
      .then((status) => {
        if (active) setInstagramConnection(status)
      })
      .catch(() => {
        if (active) setInstagramConnection(null)
      })
      .finally(() => {
        if (active) setIsInstagramConnectionLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    void getCreativeIAChats()
      .then((result) => {
        if (!active) return
        setChatState({ chats: result.chats, activeChatId: null })
        setChatLimit(result.limit)
        setChatError(null)
      })
      .catch((error) => {
        if (!active) return
        setChatError(
          error instanceof Error && error.message === 'AUTH_REQUIRED'
            ? 'Hundredへサインインし直してください。'
            : 'Chat一覧を読み込めませんでした。',
        )
      })
      .finally(() => {
        if (active) setIsChatsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

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
  }, [activeChat?.messages, isGenerating])

  useEffect(() => {
    let active = true
    if (
      !activeChat ||
      activeChat.productionDestination !== 'instagram' ||
      activeChat.instagramContentType !== 'feed'
    ) {
      setInstagramPublication(null)
      setInstagramPublishError(null)
      setIsInstagramPublicationLoading(false)
      return () => {
        active = false
      }
    }

    setIsInstagramPublicationLoading(true)
    setInstagramPublishError(null)
    void getCreativeIAInstagramPublication(activeChat.id)
      .then((result) => {
        if (active) setInstagramPublication(result.publication)
      })
      .catch(() => {
        if (active) setInstagramPublishError('投稿画像を読み込めませんでした。')
      })
      .finally(() => {
        if (active) setIsInstagramPublicationLoading(false)
      })

    return () => {
      active = false
    }
  }, [
    activeChat?.id,
    activeChat?.instagramContentType,
    activeChat?.productionDestination,
  ])

  const scheduleChatSave = (chatId: string) => {
    const currentTimer = chatSaveTimersRef.current.get(chatId)
    if (currentTimer) window.clearTimeout(currentTimer)

    const timer = window.setTimeout(() => {
      chatSaveTimersRef.current.delete(chatId)
      const chat = chatStateRef.current.chats.find((item) => item.id === chatId)
      if (!chat) return

      void updateCreativeIAChat(chat).catch(() => {
        setChatError('Chatの変更を保存できませんでした。')
      })
    }, 700)

    chatSaveTimersRef.current.set(chatId, timer)
  }

  const selectedSiteLabel = useMemo(
    () =>
      connection?.selectedSite?.name ||
      connection?.selectedSite?.url ||
      'WordPress',
    [connection],
  )

  const openArtifact = (view: ArtifactView) => {
    setArtifactView(view)
    setIsArtifactOpen(true)
  }

  const handleGenerate = async (request: string) => {
    const normalizedRequest = request.trim()
    if (!normalizedRequest || isGenerating || !activeChat) return
    const targetChatId = activeChat.id
    const userMessage = createMessage('user', normalizedRequest)
    const chatBeforeGeneration: ChatSession = {
      ...activeChat,
      title:
        activeChat.title === '新しいChat'
          ? normalizedRequest.slice(0, 34)
          : activeChat.title,
      messages: [...activeChat.messages, userMessage],
      savedDraft: activeChat.savedDraft,
      updatedAt: Date.now(),
    }

    updateChat(targetChatId, () => chatBeforeGeneration)
    setComposer('')
    setGenerationError(null)
    setChatError(null)
    setSaveError(null)
    setIsGenerating(true)

    try {
      await Promise.all([
        appendCreativeIAChatMessage(targetChatId, userMessage),
        updateCreativeIAChat(chatBeforeGeneration),
      ])
      const result = await respondCreativeIAChat(targetChatId)
      const assistantMessage = createMessage('assistant', result.message)
      const updatedArticle =
        result.action === 'update_article' && result.article
          ? result.article
          : chatBeforeGeneration.article
      const updatedChat: ChatSession = {
        ...chatBeforeGeneration,
        productionDestination: result.productionDestination,
        instagramContentType: result.instagramContentType,
        article: updatedArticle,
        draftTitle: result.article?.title ?? chatBeforeGeneration.draftTitle,
        draftContent:
          result.article?.content ?? chatBeforeGeneration.draftContent,
        savedDraft:
          result.action === 'update_article'
            ? null
            : chatBeforeGeneration.savedDraft,
        messages: [...chatBeforeGeneration.messages, assistantMessage],
        updatedAt: Date.now(),
      }
      updateChat(targetChatId, () => updatedChat)
      void Promise.all([
        appendCreativeIAChatMessage(targetChatId, assistantMessage),
        updateCreativeIAChat(updatedChat),
      ]).catch(() => {
        setChatError('生成した成果物をD1へ保存できませんでした。')
      })
      if (result.action === 'update_article' && result.article) {
        setArtifactView('article')
        setIsArtifactOpen(true)
      }
      draftRequestKeyRef.current = null
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      const message =
        code === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してからお試しください。'
          : code === 'RATE_LIMITED'
            ? 'AI利用回数の上限に達しました。時間をおいてお試しください。'
            : code === 'SERVICE_BUSY'
              ? 'AIが混雑しています。時間をおいてもう一度お試しください。'
              : 'AIの応答を取得できませんでした。入力内容は保持されています。'
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
    if (!connection?.connected || !activeChat) {
      setSaveError('保存するには、設定からWordPressへ接続してください。')
      return
    }

    setIsSaving(true)
    setSaveError(null)
    updateChat(activeChat.id, (chat) => ({ ...chat, savedDraft: null }))

    try {
      const requestKey = draftRequestKeyRef.current ?? crypto.randomUUID()
      draftRequestKeyRef.current = requestKey
      const result = await createCreativeIAWordPressDraft(
        { title: activeChat.draftTitle, content: activeChat.draftContent },
        requestKey,
      )
      updateChat(activeChat.id, (chat) => ({
        ...chat,
        savedDraft: result,
        updatedAt: Date.now(),
      }))
      scheduleChatSave(activeChat.id)
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

  const handleInstagramImageUpload = async (image: File) => {
    if (!activeChat) return
    if (image.type !== 'image/jpeg' || image.size > 8 * 1024 * 1024) {
      setInstagramPublishError('8MB以下のJPEG画像を選択してください。')
      return
    }
    setIsInstagramImageUploading(true)
    setInstagramPublishError(null)
    try {
      const publication = await uploadCreativeIAInstagramFeedImage(
        activeChat.id,
        image,
      )
      setInstagramPublication(publication)
    } catch (error) {
      setInstagramPublishError(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してください。'
          : '画像を保存できませんでした。JPEG形式を確認してください。',
      )
    } finally {
      setIsInstagramImageUploading(false)
    }
  }

  const handleInstagramPublish = async () => {
    if (!activeChat || !instagramPublication) return
    const confirmed = window.confirm(
      'この画像とキャプションをInstagramへ公開します。公開後はCreative IAから取り消せません。投稿しますか？',
    )
    if (!confirmed) return

    setIsInstagramPublishing(true)
    setInstagramPublishError(null)
    try {
      await updateCreativeIAChat(activeChat)
      const publication = await publishCreativeIAInstagramFeed(activeChat.id)
      setInstagramPublication(publication)
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setInstagramPublishError(
        code === 'AUTH_REQUIRED'
          ? 'Instagramへ再接続してからお試しください。'
          : code === 'CONFLICT'
            ? '投稿準備が完了していないか、現在処理中です。'
            : code === 'PROVIDER_FAILED'
              ? 'Instagramへ投稿できませんでした。画像や権限を確認してください。'
              : 'Instagramへの投稿処理に失敗しました。',
      )
    } finally {
      setIsInstagramPublishing(false)
    }
  }

  const handleSectionChange = (section: CreativeIASection) => {
    setActiveSection(section)
    setIsArtifactOpen(false)
    if (section === 'create') {
      setChatState((current) => ({ ...current, activeChatId: null }))
    }
  }

  const handleNewChat = async () => {
    if (isChatMutationPending) return
    setIsChatMutationPending(true)
    setChatError(null)

    try {
      const chat = await createCreativeIAChat()
      setChatState((current) => ({
        chats: [chat, ...current.chats],
        activeChatId: chat.id,
      }))
      setComposer('')
      setGenerationError(null)
      setSaveError(null)
      setIsArtifactOpen(false)
      setArtifactView('article')
      draftRequestKeyRef.current = null
    } catch (error) {
      setChatError(
        error instanceof Error && error.message === 'CONFLICT'
          ? `Chatの上限は${chatLimit}件です。不要なChatを削除してください。`
          : 'Chatを作成できませんでした。',
      )
    } finally {
      setIsChatMutationPending(false)
    }
  }

  const handleSelectChat = (chatId: string) => {
    setChatState((current) => ({ ...current, activeChatId: chatId }))
    setComposer('')
    setGenerationError(null)
    setChatError(null)
    setSaveError(null)
    setIsArtifactOpen(false)
    setArtifactView('article')
    draftRequestKeyRef.current = null
  }

  const handleDeleteChat = async (chatId: string) => {
    if (isChatMutationPending) return
    setIsChatMutationPending(true)
    setChatError(null)

    try {
      await deleteCreativeIAChat(chatId)
      const timer = chatSaveTimersRef.current.get(chatId)
      if (timer) window.clearTimeout(timer)
      chatSaveTimersRef.current.delete(chatId)
      setChatState((current) => ({
        chats: current.chats.filter((chat) => chat.id !== chatId),
        activeChatId:
          current.activeChatId === chatId ? null : current.activeChatId,
      }))
      setComposer('')
      setGenerationError(null)
      setSaveError(null)
      setIsArtifactOpen(false)
      setArtifactView('article')
      draftRequestKeyRef.current = null
    } catch {
      setChatError('Chatを削除できませんでした。')
    } finally {
      setIsChatMutationPending(false)
    }
  }

  return (
    <main
      className="creative-ia"
      data-theme={theme}
      data-sidebar-collapsed={isSidebarCollapsed}
    >
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

      <button
        className="creative-ia__sidebar-toggle"
        type="button"
        aria-label={
          isSidebarCollapsed ? 'サイドバーを表示' : 'サイドバーを隠す'
        }
        onClick={() => setIsSidebarCollapsed((current) => !current)}
      >
        <PathIcon
          path={
            isSidebarCollapsed
              ? 'M9 6l6 6-6 6'
              : 'M15 6l-6 6 6 6'
          }
        />
      </button>

      <div className="creative-ia__workspace">
        {activeSection === 'create' && !activeChat && (
          <ChatOverview
            chats={chatState.chats}
            activeChatId={chatState.activeChatId}
            isLoading={isChatsLoading}
            isPending={isChatMutationPending}
            error={chatError}
            limit={chatLimit}
            onNewChat={() => void handleNewChat()}
            onSelectChat={handleSelectChat}
            onDeleteChat={(chatId) => void handleDeleteChat(chatId)}
          />
        )}

        {activeSection === 'create' && activeChat && (
          <CreateView
            messages={activeChat.messages}
            composer={composer}
            article={activeChat.article}
            productionDestination={activeChat.productionDestination}
            instagramContentType={activeChat.instagramContentType}
            usedReferences={activeChat.article?.usedReferences ?? []}
            isGenerating={isGenerating}
            error={generationError}
            persistenceError={chatError}
            messageEndRef={messageEndRef}
            onComposerChange={setComposer}
            onSubmit={handleSubmit}
            onQuickPrompt={setComposer}
            onOpenArtifact={openArtifact}
            onBackToChats={() => {
              setChatState((current) => ({ ...current, activeChatId: null }))
              setIsArtifactOpen(false)
              setChatError(null)
            }}
          />
        )}

        {activeSection === 'content' && (
          <ContentView
            chats={chatState.chats}
            wordpressDestination={selectedSiteLabel}
            onOpen={(chatId) => {
              handleSelectChat(chatId)
              setActiveSection('create')
              openArtifact('article')
            }}
          />
        )}

        {activeSection === 'references' && <ReferencesView />}

        {activeSection === 'settings' && (
          <SettingsView
            theme={theme}
            connection={connection}
            isConnectionLoading={isConnectionLoading}
            instagramConnection={instagramConnection}
            isInstagramConnectionLoading={isInstagramConnectionLoading}
            selectedSiteLabel={selectedSiteLabel}
            onThemeChange={setTheme}
          />
        )}
      </div>

      {activeSection === 'create' && activeChat && (
        <ArtifactPanel
          open={isArtifactOpen}
          view={artifactView}
          hasArticle={activeChat.article !== null}
          title={activeChat.draftTitle}
          content={activeChat.draftContent}
          warnings={activeChat.article?.warnings ?? []}
          productionMemos={activeChat.productionMemos}
          availableRules={referenceAIRules}
          appliedRuleIds={activeChat.appliedRuleIds}
          productionDestination={activeChat.productionDestination}
          instagramContentType={activeChat.instagramContentType}
          isSaving={isSaving}
          connection={connection}
          saveError={saveError}
          savedDraft={activeChat.savedDraft}
          instagramConnection={instagramConnection}
          instagramPublication={instagramPublication}
          isInstagramPublicationLoading={isInstagramPublicationLoading}
          isInstagramImageUploading={isInstagramImageUploading}
          isInstagramPublishing={isInstagramPublishing}
          instagramPublishError={instagramPublishError}
          onClose={() => setIsArtifactOpen(false)}
          onViewChange={setArtifactView}
          onProductionDestinationChange={(productionDestination) => {
            updateChat(activeChat.id, (chat) => ({
              ...chat,
              productionDestination,
              updatedAt: Date.now(),
            }))
            scheduleChatSave(activeChat.id)
          }}
          onInstagramContentTypeChange={(instagramContentType) => {
            updateChat(activeChat.id, (chat) => ({
              ...chat,
              instagramContentType,
              updatedAt: Date.now(),
            }))
            scheduleChatSave(activeChat.id)
          }}
          onProductionMemosChange={(productionMemos) => {
            updateChat(activeChat.id, (chat) => ({
              ...chat,
              productionMemos,
              savedDraft: null,
              updatedAt: Date.now(),
            }))
            scheduleChatSave(activeChat.id)
            draftRequestKeyRef.current = null
          }}
          onAppliedRuleIdsChange={(appliedRuleIds) => {
            updateChat(activeChat.id, (chat) => ({
              ...chat,
              appliedRuleIds,
              savedDraft: null,
              updatedAt: Date.now(),
            }))
            scheduleChatSave(activeChat.id)
            draftRequestKeyRef.current = null
          }}
          onTitleChange={(value) => {
            updateChat(activeChat.id, (chat) => ({
              ...chat,
              draftTitle: value,
              savedDraft: null,
              updatedAt: Date.now(),
            }))
            scheduleChatSave(activeChat.id)
            draftRequestKeyRef.current = null
          }}
          onContentChange={(value) => {
            updateChat(activeChat.id, (chat) => ({
              ...chat,
              draftContent: value,
              savedDraft: null,
              updatedAt: Date.now(),
            }))
            scheduleChatSave(activeChat.id)
            draftRequestKeyRef.current = null
          }}
          onSave={() => void handleSave()}
          onInstagramImageUpload={(image) =>
            void handleInstagramImageUpload(image)
          }
          onInstagramPublish={() => void handleInstagramPublish()}
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

function ChatOverview({
  chats,
  activeChatId,
  isLoading,
  isPending,
  error,
  limit,
  onNewChat,
  onSelectChat,
  onDeleteChat,
}: {
  chats: ChatSession[]
  activeChatId: string | null
  isLoading: boolean
  isPending: boolean
  error: string | null
  limit: number
  onNewChat: () => void
  onSelectChat: (chatId: string) => void
  onDeleteChat: (chatId: string) => void
}) {
  const sortedChats = useMemo(
    () => [...chats].sort((left, right) => right.updatedAt - left.updatedAt),
    [chats],
  )

  return (
    <section className="creative-ia__chat-overview" aria-labelledby="chat-overview-title">
      <header className="creative-ia__collection-header">
        <div>
          <p>Create</p>
          <h1 id="chat-overview-title">Chat</h1>
          <span>作成中のコンテンツを選ぶか、新しいChatを始めます。</span>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          disabled={isPending || chats.length >= limit}
        >
          ＋ 新しいChat
        </button>
      </header>

      <div className="creative-ia__collection-meta">
        <span>{chats.length} / {limit} Chat</span>
        {chats.length > 0 && <small>左へスライドすると削除できます。</small>}
      </div>

      {error && <p className="creative-ia__chat-error" role="alert">{error}</p>}

      {isLoading ? (
        <div className="creative-ia__empty-state">
          <p>Chatを読み込んでいます。</p>
        </div>
      ) : chats.length === 0 ? (
        <div className="creative-ia__empty-state">
          <span aria-hidden="true">✦</span>
          <h2>最初のChatを始めましょう</h2>
          <p>AIに情報を渡しながら、1つのコンテンツを育てていけます。</p>
          <button type="button" onClick={onNewChat} disabled={isPending}>
            新しいChatを作成
          </button>
        </div>
      ) : (
        <WorkspaceList
          ariaLabel="Chat一覧"
          columns={[
            { key: 'title', label: 'Chatタイトル' },
            { key: 'article', label: '関連している制作物' },
            { key: 'updated', label: '最終更新' },
            { key: 'status', label: '状態' },
          ]}
          columnTemplate="minmax(220px, 1.35fr) minmax(220px, 1.2fr) 132px 108px"
          rows={sortedChats.map((chat) => {
            const artifactCopy = getArtifactCopy(
              chat.productionDestination,
              chat.instagramContentType,
            )
            const isSaved =
              chat.productionDestination === 'wordpress' && Boolean(chat.savedDraft)

            return {
              id: chat.id,
              ariaLabel: `「${chat.title}」を開く`,
              active: activeChatId === chat.id,
              cells: {
                title: (
                  <span className="creative-ia__collection-primary">
                    <strong>{chat.title}</strong>
                    <small>{chat.messages.at(-1)?.text ?? '会話を始めましょう'}</small>
                  </span>
                ),
                article:
                  chat.draftTitle || chat.article?.title || artifactCopy.emptyLabel,
                updated: <FormattedDate value={chat.updatedAt} />,
                status: (
                  <StatusBadge tone={isSaved ? 'saved' : 'editing'}>
                    {isSaved ? '保存済み' : chat.article ? '作成中' : '会話中'}
                  </StatusBadge>
                ),
              },
              onOpen: () => onSelectChat(chat.id),
              onDelete: () => onDeleteChat(chat.id),
              deleteLabel: `「${chat.title}」を削除`,
            }
          })}
          disabled={isPending}
        />
      )}
    </section>
  )
}

type WorkspaceListColumn = {
  key: string
  label: string
}

type WorkspaceListRow = {
  id: string
  ariaLabel: string
  active?: boolean
  cells: Record<string, ReactNode>
  onOpen: () => void
  onDelete?: () => void
  deleteLabel?: string
}

function WorkspaceList({
  ariaLabel,
  columns,
  columnTemplate,
  rows,
  disabled = false,
}: {
  ariaLabel: string
  columns: WorkspaceListColumn[]
  columnTemplate: string
  rows: WorkspaceListRow[]
  disabled?: boolean
}) {
  const [openRowId, setOpenRowId] = useState<string | null>(null)
  const pointerStartRef = useRef<{ rowId: string; x: number } | null>(null)
  const listStyle = {
    '--cia-list-columns': columnTemplate,
  } as CSSProperties

  return (
    <div className="creative-ia__collection-list" style={listStyle} role="list" aria-label={ariaLabel}>
      <div className="creative-ia__collection-list-header" aria-hidden="true">
        {columns.map((column) => (
          <span key={column.key}>{column.label}</span>
        ))}
        <span />
      </div>
      <div className="creative-ia__collection-list-body">
        {rows.map((row) => (
          <div
            key={row.id}
            className="creative-ia__collection-row"
            data-reveal-delete={openRowId === row.id}
            data-deletable={Boolean(row.onDelete)}
            role="listitem"
          >
            {row.onDelete && (
              <button
                className="creative-ia__collection-delete"
                type="button"
                disabled={disabled}
                onClick={() => {
                  setOpenRowId(null)
                  row.onDelete?.()
                }}
                aria-label={row.deleteLabel ?? '削除'}
              >
                削除
              </button>
            )}
            <button
              className="creative-ia__collection-row-main"
              type="button"
              data-active={row.active}
              aria-label={row.ariaLabel}
              onPointerDown={(event) => {
                if (!row.onDelete) return
                pointerStartRef.current = { rowId: row.id, x: event.clientX }
              }}
              onPointerUp={(event) => {
                const start = pointerStartRef.current
                pointerStartRef.current = null
                if (!row.onDelete || !start || start.rowId !== row.id) return

                const distance = event.clientX - start.x
                if (distance < -36) setOpenRowId(row.id)
                if (distance > 24) setOpenRowId(null)
              }}
              onClick={() => {
                if (openRowId === row.id) {
                  setOpenRowId(null)
                  return
                }
                row.onOpen()
              }}
            >
              {columns.map((column) => (
                <span
                  key={column.key}
                  className={`creative-ia__collection-cell creative-ia__collection-cell--${column.key}`}
                  data-label={column.label}
                >
                  {row.cells[column.key]}
                </span>
              ))}
              <span className="creative-ia__collection-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({
  tone,
  children,
}: {
  tone: 'saved' | 'editing' | 'error' | 'neutral'
  children: ReactNode
}) {
  return <span className="creative-ia__status-badge" data-tone={tone}>{children}</span>
}

function FormattedDate({ value }: { value: number }) {
  return (
    <time dateTime={new Date(value).toISOString()}>
      {new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(value)}
    </time>
  )
}

function CreateView({
  messages,
  composer,
  article,
  productionDestination,
  instagramContentType,
  usedReferences,
  isGenerating,
  error,
  persistenceError,
  messageEndRef,
  onComposerChange,
  onSubmit,
  onQuickPrompt,
  onOpenArtifact,
  onBackToChats,
}: {
  messages: Message[]
  composer: string
  article: CreativeIAGeneratedArticle | null
  productionDestination: CreativeIAProductionDestination | null
  instagramContentType: CreativeIAInstagramContentType
  usedReferences: CreativeIAGeneratedArticle['usedReferences']
  isGenerating: boolean
  error: string | null
  persistenceError: string | null
  messageEndRef: React.RefObject<HTMLDivElement | null>
  onComposerChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onQuickPrompt: (prompt: string) => void
  onOpenArtifact: (view: ArtifactView) => void
  onBackToChats: () => void
}) {
  const artifactCopy = getArtifactCopy(
    productionDestination,
    instagramContentType,
  )
  const activeQuickPrompts =
    productionDestination === null
      ? unsetDestinationQuickPrompts
      : productionDestination === 'instagram'
        ? instagramQuickPrompts
        : quickPrompts
  const composerPlaceholder =
    productionDestination === null
      ? '例：このサービスを紹介するコンテンツを作りたい'
      : productionDestination === 'instagram'
      ? `例：このサービスを紹介するInstagramの${instagramContentTypeLabels[instagramContentType]}投稿案を作りたい`
      : '例：このトリートメントを紹介する記事を書きたい'

  return (
    <section className="creative-ia__create" aria-label="作成">
      <div className="creative-ia__create-toolbar">
        <button
          className="creative-ia__back-to-chats"
          type="button"
          onClick={onBackToChats}
        >
          <span aria-hidden="true">←</span> Chat一覧に戻る
        </button>
        <div className="creative-ia__artifact-toggles">
          {article && (
            <button
              className="creative-ia__artifact-toggle"
              type="button"
              onClick={() => onOpenArtifact('article')}
            >
              {artifactCopy.openLabel}
            </button>
          )}
          <button
            className="creative-ia__artifact-toggle"
            type="button"
            onClick={() => onOpenArtifact('destination')}
          >
            制作先
          </button>
          <button
            className="creative-ia__artifact-toggle"
            type="button"
            onClick={() => onOpenArtifact('memo')}
          >
            制作メモ
          </button>
          <button
            className="creative-ia__artifact-toggle"
            type="button"
            onClick={() => onOpenArtifact('rules')}
          >
            適用ルール
          </button>
        </div>
      </div>

      {usedReferences.length > 0 && (
        <div className="creative-ia__active-references" aria-label="参照中のデータ">
          <span>参照中</span>
          <div>
            {usedReferences.map((reference) => (
              <span key={reference.id}>{reference.name}</span>
            ))}
          </div>
        </div>
      )}

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
                  {activeQuickPrompts.map((item) => (
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
              <p className="creative-ia__thinking">{artifactCopy.thinkingLabel}</p>
            </div>
          </div>
        )}
        <div ref={messageEndRef} />
      </div>

      <form className="creative-ia__composer" onSubmit={onSubmit}>
        {persistenceError && <p role="alert">{persistenceError}</p>}
        {error && <p role="alert">{error}</p>}
        <div>
          <label htmlFor="creative-ia-prompt">AIに相談する</label>
          <textarea
            id="creative-ia-prompt"
            value={composer}
            rows={2}
            maxLength={2000}
            placeholder={composerPlaceholder}
            onChange={(event) => onComposerChange(event.target.value)}
          />
          <button
            type="submit"
            disabled={!composer.trim() || isGenerating}
            aria-label="AIへ送信"
          >
            <PathIcon path="M5 12h14 M13 6l6 6-6 6" />
          </button>
        </div>
        <small>Enterは改行になります。右側の送信ボタンで送信します。</small>
      </form>
    </section>
  )
}

function ArtifactPanel({
  open,
  view,
  hasArticle,
  title,
  content,
  warnings,
  productionMemos,
  availableRules,
  appliedRuleIds,
  productionDestination,
  instagramContentType,
  isSaving,
  connection,
  saveError,
  savedDraft,
  instagramConnection,
  instagramPublication,
  isInstagramPublicationLoading,
  isInstagramImageUploading,
  isInstagramPublishing,
  instagramPublishError,
  onClose,
  onViewChange,
  onProductionDestinationChange,
  onInstagramContentTypeChange,
  onProductionMemosChange,
  onAppliedRuleIdsChange,
  onTitleChange,
  onContentChange,
  onSave,
  onInstagramImageUpload,
  onInstagramPublish,
  onOpenSettings,
}: {
  open: boolean
  view: ArtifactView
  hasArticle: boolean
  title: string
  content: string
  warnings: string[]
  productionMemos: ProductionMemo[]
  availableRules: ReferenceAIRule[]
  appliedRuleIds: string[]
  productionDestination: CreativeIAProductionDestination | null
  instagramContentType: CreativeIAInstagramContentType
  isSaving: boolean
  connection: CreativeIAWordPressStatus | null
  saveError: string | null
  savedDraft: CreativeIAWordPressDraft | null
  instagramConnection: CreativeIAInstagramStatus | null
  instagramPublication: CreativeIAInstagramPublication | null
  isInstagramPublicationLoading: boolean
  isInstagramImageUploading: boolean
  isInstagramPublishing: boolean
  instagramPublishError: string | null
  onClose: () => void
  onViewChange: (view: ArtifactView) => void
  onProductionDestinationChange: (
    destination: CreativeIAProductionDestination,
  ) => void
  onInstagramContentTypeChange: (
    contentType: CreativeIAInstagramContentType,
  ) => void
  onProductionMemosChange: (memos: ProductionMemo[]) => void
  onAppliedRuleIdsChange: (ruleIds: string[]) => void
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onSave: () => void
  onInstagramImageUpload: (image: File) => void
  onInstagramPublish: () => void
  onOpenSettings: () => void
}) {
  const artifactCopy = getArtifactCopy(
    productionDestination,
    instagramContentType,
  )

  return (
    <aside
      className="creative-ia__artifact"
      data-open={open}
      aria-label="制作パネル"
    >
      <div className="creative-ia__artifact-body">
        <button type="button" onClick={onClose} aria-label="パネルを閉じる">
          ×
        </button>
        <div className="creative-ia__artifact-tabs" role="tablist" aria-label="制作設定">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'destination'}
            onClick={() => onViewChange('destination')}
          >
            制作先
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'article'}
            disabled={!hasArticle}
            onClick={() => onViewChange('article')}
          >
            {artifactCopy.artifactLabel}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'memo'}
            onClick={() => onViewChange('memo')}
          >
            制作メモ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'rules'}
            onClick={() => onViewChange('rules')}
          >
            適用ルール
          </button>
        </div>

        {view === 'article' && hasArticle && (
          <>
            <label>
              <span>{artifactCopy.titleLabel}</span>
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
              <span>{artifactCopy.contentLabel}</span>
              <textarea
                value={content}
                maxLength={20000}
                onChange={(event) => onContentChange(event.target.value)}
              />
            </label>

            {productionDestination === 'instagram' &&
              instagramContentType === 'feed' && (
                <section className="creative-ia__instagram-media" aria-labelledby="instagram-media-title">
                  <header>
                    <div>
                      <h2 id="instagram-media-title">投稿画像</h2>
                      <p>フィードへ投稿するJPEG画像を1枚選択します。</p>
                    </div>
                  </header>
                  {isInstagramPublicationLoading ? (
                    <p className="creative-ia__instagram-media-status">画像を確認しています。</p>
                  ) : instagramPublication ? (
                    <figure>
                      <img
                        src={`${instagramPublication.imageUrl}?v=${instagramPublication.updatedAt}`}
                        alt="Instagramへ投稿する画像のプレビュー"
                      />
                      <figcaption>
                        {instagramPublication.status === 'published'
                          ? 'Instagramへ投稿済み'
                          : '投稿前プレビュー'}
                      </figcaption>
                    </figure>
                  ) : (
                    <p className="creative-ia__instagram-media-status">
                      画像はまだ選択されていません。
                    </p>
                  )}
                  {instagramPublication?.status !== 'published' && (
                    <label className="creative-ia__instagram-file-picker">
                      <span>
                        {isInstagramImageUploading
                          ? 'アップロード中'
                          : instagramPublication
                            ? '画像を変更'
                            : 'JPEG画像を選択'}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,.jpg,.jpeg"
                        disabled={isInstagramImageUploading || isInstagramPublishing}
                        onChange={(event) => {
                          const image = event.target.files?.[0]
                          if (image) onInstagramImageUpload(image)
                          event.target.value = ''
                        }}
                      />
                    </label>
                  )}
                  <small>8MB以下のJPEG画像に対応しています。</small>
                </section>
              )}
          </>
        )}

        {view === 'destination' && (
          <ProductionDestinationEditor
            destination={productionDestination}
            instagramContentType={instagramContentType}
            onDestinationChange={onProductionDestinationChange}
            onInstagramContentTypeChange={onInstagramContentTypeChange}
          />
        )}

        {view === 'memo' && (
          <ProductionMemoEditor
            memos={productionMemos}
            onChange={onProductionMemosChange}
          />
        )}

        {view === 'rules' && (
          <AppliedRulesEditor
            rules={availableRules}
            appliedRuleIds={appliedRuleIds}
            onChange={onAppliedRuleIdsChange}
          />
        )}
      </div>

      {view === 'article' && hasArticle && productionDestination === 'wordpress' && (
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
      )}

      {view === 'article' &&
        hasArticle &&
        productionDestination === 'instagram' &&
        instagramContentType === 'feed' && (
          <footer>
            {instagramPublishError && <p role="alert">{instagramPublishError}</p>}
            {instagramPublication?.status === 'published' && (
              <p className="creative-ia__save-success" role="status">
                Instagramへ投稿しました。
                {instagramPublication.accountUrl && (
                  <a
                    href={instagramPublication.accountUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Instagramで確認
                  </a>
                )}
              </p>
            )}
            {!instagramConnection?.connected ? (
              <button type="button" onClick={onOpenSettings}>
                Instagramを接続
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  isInstagramPublishing ||
                  isInstagramImageUploading ||
                  !content.trim() ||
                  !instagramPublication ||
                  instagramPublication.status === 'published'
                }
                onClick={onInstagramPublish}
              >
                {isInstagramPublishing
                  ? 'Instagramへ投稿中'
                  : instagramPublication?.status === 'published'
                    ? 'Instagramへ投稿済み'
                    : 'Instagramへ投稿'}
              </button>
            )}
            <small>確認なしに自動公開することはありません。</small>
          </footer>
        )}
    </aside>
  )
}

function ProductionDestinationEditor({
  destination,
  instagramContentType,
  onDestinationChange,
  onInstagramContentTypeChange,
}: {
  destination: CreativeIAProductionDestination | null
  instagramContentType: CreativeIAInstagramContentType
  onDestinationChange: (destination: CreativeIAProductionDestination) => void
  onInstagramContentTypeChange: (
    contentType: CreativeIAInstagramContentType,
  ) => void
}) {
  const instagramFormats: Array<{
    value: CreativeIAInstagramContentType
    label: string
  }> = [
    { value: 'feed', label: 'フィード' },
    { value: 'stories', label: 'ストーリーズ' },
    { value: 'reels', label: 'Reels' },
  ]

  return (
    <section
      className="creative-ia__artifact-section"
      aria-labelledby="production-destination-title"
    >
      <header>
        <div>
          <h2 id="production-destination-title">制作先</h2>
          <p>このChatで作成するコンテンツの種類を選びます。</p>
        </div>
      </header>

      {destination === null && (
        <p className="creative-ia__destination-notice" role="status">
          制作先は未設定です。制作を依頼すると、Creative IAが確認します。
        </p>
      )}

      <div className="creative-ia__destination-list">
        <label className="creative-ia__destination-option">
          <input
            type="radio"
            name="production-destination"
            value="wordpress"
            checked={destination === 'wordpress'}
            onChange={() => onDestinationChange('wordpress')}
          />
          <span>
            <strong>WordPress記事</strong>
            <small>記事案を作成し、WordPressへ下書き保存します。</small>
          </span>
        </label>

        <label className="creative-ia__destination-option">
          <input
            type="radio"
            name="production-destination"
            value="instagram"
            checked={destination === 'instagram'}
            onChange={() => onDestinationChange('instagram')}
          />
          <span>
            <strong>Instagram</strong>
            <small>Instagram向けの投稿案を作成します。</small>
          </span>
        </label>
      </div>

      {destination === 'instagram' && (
        <fieldset className="creative-ia__destination-formats">
          <legend>投稿形式</legend>
          <div>
            {instagramFormats.map((format) => (
              <label key={format.value}>
                <input
                  type="radio"
                  name="instagram-content-type"
                  value={format.value}
                  checked={instagramContentType === format.value}
                  onChange={() =>
                    onInstagramContentTypeChange(format.value)
                  }
                />
                <span>{format.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </section>
  )
}

function ProductionMemoEditor({
  memos,
  onChange,
}: {
  memos: ProductionMemo[]
  onChange: (memos: ProductionMemo[]) => void
}) {
  const updateMemo = (
    memoId: string,
    field: 'label' | 'value',
    value: string,
  ) => {
    onChange(
      memos.map((memo) =>
        memo.id === memoId ? { ...memo, [field]: value } : memo,
      ),
    )
  }

  return (
    <section className="creative-ia__artifact-section" aria-labelledby="production-memo-title">
      <header>
        <div>
          <h2 id="production-memo-title">制作メモ</h2>
          <p>今回の制作だけで使う情報や要望を記録します。</p>
        </div>
      </header>

      {memos.length === 0 ? (
        <div className="creative-ia__artifact-empty">
          <p>まだ制作メモはありません。</p>
          <small>想定読者や掲載したい情報など、必要な項目を自由に追加できます。</small>
        </div>
      ) : (
        <div className="creative-ia__memo-list">
          {memos.map((memo, index) => (
            <div className="creative-ia__memo-row" key={memo.id}>
              <label>
                <span className="creative-ia__visually-hidden">項目名</span>
                <input
                  value={memo.label}
                  maxLength={80}
                  placeholder="項目名"
                  aria-label={`制作メモ${index + 1}の項目名`}
                  onChange={(event) => updateMemo(memo.id, 'label', event.target.value)}
                />
              </label>
              <label>
                <span className="creative-ia__visually-hidden">内容</span>
                <textarea
                  value={memo.value}
                  maxLength={2000}
                  rows={2}
                  placeholder="内容"
                  aria-label={`制作メモ${index + 1}の内容`}
                  onChange={(event) => updateMemo(memo.id, 'value', event.target.value)}
                />
              </label>
              <button
                type="button"
                aria-label={`制作メモ${index + 1}を削除`}
                onClick={() => onChange(memos.filter((item) => item.id !== memo.id))}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        className="creative-ia__add-item"
        type="button"
        onClick={() =>
          onChange([
            ...memos,
            { id: crypto.randomUUID(), label: '', value: '' },
          ])
        }
      >
        ＋ 項目を追加
      </button>
    </section>
  )
}

function AppliedRulesEditor({
  rules,
  appliedRuleIds,
  onChange,
}: {
  rules: ReferenceAIRule[]
  appliedRuleIds: string[]
  onChange: (ruleIds: string[]) => void
}) {
  return (
    <section className="creative-ia__artifact-section" aria-labelledby="applied-rules-title">
      <header>
        <div>
          <h2 id="applied-rules-title">適用ルール</h2>
          <p>参照データの「02 AIルール」から、今回の制作で使うルールを選びます。</p>
        </div>
      </header>

      {rules.length === 0 ? (
        <div className="creative-ia__artifact-empty">
          <p>選択できるAIルールはまだありません。</p>
          <small>参照データ機能の実装後、登録したルールがここに表示されます。</small>
        </div>
      ) : (
        <div className="creative-ia__rule-list">
          {rules.map((rule) => {
            const checked = appliedRuleIds.includes(rule.id)
            return (
              <label key={rule.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? appliedRuleIds.filter((id) => id !== rule.id)
                        : [...appliedRuleIds, rule.id],
                    )
                  }
                />
                <span>
                  <strong>{rule.label}</strong>
                  {rule.description && <small>{rule.description}</small>}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ContentView({
  chats,
  wordpressDestination,
  onOpen,
}: {
  chats: ChatSession[]
  wordpressDestination: string
  onOpen: (chatId: string) => void
}) {
  const contentChats = useMemo(
    () =>
      chats
        .filter((chat) => chat.article !== null)
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [chats],
  )

  return (
    <section className="creative-ia__page" aria-labelledby="content-title">
      <header className="creative-ia__section-header">
        <div>
          <p>Content</p>
          <h1 id="content-title">下書き</h1>
          <span>作成した記事案・投稿案と、その保存状態を確認できます。</span>
        </div>
      </header>
      {contentChats.length > 0 ? (
        <WorkspaceList
          ariaLabel="下書き一覧"
          columns={[
            { key: 'title', label: 'タイトル' },
            { key: 'destination', label: '投稿先' },
            { key: 'updated', label: '最終更新' },
            { key: 'status', label: '状態' },
            { key: 'error', label: 'エラー' },
          ]}
          columnTemplate="minmax(260px, 1.55fr) minmax(140px, .8fr) 132px 108px 84px"
          rows={contentChats.map((chat) => {
            const artifactCopy = getArtifactCopy(
              chat.productionDestination,
              chat.instagramContentType,
            )
            const isInstagram = chat.productionDestination === 'instagram'

            return {
              id: chat.id,
              ariaLabel: `「${chat.draftTitle || chat.title}」を開く`,
              cells: {
                title: (
                  <span className="creative-ia__collection-primary">
                    <strong>{chat.draftTitle || 'タイトル未入力'}</strong>
                    <small>{chat.title}</small>
                  </span>
                ),
                destination: isInstagram
                  ? artifactCopy.destinationLabel
                  : wordpressDestination,
                updated: <FormattedDate value={chat.updatedAt} />,
                status: isInstagram ? (
                  <StatusBadge tone="editing">投稿案</StatusBadge>
                ) : (
                  <StatusBadge tone={chat.savedDraft ? 'saved' : 'editing'}>
                    {chat.savedDraft ? '保存済み' : '未保存'}
                  </StatusBadge>
                ),
                error: <span className="creative-ia__no-error">なし</span>,
              },
              onOpen: () => onOpen(chat.id),
            }
          })}
        />
      ) : (
        <div className="creative-ia__empty-state">
          <span aria-hidden="true">✦</span>
          <h2>まだ下書きはありません</h2>
          <p>「作成」でAIへ話しかけると、作成中のコンテンツがここに表示されます。</p>
        </div>
      )}
    </section>
  )
}

function ReferencesView() {
  const [view, setView] = useState<
    | 'overview'
    | 'products'
    | 'create'
    | 'detail'
    | 'edit'
    | 'services'
    | 'service-create'
    | 'service-detail'
    | 'service-edit'
    | 'organizations'
    | 'organization-create'
    | 'organization-detail'
    | 'organization-edit'
    | 'contacts'
    | 'contact-create'
    | 'contact-detail'
    | 'contact-edit'
  >('overview')
  const [activeReferenceTab, setActiveReferenceTab] = useState<
    'materials' | 'rules'
  >('materials')
  const [products, setProducts] = useState<CreativeIAReferenceProduct[]>([])
  const [services, setServices] = useState<CreativeIAReferenceService[]>([])
  const [organizations, setOrganizations] = useState<CreativeIAReferenceOrganization[]>([])
  const [contacts, setContacts] = useState<CreativeIAReferenceContact[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isServicesLoading, setIsServicesLoading] = useState(true)
  const [isOrganizationsLoading, setIsOrganizationsLoading] = useState(true)
  const [isContactsLoading, setIsContactsLoading] = useState(true)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false)
  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  )
  const selectedService = services.find(
    (service) => service.id === selectedServiceId,
  )
  const selectedOrganization = organizations.find(
    (organization) => organization.id === selectedOrganizationId,
  )
  const selectedContact = contacts.find(
    (contact) => contact.id === selectedContactId,
  )

  useEffect(() => {
    let active = true
    void getCreativeIAReferenceProducts()
      .then((result) => {
        if (!active) return
        setProducts(result.products)
        setError(null)
      })
      .catch((requestError) => {
        if (!active) return
        setError(
          requestError instanceof Error && requestError.message === 'AUTH_REQUIRED'
            ? 'Hundredへサインインし直してください。'
            : '商品一覧を読み込めませんでした。',
        )
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.all([
      getCreativeIAReferenceOrganizations(),
      getCreativeIAReferenceContacts(),
    ])
      .then(([organizationResult, contactResult]) => {
        if (!active) return
        setOrganizations(organizationResult.organizations)
        setContacts(contactResult.contacts)
      })
      .catch((requestError) => {
        if (!active) return
        setError(
          requestError instanceof Error && requestError.message === 'AUTH_REQUIRED'
            ? 'Hundredへサインインし直してください。'
            : '会社・店舗と担当者を読み込めませんでした。',
        )
      })
      .finally(() => {
        if (!active) return
        setIsOrganizationsLoading(false)
        setIsContactsLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void getCreativeIAReferenceServices()
      .then((result) => {
        if (!active) return
        setServices(result.services)
      })
      .catch((requestError) => {
        if (!active) return
        setError(
          requestError instanceof Error && requestError.message === 'AUTH_REQUIRED'
            ? 'Hundredへサインインし直してください。'
            : 'サービス一覧を読み込めませんでした。',
        )
      })
      .finally(() => {
        if (active) setIsServicesLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const openProduct = (productId: string) => {
    setSelectedProductId(productId)
    setIsDeleteConfirming(false)
    setError(null)
    setView('detail')
  }

  const handleSaveProduct = async (input: CreativeIAReferenceProductInput) => {
    if (isPending) return
    setIsPending(true)
    setError(null)

    try {
      const product =
        view === 'edit' && selectedProduct
          ? await updateCreativeIAReferenceProduct(selectedProduct.id, input)
          : await createCreativeIAReferenceProduct(input)
      setProducts((current) => {
        const others = current.filter((item) => item.id !== product.id)
        return [product, ...others]
      })
      setSelectedProductId(product.id)
      setView('detail')
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してください。'
          : requestError instanceof Error &&
              requestError.message === 'INVALID_INPUT'
            ? '入力内容を確認してください。'
            : '商品を保存できませんでした。',
      )
    } finally {
      setIsPending(false)
    }
  }

  const handleDeleteProduct = async () => {
    if (!selectedProduct || isPending) return
    setIsPending(true)
    setError(null)

    try {
      await deleteCreativeIAReferenceProduct(selectedProduct.id)
      setProducts((current) =>
        current.filter((product) => product.id !== selectedProduct.id),
      )
      setSelectedProductId(null)
      setIsDeleteConfirming(false)
      setView('products')
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してください。'
          : '商品を削除できませんでした。',
      )
    } finally {
      setIsPending(false)
    }
  }

  const openService = (serviceId: string) => {
    setSelectedServiceId(serviceId)
    setIsDeleteConfirming(false)
    setError(null)
    setView('service-detail')
  }

  const handleSaveService = async (input: CreativeIAReferenceServiceInput) => {
    if (isPending) return
    setIsPending(true)
    setError(null)
    try {
      const service =
        view === 'service-edit' && selectedService
          ? await updateCreativeIAReferenceService(selectedService.id, input)
          : await createCreativeIAReferenceService(input)
      setServices((current) => [
        service,
        ...current.filter((item) => item.id !== service.id),
      ])
      setSelectedServiceId(service.id)
      setView('service-detail')
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してください。'
          : requestError instanceof Error && requestError.message === 'INVALID_INPUT'
            ? '入力内容を確認してください。'
            : 'サービスを保存できませんでした。',
      )
    } finally {
      setIsPending(false)
    }
  }

  const handleDeleteService = async () => {
    if (!selectedService || isPending) return
    setIsPending(true)
    setError(null)
    try {
      await deleteCreativeIAReferenceService(selectedService.id)
      setServices((current) =>
        current.filter((service) => service.id !== selectedService.id),
      )
      setSelectedServiceId(null)
      setIsDeleteConfirming(false)
      setView('services')
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message === 'AUTH_REQUIRED'
          ? 'Hundredへサインインし直してください。'
          : 'サービスを削除できませんでした。',
      )
    } finally {
      setIsPending(false)
    }
  }

  const openOrganization = (id: string) => {
    setSelectedOrganizationId(id); setIsDeleteConfirming(false); setError(null); setView('organization-detail')
  }
  const handleSaveOrganization = async (input: CreativeIAReferenceOrganizationInput) => {
    if (isPending) return
    setIsPending(true); setError(null)
    try {
      const organization = view === 'organization-edit' && selectedOrganization
        ? await updateCreativeIAReferenceOrganization(selectedOrganization.id, input)
        : await createCreativeIAReferenceOrganization(input)
      setOrganizations((current) => [organization, ...current.filter((item) => item.id !== organization.id)])
      setContacts((current) => current.map((contact) =>
        contact.organizationId === organization.id
          ? { ...contact, organizationName: organization.name }
          : contact,
      ))
      setSelectedOrganizationId(organization.id); setView('organization-detail')
    } catch (requestError) {
      setError(requestError instanceof Error && requestError.message === 'INVALID_INPUT'
        ? '種別と所属会社を含む入力内容を確認してください。'
        : '会社・店舗を保存できませんでした。')
    } finally { setIsPending(false) }
  }
  const handleDeleteOrganization = async () => {
    if (!selectedOrganization || isPending) return
    setIsPending(true); setError(null)
    try {
      await deleteCreativeIAReferenceOrganization(selectedOrganization.id)
      setOrganizations((current) => current.filter((item) => item.id !== selectedOrganization.id))
      setSelectedOrganizationId(null); setIsDeleteConfirming(false); setView('organizations')
    } catch (requestError) {
      setError(requestError instanceof Error && requestError.message === 'CONFLICT'
        ? '紐づく店舗または担当者を削除・変更してから削除してください。'
        : '会社・店舗を削除できませんでした。')
    } finally { setIsPending(false) }
  }

  const openContact = (id: string) => {
    setSelectedContactId(id); setIsDeleteConfirming(false); setError(null); setView('contact-detail')
  }
  const handleSaveContact = async (input: CreativeIAReferenceContactInput) => {
    if (isPending) return
    setIsPending(true); setError(null)
    try {
      const contact = view === 'contact-edit' && selectedContact
        ? await updateCreativeIAReferenceContact(selectedContact.id, input)
        : await createCreativeIAReferenceContact(input)
      setContacts((current) => [contact, ...current.filter((item) => item.id !== contact.id)])
      setSelectedContactId(contact.id); setView('contact-detail')
    } catch {
      setError('担当者を保存できませんでした。所属先を確認してください。')
    } finally { setIsPending(false) }
  }
  const handleDeleteContact = async () => {
    if (!selectedContact || isPending) return
    setIsPending(true); setError(null)
    try {
      await deleteCreativeIAReferenceContact(selectedContact.id)
      setContacts((current) => current.filter((item) => item.id !== selectedContact.id))
      setSelectedContactId(null); setIsDeleteConfirming(false); setView('contacts')
    } catch { setError('担当者を削除できませんでした。') }
    finally { setIsPending(false) }
  }

  if (view === 'products') {
    return (
      <ReferenceProductList
        products={products}
        isLoading={isLoading}
        error={error}
        onBack={() => setView('overview')}
        onCreate={() => {
          setSelectedProductId(null)
          setError(null)
          setView('create')
        }}
        onOpen={openProduct}
      />
    )
  }

  if (view === 'create' || view === 'edit') {
    return (
      <ProductEditor
        key={view === 'edit' ? selectedProduct?.id : 'new-product'}
        product={view === 'edit' ? selectedProduct : undefined}
        isPending={isPending}
        error={error}
        onCancel={() => setView(selectedProduct ? 'detail' : 'products')}
        onSave={(input) => void handleSaveProduct(input)}
      />
    )
  }

  if (view === 'detail' && selectedProduct) {
    return (
      <ProductDetail
        product={selectedProduct}
        isPending={isPending}
        isDeleteConfirming={isDeleteConfirming}
        error={error}
        onBack={() => setView('products')}
        onEdit={() => {
          setError(null)
          setView('edit')
        }}
        onDeleteRequest={() => setIsDeleteConfirming(true)}
        onDeleteCancel={() => setIsDeleteConfirming(false)}
        onDelete={() => void handleDeleteProduct()}
      />
    )
  }

  if (view === 'services') {
    return (
      <ReferenceServiceList
        services={services}
        isLoading={isServicesLoading}
        error={error}
        onBack={() => setView('overview')}
        onCreate={() => {
          setSelectedServiceId(null)
          setError(null)
          setView('service-create')
        }}
        onOpen={openService}
      />
    )
  }

  if (view === 'service-create' || view === 'service-edit') {
    return (
      <ServiceEditor
        key={view === 'service-edit' ? selectedService?.id : 'new-service'}
        service={view === 'service-edit' ? selectedService : undefined}
        isPending={isPending}
        error={error}
        onCancel={() =>
          setView(selectedService ? 'service-detail' : 'services')
        }
        onSave={(input) => void handleSaveService(input)}
      />
    )
  }

  if (view === 'service-detail' && selectedService) {
    return (
      <ServiceDetail
        service={selectedService}
        isPending={isPending}
        isDeleteConfirming={isDeleteConfirming}
        error={error}
        onBack={() => setView('services')}
        onEdit={() => {
          setError(null)
          setView('service-edit')
        }}
        onDeleteRequest={() => setIsDeleteConfirming(true)}
        onDeleteCancel={() => setIsDeleteConfirming(false)}
        onDelete={() => void handleDeleteService()}
      />
    )
  }

  if (view === 'organizations') return <ReferenceOrganizationList organizations={organizations} isLoading={isOrganizationsLoading} error={error} onBack={() => setView('overview')} onCreate={() => { setSelectedOrganizationId(null); setError(null); setView('organization-create') }} onOpen={openOrganization} />
  if (view === 'organization-create' || view === 'organization-edit') return <OrganizationEditor key={view === 'organization-edit' ? selectedOrganization?.id : 'new-organization'} organization={view === 'organization-edit' ? selectedOrganization : undefined} organizations={organizations} isPending={isPending} error={error} onCancel={() => setView(selectedOrganization ? 'organization-detail' : 'organizations')} onSave={(input) => void handleSaveOrganization(input)} />
  if (view === 'organization-detail' && selectedOrganization) return <OrganizationDetail organization={selectedOrganization} contacts={contacts.filter((contact) => contact.organizationId === selectedOrganization.id)} stores={organizations.filter((item) => item.parentCompanyId === selectedOrganization.id)} isPending={isPending} isDeleteConfirming={isDeleteConfirming} error={error} onBack={() => setView('organizations')} onEdit={() => { setError(null); setView('organization-edit') }} onDeleteRequest={() => setIsDeleteConfirming(true)} onDeleteCancel={() => setIsDeleteConfirming(false)} onDelete={() => void handleDeleteOrganization()} />

  if (view === 'contacts') return <ReferenceContactList contacts={contacts} isLoading={isContactsLoading} error={error} onBack={() => setView('overview')} onCreate={() => { setSelectedContactId(null); setError(null); setView('contact-create') }} onOpen={openContact} />
  if (view === 'contact-create' || view === 'contact-edit') return <ContactEditor key={view === 'contact-edit' ? selectedContact?.id : 'new-contact'} contact={view === 'contact-edit' ? selectedContact : undefined} organizations={organizations} isPending={isPending} error={error} onCancel={() => setView(selectedContact ? 'contact-detail' : 'contacts')} onSave={(input) => void handleSaveContact(input)} />
  if (view === 'contact-detail' && selectedContact) return <ContactDetail contact={selectedContact} isPending={isPending} isDeleteConfirming={isDeleteConfirming} error={error} onBack={() => setView('contacts')} onEdit={() => { setError(null); setView('contact-edit') }} onDeleteRequest={() => setIsDeleteConfirming(true)} onDeleteCancel={() => setIsDeleteConfirming(false)} onDelete={() => void handleDeleteContact()} />

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
      <div className="creative-ia__reference-tabs" role="tablist" aria-label="参照データの種類">
        <button
          id="reference-materials-tab"
          type="button"
          role="tab"
          aria-selected={activeReferenceTab === 'materials'}
          aria-controls="reference-materials-panel"
          onClick={() => setActiveReferenceTab('materials')}
        >
          コンテンツ素材
        </button>
        <button
          id="reference-rules-tab"
          type="button"
          role="tab"
          aria-selected={activeReferenceTab === 'rules'}
          aria-controls="reference-rules-panel"
          onClick={() => setActiveReferenceTab('rules')}
        >
          AIルール
        </button>
      </div>
      <div className="creative-ia__reference-panel">
        {activeReferenceTab === 'materials' ? (
          <ul
            id="reference-materials-panel"
            role="tabpanel"
            aria-labelledby="reference-materials-tab"
            className="creative-ia__reference-list"
          >
            <li>
              <button type="button" onClick={() => setView('products')}>
                <span>商品</span>
                <small>{products.length}件</small>
                <span aria-hidden="true">→</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setView('services')}>
                <span>サービス</span>
                <small>{services.length}件</small>
                <span aria-hidden="true">→</span>
              </button>
            </li>
            <li><span>写真</span><small>準備中</small></li>
            <li>
              <button type="button" onClick={() => setView('organizations')}>
                <span>会社・店舗</span><small>{organizations.length}件</small><span aria-hidden="true">→</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setView('contacts')}>
                <span>担当者</span><small>{contacts.length}件</small><span aria-hidden="true">→</span>
              </button>
            </li>
          </ul>
        ) : (
          <ul
            id="reference-rules-panel"
            role="tabpanel"
            aria-labelledby="reference-rules-tab"
            className="creative-ia__reference-list"
          >
            <li><span>想定読者</span><small>準備中</small></li>
            <li><span>表記ルール</span><small>準備中</small></li>
            <li><span>使用可能な事実</span><small>準備中</small></li>
            <li><span>禁止表現</span><small>準備中</small></li>
            <li><span>AIへの送信ルール</span><small>準備中</small></li>
          </ul>
        )}
      </div>
    </section>
  )
}

function ReferenceProductList({
  products,
  isLoading,
  error,
  onBack,
  onCreate,
  onOpen,
}: {
  products: CreativeIAReferenceProduct[]
  isLoading: boolean
  error: string | null
  onBack: () => void
  onCreate: () => void
  onOpen: (productId: string) => void
}) {
  return (
    <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="products-title">
      <button className="creative-ia__page-back" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> 参照データ
      </button>
      <header className="creative-ia__collection-header">
        <div>
          <p>References</p>
          <h1 id="products-title">商品</h1>
          <span>記事やSNSコンテンツで再利用する商品情報を管理します。</span>
        </div>
        <button type="button" onClick={onCreate}>＋ 商品を登録</button>
      </header>
      <div className="creative-ia__collection-meta">
        <span>{products.length}件</span>
        {products.length > 0 && <small>更新日時が新しい順に表示しています。</small>}
      </div>

      {error && <p className="creative-ia__chat-error" role="alert">{error}</p>}
      {isLoading ? (
        <div className="creative-ia__empty-state"><p>商品を読み込んでいます。</p></div>
      ) : products.length === 0 ? (
        <div className="creative-ia__empty-state">
          <span aria-hidden="true">✦</span>
          <h2>最初の商品を登録しましょう</h2>
          <p>商品名だけでも登録できます。必要な情報はあとから追加できます。</p>
          <button type="button" onClick={onCreate}>商品を登録</button>
        </div>
      ) : (
        <WorkspaceList
          ariaLabel="商品一覧"
          columns={[
            { key: 'name', label: '商品名' },
            { key: 'category', label: 'カテゴリ' },
            { key: 'source', label: '情報元URL' },
            { key: 'updated', label: '最終更新' },
            { key: 'ai', label: 'AI利用' },
          ]}
          columnTemplate="minmax(240px, 1.45fr) minmax(140px, .8fr) minmax(200px, 1.15fr) 132px 90px"
          rows={products.map((product) => ({
            id: product.id,
            ariaLabel: `「${product.name}」の詳細を開く`,
            cells: {
              name: (
                <span className="creative-ia__collection-primary">
                  <strong>{product.name}</strong>
                  <small>{product.description || '説明未入力'}</small>
                </span>
              ),
              category: product.category || '—',
              source: formatSourceUrl(product.sourceUrl),
              updated: <FormattedDate value={product.updatedAt} />,
              ai: (
                <StatusBadge tone={product.aiEnabled ? 'saved' : 'neutral'}>
                  {product.aiEnabled ? '利用する' : '利用しない'}
                </StatusBadge>
              ),
            },
            onOpen: () => onOpen(product.id),
          }))}
        />
      )}
    </section>
  )
}

function ReferenceServiceList({
  services, isLoading, error, onBack, onCreate, onOpen,
}: {
  services: CreativeIAReferenceService[]
  isLoading: boolean
  error: string | null
  onBack: () => void
  onCreate: () => void
  onOpen: (serviceId: string) => void
}) {
  return (
    <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="services-title">
      <button className="creative-ia__page-back" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> 参照データ
      </button>
      <header className="creative-ia__collection-header">
        <div>
          <p>References</p>
          <h1 id="services-title">サービス</h1>
          <span>記事やSNSコンテンツで再利用するサービス情報を管理します。</span>
        </div>
        <button type="button" onClick={onCreate}>＋ サービスを登録</button>
      </header>
      <div className="creative-ia__collection-meta">
        <span>{services.length}件</span>
        {services.length > 0 && <small>更新日時が新しい順に表示しています。</small>}
      </div>
      {error && <p className="creative-ia__chat-error" role="alert">{error}</p>}
      {isLoading ? (
        <div className="creative-ia__empty-state"><p>サービスを読み込んでいます。</p></div>
      ) : services.length === 0 ? (
        <div className="creative-ia__empty-state">
          <span aria-hidden="true">✦</span>
          <h2>最初のサービスを登録しましょう</h2>
          <p>サービス名だけでも登録できます。必要な情報はあとから追加できます。</p>
          <button type="button" onClick={onCreate}>サービスを登録</button>
        </div>
      ) : (
        <WorkspaceList
          ariaLabel="サービス一覧"
          columns={[
            { key: 'name', label: 'サービス名' },
            { key: 'category', label: 'カテゴリ' },
            { key: 'source', label: '情報元URL' },
            { key: 'updated', label: '最終更新' },
            { key: 'ai', label: 'AI利用' },
          ]}
          columnTemplate="minmax(240px, 1.45fr) minmax(140px, .8fr) minmax(200px, 1.15fr) 132px 90px"
          rows={services.map((service) => ({
            id: service.id,
            ariaLabel: `「${service.name}」の詳細を開く`,
            cells: {
              name: (
                <span className="creative-ia__collection-primary">
                  <strong>{service.name}</strong>
                  <small>{service.description || '説明未入力'}</small>
                </span>
              ),
              category: service.category || '—',
              source: service.sourceUrl ? (
                <a
                  href={service.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  {formatSourceUrl(service.sourceUrl)} ↗
                </a>
              ) : '—',
              updated: <FormattedDate value={service.updatedAt} />,
              ai: (
                <StatusBadge tone={service.aiEnabled ? 'saved' : 'neutral'}>
                  {service.aiEnabled ? '利用する' : '利用しない'}
                </StatusBadge>
              ),
            },
            onOpen: () => onOpen(service.id),
          }))}
        />
      )}
    </section>
  )
}

function ServiceDetail({
  service, isPending, isDeleteConfirming, error, onBack, onEdit,
  onDeleteRequest, onDeleteCancel, onDelete,
}: {
  service: CreativeIAReferenceService
  isPending: boolean
  isDeleteConfirming: boolean
  error: string | null
  onBack: () => void
  onEdit: () => void
  onDeleteRequest: () => void
  onDeleteCancel: () => void
  onDelete: () => void
}) {
  const fields = [
    ['カテゴリ', service.category], ['価格', service.price],
    ['所要時間', service.duration], ['サービス説明', service.description],
    ['特徴', service.features], ['対象', service.target],
    ['提供内容・流れ', service.process], ['注意事項', service.cautions],
    ['AIへ渡す補足情報', service.aiNotes],
  ].filter(([, value]) => value)

  return (
    <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="service-detail-title">
      <button className="creative-ia__page-back" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> サービス一覧
      </button>
      <header className="creative-ia__reference-detail-header">
        <div>
          <p>Service</p>
          <h1 id="service-detail-title">{service.name}</h1>
          <span>サービス情報の確認と、AIで利用する内容を管理します。</span>
        </div>
        <div>
          <button type="button" onClick={onEdit}>編集</button>
          <button type="button" data-danger="true" onClick={onDeleteRequest}>削除</button>
        </div>
      </header>
      {error && <p className="creative-ia__chat-error" role="alert">{error}</p>}
      {isDeleteConfirming && (
        <div className="creative-ia__delete-confirm" role="alert">
          <span>このサービスを削除します。元に戻すことはできません。</span>
          <div>
            <button type="button" onClick={onDeleteCancel} disabled={isPending}>キャンセル</button>
            <button type="button" onClick={onDelete} disabled={isPending}>
              {isPending ? '削除中' : '削除する'}
            </button>
          </div>
        </div>
      )}
      <div className="creative-ia__reference-detail-grid">
        <section>
          <span>AI利用</span>
          <StatusBadge tone={service.aiEnabled ? 'saved' : 'neutral'}>
            {service.aiEnabled ? '利用する' : '利用しない'}
          </StatusBadge>
        </section>
        <section><span>最終更新</span><FormattedDate value={service.updatedAt} /></section>
        {service.sourceUrl && (
          <section>
            <span>情報元URL</span>
            <a href={service.sourceUrl} target="_blank" rel="noreferrer">
              {formatSourceUrl(service.sourceUrl)} ↗
            </a>
          </section>
        )}
      </div>
      <dl className="creative-ia__reference-fields">
        {fields.length > 0 ? fields.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        )) : (
          <div><dt>サービス情報</dt><dd>詳細情報はまだ登録されていません。</dd></div>
        )}
      </dl>
    </section>
  )
}

function ServiceEditor({ service, isPending, error, onCancel, onSave }: {
  service?: CreativeIAReferenceService
  isPending: boolean
  error: string | null
  onCancel: () => void
  onSave: (input: CreativeIAReferenceServiceInput) => void
}) {
  const [form, setForm] = useState<CreativeIAReferenceServiceInput>(() => ({
    name: service?.name ?? '', category: service?.category ?? '',
    sourceUrl: service?.sourceUrl ?? null, description: service?.description ?? '',
    features: service?.features ?? '', price: service?.price ?? '',
    duration: service?.duration ?? '', target: service?.target ?? '',
    process: service?.process ?? '', cautions: service?.cautions ?? '',
    aiNotes: service?.aiNotes ?? '', aiEnabled: service?.aiEnabled ?? true,
  }))
  const updateField = <Key extends keyof CreativeIAReferenceServiceInput>(
    key: Key, value: CreativeIAReferenceServiceInput[Key],
  ) => setForm((current) => ({ ...current, [key]: value }))

  return (
    <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="service-editor-title">
      <button className="creative-ia__page-back" type="button" onClick={onCancel}>
        <span aria-hidden="true">←</span> {service ? 'サービス詳細' : 'サービス一覧'}
      </button>
      <header className="creative-ia__section-header">
        <div>
          <p>Service</p>
          <h1 id="service-editor-title">{service ? 'サービスを編集' : 'サービスを登録'}</h1>
          <span>サービス名だけで保存できます。必要な情報はあとから追加できます。</span>
        </div>
      </header>
      <form className="creative-ia__reference-form" onSubmit={(event) => {
        event.preventDefault()
        onSave({ ...form, sourceUrl: form.sourceUrl || null })
      }}>
        {error && <p className="creative-ia__chat-error" role="alert">{error}</p>}
        <div className="creative-ia__reference-form-grid">
          <label>
            <span>サービス名 <small>必須</small></span>
            <input value={form.name} maxLength={200} required onChange={(event) => updateField('name', event.target.value)} />
          </label>
          <label>
            <span>カテゴリ</span>
            <input value={form.category} maxLength={200} placeholder="例：コンサルティング" onChange={(event) => updateField('category', event.target.value)} />
          </label>
          <label className="creative-ia__reference-form-wide">
            <span>サービスURL</span>
            <input type="url" value={form.sourceUrl ?? ''} maxLength={2000} placeholder="https://example.com/service" onChange={(event) => updateField('sourceUrl', event.target.value)} />
            <small>URLからのサービス情報取得は今後対応予定です。</small>
          </label>
          <label className="creative-ia__reference-form-wide">
            <span>サービス説明</span>
            <textarea value={form.description} rows={4} maxLength={10000} onChange={(event) => updateField('description', event.target.value)} />
          </label>
        </div>
        <details className="creative-ia__reference-form-details">
          <summary>詳細情報を追加</summary>
          <div className="creative-ia__reference-form-grid">
            <label><span>価格</span><input value={form.price} maxLength={200} onChange={(event) => updateField('price', event.target.value)} /></label>
            <label><span>所要時間</span><input value={form.duration} maxLength={200} placeholder="例：60分" onChange={(event) => updateField('duration', event.target.value)} /></label>
            <ReferenceTextarea label="特徴" value={form.features} onChange={(value) => updateField('features', value)} />
            <ReferenceTextarea label="対象" value={form.target} onChange={(value) => updateField('target', value)} />
            <ReferenceTextarea label="提供内容・流れ" value={form.process} onChange={(value) => updateField('process', value)} />
            <ReferenceTextarea label="注意事項" value={form.cautions} onChange={(value) => updateField('cautions', value)} />
            <ReferenceTextarea label="AIへ渡す補足情報" value={form.aiNotes} onChange={(value) => updateField('aiNotes', value)} />
          </div>
        </details>
        <label className="creative-ia__reference-ai-toggle">
          <input type="checkbox" checked={form.aiEnabled} onChange={(event) => updateField('aiEnabled', event.target.checked)} />
          <span><strong>AIで利用する</strong><small>Chatやコンテンツ生成の参照候補に含めます。</small></span>
        </label>
        <footer>
          <button type="button" onClick={onCancel} disabled={isPending}>キャンセル</button>
          <button type="submit" disabled={isPending || !form.name.trim()}>
            {isPending ? '保存中' : service ? '変更を保存' : 'サービスを登録'}
          </button>
        </footer>
      </form>
    </section>
  )
}

function ReferenceOrganizationList({ organizations, isLoading, error, onBack, onCreate, onOpen }: {
  organizations: CreativeIAReferenceOrganization[]; isLoading: boolean; error: string | null
  onBack: () => void; onCreate: () => void; onOpen: (id: string) => void
}) {
  return (
    <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="organizations-title">
      <button className="creative-ia__page-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> 参照データ</button>
      <header className="creative-ia__collection-header"><div><p>References</p><h1 id="organizations-title">会社・店舗</h1><span>会社と、会社に所属する複数の店舗情報を管理します。</span></div><button type="button" onClick={onCreate}>＋ 会社・店舗を登録</button></header>
      <div className="creative-ia__collection-meta"><span>{organizations.length}件</span>{organizations.length > 0 && <small>更新日時が新しい順に表示しています。</small>}</div>
      {error && <p className="creative-ia__chat-error" role="alert">{error}</p>}
      {isLoading ? <div className="creative-ia__empty-state"><p>会社・店舗を読み込んでいます。</p></div> : organizations.length === 0 ? (
        <div className="creative-ia__empty-state"><span aria-hidden="true">✦</span><h2>最初の会社を登録しましょう</h2><p>会社を登録すると、所属店舗や担当者を紐づけられます。</p><button type="button" onClick={onCreate}>会社・店舗を登録</button></div>
      ) : <WorkspaceList ariaLabel="会社・店舗一覧" columns={[{key:'name',label:'名称'},{key:'type',label:'種別'},{key:'parent',label:'所属会社'},{key:'address',label:'所在地'},{key:'updated',label:'最終更新'},{key:'ai',label:'AI利用'}]} columnTemplate="minmax(220px,1.3fr) 90px minmax(150px,.9fr) minmax(180px,1fr) 132px 90px" rows={organizations.map((item) => ({ id:item.id, ariaLabel:`「${item.name}」の詳細を開く`, cells:{
        name:<span className="creative-ia__collection-primary"><strong>{item.name}</strong><small>{item.description || '説明未入力'}</small></span>,
        type:item.organizationType === 'company' ? '会社' : '店舗', parent:item.parentCompanyName || '—', address:item.address || '—', updated:<FormattedDate value={item.updatedAt} />, ai:<StatusBadge tone={item.aiEnabled ? 'saved' : 'neutral'}>{item.aiEnabled ? '利用する' : '利用しない'}</StatusBadge>,
      }, onOpen:() => onOpen(item.id) }))} />}
    </section>
  )
}

function OrganizationDetail({ organization, contacts, stores, isPending, isDeleteConfirming, error, onBack, onEdit, onDeleteRequest, onDeleteCancel, onDelete }: {
  organization: CreativeIAReferenceOrganization; contacts: CreativeIAReferenceContact[]; stores: CreativeIAReferenceOrganization[]
  isPending:boolean; isDeleteConfirming:boolean; error:string|null; onBack:()=>void; onEdit:()=>void; onDeleteRequest:()=>void; onDeleteCancel:()=>void; onDelete:()=>void
}) {
  const fields = [['種別',organization.organizationType === 'company' ? '会社' : '店舗'],['所属会社',organization.parentCompanyName ?? ''],['所在地',organization.address],['電話番号',organization.phone],['営業時間',organization.businessHours],['説明',organization.description],['特徴',organization.features],['AIへ渡す補足情報',organization.aiNotes]].filter(([,value])=>value)
  return <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="organization-detail-title">
    <button className="creative-ia__page-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> 会社・店舗一覧</button>
    <header className="creative-ia__reference-detail-header"><div><p>Organization</p><h1 id="organization-detail-title">{organization.name}</h1><span>会社・店舗情報と紐づくデータを管理します。</span></div><div><button type="button" onClick={onEdit}>編集</button><button type="button" data-danger="true" onClick={onDeleteRequest}>削除</button></div></header>
    {error && <p className="creative-ia__chat-error" role="alert">{error}</p>}
    {isDeleteConfirming && <div className="creative-ia__delete-confirm" role="alert"><span>この会社・店舗を削除します。紐づく店舗や担当者がある場合は削除できません。</span><div><button type="button" onClick={onDeleteCancel} disabled={isPending}>キャンセル</button><button type="button" onClick={onDelete} disabled={isPending}>{isPending?'削除中':'削除する'}</button></div></div>}
    <div className="creative-ia__reference-detail-grid"><section><span>AI利用</span><StatusBadge tone={organization.aiEnabled?'saved':'neutral'}>{organization.aiEnabled?'利用する':'利用しない'}</StatusBadge></section><section><span>最終更新</span><FormattedDate value={organization.updatedAt}/></section>{organization.sourceUrl&&<section><span>情報元URL</span><a href={organization.sourceUrl} target="_blank" rel="noreferrer">{formatSourceUrl(organization.sourceUrl)} ↗</a></section>}</div>
    <dl className="creative-ia__reference-fields">{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {(stores.length > 0 || contacts.length > 0) && <dl className="creative-ia__reference-fields">{stores.length>0&&<div><dt>所属店舗</dt><dd>{stores.map((item)=>item.name).join('、')}</dd></div>}{contacts.length>0&&<div><dt>担当者</dt><dd>{contacts.map((item)=>item.name).join('、')}</dd></div>}</dl>}
  </section>
}

function OrganizationEditor({ organization, organizations, isPending, error, onCancel, onSave }: {
  organization?:CreativeIAReferenceOrganization; organizations:CreativeIAReferenceOrganization[]; isPending:boolean; error:string|null; onCancel:()=>void; onSave:(input:CreativeIAReferenceOrganizationInput)=>void
}) {
  const [form,setForm]=useState<CreativeIAReferenceOrganizationInput>(()=>({name:organization?.name??'',organizationType:organization?.organizationType??'company',parentCompanyId:organization?.parentCompanyId??null,sourceUrl:organization?.sourceUrl??null,description:organization?.description??'',address:organization?.address??'',phone:organization?.phone??'',businessHours:organization?.businessHours??'',features:organization?.features??'',aiNotes:organization?.aiNotes??'',aiEnabled:organization?.aiEnabled??true}))
  const update=<K extends keyof CreativeIAReferenceOrganizationInput>(key:K,value:CreativeIAReferenceOrganizationInput[K])=>setForm((current)=>({...current,[key]:value}))
  const companies=organizations.filter((item)=>item.organizationType==='company'&&item.id!==organization?.id)
  return <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="organization-editor-title"><button className="creative-ia__page-back" type="button" onClick={onCancel}><span aria-hidden="true">←</span> {organization?'会社・店舗詳細':'会社・店舗一覧'}</button><header className="creative-ia__section-header"><div><p>Organization</p><h1 id="organization-editor-title">{organization?'会社・店舗を編集':'会社・店舗を登録'}</h1><span>店舗を登録する場合は、所属会社を選択します。</span></div></header>
    <form className="creative-ia__reference-form" onSubmit={(event)=>{event.preventDefault();onSave({...form,parentCompanyId:form.organizationType==='store'?form.parentCompanyId:null,sourceUrl:form.sourceUrl||null})}}>{error&&<p className="creative-ia__chat-error" role="alert">{error}</p>}<div className="creative-ia__reference-form-grid">
      <label><span>種別 <small>必須</small></span><select value={form.organizationType} onChange={(event)=>update('organizationType',event.target.value as 'company'|'store')}><option value="company">会社</option><option value="store">店舗</option></select></label>
      <label><span>名称 <small>必須</small></span><input required maxLength={200} value={form.name} onChange={(event)=>update('name',event.target.value)}/></label>
      {form.organizationType==='store'&&<label><span>所属会社 <small>必須</small></span><select required value={form.parentCompanyId??''} onChange={(event)=>update('parentCompanyId',event.target.value||null)}><option value="">選択してください</option>{companies.map((company)=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
      <label className="creative-ia__reference-form-wide"><span>WebサイトURL</span><input type="url" maxLength={2000} value={form.sourceUrl??''} onChange={(event)=>update('sourceUrl',event.target.value)}/></label>
      <label className="creative-ia__reference-form-wide"><span>説明</span><textarea rows={4} maxLength={10000} value={form.description} onChange={(event)=>update('description',event.target.value)}/></label>
    </div><details className="creative-ia__reference-form-details"><summary>詳細情報を追加</summary><div className="creative-ia__reference-form-grid"><label className="creative-ia__reference-form-wide"><span>所在地</span><input maxLength={1000} value={form.address} onChange={(event)=>update('address',event.target.value)}/></label><label><span>電話番号</span><input maxLength={200} value={form.phone} onChange={(event)=>update('phone',event.target.value)}/></label><label><span>営業時間</span><input maxLength={2000} value={form.businessHours} onChange={(event)=>update('businessHours',event.target.value)}/></label><ReferenceTextarea label="特徴" value={form.features} onChange={(value)=>update('features',value)}/><ReferenceTextarea label="AIへ渡す補足情報" value={form.aiNotes} onChange={(value)=>update('aiNotes',value)}/></div></details>
    <label className="creative-ia__reference-ai-toggle"><input type="checkbox" checked={form.aiEnabled} onChange={(event)=>update('aiEnabled',event.target.checked)}/><span><strong>AIで利用する</strong><small>Chatやコンテンツ生成の参照候補に含めます。</small></span></label><footer><button type="button" onClick={onCancel} disabled={isPending}>キャンセル</button><button type="submit" disabled={isPending||!form.name.trim()||(form.organizationType==='store'&&!form.parentCompanyId)}>{isPending?'保存中':organization?'変更を保存':'会社・店舗を登録'}</button></footer></form>
  </section>
}

function ReferenceContactList({contacts,isLoading,error,onBack,onCreate,onOpen}:{contacts:CreativeIAReferenceContact[];isLoading:boolean;error:string|null;onBack:()=>void;onCreate:()=>void;onOpen:(id:string)=>void}){
  return <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="contacts-title"><button className="creative-ia__page-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> 参照データ</button><header className="creative-ia__collection-header"><div><p>References</p><h1 id="contacts-title">担当者</h1><span>会社・店舗に所属する担当者の公開用情報を管理します。</span></div><button type="button" onClick={onCreate}>＋ 担当者を登録</button></header><div className="creative-ia__collection-meta"><span>{contacts.length}件</span></div>{error&&<p className="creative-ia__chat-error" role="alert">{error}</p>}{isLoading?<div className="creative-ia__empty-state"><p>担当者を読み込んでいます。</p></div>:contacts.length===0?<div className="creative-ia__empty-state"><span aria-hidden="true">✦</span><h2>最初の担当者を登録しましょう</h2><p>先に会社または店舗を登録して、所属先を紐づけます。</p><button type="button" onClick={onCreate}>担当者を登録</button></div>:<WorkspaceList ariaLabel="担当者一覧" columns={[{key:'name',label:'表示名'},{key:'organization',label:'所属先'},{key:'position',label:'部署・役職'},{key:'updated',label:'最終更新'},{key:'ai',label:'AI利用'}]} columnTemplate="minmax(220px,1.3fr) minmax(180px,1fr) minmax(180px,1fr) 132px 90px" rows={contacts.map((item)=>({id:item.id,ariaLabel:`「${item.name}」の詳細を開く`,cells:{name:<span className="creative-ia__collection-primary"><strong>{item.name}</strong><small>{item.description||'紹介文未入力'}</small></span>,organization:item.organizationName||'—',position:[item.department,item.role].filter(Boolean).join('・')||'—',updated:<FormattedDate value={item.updatedAt}/>,ai:<StatusBadge tone={item.aiEnabled?'saved':'neutral'}>{item.aiEnabled?'利用する':'利用しない'}</StatusBadge>},onOpen:()=>onOpen(item.id)}))}/>}</section>
}

function ContactDetail({contact,isPending,isDeleteConfirming,error,onBack,onEdit,onDeleteRequest,onDeleteCancel,onDelete}:{contact:CreativeIAReferenceContact;isPending:boolean;isDeleteConfirming:boolean;error:string|null;onBack:()=>void;onEdit:()=>void;onDeleteRequest:()=>void;onDeleteCancel:()=>void;onDelete:()=>void}){
  const fields=[['所属先',contact.organizationName],['部署',contact.department],['役職',contact.role],['紹介文',contact.description],['専門分野・担当業務',contact.specialties],['AIへ渡す補足情報',contact.aiNotes]].filter(([,value])=>value)
  return <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="contact-detail-title"><button className="creative-ia__page-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> 担当者一覧</button><header className="creative-ia__reference-detail-header"><div><p>Contact</p><h1 id="contact-detail-title">{contact.name}</h1><span>担当者の紹介情報とAI利用設定を管理します。</span></div><div><button type="button" onClick={onEdit}>編集</button><button type="button" data-danger="true" onClick={onDeleteRequest}>削除</button></div></header>{error&&<p className="creative-ia__chat-error" role="alert">{error}</p>}{isDeleteConfirming&&<div className="creative-ia__delete-confirm" role="alert"><span>この担当者を削除します。元に戻すことはできません。</span><div><button type="button" onClick={onDeleteCancel} disabled={isPending}>キャンセル</button><button type="button" onClick={onDelete} disabled={isPending}>{isPending?'削除中':'削除する'}</button></div></div>}<div className="creative-ia__reference-detail-grid"><section><span>AI利用</span><StatusBadge tone={contact.aiEnabled?'saved':'neutral'}>{contact.aiEnabled?'利用する':'利用しない'}</StatusBadge></section><section><span>最終更新</span><FormattedDate value={contact.updatedAt}/></section></div><dl className="creative-ia__reference-fields">{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
}

function ContactEditor({contact,organizations,isPending,error,onCancel,onSave}:{contact?:CreativeIAReferenceContact;organizations:CreativeIAReferenceOrganization[];isPending:boolean;error:string|null;onCancel:()=>void;onSave:(input:CreativeIAReferenceContactInput)=>void}){
  const [form,setForm]=useState<CreativeIAReferenceContactInput>(()=>({name:contact?.name??'',organizationId:contact?.organizationId??'',department:contact?.department??'',role:contact?.role??'',description:contact?.description??'',specialties:contact?.specialties??'',aiNotes:contact?.aiNotes??'',aiEnabled:contact?.aiEnabled??true}))
  const update=<K extends keyof CreativeIAReferenceContactInput>(key:K,value:CreativeIAReferenceContactInput[K])=>setForm((current)=>({...current,[key]:value}))
  return <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="contact-editor-title"><button className="creative-ia__page-back" type="button" onClick={onCancel}><span aria-hidden="true">←</span> {contact?'担当者詳細':'担当者一覧'}</button><header className="creative-ia__section-header"><div><p>Contact</p><h1 id="contact-editor-title">{contact?'担当者を編集':'担当者を登録'}</h1><span>記事などで紹介する公開用情報を登録します。メールアドレスや電話番号は保存しません。</span></div></header><form className="creative-ia__reference-form" onSubmit={(event)=>{event.preventDefault();onSave(form)}}>{error&&<p className="creative-ia__chat-error" role="alert">{error}</p>}<div className="creative-ia__reference-form-grid"><label><span>表示名 <small>必須</small></span><input required maxLength={200} value={form.name} onChange={(event)=>update('name',event.target.value)}/></label><label><span>所属先 <small>必須</small></span><select required value={form.organizationId} onChange={(event)=>update('organizationId',event.target.value)}><option value="">選択してください</option>{organizations.map((item)=><option key={item.id} value={item.id}>{item.name}（{item.organizationType==='company'?'会社':'店舗'}）</option>)}</select></label><label><span>部署</span><input maxLength={200} value={form.department} onChange={(event)=>update('department',event.target.value)}/></label><label><span>役職</span><input maxLength={200} value={form.role} onChange={(event)=>update('role',event.target.value)}/></label><label className="creative-ia__reference-form-wide"><span>紹介文</span><textarea rows={4} maxLength={10000} value={form.description} onChange={(event)=>update('description',event.target.value)}/></label></div><details className="creative-ia__reference-form-details"><summary>詳細情報を追加</summary><div className="creative-ia__reference-form-grid"><ReferenceTextarea label="専門分野・担当業務" value={form.specialties} onChange={(value)=>update('specialties',value)}/><ReferenceTextarea label="AIへ渡す補足情報" value={form.aiNotes} onChange={(value)=>update('aiNotes',value)}/></div></details><label className="creative-ia__reference-ai-toggle"><input type="checkbox" checked={form.aiEnabled} onChange={(event)=>update('aiEnabled',event.target.checked)}/><span><strong>AIで利用する</strong><small>Chatやコンテンツ生成の参照候補に含めます。</small></span></label><footer><button type="button" onClick={onCancel} disabled={isPending}>キャンセル</button><button type="submit" disabled={isPending||!form.name.trim()||!form.organizationId}>{isPending?'保存中':contact?'変更を保存':'担当者を登録'}</button></footer></form></section>
}

function ProductDetail({
  product,
  isPending,
  isDeleteConfirming,
  error,
  onBack,
  onEdit,
  onDeleteRequest,
  onDeleteCancel,
  onDelete,
}: {
  product: CreativeIAReferenceProduct
  isPending: boolean
  isDeleteConfirming: boolean
  error: string | null
  onBack: () => void
  onEdit: () => void
  onDeleteRequest: () => void
  onDeleteCancel: () => void
  onDelete: () => void
}) {
  const fields = [
    ['ブランド', product.brand],
    ['カテゴリ', product.category],
    ['価格', product.price],
    ['容量', product.capacity],
    ['商品説明', product.description],
    ['特徴', product.features],
    ['成分・仕様', product.specifications],
    ['使用方法', product.usage],
    ['注意事項', product.cautions],
    ['AIへ渡す補足情報', product.aiNotes],
  ].filter(([, value]) => value)

  return (
    <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="product-detail-title">
      <button className="creative-ia__page-back" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> 商品一覧
      </button>
      <header className="creative-ia__reference-detail-header">
        <div>
          <p>Product</p>
          <h1 id="product-detail-title">{product.name}</h1>
          <span>商品情報の確認と、AIで利用する内容を管理します。</span>
        </div>
        <div>
          <button type="button" onClick={onEdit}>編集</button>
          <button type="button" data-danger="true" onClick={onDeleteRequest}>削除</button>
        </div>
      </header>

      {error && <p className="creative-ia__chat-error" role="alert">{error}</p>}
      {isDeleteConfirming && (
        <div className="creative-ia__delete-confirm" role="alert">
          <span>この商品を削除します。元に戻すことはできません。</span>
          <div>
            <button type="button" onClick={onDeleteCancel} disabled={isPending}>キャンセル</button>
            <button type="button" onClick={onDelete} disabled={isPending}>
              {isPending ? '削除中' : '削除する'}
            </button>
          </div>
        </div>
      )}

      <div className="creative-ia__reference-detail-grid">
        <section>
          <span>AI利用</span>
          <StatusBadge tone={product.aiEnabled ? 'saved' : 'neutral'}>
            {product.aiEnabled ? '利用する' : '利用しない'}
          </StatusBadge>
        </section>
        <section>
          <span>最終更新</span>
          <FormattedDate value={product.updatedAt} />
        </section>
        {product.sourceUrl && (
          <section>
            <span>情報元URL</span>
            <a href={product.sourceUrl} target="_blank" rel="noreferrer">
              {formatSourceUrl(product.sourceUrl)} ↗
            </a>
          </section>
        )}
      </div>

      <dl className="creative-ia__reference-fields">
        {fields.length > 0 ? (
          fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))
        ) : (
          <div><dt>商品情報</dt><dd>詳細情報はまだ登録されていません。</dd></div>
        )}
      </dl>
    </section>
  )
}

function ProductEditor({
  product,
  isPending,
  error,
  onCancel,
  onSave,
}: {
  product?: CreativeIAReferenceProduct
  isPending: boolean
  error: string | null
  onCancel: () => void
  onSave: (input: CreativeIAReferenceProductInput) => void
}) {
  const [form, setForm] = useState<CreativeIAReferenceProductInput>(() => ({
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    category: product?.category ?? '',
    sourceUrl: product?.sourceUrl ?? null,
    description: product?.description ?? '',
    features: product?.features ?? '',
    price: product?.price ?? '',
    capacity: product?.capacity ?? '',
    specifications: product?.specifications ?? '',
    usage: product?.usage ?? '',
    cautions: product?.cautions ?? '',
    aiNotes: product?.aiNotes ?? '',
    aiEnabled: product?.aiEnabled ?? true,
  }))
  const updateField = <Key extends keyof CreativeIAReferenceProductInput>(
    key: Key,
    value: CreativeIAReferenceProductInput[Key],
  ) => setForm((current) => ({ ...current, [key]: value }))

  return (
    <section className="creative-ia__page creative-ia__reference-page" aria-labelledby="product-editor-title">
      <button className="creative-ia__page-back" type="button" onClick={onCancel}>
        <span aria-hidden="true">←</span> {product ? '商品詳細' : '商品一覧'}
      </button>
      <header className="creative-ia__section-header">
        <div>
          <p>Product</p>
          <h1 id="product-editor-title">{product ? '商品を編集' : '商品を登録'}</h1>
          <span>商品名だけで保存できます。必要な情報はあとから追加できます。</span>
        </div>
      </header>

      <form
        className="creative-ia__reference-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSave({ ...form, sourceUrl: form.sourceUrl || null })
        }}
      >
        {error && <p className="creative-ia__chat-error" role="alert">{error}</p>}
        <div className="creative-ia__reference-form-grid">
          <label>
            <span>商品名 <small>必須</small></span>
            <input
              value={form.name}
              maxLength={200}
              required
              onChange={(event) => updateField('name', event.target.value)}
            />
          </label>
          <label>
            <span>ブランド</span>
            <input
              value={form.brand}
              maxLength={200}
              onChange={(event) => updateField('brand', event.target.value)}
            />
          </label>
          <label>
            <span>カテゴリ</span>
            <input
              value={form.category}
              maxLength={200}
              placeholder="例：ヘアケア"
              onChange={(event) => updateField('category', event.target.value)}
            />
          </label>
          <label className="creative-ia__reference-form-wide">
            <span>商品URL</span>
            <input
              type="url"
              value={form.sourceUrl ?? ''}
              maxLength={2000}
              placeholder="https://example.com/product"
              onChange={(event) => updateField('sourceUrl', event.target.value)}
            />
            <small>URLからの商品情報取得は今後対応予定です。</small>
          </label>
          <label className="creative-ia__reference-form-wide">
            <span>商品説明</span>
            <textarea
              value={form.description}
              rows={4}
              maxLength={10000}
              onChange={(event) => updateField('description', event.target.value)}
            />
          </label>
        </div>

        <details className="creative-ia__reference-form-details">
          <summary>詳細情報を追加</summary>
          <div className="creative-ia__reference-form-grid">
            <label><span>価格</span><input value={form.price} maxLength={200} onChange={(event) => updateField('price', event.target.value)} /></label>
            <label><span>容量</span><input value={form.capacity} maxLength={200} onChange={(event) => updateField('capacity', event.target.value)} /></label>
            <ReferenceTextarea label="特徴" value={form.features} onChange={(value) => updateField('features', value)} />
            <ReferenceTextarea label="成分・仕様" value={form.specifications} onChange={(value) => updateField('specifications', value)} />
            <ReferenceTextarea label="使用方法" value={form.usage} onChange={(value) => updateField('usage', value)} />
            <ReferenceTextarea label="注意事項" value={form.cautions} onChange={(value) => updateField('cautions', value)} />
            <ReferenceTextarea label="AIへ渡す補足情報" value={form.aiNotes} onChange={(value) => updateField('aiNotes', value)} />
          </div>
        </details>

        <label className="creative-ia__reference-ai-toggle">
          <input
            type="checkbox"
            checked={form.aiEnabled}
            onChange={(event) => updateField('aiEnabled', event.target.checked)}
          />
          <span><strong>AIで利用する</strong><small>Chatやコンテンツ生成の参照候補に含めます。</small></span>
        </label>

        <footer>
          <button type="button" onClick={onCancel} disabled={isPending}>キャンセル</button>
          <button type="submit" disabled={isPending || !form.name.trim()}>
            {isPending ? '保存中' : product ? '変更を保存' : '商品を登録'}
          </button>
        </footer>
      </form>
    </section>
  )
}

function ReferenceTextarea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="creative-ia__reference-form-wide">
      <span>{label}</span>
      <textarea value={value} rows={3} maxLength={20000} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function formatSourceUrl(sourceUrl: string | null) {
  if (!sourceUrl) return '—'
  try {
    const url = new URL(sourceUrl)
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return sourceUrl
  }
}

function SettingsView({
  theme,
  connection,
  isConnectionLoading,
  instagramConnection,
  isInstagramConnectionLoading,
  selectedSiteLabel,
  onThemeChange,
}: {
  theme: CreativeIATheme
  connection: CreativeIAWordPressStatus | null
  isConnectionLoading: boolean
  instagramConnection: CreativeIAInstagramStatus | null
  isInstagramConnectionLoading: boolean
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

        <section>
          <div>
            <p>外部サービス接続</p>
            <h2>Instagram</h2>
            <span>
              {isInstagramConnectionLoading
                ? '接続状態を確認中'
                : instagramConnection?.connected
                  ? `@${instagramConnection.account?.username ?? 'Instagram'}へ接続済み`
                  : instagramConnection?.tokenExpired
                    ? '再接続が必要'
                    : '未接続'}
            </span>
          </div>
          <Link to="/creative-ia/settings/instagram">接続を管理</Link>
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
