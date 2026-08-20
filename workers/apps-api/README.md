# Hundred Apps API

Hundred上の各アプリで共用するCloudflare Workerです。最初の対象として、Creative IAとWordPress.comのOAuthコールバックを受け付けます。

## Cloudflare Workers Builds

- プロジェクト名: `hundred-apps-api`
- ルートディレクトリ: `workers/apps-api`
- ビルドコマンド: 空欄
- デプロイコマンド: `npx wrangler deploy`

## 公開予定URL

- Workerカスタムドメイン: `https://apps-api.yamahit.com`
- ヘルスチェック: `https://apps-api.yamahit.com/health`
- WordPress.com OAuthコールバック: `https://apps-api.yamahit.com/api/creative-ia/wordpress/oauth/callback`

## Secrets

値はリポジトリに保存せず、Cloudflare WorkerのSecretとして登録します。

- `WORDPRESS_CLIENT_SECRET`
- `OAUTH_STATE_SECRET`
- `TOKEN_ENCRYPTION_KEY`
