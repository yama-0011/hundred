import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AnigramUnityView, {
  type AnigramDisplayState,
} from '../../components/Anigram/AnigramUnityView'
import {
  addAnigramValidationGrowthEvent,
  getAnigramPet,
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
  if (pet.status === 'dead') return '眠っています'
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
    void loadPet(true)
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

          <div className="anigram-status__actions">
            <button
              type="button"
              onClick={() => void feed()}
              disabled={
                loading ||
                feeding ||
                !pet ||
                pet.lifeStage === 'hatching' ||
                pet.status === 'dead'
              }
            >
              {feeding ? '反映中です…' : actionLabel}
            </button>
          </div>

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
          <p className="anigram-status__note">
            Instagram反応はWorkerが定期取得し、D1を経由して自動反映します。
            このボタンはPhase 1の動作確認用です。
          </p>
        </aside>
      </section>
    </main>
  )
}

export default AnigramPage
