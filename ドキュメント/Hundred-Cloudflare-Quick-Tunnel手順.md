# Hundred Cloudflare Quick Tunnel 実機・外部公開確認手順

## 1. 目的

ローカルMacで起動しているHundredのVite開発サーバーを、Cloudflare Quick
Tunnelを利用して一時的にインターネットへ公開する。

主な用途は次のとおり。

-   自宅LAN外の端末からHundredを確認する
-   Tailscaleへ参加していない端末で動作確認する
-   友人など第三者へ一時URLを共有し、Hundredを操作してもらう
-   本番デプロイ前の簡易的な外部アクセス検証を行う

Quick Tunnelは開発・技術検証用途とし、本番公開には使用しない。

------------------------------------------------------------------------

## 2. 前提

Macへ`cloudflared`をインストール済みであること。

確認コマンド:

``` bash
cloudflared --version
```

動作確認時のバージョン:

``` text
cloudflared version 2026.8.2
```

HundredのフロントエンドはViteを使用する。

対象ディレクトリ:

``` text
/Users/yama/Desktop/ひまつぶし/Workspace/hundred/frontend
```

------------------------------------------------------------------------

## 3. ViteのallowedHosts設定

Cloudflare Quick
TunnelからViteへアクセスすると、初期状態では次のエラーが発生する場合がある。

``` text
Blocked request. This host ("xxxxx.trycloudflare.com") is not allowed.
To allow this host, add "xxxxx.trycloudflare.com" to `server.allowedHosts` in vite.config.js.
```

これはCloudflare
Tunnelの障害ではなく、ViteのHostチェックによってアクセスが拒否されている状態である。

Hundredでは次のファイルへ設定する。

``` text
frontend/vite.config.ts
```

設定例:

``` ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
  },
})
```

`.trycloudflare.com`を指定することで、Quick
Tunnel起動時に生成されるサブドメインを許可する。

Quick
TunnelではURLが起動ごとに変わる可能性があるため、特定の一時URLだけを固定登録しない。

`allowedHosts: true`による全Host許可は行わず、必要なHostだけを許可する。

------------------------------------------------------------------------

## 4. Hundredの起動

ターミナル1でHundredのフロントエンドを起動する。

``` bash
cd "/Users/yama/Desktop/ひまつぶし/Workspace/hundred/frontend"
npm run dev
```

プロジェクト側でViteのポートを`5173`へ固定している場合は、5173番ポートで起動していることを確認する。

------------------------------------------------------------------------

## 5. Cloudflare Quick Tunnelの起動

別のターミナルを開く。

Quick Tunnel自体はHundredのリポジトリ内から実行する必要はない。

``` bash
cloudflared tunnel --url http://localhost:5173
```

正常に作成されると、次のようなログが表示される。

``` text
Your quick Tunnel has been created! Visit it at:
https://xxxxx.trycloudflare.com
```

さらに次のようなTunnel接続成功ログを確認する。

``` text
Registered tunnel connection
protocol=quic
```

Quick
Tunnel利用時に次のメッセージが表示されても、設定ファイルを使用しない今回の構成では問題ない。

``` text
Cannot determine default configuration path.
No file [config.yml config.yaml] ...
```

------------------------------------------------------------------------

## 6. 外部端末からアクセス

ブラウザから、Quick Tunnel起動時に発行されたURLへアクセスする。

例:

``` text
https://xxxxx.trycloudflare.com
```

このURLはTailscale IPではないため、アクセスする端末にTailscaleは不要。

次のような端末から確認できる。

-   iPhone
-   iPad
-   別のMac
-   Windows PC
-   友人など第三者の端末

HundredのSign in画面が表示されれば、Cloudflare Quick
Tunnel経由の公開確認は成功。

------------------------------------------------------------------------

## 7. 通信経路

``` text
外部端末
   ↓ HTTPS
Cloudflare
   ↓ Quick Tunnel
Mac / cloudflared
   ↓
localhost:5173
   ↓
Vite
   ↓
Hundred
```

Mac側でルーターのポート開放を行う必要はない。

------------------------------------------------------------------------

## 8. Tailscaleとの使い分け

### Tailscale

自分の端末から開発環境へアクセスするときに使用する。

``` text
自分のiPhone
   ↓
Tailscale
   ↓
Mac
   ↓
Vite
```

特徴:

-   Tailnet参加端末だけがアクセスできる
-   自分専用のリモート実機確認に向いている
-   公開URLを発行する必要がない

### Cloudflare Quick Tunnel

Tailscaleへ参加していない端末へ一時的に公開するときに使用する。

``` text
友人などのブラウザ
   ↓
インターネット
   ↓
Cloudflare Quick Tunnel
   ↓
Mac
   ↓
Vite
```

特徴:

-   相手側にTailscaleは不要
-   URLをブラウザで開くだけで確認できる
-   一時的な第三者テストに向いている

------------------------------------------------------------------------

## 9. セキュリティ上の注意

Quick TunnelのURLはインターネットから到達可能な公開URLとして扱う。

次を遵守する。

-   URLをSNSや公開リポジトリへ掲載しない
-   秘密情報を画面へ表示しない
-   DBパスワードやAPIキーをフロントエンドへ含めない
-   本番データを開発環境へ持ち込まない
-   認証未実装の機能を長時間公開しない
-   確認終了後はQuick Tunnelを停止する
-   公開資料・Git管理対象の文書では、実際に発行されたQuick Tunnel
    URLを伏せる
-   端末名、ローカルIP、Tailscale IPなどの環境固有情報も公開時には伏せる

`server.allowedHosts`についても、次のような全許可は原則使用しない。

``` ts
server: {
  allowedHosts: true,
}
```

HundredではQuick Tunnelに必要な範囲だけを許可する。

``` ts
server: {
  allowedHosts: ['.trycloudflare.com'],
}
```

------------------------------------------------------------------------

## 10. 終了方法

動作確認が終了したら、Quick
Tunnelを起動しているターミナルで`Ctrl + C`を押す。

``` text
Ctrl + C
```

これによりQuick Tunnelを停止する。

Viteも不要であれば、Viteを起動しているターミナルでも`Ctrl + C`を押して終了する。

------------------------------------------------------------------------

## 11. トラブルシューティング

### `Blocked request`と表示される

原因:

Viteの`server.allowedHosts`にQuick TunnelのHostが許可されていない。

対応:

`frontend/vite.config.ts`を確認する。

``` ts
server: {
  allowedHosts: ['.trycloudflare.com'],
}
```

変更後は必要に応じてViteを再起動する。

### CloudflareのURLは発行されたがHundredが表示されない

次を確認する。

1.  Viteが起動しているか
2.  `localhost:5173`でHundredを開けるか
3.  Cloudflare Tunnelの接続ログに異常がないか
4.  `vite.config.ts`の`allowedHosts`が設定されているか
5.  Cloudflare TunnelがViteと同じポート`5173`を参照しているか

------------------------------------------------------------------------

## 12. Codexが確認すべき事項

Cloudflare Quick
Tunnelを利用した外部確認を行う場合、Codexは次を確認する。

-   HundredのVite開発サーバーが起動していること
-   Viteが実際に5173番ポートを使用していること
-   `frontend/vite.config.ts`で`.trycloudflare.com`が許可されていること
-   `cloudflared`がQuick Tunnelへ正常接続していること
-   Tunnel URLをソースコードやGit管理対象へ記録しないこと
-   外部公開終了後にTunnelを停止すること

Quick
Tunnelは開発時の一時公開手段として扱い、本番環境の公開方式として使用しない。
