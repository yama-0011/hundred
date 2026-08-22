# Hundred Apps API

Hundred上の各アプリで共用するCloudflare Workerです。Creative IAの記事案生成、WordPress.comのOAuth接続、独自ドメインWordPressのApplication Password接続および下書き保存を受け付けます。

## Cloudflare Workers Builds

- プロジェクト名: `hundred-apps-api`
- ルートディレクトリ: `workers/apps-api`
- ビルドコマンド: 空欄
- デプロイコマンド: `npx wrangler deploy`

## 公開予定URL

- Workerカスタムドメイン: `https://apps-api.yamahit.com`
- ヘルスチェック: `https://apps-api.yamahit.com/health`
- WordPress.com OAuthコールバック: `https://hundred-apps-api.oneonewapig.workers.dev/api/creative-ia/wordpress/oauth/callback`
- WordPress.com下書き保存: `POST /api/creative-ia/wordpress/posts`
- Application Password接続: `POST /api/creative-ia/wordpress/application-password`
- WordPress接続解除: `DELETE /api/creative-ia/wordpress/connection`
- Gemini記事案生成: `POST /api/creative-ia/generate`

## Cognito認証

`GET /api/creative-ia/wordpress/status`などの保護対象APIでは、HundredのCognito Access Tokenを`Authorization: Bearer <token>`で受け取ります。WorkerはAWS公式の`aws-jwt-verify`を使用し、署名、User Pool、App Client、期限、`token_use=access`を検証します。

## Secrets

値はリポジトリに保存せず、Cloudflare WorkerのSecretとして登録します。

- `WORDPRESS_CLIENT_SECRET`
- `OAUTH_STATE_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `GEMINI_API_KEY`

Geminiのモデル名は公開設定`GEMINI_MODEL`で切り替えます。初期値は低コスト安定版の`gemini-3.5-flash-lite`です。記事生成は利用者ごとに1分3回・UTC日次20回までとし、D1には入力文や生成本文ではなく利用時刻と成否だけを記録します。

## D1マイグレーション

本番D1へ未適用のマイグレーションを反映します。

```bash
npx wrangler d1 migrations apply hundred-apps-prod --remote
```
