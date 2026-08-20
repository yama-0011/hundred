export type CursorSoundId = string

export type CursorSoundOption = {
  id: CursorSoundId
  name: string
  description: string
  source: string | null
  volume: number
}

type CursorSoundMetadata = {
  id: CursorSoundId
  name: string
  description: string
  volume: number
  order: number
}

// cursorフォルダ内のMP3をビルド時にURLへ変換し、追加ファイルを自動検出する。
const cursorSoundFiles = import.meta.glob<string>(
  '../../../assets/Hundred/sounds/cursor/*.mp3',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
)

// 既存音源だけ個別の表示内容と音量を補正し、未登録音源には共通初期値を使う。
/*
 * 個別設定の記入例:
 *
 * 'sample-click': {                 // MP3の拡張子を除いたファイル名
 *   id: 'sample',                   // 保存や再生処理で使用する重複しないID
 *   name: 'Sample',                 // 設定画面に表示する名前
 *   description: 'サンプルの説明', // 設定画面に表示する説明
 *   volume: 0.65,                   // 基準音量（通常は0〜1程度）
 *   order: 10,                      // 設定画面での表示順
 * },
 */
const cursorSoundMetadata: Record<string, CursorSoundMetadata> = {
  'hundred-cursor-sound-block': {
    id: 'block',
    name: 'Block',
    description: '短くはっきりしたクリック',
    volume: 1,
    order: 1,
  },
  'hundred-cursor-sound-digital': {
    id: 'digital',
    name: 'Digital',
    description: '小さなデジタルクリック',
    volume: 0.35,
    order: 2,
  },
  'hundred-cursor-sound-game': {
    id: 'game',
    name: 'Game',
    description: '軽快なカーソル移動音',
    volume: 0.8,
    order: 3,
  },
}

// ファイル名変更前にブラウザへ保存されたIDを、現在のIDへ読み替える。
const legacyCursorSoundIds: Record<string, CursorSoundId> = {
  move: 'game',
}

/** 音源のパスから拡張子を除いたファイル名をIDとして取り出す。 */
function getSoundId(path: string) {
  return path.split('/').at(-1)?.replace(/\.mp3$/i, '') ?? path
}

/** 補正情報のないファイル名を、選択画面で読みやすい表示名へ変換する。 */
function createDisplayName(id: string) {
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/\b[a-z]/g, (character) => character.toUpperCase())
}

/** 自動検出した音源と補正情報から、画面描画用の選択肢を作成する。 */
function createCursorSoundOptions() {
  const detectedSounds = Object.entries(cursorSoundFiles)
    .map(([path, source]) => {
      const fileId = getSoundId(path)
      const metadata = cursorSoundMetadata[fileId]

      return {
        id: metadata?.id ?? fileId,
        name: metadata?.name ?? createDisplayName(fileId),
        description: metadata?.description ?? '追加されたカーソル移動音',
        source,
        volume: metadata?.volume ?? 0.65,
        order: metadata?.order ?? 100,
      }
    })
    .sort(
      (left, right) =>
        left.order - right.order || left.name.localeCompare(right.name),
    )
    .map(({ id, name, description, source, volume }) => ({
      id,
      name,
      description,
      source,
      volume,
    }))

  return [
    ...detectedSounds,
    {
      id: 'none',
      name: 'オフ',
      description: 'カーソル音を再生しない',
      source: null,
      volume: 0,
    },
  ] satisfies CursorSoundOption[]
}

export const cursorSoundOptions = createCursorSoundOptions()

// 音源の増減に追従し、利用可能な先頭音源を初期選択として使用する。
export const defaultCursorSoundId =
  cursorSoundOptions.find(({ source }) => source !== null)?.id ?? 'none'

/** 現在または旧形式のIDを、利用可能な現在のIDへ変換する。 */
export function resolveCursorSoundId(value: string | null) {
  if (value === null) return undefined

  const resolvedId = legacyCursorSoundIds[value] ?? value
  return cursorSoundOptions.some(({ id }) => id === resolvedId)
    ? resolvedId
    : undefined
}

/** 保存値が利用可能なカーソル音IDか確認する。 */
export function isCursorSoundId(value: string | null): value is CursorSoundId {
  return resolveCursorSoundId(value) !== undefined
}

/** 指定されたIDに対応するカーソル音の設定を返す。 */
export function getCursorSound(id: CursorSoundId) {
  const resolvedId = resolveCursorSoundId(id)
  return cursorSoundOptions.find((sound) => sound.id === resolvedId)
}
