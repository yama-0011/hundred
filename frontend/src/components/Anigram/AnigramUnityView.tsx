import { useEffect, useRef, useState } from 'react'

export type AnigramDisplayState = {
  species: string
  status: 'alive' | 'dead'
  lifeStage: 'egg' | 'hatching' | 'baby' | 'adult'
  motion: 'egg_idle' | 'hatching' | 'idle' | 'feed' | 'dead'
  evolutionStage: string
  hatchProgressPercent: number | null
  fullnessPercent: number | null
}

type UnityInstance = {
  SendMessage: (objectName: string, methodName: string, value: string) => void
  Quit: () => Promise<void>
}

type UnityConfig = {
  dataUrl: string
  frameworkUrl: string
  codeUrl: string
  streamingAssetsUrl: string
  companyName: string
  productName: string
  productVersion: string
}

type UnityWindow = Window & {
  createUnityInstance?: (
    canvas: HTMLCanvasElement,
    config: UnityConfig,
    onProgress: (progress: number) => void,
  ) => Promise<UnityInstance>
}

const unityRoot = '/anigram-unity'
const loaderUrl = `${unityRoot}/Build/WebGL.loader.js`

function loadUnityLoader() {
  const unityWindow = window as UnityWindow

  if (unityWindow.createUnityInstance) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${loaderUrl}"]`,
    )
    const script = existingScript ?? document.createElement('script')

    const handleLoad = () => resolve()
    const handleError = () => reject(new Error('Unity loader could not be loaded.'))

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })

    if (!existingScript) {
      script.src = loaderUrl
      script.async = true
      document.body.appendChild(script)
    }
  })
}

type AnigramUnityViewProps = {
  displayState: AnigramDisplayState
}

/** Unity WebGLを読み込み、Reactで保持する表示状態を3Dモデルへ渡す。 */
function AnigramUnityView({ displayState }: AnigramUnityViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const unityInstanceRef = useRef<UnityInstance | null>(null)
  const displayStateRef = useRef(displayState)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  displayStateRef.current = displayState

  useEffect(() => {
    let cancelled = false

    const startUnity = async () => {
      try {
        await loadUnityLoader()
        const canvas = canvasRef.current
        const createUnityInstance = (window as UnityWindow).createUnityInstance

        if (cancelled || !canvas || !createUnityInstance) return

        const instance = await createUnityInstance(
          canvas,
          {
            dataUrl: `${unityRoot}/Build/WebGL.data.unityweb`,
            frameworkUrl: `${unityRoot}/Build/WebGL.framework.js.unityweb`,
            codeUrl: `${unityRoot}/Build/WebGL.wasm.unityweb`,
            streamingAssetsUrl: `${unityRoot}/StreamingAssets`,
            companyName: 'Hundred',
            productName: 'Anigram',
            productVersion: '0.1.0',
          },
          setProgress,
        )

        if (cancelled) {
          await instance.Quit()
          return
        }

        unityInstanceRef.current = instance
        setProgress(1)
        instance.SendMessage(
          'AnigramPet',
          'ApplyStateJson',
          JSON.stringify(displayStateRef.current),
        )
      } catch {
        if (!cancelled) {
          setError(
            '3D表示を読み込めませんでした。Unity WebGL成果物を配置して、もう一度お試しください。',
          )
        }
      }
    }

    void startUnity()

    return () => {
      cancelled = true
      const instance = unityInstanceRef.current
      unityInstanceRef.current = null
      if (instance) void instance.Quit()
    }
    // Unityの起動はマウント時だけ行い、状態変更は下のeffectで反映する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    unityInstanceRef.current?.SendMessage(
      'AnigramPet',
      'ApplyStateJson',
      JSON.stringify(displayState),
    )
  }, [displayState])

  return (
    <div className="anigram-unity" aria-label="ハリネズミの3D表示">
      <canvas
        id="unity-canvas"
        ref={canvasRef}
        className="anigram-unity__canvas"
        tabIndex={0}
      />
      {progress < 1 && !error ? (
        <div className="anigram-unity__loading">
          <span>3Dを準備しています</span>
          <progress value={progress} max={1} />
        </div>
      ) : null}
      {error ? (
        <div className="anigram-unity__fallback">
          <span aria-hidden="true">🦔</span>
          <p>{error}</p>
        </div>
      ) : null}
    </div>
  )
}

export default AnigramUnityView
