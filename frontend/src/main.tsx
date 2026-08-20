import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import App from './App.tsx'
import { configureHundredAuth } from './components/Hundred/Auth/hundredAuth.ts'

configureHundredAuth()

/**
 * Reactアプリケーションのエントリーポイント。
 *
 * 責務:
 * - index.htmlの#rootへReactアプリを描画する
 * - Amazon Cognito認証を初期化する
 * - StrictModeとBrowserRouterをアプリ全体へ適用する
 * - グローバルスタイルを読み込む
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
