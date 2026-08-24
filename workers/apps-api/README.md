# Hundred Apps API

Hundred上の各アプリで共用するCloudflare Workerです。Creative IAの記事案生成、WordPress接続・下書き保存、Instagram Business Login接続を受け付けます。

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
- Instagram接続状態: `GET /api/creative-ia/instagram/status`
- Instagram OAuth開始: `GET /api/creative-ia/instagram/oauth/start`
- Instagram OAuthコールバック: `https://apps-api.yamahit.com/api/creative-ia/instagram/oauth/callback`
- Instagram接続解除: `DELETE /api/creative-ia/instagram/connection`
- Gemini記事案生成: `POST /api/creative-ia/generate`
- Creative IA会話応答: `POST /api/creative-ia/chats/:chatId/respond`

## Creative IA利用ガイド

Creative IA自身の機能・操作方法への回答には、`ドキュメント/AI向け/Creative-IA_AI利用ガイド.md`を使用します。Markdownはデプロイ時にText ModuleとしてWorkerへ組み込み、質問に関係する見出しだけをGeminiへ渡します。内部設計書や秘密情報は回答用の情報源に使用しません。

## Cognito認証

`GET /api/creative-ia/wordpress/status`などの保護対象APIでは、HundredのCognito Access Tokenを`Authorization: Bearer <token>`で受け取ります。WorkerはAWS公式の`aws-jwt-verify`を使用し、署名、User Pool、App Client、期限、`token_use=access`を検証します。

## Secrets

値はリポジトリに保存せず、Cloudflare WorkerのSecretとして登録します。

- `WORDPRESS_CLIENT_SECRET`
- `INSTAGRAM_CLIENT_SECRET`
- `OAUTH_STATE_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `GEMINI_API_KEY`

Geminiのモデル名は公開設定`GEMINI_MODEL`で切り替えます。初期値は低コスト安定版の`gemini-3.5-flash-lite`です。記事生成は利用者ごとに1分3回・UTC日次20回までとし、D1には入力文や生成本文ではなく利用時刻と成否だけを記録します。

## Instagram Business Login

Meta開発者ダッシュボードの「InstagramログインによるAPI設定」で、次のリダイレクトURIを完全一致で登録します。

```text
https://apps-api.yamahit.com/api/creative-ia/instagram/oauth/callback
```

Instagram App Secretは画面やソースへ保存せず、WorkerのSecretへ登録します。

```bash
npx wrangler secret put INSTAGRAM_CLIENT_SECRET
```

初期実装で要求する権限は`instagram_business_basic`と`instagram_business_content_publish`です。取得した長期アクセストークンはAES-256-GCMで暗号化してD1へ保存し、ブラウザやAPIレスポンスへ返しません。接続解除時はCreative IA側に保存した接続情報を削除します。自動更新は行わないため、期限切れ時は設定画面から再接続します。

## D1マイグレーション

本番D1へ未適用のマイグレーションを反映します。

```bash
npx wrangler d1 migrations apply hundred-apps-prod --remote
```
