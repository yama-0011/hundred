import { Route, Routes } from 'react-router-dom'
import HundredHomePage from './pages/Hundred/HundredHomePage'

/**
 * アプリケーション全体のルーティング定義。
 *
 * 責務:
 * - URLとページコンポーネントを対応付ける
 * - アプリで利用できる画面遷移の入口を管理する
 */
function App() {
  return (
    <Routes>
      <Route path="/" element={<HundredHomePage />} />
    </Routes>
  )
}

export default App
