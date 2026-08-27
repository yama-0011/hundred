import { useCallback, useEffect, useMemo, useState } from 'react'
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

  const loadPet = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      setPet(await getAnigramPet())
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
  }, [])

  useEffect(() => {
    void loadPet(true)
  }, [loadPet])

  useEffect(() => {
    if (pet?.lifeStage !== 'hatching') return
    const interval = window.setInterval(() => void loadPet(), 5_000)
    return () => window.clearInterval(interval)
  }, [loadPet, pet?.lifeStage])

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
      setPet(nextPet)
      setError(null)
      setMotion(nextPet.lifeStage === 'egg' ? 'egg_idle' : 'feed')
      window.setTimeout(() => setMotion(null), 900)
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
          {!isBeforeHatching && pet ? (
            <p className="anigram-status__meta">
              最終給餌: {formatDateTime(pet.lastFedAt)}
            </p>
          ) : null}
          <p className="anigram-status__note">
            状態はWorkerが現在時刻を反映し、D1へ保存しています。
            このボタンはPhase 1の動作確認用です。
          </p>
        </aside>
      </section>
    </main>
  )
}

export default AnigramPage
