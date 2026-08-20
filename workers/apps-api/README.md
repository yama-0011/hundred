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

## Cognito認証

`GET /api/creative-ia/wordpress/status`などの保護対象APIでは、HundredのCognito Access Tokenを`Authorization: Bearer <token>`で受け取ります。WorkerはAWS公式の`aws-jwt-verify`を使用し、署名、User Pool、App Client、期限、`token_use=access`を検証します。

## Secrets

値はリポジトリに保存せず、Cloudflare WorkerのSecretとして登録します。

- `WORDPRESS_CLIENT_SECRET`
- `OAUTH_STATE_SECRET`
- `TOKEN_ENCRYPTION_KEY`

## D1マイグレーション

本番D1へ未適用のマイグレーションを反映します。

```bash
npx wrangler d1 migrations apply hundred-apps-prod --remote
```
