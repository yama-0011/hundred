# 開発環境

> AI Desktopが生成したファイルです。直接編集せず、AI Desktopで変更してください。

| 項目 | 内容 |
| --- | --- |
| OS | macOS |
| 実行環境 | Node.js 22 |
| パッケージ管理 | npm |
| フロントエンド | Vite（http://localhost:5173） |
| バックエンド・Worker | Wrangler（http://localhost:8787） |

## 前提ソフトウェア

| 名前 | バージョン | 必須 | 説明 |
| --- | --- | --- | --- |
| Node.js | 22 | 必須 | フロントエンド、Worker、Local Agentの実行に使います。 |
| npm |  | 必須 | 依存関係のインストールとスクリプトの実行に使います。 |
| Apple Intelligence CLI |  | 任意 | Apple Intelligenceを使うときだけ必要です。 |

## ローカルサービス

| 名前 | 接続先 | 起動コマンド |
| --- | --- | --- |
| Frontend | http://localhost:5173 | cd frontend && npm run dev |
| Apps API（Worker） | http://localhost:8787 | cd workers/apps-api && npm run dev |
| Hundred Local Agent | http://127.0.0.1:11435 | cd local-agent && npm start |
| Apple Intelligence | http://127.0.0.1:11434 | apple-intelligence serve |

## 初回セットアップ

1. フロントエンドの依存関係をインストール：frontendで実行します。
   ```
   cd frontend && npm install
   ```
2. Workerの依存関係をインストール：workers/apps-apiで実行します。
   ```
   cd workers/apps-api && npm install
   ```
3. ローカルD1へマイグレーションを適用：ローカル開発用のD1にテーブルを作成します。本番には適用されません。
   ```
   cd workers/apps-api && npx wrangler d1 migrations apply hundred-apps-prod --local
   ```
4. WorkerとFrontendを起動：別々のターミナルで起動します。Apple Intelligenceを使う場合はLocal Agentも起動します。
   ```
   cd workers/apps-api && npm run dev
   cd frontend && npm run dev
   ```

## 環境変数（値は記載しません）

| 変数名 | 設定先 | 必須 | 説明 |
| --- | --- | --- | --- |
| VITE_CREATIVE_IA_API_ORIGIN | frontend/.env.local | 任意 | 共用APIの接続先です。未設定の場合、開発時は http://localhost:8787、本番は https://apps-api.yamahit.com を使います。 |
| VITE_HUNDRED_LOCAL_AGENT_ORIGIN | frontend/.env.local | 任意 | Hundred Local Agentの接続先です。未設定の場合は http://127.0.0.1:11435 を使います。 |
| COGNITO_USER_POOL_ID / COGNITO_USER_POOL_CLIENT_ID | workers/apps-api/wrangler.jsonc（vars） | 必須 | WorkerがAccess Tokenを検証するCognitoの設定です。フロントエンド側は hundredAuth.ts に記載しています。 |

## 動作確認

- [ ] http://localhost:5173/ を開き、サインイン画面が表示されることを確認する。
- [ ] サインイン後、Hundred Homeでカテゴリとアプリを選べることを確認する。
- [ ] ゲストとして利用を開始できることを確認する。
- [ ] Homeからアプリを選び、各アプリの画面へ移動できることを確認する。
- [ ] 壁紙・効果音・通知の設定が、再読み込み後も保たれることを確認する。
