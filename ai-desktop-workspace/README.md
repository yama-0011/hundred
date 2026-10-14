# AI Desktop workspace

AI Desktopの資料をCodex CLIで編集するための一時作業領域です。正式データとAI下書き履歴はD1で管理します。

## 共有JSON

`Workspace JSON.json`は、ユーザーとCodexがJSONを受け渡して編集・検証するための共有作業ファイルです。作業ごとに内容を入れ替え、資料JSON、Project雛形、インポートデータなど、その機能が要求するJSON形式をそのまま保存します。

このファイルは一時作業用であり、正式データの保存先ではありません。Gitの管理対象から除外し、必要な内容はAI Desktopで確認してからD1へ保存します。

## ディレクトリ構成

`pull`したJSONは対象環境、サービス、カテゴリ、コンテンツの順に保存されます。

```text
ai-desktop-workspace/
├── local/<serviceId>/<categoryId>/<contentId>.json
└── remote/<serviceId>/<categoryId>/<contentId>.json
```

同じ対象を再取得すると同じファイルを上書きします。版を増やす必要はありません。AI下書きの版管理はD1が行います。

## D1から取得する

`workers/apps-api`で実行します。対象環境を必ず指定してください。

```bash
cd /Users/yama/Workspace/hundred/workers/apps-api

npm run ai-desktop:pull -- \
  --service codex \
  --category <カテゴリID> \
  --content <コンテンツID> \
  --local
```

本番D1から取得する場合は`--remote`を指定します。出力先は自動で`local`または`remote`へ分かれます。

### マイ資料の編集画面から書き出す

マイ資料の編集画面の「JSON連携 → JSONへ書き出す」は、このフォルダを選ぶと、`pull`と同じ場所（`local/<serviceId>/<categoryId>/<contentId>.json`）へ、同じ形のJSONを書き出します。同じページは同じ名前で上書きします。版の履歴はAI Desktopの下書き履歴で残してください。

### Screen Mapの画像

Screen Mapのページは、画面ごとのスクリーンショットをJSONと同じ場所の`<contentId>-images/`へ保存し、JSONの`screenImages`に画面IDとパスを書きます（画面からの書き出しと`pull`のどちらも同じです）。AIは質問に必要な画面の画像だけを開いてください。画像はGitの管理対象から除外しています。

## AI下書きへ保存する

```bash
npm run ai-desktop:push -- \
  --file ../../ai-desktop-workspace/local/<serviceId>/<カテゴリID>/<コンテンツID>.json \
  --local
```

本番用JSONではパスとオプションの両方を`remote`にします。JSON内の`target.databaseTarget`と指定が一致しない場合は停止します。

```bash
npm run ai-desktop:push -- \
  --file ../../ai-desktop-workspace/remote/<serviceId>/<カテゴリID>/<コンテンツID>.json \
  --remote \
  --dry-run
```

`push`は正式公開データを直接変更しません。AI Desktopの「AI下書き」で内容を確認して編集画面へ反映し、最後に「DBへ保存」で正式反映します。
