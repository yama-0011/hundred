<!-- ai-desktop:start（この範囲はAI Desktopが生成します。編集しないでください） -->
# Hundred

Hundredは、AI Desktop・Creative IA・Anigram・Record HubなどのAppを1つの入口からまとめて使うためのプラットフォームです。

Hundred本体は、サインイン（Amazon Cognito、ゲスト利用あり）、XMB型のHundred Home、Appの一覧と起動、プロフィール、壁紙・効果音・通知などの共通設定、全App共通のApple Intelligenceを受け持ちます。各Appの画面・データ・業務ルールは各Appが受け持ち、Hundredは直接編集しません。

## 守るルール

- Appの内部に踏み込まない：Hundredは認証、Home、Appの起動、共通設定だけを受け持つ。各Appのデータやテーブルを直接更新しない。
- 画面の表記は日本語：UIは日本語を標準とし、英字は製品名・サービス名・定着した略語に限る。同じ概念には常に同じ言葉を使う。詳細は ドキュメント/共通/Hundred-UI表記ルール.md。
- 内部のユーザー名を表示しない：Cognitoの内部ユーザー名は画面に出さず、名前かメールアドレスで表示する。
- 権限はサーバーで判定：APIはCognitoのAccess Tokenを検証してから処理する。画面側の判定は表示の出し分けにだけ使う。
- 秘密情報を保存しない：パスワード、APIキー、暗号鍵をリポジトリ、フロントエンド、APIレスポンス、プロジェクト情報に含めない。
- マイグレーションは追加のみ：D1の変更は workers/apps-api/migrations に次の連番でSQLを追加する。本番に適用済みのファイルは書き換えない。
- 本番への反映は指示があるときだけ：本番D1へのマイグレーション適用とデプロイは、本人の指示があるときだけ行う。本番DBを開発用に使わない。
- ファイル名にプロダクト名を付ける：Hundred専用のファイルは Hundred を接頭辞にする（例：HundredWallpaperBackground.tsx、hundredAuth.ts）。コンポーネントはPascalCase、その他のTSはcamelCase、CSSはkebab-case。
- 変更後は型チェック：フロントエンドは npx tsc --noEmit -p . を通す。画面の変更はブラウザで確認したかどうかも報告する。
- コミットメッセージ：変更の要点を日本語1行で書く。コミットとプッシュは指示があるときだけ行う。

## よく使うコマンド

- フロントエンドを起動：`npm run dev`（frontend）
- Workerを起動：`npm run dev`（workers/apps-api）
- フロントエンドの型チェック：`npx tsc --noEmit -p .`（frontend）

## 詳しい情報の置き場所

- 設計書：`docs/design/`（一覧は `docs/design/README.md`）。要件や設計に関わる作業では、該当する設計書を読んでから始めてください。
- プロジェクト情報：概要と構成は `docs/project/overview.md`、技術スタックは `docs/project/tech-stack.md`、データベースは `docs/project/database.md`、開発環境は `docs/project/environment.md`、よく使うコマンドは `docs/project/commands.md`、プロジェクトルールは `docs/project/rules.md`、リンク集は `docs/project/links.md`、開発メモは `docs/project/notes.md`
- `docs/design/` と `docs/project/` はAI Desktopが生成したファイルです。直接編集せず、変更が必要なときは `docs/ai-desktop/README.md` の手順に従ってください。
<!-- ai-desktop:end -->
