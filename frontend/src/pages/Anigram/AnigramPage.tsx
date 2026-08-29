import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AnigramUnityView, {
  type AnigramDisplayState,
} from '../../components/Anigram/AnigramUnityView'
import {
  addAnigramValidationGrowthEvent,
  getAnigramPet,
  resetAnigramPetForValidation,
  runAnigramStarvationValidation,
  type AnigramStarvationValidationAction,
  type AnigramPetState,
} from '../../services/Anigram/anigramApi'
import '../../styles/Anigram/anigram.css'

const initialDisplayState: AnigramDisplayState = {
  species: 'hedgehog',
  status: 'alive',
  lifeStage: 'egg',
  evolutionStage: 'base',
  hatchProgressPercent: 0,
  hatchingProgressPercent: null,
  fullnessPercent: null,
  motion: 'egg_idle',
}

function formatDateTime(value: number | null) {
  if (value === null) return 'まだありません'
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function resolveStageMessage(pet: AnigramPetState | null) {
  if (!pet) return '準備中です'
  if (pet.status === 'dead') return '死亡しています'
  if (pet.lifeStage === 'egg') return '卵を温めています'
  if (pet.lifeStage === 'hatching') return 'もうすぐ孵化します'
  if (pet.lifeStage === 'baby') return '元気な幼体です'
  return '元気です'
}

/** Worker / D1のゲーム状態をUnity表示へ反映するAnigramホーム。 */
function AnigramPage() {
  const [pet, setPet] = useState<AnigramPetState | null>(null)
  const [loading, setLoading] = useState(true)
  const [feeding, setFeeding] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [validatingStarvation, setValidatingStarvation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [motion, setMotion] = useState<AnigramDisplayState['motion'] | null>(null)
  const petRef = useRef<AnigramPetState | null>(null)
  const motionTimerRef = useRef<number | null>(null)

  const showGrowthMotion = useCallback((nextPet: AnigramPetState) => {
    const previousPet = petRef.current
    const hatchPointsIncreased =
      typeof previousPet?.hatchPoints === 'number' &&
      typeof nextPet.hatchPoints === 'number' &&
      nextPet.hatchPoints > previousPet.hatchPoints
    const fullnessIncreased =
      typeof previousPet?.fullnessPoints === 'number' &&
      typeof nextPet.fullnessPoints === 'number' &&
      nextPet.fullnessPoints > previousPet.fullnessPoints

    if (hatchPointsIncreased || fullnessIncreased) {
      setMotion(nextPet.lifeStage === 'egg' ? 'egg_idle' : 'feed')
      if (motionTimerRef.current !== null) {
        window.clearTimeout(motionTimerRef.current)
      }
      motionTimerRef.current = window.setTimeout(() => {
        setMotion(null)
        motionTimerRef.current = null
      }, 900)
    }

    petRef.current = nextPet
  }, [])

  const loadPet = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const nextPet = await getAnigramPet()
      showGrowthMotion(nextPet)
      setPet(nextPet)
      setError(null)
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message === 'AUTH_REQUIRED'
          ? 'Anigramを始めるにはHundredへのサインインが必要です。'
          : 'ゲーム状態を取得できませんでした。',
      )
    } finally {
      setLoading(false)
    }
  }, [showGrowthMotion])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPet(true), 0)
    return () => window.clearTimeout(timeout)
  }, [loadPet])

  useEffect(() => {
    const pollingInterval = pet?.lifeStage === 'hatching' ? 5_000 : 30_000
    const interval = window.setInterval(() => void loadPet(), pollingInterval)
    return () => window.clearInterval(interval)
  }, [loadPet, pet?.lifeStage])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadPet()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      if (motionTimerRef.current !== null) {
        window.clearTimeout(motionTimerRef.current)
      }
    }
  }, [loadPet])

  const displayState = useMemo<AnigramDisplayState>(
    () =>
      pet
        ? {
            ...pet.displayState,
            motion: motion ?? pet.displayState.motion,
          }
        : initialDisplayState,
    [motion, pet],
  )

  const feed = async () => {
    if (!pet || pet.lifeStage === 'hatching' || pet.status === 'dead') return
    setFeeding(true)
    try {
      const nextPet = await addAnigramValidationGrowthEvent()
      showGrowthMotion(nextPet)
      setPet(nextPet)
      setError(null)
    } catch {
      setError('成長ポイントを反映できませんでした。')
    } finally {
      setFeeding(false)
    }
  }

  const resetPet = async () => {
    if (!pet || resetting) return
    const confirmed = window.confirm(
      '育成状態を卵（0ポイント）へ戻します。過去の反応履歴は削除されません。よろしいですか？',
    )
    if (!confirmed) return

    setResetting(true)
    try {
      const nextPet = await resetAnigramPetForValidation()
      if (motionTimerRef.current !== null) {
        window.clearTimeout(motionTimerRef.current)
        motionTimerRef.current = null
      }
      setMotion(null)
      petRef.current = nextPet
      setPet(nextPet)
      setError(null)
    } catch {
      setError('育成状態を卵へ戻せませんでした。')
    } finally {
      setResetting(false)
    }
  }

  const validateStarvation = async (
    action: AnigramStarvationValidationAction,
  ) => {
    if (!pet || validatingStarvation) return
    const messages = {
      prepare: '死亡検証を開始し、幼体の満腹度を1%にします。よろしいですか？',
      advance_to_zero:
        '満腹度が0になるまでの時間経過をD1へ反映します。0になっても即死亡しないことを確認します。',
      advance_grace:
        '設定されている死亡猶予期間を経過させ、死亡状態へ移行します。よろしいですか？',
    }
    if (!window.confirm(messages[action])) return

    setValidatingStarvation(true)
    try {
      const nextPet = await runAnigramStarvationValidation(action)
      petRef.current = nextPet
      setMotion(null)
      setPet(nextPet)
      setError(null)
    } catch (requestError) {
      setError(
        requestError instanceof Error &&
          requestError.message === 'ADMIN_REQUIRED'
          ? '死亡フローの検証には管理者権限が必要です。'
          : '死亡フローを検証できませんでした。現在の育成状態を確認してください。',
      )
    } finally {
      setValidatingStarvation(false)
    }
  }

  const isBeforeHatching =
    pet?.lifeStage === 'egg' || pet?.lifeStage === 'hatching'
  const progressValue = isBeforeHatching
    ? (pet?.hatchProgressPercent ?? 0)
    : (pet?.fullnessPercent ?? 0)
  const progressLabel = isBeforeHatching ? '孵化進捗' : '満腹度'
  const actionLabel =
    pet?.lifeStage === 'egg'
      ? '卵を温める'
      : pet?.lifeStage === 'hatching'
        ? '孵化を待っています'
        : 'ごはんをあげる'

  return (
    <main className="anigram-page">
      <header className="anigram-header">
        <Link to="/">← Hundredへ戻る</Link>
        <span>技術検証</span>
      </header>

      <section className="anigram-hero">
        <div className="anigram-hero__copy">
          <p className="anigram-eyebrow">USER APP</p>
          <h1>Anigram</h1>
          <p>みんなの反応で、ハリネズミを育てる。</p>
        </div>

        <AnigramUnityView displayState={displayState} />

        <aside className="anigram-status">
          <div className="anigram-status__heading">
            <div>
              <p>{pet?.displayName ?? 'ハリネズミ'}</p>
              <h2>{resolveStageMessage(pet)}</h2>
            </div>
            <strong>{progressValue}%</strong>
          </div>

          <div className="anigram-status__progress-label">
            <span>{progressLabel}</span>
            {pet?.lifeStage === 'egg' ? (
              <span>
                {pet.hatchPoints} / {pet.hatchRequiredPoints}
              </span>
            ) : null}
          </div>
          <div
            className="anigram-status__progress"
            role="progressbar"
            aria-label={progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressValue}
          >
            <span style={{ width: `${progressValue}%` }} />
          </div>

          {pet?.canManageValidation ? (
            <details className="anigram-validation">
              <summary>管理者向け技術検証</summary>
              <div className="anigram-status__actions">
                <button
                  type="button"
                  onClick={() => void feed()}
                  disabled={
                    loading ||
                    feeding ||
                    resetting ||
                    validatingStarvation ||
                    !pet ||
                    pet.lifeStage === 'hatching' ||
                    pet.status === 'dead'
                  }
                >
                  {feeding ? '反映中です…' : actionLabel}
                </button>
                {pet.status !== 'dead' ? (
                  <button
                    type="button"
                    className="anigram-button--warning"
                    onClick={() =>
                      void validateStarvation(
                        pet.zeroStartedAt !== null
                          ? 'advance_grace'
                          : pet.fullnessPoints !== null &&
                              pet.fullnessPoints <= 1
                            ? 'advance_to_zero'
                            : 'prepare',
                      )
                    }
                    disabled={
                      loading || feeding || resetting || validatingStarvation
                    }
                  >
                    {validatingStarvation
                      ? '検証状態を反映中です…'
                      : pet.zeroStartedAt !== null
                        ? '死亡猶予を経過させる'
                        : pet.fullnessPoints !== null && pet.fullnessPoints <= 1
                          ? '満腹度0まで時間を進める'
                          : '死亡検証を開始（満腹度1%）'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="anigram-button--secondary"
                  onClick={() => void resetPet()}
                  disabled={
                    loading || feeding || resetting || validatingStarvation || !pet
                  }
                >
                  {resetting ? '初期化中です…' : '育成状態を卵へ戻す'}
                </button>
              </div>
            </details>
          ) : null}

          {error ? <p className="anigram-status__error">{error}</p> : null}
          {pet?.lifeStage === 'hatching' ? (
            <p className="anigram-status__meta" aria-live="polite">
              孵化まであと約{pet.hatchingRemainingSeconds ?? 0}秒
            </p>
          ) : null}
          {!isBeforeHatching && pet ? (
            <p className="anigram-status__meta">
              最終給餌: {formatDateTime(pet.lastFedAt)}
            </p>
          ) : null}
          {pet?.zeroStartedAt !== null && pet?.status === 'alive' ? (
            <p className="anigram-status__warning" aria-live="polite">
              満腹度0です。死亡までの猶予は残り約
              {Math.ceil((pet.starvationRemainingSeconds ?? 0) / 60)}分です。
            </p>
          ) : null}
          {pet?.status === 'dead' ? (
            <p className="anigram-status__warning" aria-live="polite">
              死亡日時: {formatDateTime(pet.diedAt)}
            </p>
          ) : null}
          <p className="anigram-status__note">
            Instagram反応はWorkerが定期取得し、D1を経由して自動反映します。
            管理者向け操作で初期化しても反応履歴は残ります。
          </p>
        </aside>
      </section>
    </main>
  )
}

export default AnigramPage
