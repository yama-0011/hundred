/**
 * 概要: AI Desktopのページで動き、拡張から受け取ったスクリーンショットをAI Desktopの画面へ渡す。
 * AI Desktop側は、同じページからの window.postMessage だけを受け付ける。
 */
if (!window.__hundredScreenCaptureBridge) {
  window.__hundredScreenCaptureBridge = true
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'hundred-screen-capture') return
    window.postMessage({ source: 'hundred-screen-capture', capture: message.capture }, window.location.origin)
    sendResponse({ ok: true })
  })
}
