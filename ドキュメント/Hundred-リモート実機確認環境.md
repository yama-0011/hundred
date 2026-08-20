# Hundred リモート実機確認環境

## 1. 目的

外出先のiPhoneからMac上のHundred開発環境へ接続し、Codex
Remoteでソースを変更した後に、iPhoneのSafariで実機動作確認できるようにする。

想定条件:

-   Macは起動中かつスリープしていない
-   MacとiPhoneのTailscaleは接続済み
-   iPhoneはWi-Fiを使用せず、5Gなどのモバイル回線を使用する
-   HundredのフロントエンドはViteで起動する

## 2. 現在のTailscale構成

MacとiPhoneは同一のTailnetへ接続済み。

  端末                 Tailscale IPv4
  -------------------- ------------------
  Mac `yama`           `100.127.61.2`
  iPhone `iphone-14`   `100.111.26.114`

iPhoneからMacへアクセスするときは、MacのTailscale IPv4 `100.127.61.2`
を使用する。

※
Tailscale側でIPアドレスが変更された場合は、現在のMacのIPv4を確認して読み替えること。

## 3. Vite開発サーバーの起動

``` bash
cd /Users/yama/Desktop/ひまつぶし/Workspace/hundred/frontend
npm run dev
```

`frontend/package.json`の`dev`スクリプトには、あらかじめ
`vite --host 0.0.0.0`が設定されている。そのため、追加の`--host`指定は不要。

`0.0.0.0`で待ち受けることで、localhost以外のネットワークインターフェースからも
Viteへ接続できる。

## 4. ポート番号

Viteでは`5173`が使われることが多いが、固定とは限らない。

起動時のターミナル出力を確認し、実際に使用しているポートを採用する。

例:

``` text
Local:   http://localhost:5173/
Network: http://192.168.x.x:5173/
```

この場合は`5173`を使用する。

`5173`が既に使用中の場合、`5174`など別のポートになる可能性がある。

毎回同じURLを使用したい場合は、次のようにポートを固定する。

``` bash
npm run dev -- --port 5173 --strictPort
```

`--strictPort`を付けると、`5173`が既に使用中の場合に別ポートへ自動変更せず、
エラーで通知される。

### 起動状態の確認

別のターミナルから次を実行する。

``` bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

`node`プロセスが表示されれば、Viteは`5173`で待ち受けている。
起動したターミナルを閉じるとViteが終了する可能性があるため、実機確認中は
ターミナルとViteプロセスを維持する。

終了するときは、Viteを起動したターミナルで`Control+C`を押す。

## 5. iPhoneからのアクセス

MacのTailscale IPv4とViteの実際のポート番号を組み合わせる。

Viteが`5173`で起動している場合:

``` text
http://100.127.61.2:5173
```

-   `100.127.61.2` = MacのTailscale IPv4
-   `5173` = Viteの開発サーバーポート

iPhoneではTailscaleを接続した状態で、このURLをSafariから開く。

Wi-FiをOFFにして5G接続だけにすることで、外出時と同等のネットワーク条件で確認できる。

## 6. 想定する開発フロー

``` text
iPhone
  ├─ Codex Remote
  │    ↓
  │  Mac上のHundredソースを変更
  │
  └─ Safari
       ↓
     Tailscale
       ↓
     Mac
       ↓
     Vite開発サーバー
       ↓
     Hundred
```

手順:

1.  Macを起動し、スリープしない状態にする
2.  MacのTailscaleを接続する
3.  iPhoneのTailscaleを接続する
4.  HundredのViteを`npm run dev`で起動する
5.  Codex RemoteからHundredのソースを変更する
6.  iPhone SafariからMacのTailscale IPv4とViteポートへアクセスする
7.  変更内容をiPhone実機で確認する

## 7. セキュリティ上の注意

`--host 0.0.0.0`を使用すると、ViteはTailscaleだけでなく、Macのほかの
ネットワークインターフェースでも待ち受ける。

-   信頼できないLANへの接続中は、macOSファイアウォールやTailscale ACLを確認する
-   Vite開発サーバーをインターネットへ直接ポート公開しない
-   実機確認が終わったら、不要なViteプロセスを終了する
-   この文書を公開する場合は、端末名とTailscale IPを伏せる

## 8. Codexが確認すべき事項

リモート実機確認を行う際は、次を確認する。

-   作業対象がHundredの`frontend`であること
-   `dev`スクリプトに`--host 0.0.0.0`が設定されていること
-   Viteが実際に使用しているポート番号
-   Viteプロセスが継続して起動していること
-   MacのTailscale IPv4とViteポートにHTTPでアクセスできること
-   必要に応じて現在のMacのTailscale IPv4
-   ソース変更後、HMRまたは再読み込みで変更が反映されていること

`--strictPort`を使用しない場合は、`5173`を無条件に固定値として扱わないこと。
