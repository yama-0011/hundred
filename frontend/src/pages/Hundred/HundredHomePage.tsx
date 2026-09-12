import HundredHome from '../../components/Hundred/Home/HundredHome'
import { useLocation } from 'react-router-dom'

/**
 * Hundred Homeを表示するページコンポーネント。
 *
 * 責務:
 * - ルーティングから呼び出されるHundred Homeのページ入口を提供する
 * - HundredHomeコンポーネントを画面に表示する
 */
function HundredHomePage() {
  const location = useLocation()
  return <HundredHome key={location.key} />
}

export default HundredHomePage
