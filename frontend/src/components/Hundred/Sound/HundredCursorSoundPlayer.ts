import {
  cursorSoundOptions,
  getCursorSound,
  type CursorSoundId,
  type CursorSoundOption,
} from './hundredCursorSoundOptions'

/** iPhoneでも短い効果音を連続再生できるよう、Web Audio APIを管理する。 */
class HundredCursorSoundPlayer {
  private context: AudioContext | null = null
  private readonly buffers = new Map<CursorSoundId, AudioBuffer>()
  private readonly loadingBuffers = new Map<
    CursorSoundId,
    Promise<AudioBuffer | null>
  >()
  private readonly pendingSounds = new Set<CursorSoundId>()

  /** ユーザー操作中にAudioContextを有効化し、各効果音を先読みする。 */
  prepare() {
    const context = this.getContext()
    if (!context) return null

    if (context.state !== 'running') {
      if (!this.hasActiveUserGesture()) return null

      void context.resume().catch(() => {
        // 再生許可前でも画面操作は止めず、次のユーザー操作で再試行する。
      })
    }

    cursorSoundOptions.forEach((sound) => {
      if (sound.source) void this.loadBuffer(sound, context)
    })

    return context
  }

  /** 指定した音を全体音量込みで再生し、連続入力による中断を防ぐ。 */
  play(soundId: CursorSoundId, effectVolume: number) {
    const sound = getCursorSound(soundId)
    if (!sound?.source) return

    const context = this.prepare()
    if (!context) return

    const buffer = this.buffers.get(sound.id)

    if (buffer) {
      this.startSound(context, buffer, sound.volume * effectVolume)
      return
    }

    // 初回読込中の入力は一度だけ予約し、完了時に音が重なるのを防ぐ。
    if (this.pendingSounds.has(sound.id)) return
    this.pendingSounds.add(sound.id)

    void this.loadBuffer(sound, context).then((loadedBuffer) => {
      this.pendingSounds.delete(sound.id)
      if (loadedBuffer) {
        this.startSound(context, loadedBuffer, sound.volume * effectVolume)
      }
    })
  }

  /** 有効なユーザー操作中に限ってAudioContextを作成し、以降の再生で再利用する。 */
  private getContext() {
    if (!this.context || this.context.state === 'closed') {
      if (!this.hasActiveUserGesture()) return null
      this.context = new AudioContext()
    }

    return this.context
  }

  /** ブラウザが音声開始を許可する一時的なユーザー操作中か確認する。 */
  private hasActiveUserGesture() {
    return !navigator.userActivation || navigator.userActivation.isActive
  }

  /** 音源を取得・デコードし、次回以降すぐ再生できる状態で保存する。 */
  private loadBuffer(sound: CursorSoundOption, context: AudioContext) {
    const loadedBuffer = this.buffers.get(sound.id)
    if (loadedBuffer) return Promise.resolve(loadedBuffer)

    const loadingBuffer = this.loadingBuffers.get(sound.id)
    if (loadingBuffer) return loadingBuffer

    if (!sound.source) return Promise.resolve(null)

    const request = fetch(sound.source)
      .then((response) => response.arrayBuffer())
      .then((audioData) => context.decodeAudioData(audioData))
      .then((buffer) => {
        this.buffers.set(sound.id, buffer)
        this.loadingBuffers.delete(sound.id)
        return buffer
      })
      .catch(() => {
        this.loadingBuffers.delete(sound.id)
        return null
      })

    this.loadingBuffers.set(sound.id, request)
    return request
  }

  /** 音量調整用ノードを挟み、同じ音を重ねられる一回限りの再生ノードを開始する。 */
  private startSound(context: AudioContext, buffer: AudioBuffer, volume: number) {
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = buffer
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(context.destination)
    source.start()
  }
}

export default HundredCursorSoundPlayer
