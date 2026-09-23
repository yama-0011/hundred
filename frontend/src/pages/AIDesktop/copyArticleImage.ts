import { toBlob } from 'html-to-image'

const articleWidth = 840

const waitForImages = async (root: HTMLElement) => {
  const images = [...root.querySelectorAll('img')]
  await Promise.all(images.map(async (image) => {
    if (image.complete) return
    try { await image.decode() } catch { /* 画像化処理で最終判定する。 */ }
  }))
}

const waitForDiagrams = async (root: HTMLElement) => {
  const timeoutAt = Date.now() + 10_000
  while (root.querySelector('[data-diagram-state="loading"]') && Date.now() < timeoutAt) {
    await new Promise((resolve) => window.setTimeout(resolve, 80))
  }
  if (root.querySelector('[data-diagram-state="loading"]')) throw new Error('技術図の生成が完了してから、もう一度コピーしてください。')
}

export async function copyArticleImage(stage: HTMLElement): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('このブラウザは画像のクリップボードコピーに対応していません。')

  const desktop = stage.closest<HTMLElement>('.ai-desktop')
  if (!desktop) throw new Error('キャプチャ対象を取得できませんでした。')

  const backgroundColor = getComputedStyle(desktop).getPropertyValue('--panel').trim() || '#ffffff'
  const width = articleWidth + 240 + 24 + 64
  const imagePromise = (async () => {
    let portal: HTMLDivElement | null = null
    try {
      await waitForDiagrams(stage)
      const clone = stage.cloneNode(true) as HTMLElement
      clone.classList.add('ad-capture-stage')
      clone.querySelectorAll('.ad-page-glossary-panel, .ad-learning-nav').forEach((element) => element.remove())
      portal = document.createElement('div')
      portal.className = 'ad-page-capture-portal'
      const host = document.createElement('div')
      host.className = 'ad-page-capture-host'
      host.style.setProperty('--ad-capture-article-width', `${articleWidth}px`)
      host.appendChild(clone)
      portal.appendChild(host)
      desktop.appendChild(portal)
      await document.fonts.ready
      await waitForImages(host)
      const height = Math.ceil(host.scrollHeight)
      if (height > 32_000) throw new Error('ページが長すぎるため、1枚の画像にできませんでした。')
      const blob = await toBlob(host, { width, height, canvasWidth: width, canvasHeight: height, pixelRatio: 1, backgroundColor, cacheBust: true })
      if (!blob) throw new Error('ページ画像を生成できませんでした。')
      return blob
    } finally {
      portal?.remove()
    }
  })()

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': imagePromise })])
  } catch (error) {
    try { await imagePromise } catch (renderError) { if (renderError instanceof Error) throw renderError }
    throw error instanceof Error && error.name === 'NotAllowedError'
      ? new Error('クリップボードへの画像コピーが許可されませんでした。ブラウザの権限設定を確認してください。')
      : new Error('ページ画像をクリップボードへコピーできませんでした。')
  }
}
