# Hundred スクリーンショット取り込み（Chrome拡張）

表示中の画面を撮影し、URLと画面名の候補と一緒に、AI DesktopのScreen Mapの「取り込み待ち」へ送ります。

## 入れ方

1. Chromeで `chrome://extensions` を開き、右上の「デベロッパー モード」をオンにする
2. 「パッケージ化されていない拡張機能を読み込む」を押し、このフォルダ（`browser-extension/hundred-screen-capture`）を選ぶ
3. ショートカットキーを変えるときは、`chrome://extensions/shortcuts` で設定する

## 使い方

1. AI Desktop（`https://yamahit.com/ai-desktop` または開発環境の `http://localhost:5173/ai-desktop`）を、別のタブで開いておく
2. 調べたい画面を開き、拡張のアイコンを押すか ⌥⇧S（Windowsでは Alt+Shift+S）を押す
3. 拡張のアイコンに「✓」が出たら、AI Desktopの取り込み待ちに入っている
4. AI DesktopのScreen Mapの編集画面で「取り込み待ち」を押し、マスキングと画面名を確認して登録する

## 動き

- 撮影できるのは、表示されている範囲だけです。Chromeの設定画面など、撮影できない画面もあります。
- 画面名の候補は、大見出し → パンくずリストの最後 → 選ばれているメニュー → ページタイトルの順に探します。
- 画面の中を読むのは、アイコンかキーを押した瞬間の、そのタブだけです。
- 拡張はサインイン情報を持たず、AI DesktopのAPIも呼びません。撮った画像は、AI Desktopで登録するまでブラウザの中（取り込み待ち）だけにあります。
- AI Desktopのタブが開いていないときは、アイコンに「!」が出ます。
