# 開発メモ

> AI Desktopが生成したファイルです。直接編集せず、AI Desktopで変更してください。

## Hundredの責務
- Hundredが受け持つのは、認証とセッション、Hundred Home、Appの一覧と起動、プロフィール、共通設定、全App共通のApple Intelligence。
- 各Appの画面・データ・業務ルールは各Appが受け持つ。Hundredは各Appのデータを直接編集しない。

## 現在の状態
- サインインはAmazon Cognitoで実装済み。ゲスト利用は同じタブの中だけ保持する。
- 壁紙・効果音・通知の設定は、まだサーバーに保存せずlocalStorageに保存している。
- ストアとメールは入口だけで、機能は未実装。
- 利用者の表示名（hundred_user_directory）は、現在AI DesktopのAPI経由で同期している。

## 参照する設計書
- ドキュメント/詳細設計/Hundred-詳細設計.md（一部の記述は実装より古い。認証はモックではなくCognitoで実装済み）
- ドキュメント/UI設計書/Hundred-UI設計書-XMB版.md
