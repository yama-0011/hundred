/**
 * 概要:
 * Web資料の取り込みのサイドパネル。開いている記事の範囲を選び、本文をMarkdownにして、画像と一緒にサイトごとに選んだフォルダへ保存する。
 *
 * 責務:
 * - 開いているタブのサイトを表示し、サイトの読み取りの許可（サイトごとに初回だけ）を求める
 * - 範囲の選択を記事のページで始め・終え、選んだ範囲（本文と除外する部分）をサイトごとに覚える（chrome.storage.local）
 * - 保存先のフォルダとサイト名をサイトごとに覚える（フォルダはこのパネルのIndexedDB、サイト名はchrome.storage.local）
 * - 選んだフォルダの中に「<サイト名>/<記事名>/」を作り、本文（本文.md）と画像をまとめて保存する。同じURLの記事は同じフォルダを上書きする
 * - サイトのフォルダの記事の一覧（index.md）を作り直す
 *
 * 取り込んだ内容は手元のフォルダにだけ保存し、どのサーバーにも送らない。
 */
import { htmlToMarkdown } from './hundredWebClipMarkdown.js'

const DATABASE_NAME = 'hundred-web-clipper'
const STORE_NAME = 'folders'
const INDEX_FILE = 'index.md'
const ARTICLE_FILE = '本文.md'
const RULES_KEY = 'rules'
const SITE_NAMES_KEY = 'siteNames'

const elements = Object.fromEntries(['site', 'title', 'permission', 'allow', 'folder', 'chooseFolder', 'siteName', 'select', 'stopSelect', 'modeExclude', 'modeBody', 'reset', 'selectionHelp', 'excludeCount', 'ruleState', 'save', 'status'].map((id) => [id, document.getElementById(id)]))
const view = { tab: null, origin: null, permitted: false, folder: null, siteName: '', suggestedSiteName: '', selecting: false, mode: 'exclude', excludeCount: 0, rule: null, busy: false }

// ファイル名に使えない文字は全角に置き換える（AI Desktopのワークスペースと同じ規則）。
const fullWidth = { '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？', '"': '＂', '<': '＜', '>': '＞', '|': '｜' }
const fileName = (value) => String(value ?? '').replace(/[\\/:*?"<>|]/gu, (character) => fullWidth[character]).replace(/\s+/gu, ' ').trim().replace(/[. ]+$/u, '').slice(0, 80) || '名称未設定'
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
// 「記事名 | サイト名」のようなページタイトルは、先頭の部分を記事名にする。
const articleName = (title) => title.split(/\s[|｜\-–—]\s/u)[0] || title

// 保存先のフォルダ（サイトごと）

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function storedFolder(origin) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(origin)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

async function storeFolder(origin, handle) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(handle, origin)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

async function writableFolder(handle) {
  if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return handle
  return await handle.requestPermission({ mode: 'readwrite' }) === 'granted' ? handle : null
}

// サイトごとの範囲

async function readRule(origin) {
  const { [RULES_KEY]: rules = {} } = await chrome.storage.local.get(RULES_KEY)
  return rules[origin] ?? null
}

async function saveRule(origin, rule) {
  const { [RULES_KEY]: rules = {} } = await chrome.storage.local.get(RULES_KEY)
  await chrome.storage.local.set({ [RULES_KEY]: { ...rules, [origin]: rule } })
}

async function readSiteName(origin) {
  const { [SITE_NAMES_KEY]: names = {} } = await chrome.storage.local.get(SITE_NAMES_KEY)
  return names[origin] ?? ''
}

async function saveSiteName(origin, name) {
  const { [SITE_NAMES_KEY]: names = {} } = await chrome.storage.local.get(SITE_NAMES_KEY)
  await chrome.storage.local.set({ [SITE_NAMES_KEY]: { ...names, [origin]: name } })
}

// 記事のページとのやりとり

const originPattern = (origin) => `${origin}/*`

async function sendToPage(message) {
  await chrome.scripting.executeScript({ target: { tabId: view.tab.id }, files: ['hundredWebClipSelector.js'] })
  return chrome.tabs.sendMessage(view.tab.id, message)
}

// 選択を始めたタブとつなぎ、サイドパネルを閉じたら接続が切れて、ページ側で選択をやめるようにする。
let pagePort = null
function connectPage(tabId) {
  if (pagePort?.tabId === tabId) return
  pagePort?.port.disconnect()
  pagePort = { tabId, port: chrome.tabs.connect(tabId, { name: 'hundred-web-clip-panel' }) }
  pagePort.port.onDisconnect.addListener(() => { if (pagePort?.tabId === tabId) pagePort = null })
}

function applySelection(state) {
  view.selecting = Boolean(state?.active)
  view.mode = state?.mode ?? 'exclude'
  view.excludeCount = state?.excludeCount ?? 0
  render()
}

// フォルダの読み書き

async function entries(folder) {
  const result = []
  for await (const entry of folder.values()) result.push(entry)
  return result
}

async function writeFile(folder, name, content) {
  const handle = await folder.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

function frontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text)
  if (!match) return null
  return Object.fromEntries(match[1].split('\n').map((line) => /^(\w+):\s?(.*)$/u.exec(line)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^"(.*)"$/u, '$1').replace(/\\"/gu, '"')]))
}
const yamlValue = (value) => `"${String(value).replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`

/** サイトのフォルダ内の記事（記事のフォルダの本文.md）のフォルダ名と、先頭に書いた情報。 */
async function articles(siteFolder) {
  const result = []
  for (const entry of await entries(siteFolder)) {
    if (entry.kind !== 'directory') continue
    const file = await entry.getFileHandle(ARTICLE_FILE).catch(() => null)
    const meta = file && frontMatter(await (await file.getFile()).text())
    if (meta?.url) result.push({ name: entry.name, ...meta })
  }
  return result
}

async function writeIndex(siteFolder) {
  const items = (await articles(siteFolder)).sort((a, b) => `${a.breadcrumb ?? ''}${a.title}`.localeCompare(`${b.breadcrumb ?? ''}${b.title}`, 'ja'))
  const cell = (value) => String(value ?? '').replace(/\|/gu, '\\|')
  const rows = items.map((item) => `| [${cell(item.title)}](<${item.name}/${ARTICLE_FILE}>) | ${cell(item.breadcrumb)} | ${cell(item.capturedAt)} | ${item.url} |`)
  await writeFile(siteFolder, INDEX_FILE, `# ${siteFolder.name}\n\n| 記事 | パンくず | 取り込み日 | URL |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`)
}

/** 記事のフォルダ名を決める。同じURLの記事が別の名前で保存されていれば、その名前を返す（保存後に消す）。別のURLで同じ名前があれば番号を付ける。 */
async function articleFolderName(siteFolder, url, title) {
  const existing = await articles(siteFolder)
  const desired = fileName(articleName(title))
  const same = existing.find((item) => item.url === url)
  const taken = new Set(existing.filter((item) => item.url !== url).map((item) => item.name))
  let name = desired
  for (let number = 2; taken.has(name); number += 1) name = `${desired}（${number}）`
  return { name, previous: same && same.name !== name ? same.name : null }
}

async function saveImages(articleFolder, images) {
  const saved = new Map()
  let failed = 0
  for (const [index, image] of images.entries()) {
    try {
      const response = await fetch(image.src)
      if (!response.ok) throw new Error(`IMAGE_${response.status}`)
      const blob = await response.blob()
      const extension = (/\.(png|jpe?g|gif|webp|avif|svg)(?:$|\?)/iu.exec(new URL(image.src).pathname)?.[1] ?? blob.type.split('/')[1] ?? 'png').toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg')
      const name = `${String(index + 1).padStart(2, '0')}.${extension}`
      await writeFile(articleFolder, name, blob)
      saved.set(image.src, name)
    } catch (error) {
      console.warn('画像を保存できませんでした', image.src, error)
      failed += 1
    }
  }
  return { saved, failed }
}

async function saveArticle() {
  const folder = await writableFolder(view.folder)
  if (!folder) throw new Error('保存先のフォルダへの書き込みが許可されていません。')
  const clip = await sendToPage({ type: 'clip:extract', rule: view.rule })
  if (!clip?.html) throw new Error('本文を取り出せませんでした。')
  // 選んだ範囲とサイト名は、次の記事でも使えるようサイトごとに覚える。
  if (view.selecting && clip.rule) { await saveRule(view.origin, clip.rule); view.rule = clip.rule }
  const siteName = fileName(view.siteName || clip.siteName || new URL(clip.url).hostname)
  if (siteName !== view.siteName) { view.siteName = siteName; await saveSiteName(view.origin, siteName) }
  const siteFolder = await folder.getDirectoryHandle(siteName, { create: true })
  const { name, previous } = await articleFolderName(siteFolder, clip.url, clip.title)
  // 前回の画像が残らないよう、記事のフォルダは作り直す。
  await siteFolder.removeEntry(name, { recursive: true }).catch(() => undefined)
  const articleFolder = await siteFolder.getDirectoryHandle(name, { create: true })
  const body = new DOMParser().parseFromString(clip.html, 'text/html').body.firstElementChild
  const images = []
  const tokens = new Map()
  const markdown = htmlToMarkdown(body, (src) => {
    if (!tokens.has(src)) { tokens.set(src, `\u0000image-${tokens.size}\u0000`); images.push({ src }) }
    return tokens.get(src)
  })
  const { saved, failed } = await saveImages(articleFolder, images)
  // 保存できなかった画像は、元のURLのまま残す。
  const resolved = markdown.replace(/\u0000image-(\d+)\u0000/gu, (_, index) => { const src = images[Number(index)].src; return saved.get(src) ?? src })
  // 本文に記事の見出し（h1）が含まれていなければ、先頭に記事名の見出しを足す。
  const heading = resolved.startsWith('# ') ? '' : `# ${clip.title}\n\n`
  const meta = `---\nurl: ${clip.url}\ntitle: ${yamlValue(clip.title)}\nbreadcrumb: ${yamlValue(clip.breadcrumb)}\ncapturedAt: ${today()}\n---\n\n${heading}`
  await writeFile(articleFolder, ARTICLE_FILE, meta + resolved)
  if (previous) await siteFolder.removeEntry(previous, { recursive: true }).catch(() => undefined)
  await writeIndex(siteFolder)
  render()
  return { path: `${folder.name}/${siteName}/${name}/${ARTICLE_FILE}`, imageCount: saved.size, failed }
}

// 画面

function render() {
  const ready = Boolean(view.tab && view.origin)
  elements.site.textContent = view.origin ?? 'このページは取り込めません'
  elements.title.textContent = view.tab?.title ?? ''
  elements.permission.hidden = !ready || view.permitted
  elements.folder.textContent = view.folder ? `保存先：${view.folder.name}/${view.siteName || view.suggestedSiteName || '（サイト名）'}/` : '保存先：未設定'
  elements.chooseFolder.textContent = view.folder ? '変更' : 'フォルダを選ぶ'
  elements.chooseFolder.disabled = !ready
  elements.siteName.disabled = !ready
  elements.siteName.value = view.siteName
  elements.siteName.placeholder = view.suggestedSiteName || 'ページから自動で決めます'
  elements.select.hidden = view.selecting
  elements.stopSelect.hidden = !view.selecting
  elements.select.disabled = !ready || view.busy
  elements.modeExclude.classList.toggle('active', view.mode === 'exclude')
  elements.modeBody.classList.toggle('active', view.mode === 'body')
  for (const control of [elements.modeExclude, elements.modeBody, elements.reset]) control.disabled = !view.selecting
  elements.selectionHelp.hidden = !view.selecting
  elements.excludeCount.textContent = view.selecting ? `除外：${view.excludeCount}か所` : ''
  elements.ruleState.textContent = view.rule ? 'このサイトの範囲を覚えています。範囲を選ばずに保存すると、覚えた範囲を使います。' : 'このサイトの範囲はまだありません。範囲を選ばずに保存すると、本文を推定して保存します。'
  elements.save.disabled = !ready || !view.folder || view.busy
}

function showStatus(message, tone = 'info') {
  elements.status.textContent = message
  elements.status.dataset.tone = tone
}

async function refreshTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  view.tab = tab ?? null
  view.selecting = false
  view.excludeCount = 0
  let origin = null
  try { const url = new URL(tab?.url ?? ''); if (url.protocol === 'https:' || url.protocol === 'http:') origin = url.origin } catch { /* 取り込めないページ */ }
  view.origin = origin
  view.permitted = origin ? await chrome.permissions.contains({ origins: [originPattern(origin)] }) : false
  view.folder = origin ? await storedFolder(origin).catch(() => null) : null
  view.rule = origin ? await readRule(origin) : null
  view.siteName = origin ? await readSiteName(origin) : ''
  view.suggestedSiteName = origin ? new URL(origin).hostname : ''
  if (view.permitted) {
    const state = await sendToPage({ type: 'clip:state' }).catch(() => null)
    if (state?.siteName) view.suggestedSiteName = state.siteName
    applySelection(state)
  }
  render()
}

// サイトの読み取りの許可は、ボタンを押した直後に求める必要がある（ほかの待ち時間を挟まない）。
async function ensurePermission() {
  if (view.permitted) return true
  view.permitted = await chrome.permissions.request({ origins: [originPattern(view.origin)] })
  render()
  if (!view.permitted) showStatus('このサイトの読み取りが許可されませんでした。', 'warning')
  return view.permitted
}

elements.allow.addEventListener('click', () => { void ensurePermission() })

elements.chooseFolder.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker({ id: 'hundred-web-clipper', mode: 'readwrite' })
    await storeFolder(view.origin, handle)
    view.folder = handle
    render()
    showStatus(`「${handle.name}」の中に、サイトのフォルダを作って保存します。`, 'success')
  } catch (error) {
    if (error?.name !== 'AbortError') showStatus('フォルダを選べませんでした。', 'error')
  }
})

elements.siteName.addEventListener('change', async () => {
  view.siteName = elements.siteName.value.trim() ? fileName(elements.siteName.value) : ''
  await saveSiteName(view.origin, view.siteName)
  render()
})

elements.select.addEventListener('click', async () => {
  if (!await ensurePermission()) return
  try { applySelection(await sendToPage({ type: 'clip:start', rule: view.rule })); connectPage(view.tab.id); showStatus('') }
  catch { showStatus('このページでは範囲を選べません。', 'error') }
})
elements.stopSelect.addEventListener('click', async () => { applySelection(await sendToPage({ type: 'clip:stop' }).catch(() => null)) })
elements.modeExclude.addEventListener('click', async () => { applySelection(await sendToPage({ type: 'clip:mode', mode: 'exclude' }).catch(() => null)) })
elements.modeBody.addEventListener('click', async () => { applySelection(await sendToPage({ type: 'clip:mode', mode: 'body' }).catch(() => null)) })
elements.reset.addEventListener('click', async () => { applySelection(await sendToPage({ type: 'clip:reset' }).catch(() => null)) })

elements.save.addEventListener('click', async () => {
  if (!await ensurePermission()) return
  view.busy = true
  render()
  showStatus('保存しています…')
  try {
    const result = await saveArticle()
    if (view.selecting) applySelection(await sendToPage({ type: 'clip:stop' }).catch(() => null))
    showStatus(`${result.path} を保存しました（画像${result.imageCount}件）。${result.failed ? `画像${result.failed}件は保存できず、元のURLのまま残しました。` : ''}`, result.failed ? 'warning' : 'success')
  } catch (error) {
    console.warn('記事を保存できませんでした', error)
    showStatus(error instanceof Error && error.message.endsWith('。') ? error.message : '記事を保存できませんでした。', 'error')
  } finally {
    view.busy = false
    render()
  }
})

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'clip:changed' && sender.tab?.id === view.tab?.id) applySelection(message.state)
})
chrome.tabs.onActivated.addListener(() => { void refreshTab() })
chrome.tabs.onUpdated.addListener((tabId, change) => { if (tabId === view.tab?.id && (change.status === 'complete' || change.url)) void refreshTab() })

void refreshTab()
