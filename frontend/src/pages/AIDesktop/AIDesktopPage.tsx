import { useEffect, useMemo, useRef, useState } from 'react'
import '../../styles/AIDesktop/ai-desktop.css'

type AppId = 'codex' | 'chatgpt' | 'claude' | 'explorer' | 'settings'
type WindowState = { id: AppId; x: number; y: number; width: number; height: number; minimized: boolean; maximized: boolean; z: number }

const apps = [
  { id: 'chatgpt' as const, name: 'ChatGPT', mark: '◎', color: '#10a37f', subtitle: '会話・調査・アイデア整理' },
  { id: 'codex' as const, name: 'Codex', mark: '⌘', color: '#171717', subtitle: 'AI駆動開発を学ぶ' },
  { id: 'claude' as const, name: 'Claude Code', mark: 'C', color: '#d97757', subtitle: 'エージェント開発を学ぶ' },
  { id: 'explorer' as const, name: 'Explorer', mark: '▰', color: '#e6a700', subtitle: 'コンテンツを探す' },
  { id: 'settings' as const, name: 'Settings', mark: '⚙', color: '#5277d8', subtitle: 'デスクトップを設定' },
]

const categories = [
  ['基本知識', 'Codexの仕組みとできること', '◫'],
  ['開発環境', 'Local / IDE / Cloud', '⌨'],
  ['モデル', 'モデル選択と推論レベル', '◇'],
  ['AI駆動開発', '開発フローでの活用方法', '↗'],
  ['機能・連携', 'MCP / Git / 自動化', '⌘'],
  ['料金・利用量', 'プラン・Credit・制限', '◴'],
]

function AppIcon({ id, size = 'large' }: { id: AppId; size?: 'small' | 'large' }) {
  const app = apps.find((item) => item.id === id)!
  return <span className={`ad-app-icon ${size}`} style={{ '--app-color': app.color } as React.CSSProperties}>{app.mark}</span>
}

function CodexContent({ onOpenArticle }: { onOpenArticle: () => void }) {
  return <div className="ad-app-content">
    <header className="ad-content-head">
      <div><p className="ad-eyebrow">AI DEVELOPMENT GUIDE</p><h1>Codex</h1><p>AIと一緒にソフトウェアをつくるための知識を、テーマ別に学べます。</p></div>
      <label className="ad-search"><span>⌕</span><input aria-label="Codex内を検索" placeholder="Codex内を検索" /></label>
    </header>
    <section className="ad-category-grid" aria-label="Codexのカテゴリ">
      {categories.map(([title, desc, icon], index) => <button className="ad-category" key={title} onClick={index === 5 ? onOpenArticle : undefined}>
        <span className="ad-category-icon">{icon}</span><span><strong>{title}</strong><small>{desc}</small></span><span className="ad-arrow">›</span>
      </button>)}
    </section>
    <aside className="ad-tip"><span>✦</span><div><strong>まずは「基本知識」から</strong><p>Codexが得意なことと、安全に使うための考え方を約8分で確認できます。</p></div><button>学習を始める</button></aside>
  </div>
}

function ArticleContent() {
  return <div className="ad-article-layout">
    <aside className="ad-sidebar"><button className="ad-back">‹ すべてのカテゴリ</button><h2>料金・利用量</h2>{['Overview', 'Plans', 'Credits', 'Limits', 'Usage'].map(x => <button key={x} className={x === 'Credits' ? 'active' : ''}>{x}{x === 'Credits' && <span>●</span>}</button>)}</aside>
    <article className="ad-article"><p className="ad-breadcrumb">Codex / 料金・利用量</p><h1>Creditとは</h1><p className="ad-lead">Codexでタスクを実行するときに消費される利用枠です。タスクの複雑さや実行時間によって、使用量が変わります。</p><div className="ad-note"><strong>知っておきたいこと</strong><p>簡単な質問よりも、大きなリポジトリを調査して変更するタスクのほうが多くのCreditを使用します。</p></div><h2>使用量を確認する</h2><p>SettingsのUsage画面から、現在の使用量と更新日を確認できます。</p><div className="ad-code"><span>今月の使用量</span><strong>42%</strong><i><b /></i><small>次回更新: 10月1日</small></div></article>
  </div>
}

function GenericContent({ id, onTheme }: { id: AppId; onTheme: () => void }) {
  const app = apps.find(item => item.id === id)!
  if (id === 'settings') return <div className="ad-generic"><p className="ad-eyebrow">PERSONALIZE</p><h1>設定</h1><div className="ad-setting-row"><div><strong>カラーモード</strong><p>デスクトップとウィンドウの表示を切り替えます。</p></div><button onClick={onTheme}>ライト / ダークを切り替え</button></div><div className="ad-setting-row"><div><strong>壁紙</strong><p>現在の壁紙: Aurora</p></div><span className="ad-wallpaper-chip" /></div></div>
  if (id === 'explorer') return <div className="ad-explorer"><aside><strong>ホーム</strong><span>▾ Articles</span><span>　ChatGPT</span><span>　Codex</span><span>　Claude Code</span><span>▸ Images</span></aside><main><p className="ad-eyebrow">ARTICLES</p><h1>すべてのコンテンツ</h1><div className="ad-files">{apps.slice(0, 3).map(a => <div key={a.id}><AppIcon id={a.id} /><strong>{a.name}</strong><small>フォルダー</small></div>)}</div></main></div>
  return <div className="ad-generic"><p className="ad-eyebrow">COMING SOON</p><AppIcon id={id} /><h1>{app.name}</h1><p>{app.subtitle}ためのコンテンツを準備しています。</p><button className="ad-primary">デスクトップに戻る</button></div>
}

function AIDesktopPage() {
  const [windows, setWindows] = useState<WindowState[]>([])
  const [active, setActive] = useState<AppId | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [article, setArticle] = useState(false)
  const [now, setNow] = useState(new Date())
  const zRef = useRef(2)

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer) }, [])
  const appById = useMemo(() => Object.fromEntries(apps.map(a => [a.id, a])), [])

  const openApp = (id: AppId) => {
    zRef.current += 1
    setWindows(current => {
      const existing = current.find(w => w.id === id)
      if (existing) return current.map(w => w.id === id ? { ...w, minimized: false, z: zRef.current } : w)
      const offset = current.length * 28
      return [...current, { id, x: 110 + offset, y: 62 + offset, width: Math.min(940, window.innerWidth - 150), height: Math.min(650, window.innerHeight - 120), minimized: false, maximized: false, z: zRef.current }]
    })
    setActive(id); setStartOpen(false)
  }
  const focus = (id: AppId) => { zRef.current += 1; setActive(id); setWindows(ws => ws.map(w => w.id === id ? { ...w, z: zRef.current } : w)) }
  const update = (id: AppId, next: Partial<WindowState>) => setWindows(ws => ws.map(w => w.id === id ? { ...w, ...next } : w))
  const close = (id: AppId) => { setWindows(ws => ws.filter(w => w.id !== id)); if (active === id) setActive(null); if (id === 'codex') setArticle(false) }

  const startDrag = (event: React.PointerEvent, win: WindowState) => {
    if (win.maximized || (event.target as HTMLElement).closest('button')) return
    focus(win.id); const sx = event.clientX; const sy = event.clientY; const ox = win.x; const oy = win.y
    const move = (e: PointerEvent) => update(win.id, { x: Math.max(0, ox + e.clientX - sx), y: Math.max(0, oy + e.clientY - sy) })
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
  }

  return <main className={`ai-desktop ${dark ? 'dark' : ''}`} onPointerDown={() => setStartOpen(false)}>
    <div className="ad-wallpaper-orb one" /><div className="ad-wallpaper-orb two" />
    <section className="ad-desktop-icons" aria-label="デスクトップのアプリ">
      {apps.map(app => <button key={app.id} onDoubleClick={() => openApp(app.id)} onClick={() => setActive(app.id)} className={active === app.id ? 'selected' : ''}><AppIcon id={app.id} /><span>{app.name}</span></button>)}
    </section>

    {windows.filter(w => !w.minimized).map(win => <section key={win.id} className={`ad-window ${active === win.id ? 'active' : ''} ${win.maximized ? 'maximized' : ''}`} style={win.maximized ? { zIndex: win.z } : { left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.z }} onPointerDown={(e) => { e.stopPropagation(); focus(win.id) }}>
      <header className="ad-titlebar" onPointerDown={(e) => startDrag(e, win)} onDoubleClick={() => update(win.id, { maximized: !win.maximized })}>
        <div><AppIcon id={win.id} size="small" /><strong>{appById[win.id].name}</strong></div><nav><button aria-label="最小化" onClick={() => update(win.id, { minimized: true })}>—</button><button aria-label="最大化" onClick={() => update(win.id, { maximized: !win.maximized })}>□</button><button aria-label="閉じる" className="close" onClick={() => close(win.id)}>×</button></nav>
      </header>
      <div className="ad-window-body">{win.id === 'codex' ? (article ? <ArticleContent /> : <CodexContent onOpenArticle={() => setArticle(true)} />) : <GenericContent id={win.id} onTheme={() => setDark(v => !v)} />}</div>
    </section>)}

    {startOpen && <section className="ad-start" onPointerDown={e => e.stopPropagation()}><label className="ad-start-search">⌕ <input autoFocus placeholder="アプリ、設定、コンテンツを検索" /></label><div className="ad-start-label"><strong>ピン留め済み</strong><button>すべてのアプリ ›</button></div><div className="ad-pinned">{apps.map(a => <button key={a.id} onClick={() => openApp(a.id)}><AppIcon id={a.id} /><span>{a.name}</span></button>)}</div><div className="ad-recommended"><strong>おすすめ</strong><button onClick={() => openApp('codex')}><span>✦</span><div><b>Codexをはじめる</b><small>基本知識・最初の8分</small></div></button></div><footer><span className="ad-user">Y</span><strong>Guest User</strong><button title="電源">◯</button></footer></section>}

    <footer className="ad-taskbar" onPointerDown={e => e.stopPropagation()}><div className="ad-weather"><b>21°C</b><small>晴れ</small></div><nav><button className={startOpen ? 'active' : ''} onClick={() => setStartOpen(v => !v)} aria-label="スタート"><span className="ad-windows-logo">◆</span></button>{windows.map(w => <button key={w.id} className={active === w.id && !w.minimized ? 'running active' : 'running'} onClick={() => w.minimized ? openApp(w.id) : (active === w.id ? update(w.id, { minimized: true }) : focus(w.id))}><AppIcon id={w.id} size="small" /></button>)}</nav><div className="ad-tray"><span>⌃</span><span>◉</span><span>▰</span><time>{now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}<small>{now.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</small></time></div></footer>
    <p className="ad-hint">アイコンをダブルクリックして起動</p>
  </main>
}

export default AIDesktopPage
