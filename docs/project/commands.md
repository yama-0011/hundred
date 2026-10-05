# よく使うコマンド

> AI Desktopが生成したファイルです。直接編集せず、AI Desktopで変更してください。

## フロントエンドを起動
Vite開発サーバーを起動します。
実行場所：frontend ／ 環境：ローカル
```
npm run dev
```

## Workerを起動
共用APIをローカルで起動します。ローカルD1を使います。
実行場所：workers/apps-api ／ 環境：ローカル
```
npm run dev
```

## Local Agentを起動
Apple Intelligenceとの中継サービスを起動します。
実行場所：local-agent ／ 環境：ローカル
```
npm start
```

## フロントエンドの型チェック
変更後に必ず実行します。
実行場所：frontend ／ 環境：ローカル
```
npx tsc --noEmit -p .
```

## フロントエンドのlint
ESLintでコードを確認します。
実行場所：frontend ／ 環境：ローカル
```
npm run lint
```

## フロントエンドをビルド
型チェックと本番用ビルドを実行します。
実行場所：frontend ／ 環境：ローカル
```
npm run build
```

## ローカルD1へマイグレーションを適用
ローカル開発用のD1に未適用のマイグレーションを反映します。
実行場所：workers/apps-api ／ 環境：ローカル
```
npx wrangler d1 migrations apply hundred-apps-prod --local
```
