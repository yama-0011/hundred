/**
 * 概要:
 * 拡張のアイコンかショートカットキー（⌥⇧S）で、表示中のタブを撮影し、開いているAI Desktopのタブへ送る。
 *
 * 責務:
 * - 表示中の範囲を撮影する（chrome.tabs.captureVisibleTab）
 * - 撮影したタブのURLと、画面名の候補（大見出し → パンくず → 選ばれているメニュー → ページタイトル）を拾う
 * - いちばん最近使ったAI Desktopのタブへ送る。AI Desktopは受け取った画像を取り込み待ちに入れる
 *
 * 拡張はサインイン情報を持たず、AI DesktopのAPIも呼ばない。撮った画像は、AI Desktopで登録するまでブラウザの中だけにある。
 * 画面の中を読むのは、アイコンかキーを押した瞬間の、そのタブだけ（activeTab）。
 */
const aiDesktopUrls = ['https://yamahit.com/ai-desktop*', 'http://localhost:5173/ai-desktop*', 'http://127.0.0.1:5173/ai-desktop*']

// 撮影したページの中で動く。chrome.scripting.executeScriptで渡すため、外の変数や関数は使わない。
function readScreenName() {
  const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim()
  const usable = (element) => element && element.getClientRects().length > 0 && clean(element.textContent).length > 0 && clean(element.textContent).length <= 60
  const first = (selectors) => {
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) if (usable(element)) return clean(element.textContent)
    }
    return ''
  }
  const breadcrumb = () => {
    const items = [...document.querySelectorAll('nav[aria-label*="breadcrumb" i] li, [class*="breadcrumb" i] li, [class*="breadcrumb" i] a')].filter(usable)
    return items.length ? clean(items[items.length - 1].textContent) : ''
  }
  const title = clean(document.title)
  // 「友だち一覧 | L Message」のようなタイトルは、先頭の部分を候補にする。区切りがないタイトルはサービス名だけのことが多いので使わない。
  const parts = title.split(/\s[|｜\-–—]\s/u).map(clean).filter(Boolean)
  const fromTitle = parts.length > 1 ? parts[0] : ''
  const name = first(['h1']) || breadcrumb() || first(['[aria-current="page"]', 'nav .active', '[class*="sidebar" i] .active', '[class*="menu" i] .active']) || fromTitle
  return { name, title }
}

async function showResult(tabId, text, color, title) {
  if (tabId === undefined) return
  await chrome.action.setBadgeBackgroundColor({ tabId, color })
  await chrome.action.setBadgeText({ tabId, text })
  await chrome.action.setTitle({ tabId, title })
  setTimeout(() => { void chrome.action.setBadgeText({ tabId, text: '' }); void chrome.action.setTitle({ tabId, title: '表示中の画面をAI Desktopへ取り込む（⌥⇧S）' }) }, 3000)
}

async function sendToAIDesktop(tabId, capture) {
  const message = { type: 'hundred-screen-capture', capture }
  try {
    await chrome.tabs.sendMessage(tabId, message)
  } catch {
    // 拡張を入れる前から開いていたAI Desktopのタブには、受け渡しの処理が入っていない。入れてから送り直す。
    await chrome.scripting.executeScript({ target: { tabId }, files: ['hundredAiDesktopBridge.js'] })
    await chrome.tabs.sendMessage(tabId, message)
  }
}

async function captureScreen(tab) {
  if (!tab?.id || tab.windowId === undefined) return
  try {
    const targets = (await chrome.tabs.query({ url: aiDesktopUrls })).filter((candidate) => candidate.id !== tab.id)
    const target = targets.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]
    if (!target?.id) { await showResult(tab.id, '!', '#c42b1c', 'AI Desktopのタブが見つかりません。AI Desktopを開いてから撮影してください。'); return }
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
    let candidate = { name: '', title: tab.title ?? '' }
    try {
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readScreenName })
      if (result?.result) candidate = result.result
    } catch { /* 画面の中を読めないページでも、画像とURLは送る。 */ }
    await sendToAIDesktop(target.id, { dataUrl, url: tab.url ?? '', title: candidate.title, name: candidate.name, capturedAt: Date.now() })
    await showResult(tab.id, '✓', '#07866f', 'AI Desktopの取り込み待ちに追加しました')
  } catch (error) {
    console.warn('画面を取り込めませんでした', error)
    await showResult(tab.id, '!', '#c42b1c', 'この画面は取り込めませんでした（Chromeの設定画面などは撮影できません）')
  }
}

chrome.action.onClicked.addListener((tab) => { void captureScreen(tab) })
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'capture-screen') return
  void captureScreen(tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0])
})
