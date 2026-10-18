/**
 * 概要: 拡張のアイコンを押したら、Web資料の取り込みのサイドパネルを開く。
 * 範囲の選択と保存はサイドパネル（hundredWebClipperPanel.js）が行う。
 */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.warn('サイドパネルの設定に失敗しました', error))
