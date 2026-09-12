const guestSessionStorageKey = 'hundred.guest-session'

/** 同一ブラウザタブでゲスト利用中かを返す。 */
export function hasHundredGuestSession() {
  try {
    return sessionStorage.getItem(guestSessionStorageKey) === 'active'
  } catch {
    return false
  }
}

/** ゲスト利用を同一ブラウザタブ内で保持する。 */
export function startHundredGuestSession() {
  try {
    sessionStorage.setItem(guestSessionStorageKey, 'active')
  } catch {
    // 保存できない環境でも、Hundred Home内の状態ではゲスト利用を継続する。
  }
}

/** 保存済みのゲスト利用状態を終了する。 */
export function endHundredGuestSession() {
  try {
    sessionStorage.removeItem(guestSessionStorageKey)
  } catch {
    // 保存領域を利用できない場合は削除処理を省略する。
  }
}
