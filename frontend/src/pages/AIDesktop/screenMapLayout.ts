/**
 * 概要:
 * Screen Mapの画面カードの大きさと位置を決める。
 *
 * 責務:
 * - カードの大きさ：幅は利用者が変えた値か標準の幅、高さはスクリーンショットの縦横比に合わせる（画像を切り取らない）
 * - 座標のない画面（AIやJSON連携で追加された画面）の置き場所：既存の画面の下に、グループごとに1行ずつ横に並べる
 * - 編集画面で追加した画面の置き場所：選んでいる画面の右隣、なければ全体のいちばん右
 * - グループの囲み：所属する画面の位置と大きさから、囲みの大きさを計算する
 */
import type { ScreenMapData, ScreenMapGroupFrame, ScreenMapPosition, ScreenMapScreen } from './screenMap'

// 保存する座標とカードの幅は、表示倍率1を基準にした値。表示するときは倍率をかけて広げる。
export const SCREEN_NODE_WIDTH = 200
// 画面名とURLを表示する、カード下部の高さ。表示倍率では変えない。
export const SCREEN_NODE_BODY_HEIGHT = 49
// 縦横比が分からない画像は、16:10として扱う。
const defaultImageRatio = 10 / 16
const origin = 40
const gap = 60
const framePadding = { x: 24, top: 44, bottom: 24 }

export type ScreenNodeSize = { width: number; height: number }
type Rect = ScreenMapPosition & ScreenNodeSize

/** 画面カードの表示上の大きさ。cardWidthは利用者が変えた幅、scaleは表示倍率。 */
export function screenNodeSize(screen: ScreenMapScreen, cardWidth: number | undefined, scale = 1): ScreenNodeSize {
  const image = screen.images[0]
  const ratio = image?.width && image.height ? image.height / image.width : defaultImageRatio
  // 極端に縦長・横長の画像でも、カードが細くなりすぎないようにする。
  const thumbnailRatio = Math.min(2.5, Math.max(0.3, ratio))
  const width = (cardWidth ?? SCREEN_NODE_WIDTH) * scale
  return { width: Math.round(width), height: Math.round(width * thumbnailRatio + SCREEN_NODE_BODY_HEIGHT) }
}

const sizeIn = (data: ScreenMapData, screen: ScreenMapScreen) => screenNodeSize(screen, data.layout.screens[screen.id]?.width)
const placedRects = (data: ScreenMapData): Rect[] => data.screens.flatMap((screen) => {
  const position = data.layout.screens[screen.id]
  return position ? [{ x: position.x, y: position.y, ...sizeIn(data, screen) }] : []
})

/** 保存した配置を使い、座標のない画面は既存の画面の下に、グループごとに1行ずつ横に並べる。 */
export function resolvedPositions(data: ScreenMapData): Record<string, ScreenMapPosition> {
  const positions: Record<string, ScreenMapPosition> = {}
  for (const screen of data.screens) {
    const position = data.layout.screens[screen.id]
    if (position) positions[screen.id] = { x: position.x, y: position.y }
  }
  const missing = data.screens.filter((screen) => !positions[screen.id])
  if (!missing.length) return positions
  const placed = placedRects(data)
  const left = placed.length ? Math.min(...placed.map((rect) => rect.x)) : origin
  let top = placed.length ? Math.max(...placed.map((rect) => rect.y + rect.height)) + gap * 2 : origin
  const rows = [...data.groups.map((group) => group.id), undefined].map((groupId) => missing.filter((screen) => screen.groupId === groupId)).filter((row) => row.length)
  for (const row of rows) {
    let x = left
    let rowHeight = 0
    for (const screen of row) {
      const size = sizeIn(data, screen)
      positions[screen.id] = { x, y: top }
      x += size.width + gap
      rowHeight = Math.max(rowHeight, size.height)
    }
    top += rowHeight + gap * 2
  }
  return positions
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width + gap / 2 && b.x < a.x + a.width + gap / 2 && a.y < b.y + b.height + gap / 2 && b.y < a.y + a.height + gap / 2

/** 編集画面で追加した画面の置き場所。選んでいる画面の右隣、なければ全体のいちばん右。重なるときは下へずらす。 */
export function positionForNewScreen(data: ScreenMapData, screen: ScreenMapScreen, anchorId: string | null): ScreenMapPosition {
  const positions = resolvedPositions(data)
  const rects = data.screens.filter((candidate) => positions[candidate.id]).map((candidate) => ({ ...positions[candidate.id], ...sizeIn(data, candidate) }))
  const anchor = data.screens.find((candidate) => candidate.id === anchorId)
  const start = anchor && positions[anchor.id]
    ? { x: positions[anchor.id].x + sizeIn(data, anchor).width + gap * 2, y: positions[anchor.id].y }
    : rects.length ? { x: Math.max(...rects.map((rect) => rect.x + rect.width)) + gap * 2, y: Math.min(...rects.map((rect) => rect.y)) } : { x: origin, y: origin }
  const size = screenNodeSize(screen, undefined)
  const candidate = { ...start, ...size }
  for (let attempt = 0; attempt < 50 && rects.some((rect) => overlaps(rect, candidate)); attempt += 1) {
    const blocking = rects.filter((rect) => overlaps(rect, candidate))
    candidate.y = Math.max(...blocking.map((rect) => rect.y + rect.height)) + gap
  }
  return { x: Math.round(candidate.x), y: Math.round(candidate.y) }
}

/** グループに属する画面を囲む枠を計算する。画面のないグループには枠を作らない。sizesは表示している画面カードの大きさ。 */
export function groupFrames(data: ScreenMapData, positions: Record<string, ScreenMapPosition>, sizes: Record<string, ScreenNodeSize>): Record<string, ScreenMapGroupFrame> {
  const frames: Record<string, ScreenMapGroupFrame> = {}
  for (const group of data.groups) {
    const members = data.screens.filter((screen) => screen.groupId === group.id && positions[screen.id] && sizes[screen.id])
    if (!members.length) continue
    const left = Math.min(...members.map((screen) => positions[screen.id].x)) - framePadding.x
    const top = Math.min(...members.map((screen) => positions[screen.id].y)) - framePadding.top
    const right = Math.max(...members.map((screen) => positions[screen.id].x + sizes[screen.id].width)) + framePadding.x
    const bottom = Math.max(...members.map((screen) => positions[screen.id].y + sizes[screen.id].height)) + framePadding.bottom
    frames[group.id] = { x: left, y: top, width: right - left, height: bottom - top }
  }
  return frames
}
