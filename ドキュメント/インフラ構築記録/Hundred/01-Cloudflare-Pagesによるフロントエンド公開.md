# Hundred Cloudflare Pages フロントエンド公開手順

## 1. 目的

Hundred の静的フロントエンドを Cloudflare Pages で公開し、AWS の稼働状態に左右されずに `yamahit.com` を利用できる構成にする。

- Hundred は Cloudflare Pages で常時配信する
- Record Hub の API は `api.yamahit.com` で分離する
- EC2 を停止しても Hundred の画面は表示できるようにする
- GitHub の `main` ブランチへの更新を自動でビルド・デプロイする

この手順は本番公開用である。ローカル環境を一時公開する Quick Tunnel とは用途が異なる。

---

## 2. 完成後の構成

```text
利用者
  ↓ HTTPS
yamahit.com
  ↓
Cloudflare Pages
  ↓
Hundred 静的フロントエンド

Record Hub を利用するときのみ
Hundred
  ↓ HTTPS API
api.yamahit.com
  ↓
Cloudflare Tunnel
  ↓
EC2 / cloudflared
  ↓
Nginx
  ↓
Spring Boot
  ↓
RDS PostgreSQL
```

`yamahit.com` と `api.yamahit.com` は別の配信先として管理する。

| ホスト名 | 用途 | 接続先 | AWS停止時 |
|---|---|---|---|
| `yamahit.com` | Hundred フロントエンド | Cloudflare Pages | 表示可能 |
| `api.yamahit.com` | Record Hub API | Cloudflare Tunnel → AWS | 利用不可 |

---

## 3. 今回の設定値

| 項目 | 設定値 |
|---|---|
| GitHub リポジトリ | `yama-0011/hundred` |
| 本番ブランチ | `main` |
| フロントエンドのディレクトリ | `frontend` |
| パッケージマネージャー | npm |
| ビルドコマンド | `npm run build` |
| ビルド出力ディレクトリ | `dist` |
| Pages プロジェクト名 | `hundred` |
| Pages の初期ドメイン | `hundred-n3r.pages.dev` |
| 本番カスタムドメイン | `yamahit.com` |
| Record Hub API | `api.yamahit.com` |

> ルートディレクトリを `frontend` に設定するため、ビルド出力は `frontend/dist` ではなく `dist` と入力する。

---

## 4. デプロイ前のローカル確認

プロジェクトのフロントエンドディレクトリで、依存関係の取得、Lint、ビルドを確認する。

```bash
cd "/Users/yama/Workspace/hundred/frontend"
npm ci
npm run lint
npm run build
```

次を確認する。

- コマンドがエラーなしで終了する
- `frontend/dist/index.html` が生成される
- ローカルで画面が正しく表示される
- `dist` が Git の管理対象外になっている場合は、生成物をコミットしない

---

## 5. GitHub リポジトリを接続する

1. Cloudflare ダッシュボードを開く
2. 「Workers & Pages」を開く
3. 「アプリケーションを作成」を選択する
4. 画面下部の Pages セクションにある「始める」を選択する
5. GitHub との接続を選択する
6. GitHub で「Cloudflare Workers and Pages」を承認する
7. Repository access は「Only select repositories」を選択する
8. `yama-0011/hundred` のみを許可する
9. Cloudflare に戻り、`hundred` リポジトリを選択する
10. 「セットアップの開始」を選択する

### 注意

`npx wrangler deploy` が表示される Worker 作成画面は、今回利用する Pages の Git 連携画面ではない。Worker の画面に入った場合は前の画面へ戻り、Pages の「始める」から進み直す。

GitHub App には必要なリポジトリだけを許可し、全リポジトリへのアクセスは避ける。

---

## 6. ビルド設定

Cloudflare Pages の設定画面で次を入力する。

| 項目 | 入力値 |
|---|---|
| プロジェクト名 | `hundred` |
| プロダクションブランチ | `main` |
| フレームワークプリセット | React (Vite) または Vite |
| ルートディレクトリ | `frontend` |
| ビルドコマンド | `npm run build` |
| ビルド出力ディレクトリ | `dist` |
| 環境変数 | 現時点ではなし |

設定後、「保存してデプロイする」を選択する。

---

## 7. 初回デプロイを確認する

デプロイが成功したら、Cloudflare が発行した次の URL を開く。

```text
https://hundred-n3r.pages.dev
```

次を確認する。

- サインイン画面が表示される
- CSS、画像、フォントが読み込まれる
- ブラウザを再読み込みしても表示できる
- 主要な画面遷移が動作する
- コンソールに致命的なエラーが出ていない

この時点では `pages.dev` の URL で動作確認し、問題がなければカスタムドメインを設定する。

---

## 8. 旧 Worker のカスタムドメインを解除する

今回、`yamahit.com` は以前の Worker プロジェクト `my-next-app` に関連付けられていた。そのままでは Pages に同じドメインを設定できないため、旧 Worker 側の関連付けだけを解除する。

1. Cloudflare ダッシュボードの「Workers & Pages」を開く
2. 旧 Worker `my-next-app` を開く
3. 「設定」から「ドメインとルート」を開く
4. `yamahit.com` のカスタムドメイン設定を削除する

### 削除してはいけないもの

- `api.yamahit.com` の DNS レコード
- `recordhub-prod` の Cloudflare Tunnel
- 旧 Worker 本体（ドメイン移行だけなら削除不要）

ドメインの関連付け先だけを変更し、Record Hub の API 経路は維持する。

---

## 9. Pages にカスタムドメインを設定する

1. Cloudflare ダッシュボードの「Workers & Pages」を開く
2. Pages プロジェクト `hundred` を開く
3. 「カスタムドメイン」を開く
4. 「カスタムドメインを設定」を選択する
5. `yamahit.com` を入力する
6. 内容を確認して設定を完了する
7. ステータスが「アクティブ」になるまで待つ

Cloudflare が必要な DNS 設定と証明書の準備を行う。反映には時間がかかることがあり、画面上では最大48時間と案内される場合がある。

Pages のプロジェクトへ登録する前に、同じ名前の CNAME レコードを手動で作成しない。既存の Worker や別の Pages プロジェクトに関連付けられている場合は、先にその関連付けを解除する。

---

## 10. 本番環境の動作確認

次の URL を開く。

```text
https://yamahit.com
```

確認項目は次のとおり。

- HTTPS で Hundred が表示される
- 証明書エラーがない
- サインイン画面とホーム画面が表示される
- PC とスマートフォンの両方でレイアウトが崩れない
- ページを再読み込みしても表示できる
- `https://hundred-n3r.pages.dev` でも表示できる
- DNS 上で `api.yamahit.com` が `recordhub-prod` Tunnel のまま維持されている

キャッシュにより古い画面が表示される場合は、スーパーリロードまたはシークレットウィンドウで確認する。

---

## 11. 日常のデプロイ方法

Cloudflare Pages と GitHub の接続後は、`main` ブランチへの push を契機に自動でビルドとデプロイが実行される。

基本的な流れは次のとおり。

```bash
cd "/Users/yama/Workspace/hundred/frontend"
npm run lint
npm run build
```

確認後に変更をコミットし、`main` へ push する。Cloudflare Pages の「デプロイ」画面で、ビルド結果と本番反映を確認する。

本番デプロイに失敗した場合でも、直前に成功したデプロイは引き続き配信される。失敗したビルドのログを確認し、修正後に再度 push する。

---

## 12. AWS 停止時の動作

EC2 や RDS を停止しても、Cloudflare Pages 上の Hundred 自体は表示できる。

ただし、`api.yamahit.com` を利用する Record Hub の機能は利用できない。今後 API 接続を実装するときは、次の表示制御を追加する。

- API のタイムアウトを短時間で検知する
- 「Record Hub は現在停止しています」と日本語で案内する
- Hundred のホーム画面には戻れるようにする
- 再試行ボタンを用意する
- API 停止を Hundred 全体のエラーとして扱わない

---

## 13. セキュリティ上の注意

- AWS アクセスキーをフロントエンドへ保存しない
- Cloudflare API トークンをフロントエンドへ保存しない
- データベースの接続情報をフロントエンドへ保存しない
- `VITE_` で始まる環境変数はブラウザへ公開される前提で扱う
- GitHub App は `hundred` リポジトリだけにアクセスを許可する
- Cloudflare Tunnel のトークンを GitHub や文書へ記載しない
- 秘密情報が必要な処理は Record Hub のバックエンド側で実行する

---

## 14. トラブルシューティング

### Worker の設定画面が表示される

「アプリケーションを作成」の画面へ戻り、Pages セクションの「始める」を選択する。今回の構成では `npx wrangler deploy` を入力しない。

### `package.json` が見つからずビルドに失敗する

ルートディレクトリが `frontend` になっているか確認する。

### ビルド出力が見つからない

ルートディレクトリを `frontend` にした場合、出力ディレクトリは `dist` とする。`frontend/dist` にはしない。

### カスタムドメインを追加できない

`yamahit.com` が旧 Worker `my-next-app` や別の Pages プロジェクトに関連付けられていないか確認し、古い関連付けだけを解除する。

### Pages 設定後に API が利用できない

DNS で `api.yamahit.com` が Cloudflare Tunnel `recordhub-prod` を参照しているか確認する。`yamahit.com` の移行時に API 用レコードを変更しない。

### GitHub の更新が反映されない

- push 先が `main` であるか確認する
- Pages のデプロイ履歴を確認する
- ビルドログにエラーがないか確認する
- GitHub App が `hundred` リポジトリへアクセスできるか確認する
- ブラウザのキャッシュを除外して確認する

---

## 15. Quick Tunnel との使い分け

| 項目 | Cloudflare Pages | Quick Tunnel |
|---|---|---|
| 用途 | 本番の静的フロントエンド公開 | ローカル開発中の一時確認 |
| URL | `yamahit.com` | 起動ごとに変わる一時 URL |
| Mac の起動 | 不要 | 必要 |
| Vite 開発サーバー | 不要 | 必要 |
| GitHub 連携 | あり | なし |
| 自動デプロイ | あり | なし |

ローカル確認で Quick Tunnel を使う場合は、次の文書を参照する。

- [Hundred Cloudflare Quick Tunnel 実機・外部公開確認手順](../../Hundred-Cloudflare-Quick-Tunnel手順.md)

---

## 16. 構築完了の判定

次の状態になれば構築完了とする。

- `https://yamahit.com` で Hundred が表示される
- `main` への push で Pages の自動デプロイが動作する
- AWS を停止しても Hundred の画面が表示される
- `api.yamahit.com` の Cloudflare Tunnel 設定が維持されている
- GitHub App のアクセス範囲が `hundred` リポジトリだけになっている

---

## 17. 参考資料

- [Cloudflare Pages - Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare Pages - Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages - Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Cloudflare Pages - Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflare Workers - Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

