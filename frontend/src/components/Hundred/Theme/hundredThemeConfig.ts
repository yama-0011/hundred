/**
 * 概要:
 * Hundredで使用するテーマ決定方式を定義する。
 *
 * 責務:
 * - Hundredのテーマが選択中の壁紙から決まることを設定として明示する
 * - OSのLight / Dark設定からHundredの表示を独立させる
 */

export type HundredThemeStrategy = 'wallpaper'

type HundredThemeConfig = {
  strategy: HundredThemeStrategy
}

export const hundredThemeConfig: HundredThemeConfig = {
  strategy: 'wallpaper',
}
