# Hundred Local Agent

Hundredのブラウザ画面と、ローカルのApple Intelligence・CLI・D1を接続するサービスです。`127.0.0.1`だけで待ち受けます。

## 起動

ターミナルを2つ使用します。

```bash
apple-intelligence serve
```

```bash
cd /Users/yama/Workspace/hundred/local-agent
npm start
```

既定の接続先:

- Hundred Local Agent: `http://127.0.0.1:11435`
- Apple Intelligence: `http://127.0.0.1:11434`

AI Desktopから渡された対象情報を使い、公開コンテンツの取得、Apple Intelligenceによる修正案生成、確認後の下書きDB・履歴登録を行います。正式カタログは直接更新しません。

共通チャットの`POST /v1/chat/general`では対象アプリを受け取り、そのアプリに対応するHundred内のソースだけを読み取り専用で参照します。ファイル変更、コマンド実行、DB操作は行いません。
