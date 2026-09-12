import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteAnigramSettingsHistory,
  generateAnigramStoryRender,
  getAnigramAdminAccess,
  getAnigramAdminSettings,
  publishAnigramTestStory,
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

function createTestStoryImage(accountUsername: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1920
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('CANVAS_UNAVAILABLE'))

  const background = context.createLinearGradient(0, 0, 1080, 1920)
  background.addColorStop(0, '#07100e')
  background.addColorStop(0.55, '#0b211b')
  background.addColorStop(1, '#173b31')
  context.fillStyle = background
  context.fillRect(0, 0, 1080, 1920)

  const glow = context.createRadialGradient(540, 860, 80, 540, 860, 570)
  glow.addColorStop(0, 'rgba(118, 224, 195, 0.22)')
  glow.addColorStop(1, 'rgba(118, 224, 195, 0)')
  context.fillStyle = glow
  context.fillRect(0, 260, 1080, 1220)

  context.fillStyle = '#75d9c1'
  context.font = '700 34px sans-serif'
  context.letterSpacing = '8px'
  context.fillText('ANIGRAM', 84, 132)
  context.letterSpacing = '0px'
  context.fillStyle = '#eef4f1'
  context.font = '700 78px sans-serif'
  context.fillText('ストーリー配信テスト', 84, 242)
  context.fillStyle = '#9eb0aa'
  context.font = '400 32px sans-serif'
  context.fillText(`@${accountUsername} への接続を確認しています`, 84, 302)

  context.save()
  context.translate(540, 900)
  context.fillStyle = '#263c37'
  context.beginPath()
  context.ellipse(0, 300, 340, 92, 0, 0, Math.PI * 2)
  context.fill()
  const egg = context.createRadialGradient(-90, -120, 20, 0, 0, 300)
  egg.addColorStop(0, '#f3fff7')
  egg.addColorStop(0.45, '#b9efc0')
  egg.addColorStop(1, '#568369')
  context.fillStyle = egg
  context.beginPath()
  context.ellipse(0, 0, 205, 280, 0, 0, Math.PI * 2)
  context.fill()
  context.restore()

  context.textAlign = 'center'
  context.fillStyle = '#eef4f1'
  context.font = '700 58px sans-serif'
  context.fillText('ハリネズミを育てています', 540, 1420)
  context.fillStyle = '#86ddd0'
  context.font = '500 34px sans-serif'
  context.fillText('Instagram Stories API 接続テスト', 540, 1490)

  context.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  context.beginPath()
  context.moveTo(84, 1740)
  context.lineTo(996, 1740)
  context.stroke()
  context.textAlign = 'left'
  context.fillStyle = '#91a39d'
  context.font = '400 28px sans-serif'
  context.fillText('この画像は管理画面から手動配信された検証用です', 84, 1810)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('IMAGE_FAILED')),
      'image/jpeg',
      0.92,
    )
  })
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
  const [publishingTestStory, setPublishingTestStory] = useState(false)
  const [generatingStoryRender, setGeneratingStoryRender] = useState(false)
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

  const publishTestStory = async () => {
    const username = instagramConnection?.account?.username
    if (!canManage || !username || publishingTestStory) return
    if (
      !window.confirm(
        `@${username} のInstagramストーリーズへ検証画像を実際に公開します。よろしいですか？`,
      )
    ) return

    setPublishingTestStory(true)
    setTestStoryResult(null)
    setMessage(null)
    setError(null)
    try {
      const result = await publishAnigramTestStory(
        await createTestStoryImage(username),
      )
      setTestStoryResult(result)
      setMessage(`@${result.accountUsername} へストーリーを公開しました。`)
    } catch (requestError) {
      const typedError = requestError as Error & {
        providerCode?: string
        responseMessage?: string
      }
      const detail = typedError.providerCode
        ? `（Instagramエラー: ${typedError.providerCode}）`
        : ''
      setError(
        `${typedError.responseMessage ?? 'ストーリーを公開できませんでした。'}${detail}`,
      )
    } finally {
      setPublishingTestStory(false)
    }
  }

  const generateStoryRender = async () => {
    if (!canManage || generatingStoryRender) return
    setGeneratingStoryRender(true)
    setStoryRender(null)
    setMessage(null)
    setError(null)
    try {
      const render = await generateAnigramStoryRender()
      setStoryRender(render)
      setMessage('Browser Runでストーリー画像を生成しました。')
    } catch (requestError) {
      const responseMessage = (
        requestError as Error & { responseMessage?: string }
      ).responseMessage
      setError(responseMessage ?? 'Browser Runで画像を生成できませんでした。')
    } finally {
      setGeneratingStoryRender(false)
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

          <section className="anigram-panel anigram-story-test-card">
            <div className="anigram-panel__heading">
              <div>
                <p className="anigram-eyebrow">STORY PUBLISH TEST</p>
                <h2>ストーリー配信検証</h2>
              </div>
              <span>管理者専用</span>
            </div>
            <p>
              Browser RunによるHTML/CSS画像生成を確認できます。生成だけではInstagramへ公開されません。
            </p>
            <div className="anigram-story-render-actions">
              <button
                type="button"
                onClick={() => void generateStoryRender()}
                disabled={!canManage || generatingStoryRender}
              >
                {generatingStoryRender
                  ? 'Browser Runで生成中…'
                  : 'Browser Runで画像を生成'}
              </button>
              <small>
                現在の共有ペット状態をスナップショットし、1080×1920のJPEGとしてR2へ保存します。
              </small>
            </div>
            {storyRender ? (
              <div className="anigram-story-render-preview">
                <img
                  src={storyRender.imageUrl}
                  width={storyRender.width}
                  height={storyRender.height}
                  alt="Browser Runで生成したAnigramストーリーのプレビュー"
                />
                <dl>
                  <div>
                    <dt>生成日時</dt>
                    <dd>{formatDateTime(storyRender.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>画像サイズ</dt>
                    <dd>{storyRender.width}×{storyRender.height}</dd>
                  </div>
                  <div>
                    <dt>Browser使用時間</dt>
                    <dd>
                      {storyRender.browserMsUsed === null
                        ? '取得不可'
                        : `${storyRender.browserMsUsed.toLocaleString()} ms`}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
            <div className="anigram-story-publish-test">
              <h3>Instagram公開の再検証</h3>
              <p>
                従来の固定検証画像を生成し、接続中のInstagramアカウントへストーリーズとして実際に公開します。
              </p>
              <button
                type="button"
                onClick={() => void publishTestStory()}
                disabled={
                  !canManage ||
                  !instagramConnection?.connected ||
                  instagramConnection.tokenExpired ||
                  publishingTestStory
                }
              >
                {publishingTestStory
                  ? '公開処理中…'
                  : '検証画像をストーリーへ配信'}
              </button>
              {!canManage ? (
                <small>登録済み管理者だけが配信できます。</small>
              ) : !instagramConnection?.connected ||
                instagramConnection.tokenExpired ? (
                <small>先に有効なInstagramアカウントを接続してください。</small>
              ) : (
                <small>確認ダイアログで承認するまで公開されません。</small>
              )}
              {testStoryResult ? (
                <dl className="anigram-story-test-result">
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
                    <dt>InstagramメディアID</dt>
                    <dd>{testStoryResult.story.instagramMediaId}</dd>
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
          </section>

          <form
            className="anigram-admin-form"
            onSubmit={(event) => void saveInstagramDelivery(event)}
          >
          <fieldset
            className="anigram-admin-fieldset"
            disabled={!canManage || saving}
          >
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
                現段階では配信条件の保存のみです。メッセージ・画像設定の追加後に、自動投稿処理へ接続します。
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
