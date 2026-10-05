# 技術スタック

> AI Desktopが生成したファイルです。直接編集せず、AI Desktopで変更してください。

| 名前 | 分類 | 用途 |
| --- | --- | --- |
| React 19 | フロントエンド | Hundred Homeとサインイン画面の実装に使います。 |
| TypeScript 6 | フロントエンド | フロントエンドとWorkerで使います。変更後は型チェックを通します。 |
| Vite 8 | フロントエンド | 開発サーバーとビルドに使います。 |
| React Router 7 | フロントエンド | Hundred Homeから各Appの画面へ遷移します。 |
| Canvas | フロントエンド | Hundred Homeの動く壁紙を描画します。 |
| Web Storage | フロントエンド | 壁紙・効果音・通知の設定はlocalStorage、ゲスト利用はsessionStorageに保存します。 |
| Amazon Cognito | 認証 | Hundredのサインインに使います。ホストされたログイン画面（login.yamahit.com）とGoogleアカウントに対応します。 |
| AWS Amplify 6 | 認証 | フロントエンドからCognitoへのサインイン、セッション取得、属性更新に使います。 |
| aws-jwt-verify | 認証 | WorkerでCognitoのAccess Tokenの署名、期限、用途を検証します。 |
| Cloudflare Workers | バックエンド | 共用API（hundred-apps-api）です。Hundredは認証の検証とApple Intelligenceの会話履歴に使います。 |
| Cloudflare D1 | データベース | 利用者とApple Intelligenceの会話履歴を保存します。 |
| Hundred Local Agent | ローカルAI | 127.0.0.1で待ち受けるNode.jsの中継サービスです。ブラウザとApple Intelligenceをつなぎます。 |
| Apple Intelligence | ローカルAI | 全App共通のアシスタントとして使います。Local Agent経由で呼び出します。 |
| Node.js 22 | 実行環境 | フロントエンド、Worker、Local Agentの開発と実行に使います。 |
