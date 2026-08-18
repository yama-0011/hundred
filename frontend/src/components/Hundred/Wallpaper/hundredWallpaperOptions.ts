/**
 * 概要:
 * Hundred Homeで選択できる壁紙と、壁紙に対応するテーマを定義する。
 *
 * 責務:
 * - 壁紙ID、表示名、説明、Light / Darkタイプを管理する
 * - 保存値の検証と、選択壁紙の設定・テーマ取得機能を提供する
 */

export type WallpaperId = 'mist' | 'midnight' | 'aurora'
export type WallpaperTheme = 'light' | 'dark'

export type WallpaperOption = {
  id: WallpaperId
  name: string
  description: string
  theme: WallpaperTheme
}

export const wallpaperOptions: WallpaperOption[] = [
  {
    id: 'mist',
    name: 'Mist',
    description: '静かな霧とやわらかな光',
    theme: 'light',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: '深い夜に流れる光の波',
    theme: 'dark',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: '緑と青がゆっくり交わる光',
    theme: 'dark',
  },
]

/**
 * 概要: 保存値が利用可能な壁紙IDか確認する。
 * 責務: 受け取った文字列をWallpaperIdとして安全に扱えるか判定する。
 */
export function isWallpaperId(value: string | null): value is WallpaperId {
  return wallpaperOptions.some(({ id }) => id === value)
}

/**
 * 概要: 指定されたIDに対応する壁紙設定を取得する。
 * 責務: Settings一覧などへ、選択中の壁紙名や説明を提供する。
 */
export function getWallpaper(wallpaperId: WallpaperId) {
  return wallpaperOptions.find(({ id }) => id === wallpaperId)
}

/**
 * 概要: 選択された壁紙のLight / Darkタイプを取得する。
 * 責務: 壁紙設定からテーマを返し、設定不備の場合はLightを安全な初期値とする。
 */
export function getWallpaperTheme(wallpaperId: WallpaperId): WallpaperTheme {
  return getWallpaper(wallpaperId)?.theme ?? 'light'
}
