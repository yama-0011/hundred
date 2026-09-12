import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteAnigramSettingsHistory,
  generateAndPublishAnigramStory,
  getAnigramAdminAccess,
  getAnigramAdminSettings,
  registerAnigramAdministrator,
  removeAnigramAdministrator,
  updateAnigramAdminSettings,
  updateAnigramInstagramDeliverySettings,
  type AnigramAdministrator,
  type AnigramAdminSettings,
  type AnigramInstagramDeliverySettings,
  type AnigramSettingsHistory,
  type AnigramStoryPublication,
  type AnigramStoryRender,
} from '../../services/Anigram/anigramApi'
import {
  getInstagramConnectionStatus,
  type InstagramConnectionStatus,
} from '../../services/Instagram/instagramConnectionApi'
import '../../styles/Anigram/anigram.css'

type AdminTab = 'anigram' | 'instagram' | 'administrators'

type InstagramDeliveryDraft = Pick<
  AnigramInstagramDeliverySettings,
  | 'enabled'
  | 'species'
  | 'deliveryTime'
  | 'storyTitleTemplate'
  | 'storyMessageTemplate'
  | 'storyReactionTemplate'
  | 'reactionSyncEnabled'
  | 'syncPauseReason'
>

type SettingsDraft = {
  hatchRequiredPoints: number
  initialFullnessPoints: number
  maxFullnessPoints: number
  fullnessStorageLimitPercent: number
  fullnessDecayPercentPerHour: number
  starvationGraceHours: number
  evolutionFullnessThresholdPercent: number
  evolutionHoldHours: number
  nextEvolutionStage: string
}

type NumberFieldProps = {
  label: string
  value: number
  min: number
  max?: number
  step: number
  onChange: (value: string) => void
}

function NumberField({ label, value, min, max, step, onChange }: NumberFieldProps) {
  return (
    <label className="anigram-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function createDraft(settings: AnigramAdminSettings): SettingsDraft {
  return {
    hatchRequiredPoints: settings.hatchRequiredPoints,
    initialFullnessPoints: settings.initialFullnessPoints,
    maxFullnessPoints: settings.maxFullnessPoints,
    fullnessStorageLimitPercent: settings.fullnessStorageLimitPercent ?? 120,
    fullnessDecayPercentPerHour: settings.fullnessDecayPercentPerHour,
    starvationGraceHours: settings.starvationGraceSeconds / 3_600,
    evolutionFullnessThresholdPercent: settings.evolutionFullnessThresholdPercent,
    evolutionHoldHours: settings.evolutionHoldSeconds / 3_600,
    nextEvolutionStage: settings.nextEvolutionStage,
  }
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const storyTemplateSampleValues: Record<string, string> = {
  pet_name: 'ハリネズミ',
  status: '卵を温めています',
  progress: '40',
  progress_label: '孵化進捗',
  life_stage: 'egg',
  evolution_stage: 'base',
}

const storyTemplateVariableHelp = [
  {
    token: '{pet_name}',
    description: '対象ペットの表示名に置き換わります。例：ハリネズミ',
  },
  {
    token: '{status}',
    description: '現在の状態を表す文言に置き換わります。例：卵を温めています',
  },
  {
    token: '{progress}',
    description: '現在の進捗率の数値に置き換わります。例：40（%記号は含みません）',
  },
  {
    token: '{progress_label}',
    description: '成長段階に応じた進捗項目名に置き換わります。例：孵化進捗、満腹度',
  },
  {
    token: '{life_stage}',
    description: '現在の成長状態を表す内部値に置き換わります。egg、hatching、baby、adultのいずれかです。',
  },
  {
    token: '{evolution_stage}',
    description: '現在の進化段階を表す内部値に置き換わります。例：base、stage_2',
  },
] as const

function renderStoryTemplateSample(template: string) {
  return template.replace(/\{([^{}]+)\}/gu, (token, name: string) =>
    storyTemplateSampleValues[name] ?? token,
  )
}

/** 設定内容は公開し、更新操作だけを登録済み管理者へ許可する画面。 */
function AnigramAdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('anigram')
  const [settings, setSettings] = useState<AnigramAdminSettings[]>([])
  const [history, setHistory] = useState<AnigramSettingsHistory[]>([])
  const [administrators, setAdministrators] = useState<AnigramAdministrator[]>([])
  const [selectedSpecies, setSelectedSpecies] = useState('')
  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const [instagramDelivery, setInstagramDelivery] =
    useState<AnigramInstagramDeliverySettings | null>(null)
  const [instagramDraft, setInstagramDraft] =
    useState<InstagramDeliveryDraft | null>(null)
  const [newAdministratorId, setNewAdministratorId] = useState('')
  const [canManage, setCanManage] = useState(false)
  const [instagramConnection, setInstagramConnection] =
    useState<InstagramConnectionStatus | null>(null)
  const [instagramConnectionLoading, setInstagramConnectionLoading] =
    useState(false)
  const [publishingGeneratedStory, setPublishingGeneratedStory] = useState(false)
  const [storyRender, setStoryRender] = useState<AnigramStoryRender | null>(null)
  const [testStoryResult, setTestStoryResult] = useState<{
    story: AnigramStoryPublication
    accountUsername: string
    accountUrl: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingAdministrator, setUpdatingAdministrator] = useState(false)
  const [deletingSettingsHistory, setDeletingSettingsHistory] =
    useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const selectedSettings = useMemo(
    () => settings.find((item) => item.species === selectedSpecies) ?? null,
    [selectedSpecies, settings],
  )

  const storyTemplatePreview = useMemo(
    () => instagramDraft
      ? {
          title: renderStoryTemplateSample(instagramDraft.storyTitleTemplate),
          message: renderStoryTemplateSample(instagramDraft.storyMessageTemplate),
          reaction: renderStoryTemplateSample(instagramDraft.storyReactionTemplate),
        }
      : null,
    [instagramDraft],
  )

  const instagramSettingsDirty = useMemo(() => {
    if (!instagramDraft || !instagramDelivery) return false
    return (
      instagramDraft.enabled !== instagramDelivery.enabled ||
      instagramDraft.species !== instagramDelivery.species ||
      instagramDraft.deliveryTime !== instagramDelivery.deliveryTime ||
      instagramDraft.storyTitleTemplate !== instagramDelivery.storyTitleTemplate ||
      instagramDraft.storyMessageTemplate !== instagramDelivery.storyMessageTemplate ||
      instagramDraft.storyReactionTemplate !== instagramDelivery.storyReactionTemplate ||
      instagramDraft.reactionSyncEnabled !== instagramDelivery.reactionSyncEnabled ||
      instagramDraft.syncPauseReason !== instagramDelivery.syncPauseReason
    )
  }, [instagramDelivery, instagramDraft])

  const applyPublicData = (
    response: Awaited<ReturnType<typeof getAnigramAdminSettings>>,
  ) => {
    setSettings(response.settings)
    setHistory(response.history)
    setAdministrators(response.administrators)
    setInstagramDelivery(response.instagramDelivery)
    setInstagramDraft({
      enabled: response.instagramDelivery.enabled,
      species: response.instagramDelivery.species,
      deliveryTime: response.instagramDelivery.deliveryTime,
      storyTitleTemplate: response.instagramDelivery.storyTitleTemplate,
      storyMessageTemplate: response.instagramDelivery.storyMessageTemplate,
      storyReactionTemplate: response.instagramDelivery.storyReactionTemplate,
      reactionSyncEnabled: response.instagramDelivery.reactionSyncEnabled,
      syncPauseReason: response.instagramDelivery.syncPauseReason,
    })
    const nextSpecies = selectedSpecies || response.settings[0]?.species || ''
    setSelectedSpecies(nextSpecies)
    const nextSettings = response.settings.find((item) => item.species === nextSpecies)
    setDraft(nextSettings ? createDraft(nextSettings) : null)
  }

  const loadPage = async () => {
    setLoading(true)
    try {
      applyPublicData(await getAnigramAdminSettings())
      setError(null)
    } catch {
      setError('管理画面の情報を取得できませんでした。')
    }

    try {
      const access = await getAnigramAdminAccess()
      setCanManage(access.allowed)
      if (access.allowed) {
        setInstagramConnectionLoading(true)
        try {
          setInstagramConnection(
            await getInstagramConnectionStatus('anigramAdmin'),
          )
        } catch {
          setInstagramConnection(null)
        } finally {
          setInstagramConnectionLoading(false)
        }
      } else {
        setInstagramConnection(null)
        setInstagramConnectionLoading(false)
      }
    } catch {
      setCanManage(false)
      setInstagramConnection(null)
      setInstagramConnectionLoading(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPage(), 0)
    return () => window.clearTimeout(timeout)
    // 初回表示時だけ公開設定とログイン中ユーザーの変更権限を取得する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setNumber = (key: keyof SettingsDraft, value: string) => {
    setDraft((current) =>
      current ? { ...current, [key]: Number(value) } : current,
    )
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!canManage || !draft || !selectedSettings || saving) return
    if (draft.initialFullnessPoints > draft.maxFullnessPoints) {
      setError(
        '孵化後の初期満腹ポイントは、満腹ポイント最大値以下にしてください。',
      )
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const updated = await updateAnigramAdminSettings(selectedSettings.species, {
        hatchRequiredPoints: draft.hatchRequiredPoints,
        initialFullnessPoints: draft.initialFullnessPoints,
        maxFullnessPoints: draft.maxFullnessPoints,
        fullnessStorageLimitPercent: draft.fullnessStorageLimitPercent,
        fullnessDecayPercentPerHour: draft.fullnessDecayPercentPerHour,
        starvationGraceSeconds: Math.round(draft.starvationGraceHours * 3_600),
        evolutionFullnessThresholdPercent:
          draft.evolutionFullnessThresholdPercent,
        evolutionHoldSeconds: Math.round(draft.evolutionHoldHours * 3_600),
        nextEvolutionStage: draft.nextEvolutionStage,
      })
      setSettings((current) =>
        current.map((item) => (item.species === updated.species ? updated : item)),
      )
      setDraft(createDraft(updated))
      const refreshed = await getAnigramAdminSettings()
      setHistory(refreshed.history)
      setMessage('Anigram設定を保存しました。')
      setError(null)
    } catch (requestError) {
      const responseMessage = (
        requestError as Error & { responseMessage?: string }
      ).responseMessage
      setError(
        responseMessage
          ? `設定を保存できませんでした。${responseMessage}`
          : '設定を保存できませんでした。権限と入力値を確認してください。',
      )
    } finally {
      setSaving(false)
    }
  }

  const registerAdministrator = async (event: FormEvent) => {
    event.preventDefault()
    if (!canManage || updatingAdministrator || !newAdministratorId.trim()) return
    setUpdatingAdministrator(true)
    setMessage(null)
    try {
      await registerAnigramAdministrator(newAdministratorId)
      const refreshed = await getAnigramAdminSettings()
      setAdministrators(refreshed.administrators)
      setNewAdministratorId('')
      setMessage('管理者を登録しました。')
      setError(null)
    } catch {
      setError('管理者を登録できませんでした。ユーザーIDを確認してください。')
    } finally {
      setUpdatingAdministrator(false)
    }
  }

  const saveInstagramDelivery = async (event: FormEvent) => {
    event.preventDefault()
    if (!canManage || !instagramDraft || saving) return
    setSaving(true)
    setMessage(null)
    try {
      const updated = await updateAnigramInstagramDeliverySettings(
        instagramDraft,
      )
      setInstagramDelivery(updated)
      setInstagramDraft({
        enabled: updated.enabled,
        species: updated.species,
        deliveryTime: updated.deliveryTime,
        storyTitleTemplate: updated.storyTitleTemplate,
        storyMessageTemplate: updated.storyMessageTemplate,
        storyReactionTemplate: updated.storyReactionTemplate,
        reactionSyncEnabled: updated.reactionSyncEnabled,
        syncPauseReason: updated.syncPauseReason,
      })
      setMessage('Instagram配信設定を保存しました。')
      setError(null)
    } catch {
      setError(
        'Instagram配信設定を保存できませんでした。権限と入力値を確認してください。',
      )
    } finally {
      setSaving(false)
    }
  }

  const generateAndPublishStory = async () => {
    const username = instagramConnection?.account?.username
    if (
      !canManage ||
      !username ||
      publishingGeneratedStory
    ) return
    if (
      !window.confirm(
        `現在のペット状態から新しい画像を生成し、@${username} のInstagramストーリーズへ実際に公開します。よろしいですか？`,
      )
    ) return

    setPublishingGeneratedStory(true)
    setTestStoryResult(null)
    setMessage(null)
    setError(null)
    try {
      const result = await generateAndPublishAnigramStory()
      setStoryRender(result.render)
      setTestStoryResult(result)
      setMessage(
        `画像を生成し、@${result.accountUsername} へストーリーを公開しました。`,
      )
    } catch (requestError) {
      const typedError = requestError as Error & {
        providerCode?: string
        responseMessage?: string
      }
      const detail = typedError.providerCode
        ? `（Instagramエラー: ${typedError.providerCode}）`
        : ''
      setError(
        `${typedError.responseMessage ?? '画像生成またはストーリー公開に失敗しました。'}${detail}`,
      )
    } finally {
      setPublishingGeneratedStory(false)
    }
  }

  const removeAdministrator = async (administrator: AnigramAdministrator) => {
    if (!canManage || updatingAdministrator) return
    if (!window.confirm(`${administrator.userId} を管理者から削除しますか？`)) return
    setUpdatingAdministrator(true)
    setMessage(null)
    try {
      await removeAnigramAdministrator(administrator.userId)
      const refreshed = await getAnigramAdminSettings()
      setAdministrators(refreshed.administrators)
      setMessage('管理者を削除しました。')
      setError(null)
    } catch {
      setError('管理者を削除できませんでした。最後の管理者は削除できません。')
    } finally {
      setUpdatingAdministrator(false)
    }
  }

  const removeSettingsHistory = async (id?: string) => {
    if (!canManage || deletingSettingsHistory) return
    const target = id
      ? 'この設定変更履歴を削除します。削除後は復元できません。よろしいですか？'
      : '設定変更履歴をDBからすべて削除します。削除後は復元できません。よろしいですか？'
    if (!window.confirm(target)) return
    setDeletingSettingsHistory(id ?? 'all')
    setMessage(null)
    setError(null)
    try {
      const result = await deleteAnigramSettingsHistory(id)
      setHistory((current) => id ? current.filter((item) => item.id !== id) : [])
      setMessage(`設定変更履歴を${result.deletedCount}件削除しました。`)
    } catch (requestError) {
      const responseMessage = (
        requestError as Error & { responseMessage?: string }
      ).responseMessage
      setError(responseMessage ?? '設定変更履歴を削除できませんでした。')
    } finally {
      setDeletingSettingsHistory(null)
    }
  }

  return (
    <main className="anigram-page anigram-subpage">
      <section className="anigram-subpage__heading">
        <p className="anigram-eyebrow">MANAGEMENT</p>
        <h1>Anigram管理</h1>
        <p>設定内容はすべての利用者が確認できます。変更は登録済み管理者だけが行えます。</p>
      </section>

      <nav className="anigram-admin-tabs" aria-label="管理画面メニュー">
        <button
          type="button"
          className={activeTab === 'anigram' ? 'is-active' : undefined}
          onClick={() => setActiveTab('anigram')}
        >
          Anigram設定
        </button>
        <button
          type="button"
          className={activeTab === 'instagram' ? 'is-active' : undefined}
          onClick={() => setActiveTab('instagram')}
        >
          Instagram設定
        </button>
        <button
          type="button"
          className={activeTab === 'administrators' ? 'is-active' : undefined}
          onClick={() => setActiveTab('administrators')}
        >
          管理者設定
        </button>
      </nav>

      {loading ? <p className="anigram-panel">設定を読み込んでいます…</p> : null}
      {error ? <p className="anigram-status__error">{error}</p> : null}
      {message ? (
        <p className="anigram-admin-message" aria-live="polite">
          {message}
        </p>
      ) : null}
      {!loading && !canManage ? (
        <p className="anigram-admin-readonly">
          閲覧モードです。設定変更には登録済み管理者でのサインインが必要です。
        </p>
      ) : null}

      {!loading && activeTab === 'anigram' && draft && selectedSettings ? (
        <form className="anigram-admin-form" onSubmit={(event) => void save(event)}>
          <fieldset className="anigram-admin-fieldset" disabled={!canManage || saving}>
            <section className="anigram-panel">
              <div className="anigram-panel__heading">
                <div>
                  <p className="anigram-eyebrow">PET</p>
                  <h2>対象ペット</h2>
                </div>
                <span>最終更新 {formatDateTime(selectedSettings.updatedAt)}</span>
              </div>
              <label className="anigram-field anigram-field--wide">
                <span>ペットを選択</span>
                <select
                  value={selectedSpecies}
                  onChange={(event) => {
                    const nextSpecies = event.target.value
                    setSelectedSpecies(nextSpecies)
                    const nextSettings = settings.find(
                      (item) => item.species === nextSpecies,
                    )
                    setDraft(nextSettings ? createDraft(nextSettings) : null)
                  }}
                >
                  {settings.map((item) => (
                    <option key={item.species} value={item.species}>
                      {item.displayName}（{item.species}）
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="anigram-panel">
              <div className="anigram-panel__heading">
                <div>
                  <p className="anigram-eyebrow">HATCH</p>
                  <h2>孵化までの設定</h2>
                </div>
              </div>
              <div className="anigram-field-grid anigram-field-grid--two">
                <NumberField label="孵化に必要なポイント" min={1} step={1} value={draft.hatchRequiredPoints} onChange={(value) => setNumber('hatchRequiredPoints', value)} />
                <NumberField label="孵化後の初期満腹ポイント" min={0} step={0.1} value={draft.initialFullnessPoints} onChange={(value) => setNumber('initialFullnessPoints', value)} />
              </div>
            </section>

            <section className="anigram-panel">
              <div className="anigram-panel__heading">
                <div>
                  <p className="anigram-eyebrow">EVOLUTION</p>
                  <h2>進化までの設定</h2>
                </div>
              </div>
              <div className="anigram-field-grid">
                <NumberField label="進化判定を始める満腹度（%）" min={0} max={100} step={0.1} value={draft.evolutionFullnessThresholdPercent} onChange={(value) => setNumber('evolutionFullnessThresholdPercent', value)} />
                <NumberField label="維持時間（時間）" min={0} max={8760} step={0.25} value={draft.evolutionHoldHours} onChange={(value) => setNumber('evolutionHoldHours', value)} />
                <label className="anigram-field">
                  <span>次の進化段階</span>
                  <input
                    type="text"
                    pattern="[a-z][a-z0-9_]{0,39}"
                    required
                    value={draft.nextEvolutionStage}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, nextEvolutionStage: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
              </div>
            </section>

            <section className="anigram-panel">
              <div className="anigram-panel__heading">
                <div>
                  <p className="anigram-eyebrow">HUNGER</p>
                  <h2>空腹パラメータ</h2>
                </div>
              </div>
              <div className="anigram-field-grid">
                <NumberField
                  label="満腹ポイント最大値"
                  min={1}
                  step={0.1}
                  value={draft.maxFullnessPoints}
                  onChange={(value) => {
                    const maxFullnessPoints = Number(value)
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            maxFullnessPoints,
                            initialFullnessPoints:
                              maxFullnessPoints >= 1
                                ? Math.min(
                                    current.initialFullnessPoints,
                                    maxFullnessPoints,
                                  )
                                : current.initialFullnessPoints,
                          }
                        : current,
                    )
                  }}
                />
                <NumberField
                  label="満腹ポイント蓄積上限（%）"
                  min={100}
                  max={500}
                  step={1}
                  value={draft.fullnessStorageLimitPercent}
                  onChange={(value) =>
                    setNumber('fullnessStorageLimitPercent', value)
                  }
                />
                <NumberField label="1時間あたりの減少率（%）" min={0} max={100} step={0.01} value={draft.fullnessDecayPercentPerHour} onChange={(value) => setNumber('fullnessDecayPercentPerHour', value)} />
                <NumberField label="満腹度0から死亡まで（時間）" min={0} max={8760} step={0.25} value={draft.starvationGraceHours} onChange={(value) => setNumber('starvationGraceHours', value)} />
              </div>
              <p className="anigram-instagram-note">
                100%を超えて蓄積したポイントは内部で保持します。利用者画面の満腹度は常に100%以下で表示します。
              </p>
            </section>

            <div className="anigram-admin-form__actions">
              <button type="submit">
                {saving ? '保存しています…' : '設定を保存'}
              </button>
            </div>
          </fieldset>
        </form>
      ) : null}

      {!loading && activeTab === 'anigram' && settings.length > 0 ? (
        <section className="anigram-panel">
          <div className="anigram-panel__heading">
            <div>
              <p className="anigram-eyebrow">AUDIT LOG</p>
              <h2>設定変更履歴</h2>
            </div>
            {canManage && history.length > 0 ? (
              <button
                type="button"
                className="anigram-history-delete-all"
                disabled={deletingSettingsHistory !== null}
                onClick={() => void removeSettingsHistory()}
              >
                {deletingSettingsHistory === 'all' ? '削除中…' : 'すべて削除'}
              </button>
            ) : null}
          </div>
          <ol className="anigram-timeline">
            {history.map((item) => (
              <li key={item.id}>
                <div className="anigram-history-entry">
                  <time>{formatDateTime(item.updatedAt)}</time>
                  <strong>{item.species} の設定を更新</strong>
                  <span>管理者: {item.updatedByUserId}</span>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    className="anigram-history-delete"
                    disabled={deletingSettingsHistory !== null}
                    aria-label={`${formatDateTime(item.updatedAt)}の設定変更履歴を削除`}
                    onClick={() => void removeSettingsHistory(item.id)}
                  >
                    {deletingSettingsHistory === item.id ? '削除中…' : '削除'}
                  </button>
                ) : null}
              </li>
            ))}
            {history.length === 0 ? <li>設定変更はまだありません。</li> : null}
          </ol>
        </section>
      ) : null}

      {!loading &&
      activeTab === 'instagram' &&
      instagramDraft &&
      instagramDelivery ? (
        <>
          <section className="anigram-panel anigram-instagram-connection-card">
            <div className="anigram-panel__heading">
              <div>
                <p className="anigram-eyebrow">INSTAGRAM CONNECTION</p>
                <h2>Instagram接続</h2>
              </div>
              {canManage ? (
                <span className="anigram-connection-status">
                  <i
                    data-connected={instagramConnection?.connected === true}
                    aria-hidden="true"
                  />
                  {instagramConnectionLoading
                    ? '確認中'
                    : instagramConnection?.connected
                      ? '接続済み'
                      : instagramConnection?.tokenExpired
                        ? '再接続が必要'
                        : '未接続'}
                </span>
              ) : (
                <span>管理者のみ確認できます</span>
              )}
            </div>

            {canManage && instagramConnection?.account ? (
              <p className="anigram-instagram-account">
                接続先 @{instagramConnection.account.username}
              </p>
            ) : null}
            <p className="anigram-instagram-note">
              接続情報はCreative IAと共通です。同じHundredユーザーで接続先を変更・解除すると、Creative IA側にも反映されます。
            </p>
            {canManage ? (
              <Link
                className="anigram-link-button"
                to="/anigram/settings/instagram"
              >
                接続を管理
              </Link>
            ) : null}
          </section>

          <form
            className="anigram-admin-form"
            onSubmit={(event) => void saveInstagramDelivery(event)}
          >
          <fieldset
            className="anigram-admin-fieldset"
            disabled={!canManage || saving}
          >
            <section className="anigram-panel anigram-story-template-card">
              <div className="anigram-panel__heading">
                <div>
                  <p className="anigram-eyebrow">STORY TEMPLATE</p>
                  <h2>ストーリーテンプレート</h2>
                </div>
                <span>1080×1920</span>
              </div>

              <div className="anigram-story-template-grid">
                <div className="anigram-story-template-fields">
                  <label className="anigram-field">
                    <span>見出し</span>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={instagramDraft.storyTitleTemplate}
                      onChange={(event) =>
                        setInstagramDraft((current) =>
                          current
                            ? { ...current, storyTitleTemplate: event.target.value }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label className="anigram-field">
                    <span>メインメッセージ</span>
                    <textarea
                      rows={2}
                      required
                      maxLength={120}
                      value={instagramDraft.storyMessageTemplate}
                      onChange={(event) =>
                        setInstagramDraft((current) =>
                          current
                            ? { ...current, storyMessageTemplate: event.target.value }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label className="anigram-field">
                    <span>反応を促すメッセージ</span>
                    <textarea
                      rows={3}
                      required
                      maxLength={180}
                      value={instagramDraft.storyReactionTemplate}
                      onChange={(event) =>
                        setInstagramDraft((current) =>
                          current
                            ? { ...current, storyReactionTemplate: event.target.value }
                            : current,
                        )
                      }
                    />
                  </label>
                  <p className="anigram-story-template-variables">
                    <span>差し込み変数：</span>
                    {storyTemplateVariableHelp.map((variable) => (
                      <span
                        key={variable.token}
                        className="anigram-story-template-variable"
                        tabIndex={0}
                        aria-label={`${variable.token}：${variable.description}`}
                      >
                        <code>{variable.token}</code>
                        <span role="tooltip">{variable.description}</span>
                      </span>
                    ))}
                  </p>
                </div>

                {storyTemplatePreview ? (
                  <aside className="anigram-story-template-preview">
                    <span>入力プレビュー</span>
                    <h3>{storyTemplatePreview.title}</h3>
                    <strong>{storyTemplatePreview.message}</strong>
                    <p>
                      孵化進捗 <b>40%</b>
                    </p>
                    <small>{storyTemplatePreview.reaction}</small>
                  </aside>
                ) : null}
              </div>

              <div className="anigram-story-template-publish">
                <button
                  type="button"
                  onClick={() => void generateAndPublishStory()}
                  disabled={
                    !canManage ||
                    !instagramConnection?.connected ||
                    instagramConnection.tokenExpired ||
                    publishingGeneratedStory ||
                    instagramSettingsDirty
                  }
                >
                  {publishingGeneratedStory
                    ? '画像生成・公開処理中…'
                    : '生成してストーリーへ配信'}
                </button>
                {!canManage ? (
                  <small>登録済み管理者だけが配信できます。</small>
                ) : instagramSettingsDirty ? (
                  <small>変更したテンプレートを保存してから配信してください。</small>
                ) : !instagramConnection?.connected ||
                  instagramConnection.tokenExpired ? (
                  <small>先に有効なInstagramアカウントを接続してください。</small>
                ) : (
                  <small>確認ダイアログで承認すると、現在の状態から画像を生成して実際に公開します。</small>
                )}
              </div>

              {storyRender ? (
                <div className="anigram-story-render-preview">
                  <img
                    src={storyRender.imageUrl}
                    width={storyRender.width}
                    height={storyRender.height}
                    alt="Instagramへ公開したAnigramストーリー"
                  />
                  {testStoryResult ? (
                    <dl>
                      <div>
                        <dt>公開日時</dt>
                        <dd>
                          {formatDateTime(
                            testStoryResult.story.publishedAt ??
                              testStoryResult.story.updatedAt,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Browser使用時間</dt>
                        <dd>
                          {storyRender.browserMsUsed === null
                            ? '取得不可'
                            : `${storyRender.browserMsUsed.toLocaleString()} ms`}
                        </dd>
                      </div>
                      <div>
                        <dt>公開先</dt>
                        <dd>
                          <a
                            href={testStoryResult.accountUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            @{testStoryResult.accountUsername}
                          </a>
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="anigram-panel">
              <div className="anigram-panel__heading">
                <div>
                  <p className="anigram-eyebrow">REACTION SYNC</p>
                  <h2 className="anigram-heading-with-help">
                    Instagram反応同期
                    <span className="anigram-help">
                      <span
                        className="anigram-help__trigger"
                        tabIndex={0}
                        aria-label="通常のサービス停止手順を表示"
                      >
                        ?
                      </span>
                      <span className="anigram-help__tooltip" role="tooltip">
                        <strong>通常のサービス停止手順</strong>
                        <ol>
                          <li>Instagram反応同期をOFFにする</li>
                          <li>停止理由を入力する</li>
                          <li>Instagram設定を保存する</li>
                          <li>次回Cronが停止中として終了することを確認する</li>
                          <li>メンテナンス完了後にONへ戻す</li>
                        </ol>
                      </span>
                    </span>
                  </h2>
                </div>
                <span>
                  {instagramDraft.reactionSyncEnabled ? '稼働中' : '停止中'}
                </span>
              </div>

              <label className="anigram-toggle-field">
                <span>
                  <strong>Instagram反応の自動取得</strong>
                  <small>
                    OFFの場合、Cronは起動しますがInstagram APIへアクセスせず終了します。
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={instagramDraft.reactionSyncEnabled}
                  onChange={(event) =>
                    setInstagramDraft((current) =>
                      current
                        ? {
                            ...current,
                            reactionSyncEnabled: event.target.checked,
                            syncPauseReason: event.target.checked
                              ? null
                              : current.syncPauseReason,
                          }
                        : current,
                    )
                  }
                />
              </label>

              <label className="anigram-field">
                <span>停止理由</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  required={!instagramDraft.reactionSyncEnabled}
                  disabled={instagramDraft.reactionSyncEnabled}
                  placeholder="例: システムメンテナンスのため"
                  value={instagramDraft.syncPauseReason ?? ''}
                  onChange={(event) =>
                    setInstagramDraft((current) =>
                      current
                        ? { ...current, syncPauseReason: event.target.value }
                        : current,
                    )
                  }
                />
              </label>

              <dl className="anigram-sync-status">
                <div>
                  <dt>最終同期</dt>
                  <dd>
                    {instagramDelivery.lastSyncAt === null
                      ? '未実行'
                      : formatDateTime(instagramDelivery.lastSyncAt)}
                  </dd>
                </div>
                <div>
                  <dt>最終結果</dt>
                  <dd>{instagramDelivery.lastSyncStatus ?? '記録なし'}</dd>
                </div>
                {!instagramDraft.reactionSyncEnabled &&
                instagramDelivery.syncPausedAt !== null ? (
                  <div>
                    <dt>停止日時</dt>
                    <dd>{formatDateTime(instagramDelivery.syncPausedAt)}</dd>
                  </div>
                ) : null}
              </dl>

              {canManage ? (
                <Link
                  className="anigram-link-button"
                  to="/anigram/admin/instagram-sync"
                >
                  同期管理の詳細を見る
                </Link>
              ) : null}

              <aside className="anigram-emergency-note">
                <h3>停止時の注意事項：緊急時の完全停止</h3>
                <p>
                  このスイッチでは、開始済みのCron処理は中断できません。不正アクセスや重大障害など、即時かつ完全な停止が必要な場合は、Cloudflare DashboardでCron Triggerを削除するか、Wrangler設定のcronsを空配列にしてデプロイしてください。復旧時はCron設定を戻して再デプロイが必要です。
                </p>
              </aside>
            </section>

            <section className="anigram-panel">
              <div className="anigram-panel__heading">
                <div>
                  <p className="anigram-eyebrow">INSTAGRAM DELIVERY</p>
                  <h2>自動配信設定</h2>
                </div>
                <span>
                  最終更新 {formatDateTime(instagramDelivery.updatedAt)}
                </span>
              </div>

              <label className="anigram-toggle-field">
                <span>
                  <strong>自動配信</strong>
                  <small>指定時刻に対象ペットの情報を配信する設定です。</small>
                </span>
                <input
                  type="checkbox"
                  checked={instagramDraft.enabled}
                  onChange={(event) =>
                    setInstagramDraft((current) =>
                      current
                        ? { ...current, enabled: event.target.checked }
                        : current,
                    )
                  }
                />
              </label>

              <div className="anigram-field-grid anigram-instagram-fields">
                <label className="anigram-field">
                  <span>対象ペット</span>
                  <select
                    value={instagramDraft.species}
                    onChange={(event) =>
                      setInstagramDraft((current) =>
                        current
                          ? { ...current, species: event.target.value }
                          : current,
                      )
                    }
                  >
                    {settings.map((item) => (
                      <option key={item.species} value={item.species}>
                        {item.displayName}（{item.species}）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="anigram-field">
                  <span>配信時刻</span>
                  <input
                    type="time"
                    required
                    value={instagramDraft.deliveryTime}
                    onChange={(event) =>
                      setInstagramDraft((current) =>
                        current
                          ? { ...current, deliveryTime: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="anigram-field">
                  <span>タイムゾーン</span>
                  <input type="text" value={instagramDelivery.timezone} readOnly />
                </label>
              </div>

              <p className="anigram-instagram-note">
                配信条件とストーリー文言を保存します。指定時刻に投稿するCron処理への接続は次の実装で行います。
              </p>
            </section>

            <div className="anigram-admin-form__actions">
              <button type="submit">
                {saving ? '保存しています…' : 'Instagram設定を保存'}
              </button>
            </div>
          </fieldset>
          </form>
        </>
      ) : null}

      {!loading && activeTab === 'administrators' ? (
        <>
          <section className="anigram-panel">
            <div className="anigram-panel__heading">
              <div>
                <p className="anigram-eyebrow">REGISTER</p>
                <h2>管理者を登録</h2>
              </div>
            </div>
            <form
              className="anigram-admin-register"
              onSubmit={(event) => void registerAdministrator(event)}
            >
              <label className="anigram-field">
                <span>Cognitoユーザー名</span>
                <input
                  type="text"
                  required
                  placeholder="ユーザー名またはCognito sub"
                  value={newAdministratorId}
                  onChange={(event) => setNewAdministratorId(event.target.value)}
                  disabled={!canManage || updatingAdministrator}
                />
              </label>
              <button
                type="submit"
                disabled={!canManage || updatingAdministrator}
              >
                管理者登録
              </button>
            </form>
          </section>

          <section className="anigram-panel">
            <div className="anigram-panel__heading">
              <div>
                <p className="anigram-eyebrow">ADMINISTRATORS</p>
                <h2>登録済み管理者</h2>
              </div>
              <span>{administrators.length}名</span>
            </div>
            <ul className="anigram-admin-list">
              {administrators.map((administrator) => (
                <li key={administrator.userId}>
                  <div>
                    <strong>{administrator.userId}</strong>
                    <span>登録日 {formatDateTime(administrator.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={
                      !canManage ||
                      updatingAdministrator ||
                      administrators.length <= 1
                    }
                    onClick={() => void removeAdministrator(administrator)}
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  )
}

export default AnigramAdminPage
