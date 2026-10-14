/**
 * 概要:
 * Screen Map（画面と画面遷移の図）のデータの形と、読み込み時の検証を定義する。
 *
 * 責務:
 * - Screen Mapブロックのdataの型と、空のデータの作成
 * - JSON連携やAI下書きから読み込んだデータの検証（IDの重複、参照先の存在、件数）
 *
 * 意味の情報（groups・screens・transitions）と見た目の配置（layout）を分けて持つ。
 * AIに渡すときに配置を外せるようにし、座標のない画面は表示側で自動配置する。
 * Workerの ai-desktop.ts と scripts/ai-desktop-content.mjs にも同じ検証があるため、変更するときは揃える。
 */
import type { Category, CategoryKind, ContentBlock, ContentItem, ScreenMapBlock } from './contentBlocks'

export type ScreenMapVerification = 'confirmed' | 'ai-inferred'
// サムネイルは、画面が多いときにキャンバスやiPadで重くならないよう、一覧の表示に使う縮小画像。
// widthとheightは元の画像のピクセル数。カードの縦横比を画像に合わせ、画像を切り取らずに表示するために使う。
// maskCheckedは、利用者がマスキングの要否を確認したかどうか（隠したか、「隠す情報はない」を選んだ）。
export type ScreenMapImage = { imageId: string; url: string; thumbnailImageId?: string; thumbnailUrl?: string; width?: number; height?: number; masked: boolean; maskChecked?: boolean; capturedAt?: number }
export type ScreenMapGroup = { id: string; name: string; description: string }
export type ScreenMapScreen = { id: string; name: string; groupId?: string; stateOf?: string; url: string; description: string; images: ScreenMapImage[]; verification: ScreenMapVerification }
export type ScreenMapTransition = { id: string; from: string; to: string; action: string; condition: string; verification: ScreenMapVerification }
export type ScreenMapPosition = { x: number; y: number }
// widthは利用者が変えたカードの幅（「小」の大きさを基準にした値）。ないときは標準の幅で表示する。
export type ScreenMapScreenLayout = ScreenMapPosition & { width?: number }
export type ScreenMapGroupFrame = ScreenMapPosition & { width: number; height: number }
export type ScreenMapLayout = { screens: Record<string, ScreenMapScreenLayout>; groups: Record<string, ScreenMapGroupFrame> }
export type ScreenMapData = { schemaVersion: 1; groups: ScreenMapGroup[]; screens: ScreenMapScreen[]; transitions: ScreenMapTransition[]; layout: ScreenMapLayout }

// グループの色。明るい表示・暗い表示のどちらでも見分けられるよう、明るさも少しずつ変えている。
export const SCREEN_MAP_GROUP_COLORS = ['#4f8ff0', '#a68cf0', '#2fb39a', '#e0954a', '#e06c9f', '#8fa63a']
export const screenMapGroupColor = (data: Pick<ScreenMapData, 'groups'>, groupId: string | undefined) => {
  const index = data.groups.findIndex((group) => group.id === groupId)
  return index < 0 ? '#8a94a8' : SCREEN_MAP_GROUP_COLORS[index % SCREEN_MAP_GROUP_COLORS.length]
}
/** 新しい画面・遷移・グループのid。英小文字・数字・ハイフンだけで作る。 */
export const newScreenMapId = (prefix: 'screen' | 'transition' | 'group') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const screenMapImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
/** 貼り付け・ドロップ・ファイル選択から、取り込める画像を1つ取り出す。 */
export const imageFileFrom = (files: FileList | File[] | null | undefined) => Array.from(files ?? []).find((file) => screenMapImageTypes.has(file.type)) ?? null
// キャンバスの表示倍率。保存する座標とカードの幅はこの倍率で広げて表示する。画面ごとの大きさは、編集画面の角のつまみで変える。
export const SCREEN_MAP_NODE_SCALE = 2.2
// 操作名の表示方法。この端末にだけ覚えておく（データには保存しない）。
export type ScreenMapLabelMode = 'icon' | 'all'
const viewSettingKeys = { labels: 'ai-desktop:screen-map-label-mode' }
const readSetting = (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } }
const writeSetting = (key: string, value: string) => { try { window.localStorage.setItem(key, value) } catch { /* 覚えられない端末でも表示は切り替える。 */ } }
export const readScreenMapLabelMode = (): ScreenMapLabelMode => readSetting(viewSettingKeys.labels) === 'all' ? 'all' : 'icon'
export const saveScreenMapLabelMode = (value: ScreenMapLabelMode) => writeSetting(viewSettingKeys.labels, value)
/** 画像のマスキングを確認していない（隠しておらず、「隠す情報はない」も選んでいない）かどうか。 */
export const isMaskUnchecked = (image: ScreenMapImage | undefined) => Boolean(image && !image.masked && !image.maskChecked)

// マスキングの四角。画像の幅・高さに対する比率で持つ。
export type ScreenMapMask = { x: number; y: number; width: number; height: number }
/**
 * 同じ形のURLかを判断するための形。数字やIDらしい部分を「:id」に置き換える（/friends/123 と /friends/456 は同じ形）。
 * クエリとハッシュは見ない。
 */
export function screenUrlPattern(value: string) {
  const normalize = (path: string) => path.split('/').map((segment) => /^\d+$/u.test(segment) || /^[0-9a-f-]{8,}$/iu.test(segment) || (segment.length >= 8 && /\d/u.test(segment)) ? ':id' : segment).join('/')
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    return `${url.host}${normalize(url.pathname)}`
  } catch {
    return normalize(trimmed.split(/[?#]/u)[0])
  }
}
// 前回のマスクの位置は、Screen Map（資料）ごとにこの端末へ覚えておく。最後に使った位置と、URLの形ごとの位置を持つ。
type MaskPresets = { last: ScreenMapMask[]; patterns: Record<string, ScreenMapMask[]> }
const maskPresetKey = (scope: string) => `ai-desktop:screen-map-mask-presets:${scope}`
export function readMaskPresets(scope: string): MaskPresets {
  try {
    const value = JSON.parse(window.localStorage.getItem(maskPresetKey(scope)) ?? 'null') as MaskPresets | null
    return value && Array.isArray(value.last) && value.patterns && typeof value.patterns === 'object' ? value : { last: [], patterns: {} }
  } catch {
    return { last: [], patterns: {} }
  }
}
export function saveMaskPreset(scope: string, url: string, masks: ScreenMapMask[]) {
  if (!masks.length) return
  const presets = readMaskPresets(scope)
  const pattern = screenUrlPattern(url)
  const next: MaskPresets = { last: masks, patterns: pattern ? { ...presets.patterns, [pattern]: masks } : presets.patterns }
  try { window.localStorage.setItem(maskPresetKey(scope), JSON.stringify(next)) } catch { /* 覚えられない端末でも登録は続ける。 */ }
}

export type ScreenMapSelection = { kind: 'screen' | 'transition' | 'group'; id: string }

export const SCREEN_MAP_LIMITS = { groups: 50, screens: 300, transitions: 1_000, imagesPerScreen: 10 }
export const screenMapVerificationLabels: Record<ScreenMapVerification, string> = { confirmed: '確認済み', 'ai-inferred': 'AIの推測' }

// AIが遷移を書くときに間違えにくいよう、IDは英小文字・数字・ハイフンの読める名前にする。
const idPattern = /^[a-z0-9][a-z0-9-]{0,99}$/u
const coordinateLimit = 1_000_000

export const createScreenMapData = (): ScreenMapData => ({ schemaVersion: 1, groups: [], screens: [], transitions: [], layout: { screens: {}, groups: {} } })

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const validText = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
const validVerification = (value: unknown) => value === 'confirmed' || value === 'ai-inferred'
const validCoordinate = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= coordinateLimit
const validSize = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= coordinateLimit
const validOptionalText = (value: unknown, max: number) => value === undefined || validText(value, max)
const validPixels = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100_000)
const validCardWidth = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 40 && value <= 4_000)
const validTimestamp = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isInteger(value) && value > 0)

function uniqueIds(entries: Array<Record<string, unknown>>) {
  const ids = new Set<string>()
  for (const entry of entries) {
    if (typeof entry.id !== 'string' || !idPattern.test(entry.id) || ids.has(entry.id)) return null
    ids.add(entry.id)
  }
  return ids
}

/** 読み込んだScreen Mapのdataが正しいかを判定する。 */
export function isScreenMapData(value: unknown): value is ScreenMapData {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.groups) || !Array.isArray(value.screens) || !Array.isArray(value.transitions) || !isRecord(value.layout)) return false
  const { groups, screens, transitions, layout } = value
  if (groups.length > SCREEN_MAP_LIMITS.groups || screens.length > SCREEN_MAP_LIMITS.screens || transitions.length > SCREEN_MAP_LIMITS.transitions) return false
  if (!groups.every(isRecord) || !screens.every(isRecord) || !transitions.every(isRecord)) return false
  const groupIds = uniqueIds(groups)
  const screenIds = uniqueIds(screens)
  if (!groupIds || !screenIds || !uniqueIds(transitions)) return false
  const validGroups = groups.every((group) => validText(group.name, 100) && validText(group.description, 2_000))
  const validScreens = screens.every((screen) => validText(screen.name, 100)
    && (screen.groupId === undefined || (typeof screen.groupId === 'string' && groupIds.has(screen.groupId)))
    && (screen.stateOf === undefined || (typeof screen.stateOf === 'string' && screen.stateOf !== screen.id && screenIds.has(screen.stateOf)))
    && validText(screen.url, 2_000) && validText(screen.description, 5_000) && validVerification(screen.verification)
    && Array.isArray(screen.images) && screen.images.length <= SCREEN_MAP_LIMITS.imagesPerScreen
    && screen.images.every((image) => isRecord(image) && validText(image.imageId, 300) && validText(image.url, 2_000) && validOptionalText(image.thumbnailImageId, 300) && validOptionalText(image.thumbnailUrl, 2_000) && validPixels(image.width) && validPixels(image.height) && typeof image.masked === 'boolean' && (image.maskChecked === undefined || typeof image.maskChecked === 'boolean') && validTimestamp(image.capturedAt)))
  const validTransitions = transitions.every((transition) => typeof transition.from === 'string' && screenIds.has(transition.from) && typeof transition.to === 'string' && screenIds.has(transition.to)
    && validText(transition.action, 200) && validText(transition.condition, 1_000) && validVerification(transition.verification))
  if (!validGroups || !validScreens || !validTransitions) return false
  if (!isRecord(layout.screens) || !isRecord(layout.groups)) return false
  const validScreenLayout = Object.entries(layout.screens).every(([id, position]) => screenIds.has(id) && isRecord(position) && validCoordinate(position.x) && validCoordinate(position.y) && validCardWidth(position.width))
  const validGroupLayout = Object.entries(layout.groups).every(([id, frame]) => groupIds.has(id) && isRecord(frame) && validCoordinate(frame.x) && validCoordinate(frame.y) && validSize(frame.width) && validSize(frame.height))
  return validScreenLayout && validGroupLayout
}

export const categoryKindOf = (category: Pick<Category, 'kind'>): CategoryKind => category.kind === 'screen-map' ? 'screen-map' : 'document'
export const createScreenMapContent = (title: string): ContentItem => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return { id: `screen-map-${suffix}`, navTitle: title, blocks: [{ id: `screenMap-${suffix}`, type: 'screenMap', data: createScreenMapData() }] }
}
export const screenMapBlockOf = (item: ContentItem | undefined): ScreenMapBlock | null => item?.blocks.length === 1 && item.blocks[0].type === 'screenMap' ? item.blocks[0] : null
export const containsScreenMapBlock = (blocks: ContentBlock[]): boolean => blocks.some((block) => block.type === 'screenMap' || (block.type === 'columns' && containsScreenMapBlock([...block.data.left, ...block.data.right])))
