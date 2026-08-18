import { useEffect, useRef } from 'react'
import '../../../styles/Hundred/hundred-wallpaper-background.css'
import type { WallpaperId } from './hundredWallpaperOptions'

type HundredWallpaperBackgroundProps = {
  wallpaper: WallpaperId
}

type WallpaperPalette = {
  background: [string, string]
  glow: [string, string]
  waves: [string, string, string]
  particles: [string, string]
  seed: number
}

type Particle = {
  x: number
  y: number
  radius: number
  driftAngle: number
  driftSpeed: number
  turnSpeed: number
  opacity: number
  phase: number
  twinkleSpeed: number
}

// 壁紙ごとの描画色と乱数シードをまとめ、Canvasの処理から見た目の設定を分離する。
const wallpaperPalettes: Record<WallpaperId, WallpaperPalette> = {
  mist: {
    background: ['#f8faf6', '#dce8df'],
    glow: ['rgba(255, 255, 255, 0.68)', 'rgba(76, 166, 141, 0.2)'],
    waves: [
      'rgba(255, 255, 255, 0.5)',
      'rgba(79, 173, 147, 0.22)',
      'rgba(38, 119, 101, 0.13)',
    ],
    particles: ['255, 255, 255', '39, 119, 99'],
    seed: 1289,
  },
  midnight: {
    background: ['#1b1823', '#080b13'],
    glow: ['rgba(147, 107, 169, 0.2)', 'rgba(83, 91, 145, 0.16)'],
    waves: [
      'rgba(232, 224, 240, 0.25)',
      'rgba(125, 101, 156, 0.18)',
      'rgba(73, 83, 137, 0.14)',
    ],
    particles: ['240, 233, 245', '156, 135, 183'],
    seed: 2741,
  },
  aurora: {
    background: ['#071c1f', '#080f19'],
    glow: ['rgba(51, 201, 171, 0.19)', 'rgba(61, 137, 192, 0.18)'],
    waves: [
      'rgba(100, 234, 195, 0.27)',
      'rgba(75, 174, 213, 0.25)',
      'rgba(44, 202, 163, 0.14)',
    ],
    particles: ['202, 255, 237', '92, 196, 196'],
    seed: 4093,
  },
}

/** 同じシードから同じ並びを生成し、再表示時に粒子配置が激しく変わるのを防ぐ。 */
function createSeededRandom(seed: number) {
  let state = seed >>> 0

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** 画面面積に応じた数の粒子を、不均一な位置・大きさ・速度で生成する。 */
function createParticles(width: number, height: number, seed: number) {
  const random = createSeededRandom(seed + Math.round(width) * 31)
  const count = Math.min(130, Math.max(42, Math.round((width * height) / 9500)))
  const clusters = Array.from({ length: 4 }, () => ({
    x: random() * width,
    y: random() * height,
    spreadX: width * (0.16 + random() * 0.18),
    spreadY: height * (0.12 + random() * 0.16),
  }))

  return Array.from({ length: count }, (): Particle => {
    // 多くを緩やかな塊の周辺へ置き、残りを画面全体へ散らして疎密を作る。
    const cluster = clusters[Math.floor(random() * clusters.length)]
    const useCluster = random() < 0.72
    const clusterOffsetX = (random() + random() + random() - 1.5) * cluster.spreadX
    const clusterOffsetY = (random() + random() + random() - 1.5) * cluster.spreadY
    const x = useCluster
      ? (cluster.x + clusterOffsetX + width) % width
      : random() * width
    const y = useCluster
      ? (cluster.y + clusterOffsetY + height) % height
      : random() * height
    const isLargeParticle = random() < 0.045

    return {
      x,
      y,
      radius: isLargeParticle ? 1.5 + random() * 0.5 : 0.5 + random() ** 1.7 * 0.5,
      driftAngle: random() * Math.PI * 2,
      driftSpeed: 0.004 + random() * 0.014,
      turnSpeed: (random() - 0.5) * 0.00016,
      opacity: 0.08 + random() ** 1.8 * 0.3,
      phase: random() * Math.PI * 2,
      twinkleSpeed: 0.00028 + random() * 0.00082,
    }
  })
}

/** 選択されたプリセットをCanvasへ描画し、Hundred Homeの背景として表示する。 */
function HundredWallpaperBackground({
  wallpaper,
}: HundredWallpaperBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const palette = wallpaperPalettes[wallpaper]
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 0
    let height = 0
    let particles: Particle[] = []
    let animationFrame = 0
    let previousTime = 0

    /** Canvasを表示サイズと端末解像度へ合わせ、粒子を作り直す。 */
    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      particles = createParticles(width, height, palette.seed)
    }

    /** ベース色と画面の端から差し込む光を描画する。 */
    const drawBase = () => {
      const background = context.createLinearGradient(0, 0, width, height)
      background.addColorStop(0, palette.background[0])
      background.addColorStop(1, palette.background[1])
      context.fillStyle = background
      context.fillRect(0, 0, width, height)

      const leftGlow = context.createRadialGradient(
        width * 0.08,
        height * 0.08,
        0,
        width * 0.08,
        height * 0.08,
        Math.max(width, height) * 0.72,
      )
      leftGlow.addColorStop(0, palette.glow[0])
      leftGlow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.fillStyle = leftGlow
      context.fillRect(0, 0, width, height)

      const rightGlow = context.createRadialGradient(
        width * 0.94,
        height * 0.34,
        0,
        width * 0.94,
        height * 0.34,
        Math.max(width, height) * 0.58,
      )
      rightGlow.addColorStop(0, palette.glow[1])
      rightGlow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.fillStyle = rightGlow
      context.fillRect(0, 0, width, height)
    }

    /** 位相の異なる曲線を重ね、ゆっくり形を変える光の波を描画する。 */
    const drawWaves = (time: number) => {
      const centerY = height * 0.57

      palette.waves.forEach((color, index) => {
        const phase = time * (0.00016 + index * 0.000025) + index * 1.8
        const amplitude = height * (0.025 + index * 0.014)
        const offsetY = (index - 1) * height * 0.045
        const gradient = context.createLinearGradient(0, 0, width, 0)
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
        gradient.addColorStop(0.22, color)
        gradient.addColorStop(0.72, color)
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

        context.beginPath()
        context.moveTo(-width * 0.08, centerY + offsetY)

        // 短い線分を連続させ、端末幅に依存しない滑らかな波形を作る。
        const segments = 48
        for (let point = 0; point <= segments; point += 1) {
          const x = (point / segments) * width * 1.16 - width * 0.08
          const normalizedX = point / segments
          const y =
            centerY +
            offsetY +
            Math.sin(normalizedX * Math.PI * 2.2 + phase) * amplitude +
            Math.sin(normalizedX * Math.PI * 4.1 - phase * 0.65) *
              amplitude *
              0.36
          context.lineTo(x, y)
        }

        context.strokeStyle = gradient
        context.lineWidth = Math.max(18, height * (0.045 - index * 0.006))
        context.lineCap = 'round'
        context.shadowColor = color
        context.shadowBlur = 24 + index * 7
        context.stroke()
        context.shadowBlur = 0
      })
    }

    /** 粒子を異なる方向へゆっくり漂わせ、個別の周期で穏やかに明滅させる。 */
    const drawParticles = (time: number, elapsed: number) => {
      particles.forEach((particle, index) => {
        if (!motionQuery.matches) {
          particle.driftAngle += particle.turnSpeed * elapsed
          particle.x += Math.cos(particle.driftAngle) * particle.driftSpeed * elapsed
          particle.y += Math.sin(particle.driftAngle) * particle.driftSpeed * elapsed

          if (particle.x < -4) particle.x = width + 4
          if (particle.x > width + 4) particle.x = -4
          if (particle.y < -4) particle.y = height + 4
          if (particle.y > height + 4) particle.y = -4
        }

        const twinkle =
          0.72 + Math.sin(time * particle.twinkleSpeed + particle.phase) * 0.28
        const color = palette.particles[index % palette.particles.length]
        context.beginPath()
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
        context.fillStyle = `rgba(${color}, ${particle.opacity * twinkle})`
        context.fill()
      })
    }

    /** 1フレーム分の背景を描画し、動きを許可している場合は次の描画を予約する。 */
    const renderFrame = (time: number) => {
      const elapsed = previousTime === 0 ? 16 : Math.min(time - previousTime, 40)
      previousTime = time
      context.clearRect(0, 0, width, height)
      drawBase()
      drawWaves(motionQuery.matches ? 0 : time)
      drawParticles(motionQuery.matches ? 0 : time, elapsed)

      if (!motionQuery.matches && !document.hidden) {
        animationFrame = window.requestAnimationFrame(renderFrame)
      }
    }

    /** 描画予約を整理してから、現在のモーション設定で背景を再描画する。 */
    const restartAnimation = () => {
      window.cancelAnimationFrame(animationFrame)
      previousTime = 0
      renderFrame(0)
    }

    /** タブの表示状態に合わせ、非表示中の描画を停止して復帰時に再開する。 */
    const handleVisibilityChange = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(animationFrame)
        return
      }

      restartAnimation()
    }

    /** 画面サイズ変更後にCanvasを調整して描画を再開する。 */
    const handleResize = () => {
      resizeCanvas()
      restartAnimation()
    }

    resizeCanvas()
    restartAnimation()
    window.addEventListener('resize', handleResize)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    motionQuery.addEventListener('change', restartAnimation)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      motionQuery.removeEventListener('change', restartAnimation)
    }
  }, [wallpaper])

  return (
    <div
      className="hundred-wallpaper-background"
      data-hundred-wallpaper-background={wallpaper}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="hundred-wallpaper-background__canvas" />
    </div>
  )
}

export default HundredWallpaperBackground
