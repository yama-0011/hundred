/**
 * 概要:
 * 記事のページの中で動き、取り込む範囲（本文と除外する部分）を選び、本文を取り出してサイドパネルへ返す。
 *
 * 責務:
 * - 本文の推定：article・main 要素や、段落の文字量が多い要素から選ぶ
 * - 範囲の表示：本文を緑、除外する部分を赤で囲み、カーソルを当てた要素に枠を出す
 * - クリックで、除外する部分の切り替え、または本文の選び直しをする（↑キーで1つ外側の要素へ広げる）
 * - 範囲をCSSセレクターにして返す。サイドパネルはサイトごとに覚え、次の記事で同じ範囲を当てはめる
 * - 除外した部分・非表示の要素・スクリプトなどを取り除いた本文のHTMLを返す
 *
 * サイドパネルから chrome.scripting.executeScript で読み込む。何度読み込んでも1回だけ動く。
 */
if (!window.__hundredWebClipSelector) {
  window.__hundredWebClipSelector = true

  const BODY_ATTRIBUTE = 'data-hundred-clip-body'
  const EXCLUDE_ATTRIBUTE = 'data-hundred-clip-exclude'
  const HIDDEN_ATTRIBUTE = 'data-hundred-clip-hidden'
  const removedTags = 'script, style, noscript, iframe, form, button, input, select, textarea, template, svg, canvas, video, audio, object, embed, link, meta'
  const bodyCandidates = ['article', 'main', '[role="main"]', '.entry-content', '.post-content', '.article-body', '.content', '#content']

  const state = { active: false, mode: 'exclude', body: null, excludes: new Set(), hovered: null, hoverDepth: 0 }
  let style = null
  let hoverBox = null

  const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim()
  const visible = (element) => element.getClientRects().length > 0
  const textLength = (element) => [...element.querySelectorAll('p, li, td, h2, h3')].reduce((sum, item) => sum + clean(item.textContent).length, 0)

  function guessBody() {
    for (const selector of bodyCandidates) {
      const found = [...document.querySelectorAll(selector)].filter(visible).sort((a, b) => textLength(b) - textLength(a))[0]
      if (found && textLength(found) >= 200) return found
    }
    // 段落をいちばん多く直接持つ要素を本文とみなす。
    const parents = new Map()
    for (const paragraph of document.querySelectorAll('p')) {
      if (!paragraph.parentElement || !visible(paragraph)) continue
      parents.set(paragraph.parentElement, (parents.get(paragraph.parentElement) ?? 0) + clean(paragraph.textContent).length)
    }
    return [...parents.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? document.body
  }

  // サイトの別の記事でも同じ要素を指せるよう、番号を含むIDやクラス、状態を表すクラスは使わない。
  const stableName = (name) => !/\d{3,}|^(is|has)-|active|current|hover|focus|open|selected/i.test(name)
  function selectorFor(element) {
    const parts = []
    for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
      if (current.id && stableName(current.id)) { parts.unshift(`#${CSS.escape(current.id)}`); break }
      const classes = [...current.classList].filter(stableName).slice(0, 2)
      parts.unshift(current.tagName.toLowerCase() + classes.map((name) => `.${CSS.escape(name)}`).join(''))
      const selector = parts.join(' > ')
      if (classes.length && document.querySelectorAll(selector).length === 1) return selector
    }
    return parts.join(' > ')
  }

  const queryAll = (selector, root = document) => { try { return [...root.querySelectorAll(selector)] } catch { return [] } }

  function applyRule(rule) {
    state.body = (rule?.body && queryAll(rule.body).find(visible)) || guessBody()
    state.excludes = new Set((rule?.excludes ?? []).flatMap((selector) => queryAll(selector, state.body)))
  }

  function paint() {
    for (const element of document.querySelectorAll(`[${BODY_ATTRIBUTE}], [${EXCLUDE_ATTRIBUTE}]`)) { element.removeAttribute(BODY_ATTRIBUTE); element.removeAttribute(EXCLUDE_ATTRIBUTE) }
    if (!state.active) return
    state.body?.setAttribute(BODY_ATTRIBUTE, '')
    for (const element of state.excludes) element.setAttribute(EXCLUDE_ATTRIBUTE, '')
  }

  function currentRule() {
    if (!state.body) return null
    return { body: selectorFor(state.body), excludes: [...new Set([...state.excludes].filter((element) => state.body.contains(element)).map(selectorFor))] }
  }

  function summary() {
    return { active: state.active, mode: state.mode, excludeCount: state.excludes.size, rule: currentRule() }
  }

  function hoverTarget() {
    let element = state.hovered
    for (let depth = 0; element && depth < state.hoverDepth && element.parentElement && element.parentElement !== document.body; depth += 1) element = element.parentElement
    return element
  }

  function drawHover() {
    const element = state.active ? hoverTarget() : null
    if (!element || !hoverBox) { if (hoverBox) hoverBox.style.display = 'none'; return }
    const rect = element.getBoundingClientRect()
    Object.assign(hoverBox.style, { display: 'block', top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderColor: state.mode === 'body' ? '#2fb37a' : '#e0554a' })
  }

  function onMove(event) {
    if (event.target === state.hovered) return
    state.hovered = event.target instanceof Element ? event.target : null
    state.hoverDepth = 0
    drawHover()
  }

  function onKey(event) {
    if (event.key === 'ArrowUp') { state.hoverDepth += 1; drawHover(); event.preventDefault() }
    else if (event.key === 'ArrowDown') { state.hoverDepth = Math.max(0, state.hoverDepth - 1); drawHover(); event.preventDefault() }
    else if (event.key === 'Escape') { stop(); chrome.runtime.sendMessage({ type: 'clip:changed', state: summary() }).catch(() => undefined) }
  }

  function onClick(event) {
    const element = hoverTarget()
    if (!element) return
    // ページのリンクやボタンが動かないようにする。
    event.preventDefault()
    event.stopPropagation()
    if (state.mode === 'body') {
      state.body = element
      state.excludes = new Set([...state.excludes].filter((excluded) => element.contains(excluded)))
    } else {
      const excludedAncestor = [...state.excludes].find((excluded) => excluded === element || excluded.contains(element))
      if (excludedAncestor) state.excludes.delete(excludedAncestor)
      else if (state.body?.contains(element) && element !== state.body) {
        for (const excluded of [...state.excludes]) if (element.contains(excluded)) state.excludes.delete(excluded)
        state.excludes.add(element)
      }
    }
    paint()
    chrome.runtime.sendMessage({ type: 'clip:changed', state: summary() }).catch(() => undefined)
  }

  function start(rule) {
    applyRule(rule)
    if (!state.active) {
      state.active = true
      style = document.createElement('style')
      style.textContent = `[${BODY_ATTRIBUTE}] { outline: 3px solid #2fb37a !important; outline-offset: 2px !important; }
[${EXCLUDE_ATTRIBUTE}] { outline: 2px solid #e0554a !important; background: rgba(224, 85, 74, 0.18) !important; opacity: 0.55 !important; }`
      document.documentElement.append(style)
      hoverBox = document.createElement('div')
      Object.assign(hoverBox.style, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', border: '2px dashed', borderRadius: '2px', display: 'none' })
      document.documentElement.append(hoverBox)
      document.addEventListener('mousemove', onMove, true)
      document.addEventListener('click', onClick, true)
      document.addEventListener('keydown', onKey, true)
      window.addEventListener('scroll', drawHover, true)
    }
    paint()
  }

  function stop() {
    state.active = false
    paint()
    style?.remove()
    hoverBox?.remove()
    style = null
    hoverBox = null
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKey, true)
    window.removeEventListener('scroll', drawHover, true)
  }

  function absoluteUrl(value) {
    try { return new URL(value, document.baseURI).href } catch { return '' }
  }

  function breadcrumb() {
    const items = [...document.querySelectorAll('nav[aria-label*="breadcrumb" i] li, [class*="breadcrumb" i] li, [class*="breadcrumb" i] a')].filter(visible).map((item) => clean(item.textContent)).filter(Boolean)
    return [...new Set(items)].join(' > ')
  }

  function pageTitle() {
    const heading = [...document.querySelectorAll('h1')].find((item) => visible(item) && clean(item.textContent))
    return clean(heading?.textContent) || clean(document.title)
  }

  // サイト名の候補。ページのサイト名の設定 → ページタイトルの末尾（「記事名 | サイト名」） → ドメインの順に探す。
  function siteName() {
    const meta = document.querySelector('meta[property="og:site_name"], meta[name="application-name"]')?.getAttribute('content')
    const parts = clean(document.title).split(/\s[|｜\-–—]\s/u).map(clean).filter(Boolean)
    return clean(meta) || (parts.length > 1 ? parts[parts.length - 1] : '') || location.hostname
  }

  /** 範囲を当てはめて本文を取り出す。選択中ならその範囲、そうでなければ渡された範囲（なければ推定）を使う。 */
  function extract(rule) {
    if (!state.active) applyRule(rule)
    const body = state.body
    const hidden = [...body.querySelectorAll('*')].filter((element) => { const computed = getComputedStyle(element); return computed.display === 'none' || computed.visibility === 'hidden' })
    for (const element of hidden) element.setAttribute(HIDDEN_ATTRIBUTE, '')
    for (const element of state.excludes) element.setAttribute(EXCLUDE_ATTRIBUTE, '')
    // 遅延読み込みの画像は、読み込み前は仮の画像（data:）が表示されているため、data-src などのURLを優先する。
    const imageUrl = (image) => [image.currentSrc, image.getAttribute('data-src'), image.getAttribute('data-lazy-src'), image.getAttribute('src')].find((value) => value && !value.startsWith('data:')) ?? ''
    const images = [...body.querySelectorAll('img')].map((image) => absoluteUrl(imageUrl(image)))
    const clone = body.cloneNode(true)
    for (const element of hidden) element.removeAttribute(HIDDEN_ATTRIBUTE)
    paint()
    clone.querySelectorAll('img').forEach((image, index) => image.setAttribute('src', images[index] ?? ''))
    clone.querySelectorAll(`[${EXCLUDE_ATTRIBUTE}], [${HIDDEN_ATTRIBUTE}], ${removedTags}`).forEach((element) => element.remove())
    clone.querySelectorAll('a[href]').forEach((anchor) => anchor.setAttribute('href', absoluteUrl(anchor.getAttribute('href'))))
    clone.removeAttribute(BODY_ATTRIBUTE)
    const url = new URL(location.href)
    url.hash = ''
    return { html: clone.outerHTML, url: url.href, title: pageTitle(), breadcrumb: breadcrumb(), siteName: siteName(), rule: currentRule() }
  }

  // サイドパネルとつながっている間だけ選択を続け、サイドパネルを閉じたら（接続が切れたら）やめる。
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'hundred-web-clip-panel') return
    port.onDisconnect.addListener(() => { if (state.active) stop() })
  })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (typeof message?.type !== 'string' || !message.type.startsWith('clip:')) return
    if (message.type === 'clip:start') { start(message.rule); sendResponse(summary()) }
    else if (message.type === 'clip:mode') { state.mode = message.mode === 'body' ? 'body' : 'exclude'; drawHover(); sendResponse(summary()) }
    else if (message.type === 'clip:reset') { applyRule(null); paint(); sendResponse(summary()) }
    else if (message.type === 'clip:stop') { stop(); sendResponse(summary()) }
    else if (message.type === 'clip:state') sendResponse({ ...summary(), siteName: siteName() })
    else if (message.type === 'clip:extract') sendResponse(extract(message.rule))
  })
}
