import { Route, Routes } from 'react-router-dom'
import CreativeIAConnectionPage from './pages/CreativeIA/CreativeIAConnectionPage'
import CreativeIAWorkspacePage from './pages/CreativeIA/CreativeIAWorkspacePage'
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
      <Route path="/auth/callback" element={<HundredHomePage />} />
      <Route path="/creative-ia" element={<CreativeIAWorkspacePage />} />
      <Route
        path="/creative-ia/settings/wordpress"
        element={<CreativeIAConnectionPage />}
      />
    </Routes>
  )
}

export default App
