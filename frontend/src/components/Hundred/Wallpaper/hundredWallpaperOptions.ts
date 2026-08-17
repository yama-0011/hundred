export type WallpaperId = 'mist' | 'midnight' | 'aurora'

export type WallpaperOption = {
  id: WallpaperId
  name: string
  description: string
}

export const wallpaperOptions: WallpaperOption[] = [
  { id: 'mist', name: 'Mist', description: '静かな霧とやわらかな光' },
  { id: 'midnight', name: 'Midnight', description: '深い夜に流れる光の波' },
  { id: 'aurora', name: 'Aurora', description: '緑と青がゆっくり交わる光' },
]

/** 保存値が利用可能な壁紙IDか確認する。 */
export function isWallpaperId(value: string | null): value is WallpaperId {
  return wallpaperOptions.some(({ id }) => id === value)
}
