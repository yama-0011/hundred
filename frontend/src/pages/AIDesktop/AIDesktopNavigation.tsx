import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * 概要:
 * AI Desktopの全画面に出す左ナビ。
 *
 * 責務:
 * - ホームと各機能へ1回で移動できるようにする
 * - Hundred Homeへの戻り先と、アカウントの入口を置く
 * - 折りたたむとアイコンだけを表示し、ホバーやキーボード操作で機能名を出す。折りたたみの状態はブラウザに保つ
 */
const COLLAPSED_STORAGE_KEY = 'hundred.aiDesktop.navCollapsed'

const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true' } catch { return false }
}
const writeCollapsed = (collapsed: boolean) => {
  try { localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed)) } catch { /* 保存できない環境では、再読み込みで開いた状態に戻す。 */ }
}

function Icon({ children }: { children: ReactNode }) {
  return <svg className="ad-workspace-nav__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}

const homeIcon = <Icon><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5V14h4v5.5" /></Icon>
const backIcon = <Icon><path d="M15 5l-7 7 7 7" /></Icon>
const accountIcon = <Icon><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" /></Icon>
const appIcons: Record<string, ReactNode> = {
  projects: <Icon><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H10l2 2.5h7.5A1.5 1.5 0 0 1 21 10v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" /></Icon>,
  documents: <Icon><path d="M6 3.5h8l4.5 4.5v12.5H6z" /><path d="M14 3.5V8h4.5" /><path d="M9 13h6M9 16.5h6" /></Icon>,
  settings: <Icon><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>,
}

export default function AIDesktopNavigation<Id extends string>({ apps, active, accountName, onAccount }: {
  apps: ReadonlyArray<{ id: Id; name: string }>
  active: Id | null
  accountName: string
  onAccount: () => void
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = () => { const next = !collapsed; setCollapsed(next); writeCollapsed(next) }
  // 折りたたみ時は文字を隠すので、読み上げとホバーの名前をaria-labelとdata-labelで渡す。
  const label = (name: string) => collapsed ? { 'aria-label': name, 'data-label': name } : {}
  const link = (to: string, name: string, icon: ReactNode, selected: boolean) => <Link to={to} className={selected ? 'active' : ''} aria-current={selected ? 'page' : undefined} {...label(name)}>{icon}<span>{name}</span></Link>
  return <nav className={`ad-workspace-nav ${collapsed ? 'collapsed' : ''}`} aria-label="AI Desktopのメニュー">
    <div className="ad-workspace-nav__head">
      <strong className="ad-workspace-nav__title">AI Desktop</strong>
      <button type="button" className="ad-workspace-nav__toggle" aria-expanded={!collapsed} aria-label={collapsed ? 'メニューを開く' : 'メニューを折りたたむ'} data-label={collapsed ? 'メニューを開く' : undefined} onClick={toggle}><Icon><path d="M4 5.5h16v13H4z" /><path d="M9.5 5.5v13" />{collapsed ? <path d="M13 9.5l2.5 2.5-2.5 2.5" /> : <path d="M16 9.5 13.5 12l2.5 2.5" />}</Icon></button>
    </div>
    <div className="ad-workspace-nav__group">
      {link('/ai-desktop', 'ホーム', homeIcon, active === null)}
      {apps.map((app) => <Link key={app.id} to={`/ai-desktop/${app.id}`} className={active === app.id ? 'active' : ''} aria-current={active === app.id ? 'page' : undefined} {...label(app.name)}>{appIcons[app.id]}<span>{app.name}</span></Link>)}
    </div>
    <div className="ad-workspace-nav__group ad-workspace-nav__foot">
      {link('/', 'Hundred Homeへ戻る', backIcon, false)}
      <button type="button" title={collapsed ? undefined : accountName} onClick={onAccount} {...label(accountName)}>{accountIcon}<span>{accountName}</span></button>
    </div>
  </nav>
}
