import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import CreativeIAConnectionPage from './pages/CreativeIA/CreativeIAConnectionPage'
import CreativeIAInstagramConnectionPage from './pages/CreativeIA/CreativeIAInstagramConnectionPage'
import CreativeIAWorkspacePage from './pages/CreativeIA/CreativeIAWorkspacePage'
import HundredHomePage from './pages/Hundred/HundredHomePage'
import AnigramPage from './pages/Anigram/AnigramPage'
import AnigramAdminPage from './pages/Anigram/AnigramAdminPage'
import AnigramHistoryPage from './pages/Anigram/AnigramHistoryPage'
import AnigramInstagramConnectionPage from './pages/Anigram/AnigramInstagramConnectionPage'
import HundredLoginStatus from './components/Hundred/Auth/HundredLoginStatus'

const AnigramInstagramSyncPage = lazy(
  () => import('./pages/Anigram/AnigramInstagramSyncPage'),
)

/**
 * アプリケーション全体のルーティング定義。
 *
 * 責務:
 * - URLとページコンポーネントを対応付ける
 * - アプリで利用できる画面遷移の入口を管理する
 */
function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HundredHomePage />} />
        <Route path="/auth/callback" element={<HundredHomePage />} />
        <Route path="/creative-ia" element={<CreativeIAWorkspacePage />} />
        <Route path="/anigram" element={<AnigramPage />} />
        <Route path="/anigram/history" element={<AnigramHistoryPage />} />
        <Route path="/anigram/admin" element={<AnigramAdminPage />} />
        <Route
          path="/anigram/settings/instagram"
          element={<AnigramInstagramConnectionPage />}
        />
        <Route
          path="/anigram/admin/instagram-sync"
          element={
            <Suspense fallback={<p>同期管理画面を読み込んでいます…</p>}>
              <AnigramInstagramSyncPage />
            </Suspense>
          }
        />
        <Route
          path="/creative-ia/settings/wordpress"
          element={<CreativeIAConnectionPage />}
        />
        <Route
          path="/creative-ia/settings/instagram"
          element={<CreativeIAInstagramConnectionPage />}
        />
      </Routes>
      <HundredLoginStatus />
    </>
  )
}

export default App
