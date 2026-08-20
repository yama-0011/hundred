# Hundred 詳細設計

## 1. 目的

本書は、Hundredを複数のUser Appを利用するためのプラットフォームとして実装するために、画面遷移、状態管理、責務境界、データ保存、バックエンド連携の基本方針を定義する。

XMB型UIの見た目と操作仕様は、次のUI設計書を前提とする。

- `ドキュメント/UI設計書/Hundred-UI設計書-XMB版.md`

本書では、UI設計書だけでは判断できない実装上の責務と状態遷移を扱う。

---

## 2. 対象範囲

Hundred本体が担当する対象は次のとおりとする。

- Home表示前の認証ゲート
- 会員・ゲストセッション
- XMB型Hundred Home
- Profile
- Apps一覧とUser Appの起動
- Storeへの入口
- Mailへの入口
- Hundred共通設定
- 壁紙、効果音、通知設定
- User Appのインストール状態管理
- Hundredと各User Appの画面遷移

Record Hub内部の記録、カテゴリ、コレクションなどの業務機能は対象外とし、Record Hub専用設計書で管理する。

---

## 3. 現在の実装状態

### 3.1 実装済み

- React Routerと`BrowserRouter`
- `/`でのHundred Home表示
- Home表示前の認証モック
- Sign in / Sign up / Continue as guest
- Profileの会員・ゲスト表示
- XMB型カテゴリ・App選択
- スワイプ、タップ、キーボード、マウスホイール操作
- Canvasによる動く壁紙
- 壁紙タイプによるLight / Dark配色
- カーソル音選択と効果音音量
- 通知全体とApp別通知の設定モック
- LocalStorageによる一部設定保存

### 3.2 未実装

- 実際のユーザー認証
- セッション復元
- Google等の外部アカウント連携
- User Appの実起動
- Storeの実機能
- Mailの実機能
- バックエンドAPI連携
- Hundred用DBテーブル

---

## 4. Hundredの責務

Hundredは、User Appの内部機能を持たず、次の共通基盤を提供する。

```text
Hundred
├─ 認証・セッション
├─ Home・ナビゲーション
├─ User Appの登録・起動・管理
├─ Store
├─ Mail
├─ Hundred共通設定
└─ User Appへユーザー情報を引き渡す共通基盤

User Apps
├─ Record Hub
├─ Memo
└─ Game
```

### 4.1 Hundredが管理するもの

- HundredユーザーID
- 認証状態
- インストール済みApp
- Appの並び順
- App別通知設定
- Hundredからのお知らせ
- アカウント連携情報
- Hundred共通設定

### 4.2 各User Appが管理するもの

- App固有の画面
- App固有のデータ
- App固有の設定
- App固有のAPIと業務ルール

HundredはUser App内部のデータを直接編集しない。

---

## 5. 認証とセッション

### 5.1 セッション状態

Hundredでは、次の状態を明示的に区別する。

| 状態 | 説明 | Hundred Home |
| --- | --- | --- |
| `checking` | 保存済みセッションを確認中 | 表示しない |
| `signed-out` | 未認証 | 表示しない |
| `member` | Hundred会員として認証済み | 表示する |
| `guest` | ゲストセッション | 表示する |

現在のモックでは`checking`を持たず、画面を再読み込みすると`signed-out`から開始する。

### 5.2 基本遷移

```text
起動
 ↓
セッション確認
 ├─ 有効な会員セッション → Hundred Home
 └─ セッションなし       → Sign in画面
                              ├─ Sign in  → member
                              ├─ Sign up  → member
                              └─ Guest    → guest

member / guest
 ↓ Sign out
signed-out
 ↓
Sign in画面
```

### 5.3 必須認証ゲート

- 認証方法を選択するまでHundred Homeを表示しない。
- ゲスト利用も明示的なユーザー操作によって開始する。
- 認証操作はブラウザの音声再生許可を取得する入口も兼ねる。
- 実認証導入後も、セッション確認中にHomeを一瞬表示しない。

### 5.4 ゲスト

- Hundredアカウントを作成せずにHomeを試せる。
- ゲストデータは原則として利用端末内へ保存する。
- 複数端末同期、アカウント連携、重要通知は対象外とする。
- ゲストからSign in / Sign upへ移行できる導線を用意する。
- ゲストデータを会員データへ引き継ぐかは、認証詳細設計で決定する。

---

## 6. 画面とルーティング

### 6.1 目標ルート構成

現在は`/`のみだが、画面実装時に次の構成へ段階的に移行する。

| URL | 画面 | 認証条件 |
| --- | --- | --- |
| `/` | セッション判定と遷移 | なし |
| `/sign-in` | サインイン選択 | 未認証 |
| `/home` | Hundred Home | member / guest |
| `/store` | Hundred Store | member / guest |
| `/mail` | Hundred Mail | memberを基本とする |
| `/apps/record-hub/*` | Record Hub | member / guest |

Profile、Wallpaper、Sound、Notificationsは、初期段階ではHome上のダイアログとして扱い、個別URLは持たない。

URL共有やブラウザ履歴が必要になった場合に、ダイアログのルート化を再検討する。

### 6.2 ルートガード

- `signed-out`で保護画面へアクセスした場合は`/sign-in`へ移動する。
- `member`または`guest`で`/sign-in`へアクセスした場合は`/home`へ移動する。
- 存在しないApp IDはNot Found表示とし、Homeへ戻る導線を用意する。
- 認証確認中は遷移先を確定せず、ローディング表示とする。

---

## 7. Hundred Home

### 7.1 カテゴリ

| カテゴリ | 初期責務 |
| --- | --- |
| Profile | 会員・ゲスト状態、認証操作、連携アカウント、詳細 |
| Apps | インストール済みUser Appの選択と起動 |
| Store | Store画面への遷移 |
| Mail | Hundredからのお知らせへの遷移 |
| Settings | 壁紙、サウンド、通知などの共通設定 |

### 7.2 選択状態

- 横方向のカテゴリ選択位置を保持する。
- Appsカテゴリでは縦方向のApp選択位置を保持する。
- ダイアログを閉じた場合は、開く前のカテゴリと項目へ戻る。
- User AppからHomeへ戻った場合の選択位置保持は、ルーティング実装時に決定する。

### 7.3 入力方式

| 入力 | 横移動 | 縦移動 | 決定 |
| --- | --- | --- | --- |
| タッチ | 横スワイプ | 縦スワイプ | タップ |
| キーボード | 左右キー | 上下キー | Enterまたはクリック |
| マウス | カテゴリ領域ホイール | App領域ホイール | クリック |

カーソル音は選択位置が実際に変わった場合だけ再生する。

---

## 8. Profile

### 8.1 未認証

未認証時はProfileへ到達できず、Sign in画面を表示する。

### 8.2 会員

- 表示名
- メールアドレス
- Hundred会員ID
- 連携アカウント一覧
- Sign out

### 8.3 ゲスト

- Guest session表示
- Sign in
- Sign up
- Sign out
- アカウント連携と会員詳細が利用できない旨の表示

実際の個人情報はフロントエンドへ固定値として保持せず、認証APIのレスポンスから取得する。

---

## 9. AppsとUser App起動

### 9.1 App定義

User Appは最低限次の情報を持つ。

| 項目 | 用途 |
| --- | --- |
| `appId` | Appを識別する変更しないID |
| `name` | 表示名 |
| `description` | Home・Store用の短い説明 |
| `icon` | Appアイコン |
| `route` | 起動先 |
| `version` | 表示・更新判定 |
| `notificationSupported` | App別通知設定の可否 |

### 9.2 インストール状態

- 未インストール
- インストール中
- インストール済み
- 更新可能
- アンインストール済み（データ保持）

### 9.3 起動

```text
Hundred Home / Apps
 ↓ Appを決定
App IDとインストール状態を確認
 ├─ 起動可能 → User Appルートへ遷移
 └─ 起動不可 → Home内で理由を表示
```

初期段階では同一Reactアプリ内のルートとしてUser Appを起動する。

---

## 10. Hundred共通設定

### 10.1 設定一覧

| 設定 | 現在の保存先 | 将来方針 |
| --- | --- | --- |
| 壁紙 | LocalStorage | 端末設定として維持可能 |
| カーソル音 | LocalStorage | 端末設定として維持可能 |
| 効果音音量 | LocalStorage | 端末設定として維持可能 |
| 通知全体 | LocalStorage | 会員設定として同期を検討 |
| App別通知 | LocalStorage | 会員設定として同期を検討 |

壁紙や音量は端末ごとの差が自然なため、会員データへ保存する場合でも端末設定を優先できる構造を検討する。

### 10.2 テーマ

- Hundred本体は壁紙の`light` / `dark`タイプから配色を決定する。
- OSの`prefers-color-scheme`をHundred本体のテーマ決定には使用しない。
- Record Hubなど各User Appは、各Appのテーマ方針を個別に持つ。

---

## 11. フロントエンドの状態区分

状態は用途に応じて次の3種類へ分ける。

### 11.1 画面内状態

- 選択中カテゴリ
- 選択中App
- ダイアログの開閉
- スワイプ開始位置

Reactのコンポーネント状態または専用Hookで管理する。

### 11.2 端末設定

- 壁紙
- カーソル音
- 効果音音量
- ゲスト用設定

LocalStorageを利用する。保存値は読み込み時に必ず検証する。

### 11.3 サーバー状態

- 会員情報
- 認証セッション
- インストール済みApp
- Mail
- 会員に同期する通知設定

バックエンドAPI経由で取得し、フロントエンドからDBへ直接接続しない。

---

## 12. バックエンド・DB境界

### 12.1 接続原則

```text
React
 ↓ HTTPS / JSON
Spring Boot API
 ↓ Spring JDBC
PostgreSQL
```

- ReactからPostgreSQLへ直接接続しない。
- DB認証情報をフロントエンドへ渡さない。
- 認証・認可はSpring Boot API側でも必ず確認する。
- User Appは、他Appのテーブルを直接更新しない。

### 12.2 データ所有の方針

初期段階では1つのPostgreSQLを利用してもよいが、責務は論理的に分離する。

```text
Hundred領域
├─ users
├─ linked_accounts
├─ user_apps
├─ user_settings
├─ notification_settings
└─ mails

Record Hub領域
├─ records
├─ collections
└─ Record Hub固有設定
```

実際にPostgreSQL Schemaを分けるか、テーブル名で分けるかはDB詳細設計時に決定する。

---

## 13. 環境別DB方針

### 13.1 現在の状態

| 環境 | DB | 用途 |
| --- | --- | --- |
| 本番 | AWS RDS PostgreSQL `recordhub` | 本番API |
| ローカル開発 | なし | 現在はDB機能を開発できない |
| 自動テスト | H2インメモリDB | Spring Contextテスト |

本番構成の詳細は次を参照する。

- `ドキュメント/レコードハブ_フェーズ/record-hub-aws-phase4.md`

### 13.2 開発時の禁止事項

- ローカル開発から本番RDSを通常の開発DBとして使用しない。
- 動作確認用データを本番RDSへ投入しない。
- 本番のマスターユーザーをアプリケーションの通常接続へ使い続けない。
- DBパスワードをGit、Markdown、フロントエンドへ保存しない。

### 13.3 推奨する開発DB

バックエンドのDB機能へ着手する前に、ローカルPostgreSQLを用意する。

推奨構成:

```text
ローカルReact
 ↓
ローカルSpring Boot
 ↓
ローカルPostgreSQL
```

候補はDocker ComposeによるPostgreSQLとする。理由は次のとおり。

- 本番と同じPostgreSQLのSQL・型・制約を確認できる
- 開発データを安全に破棄・再作成できる
- 本番RDSへ接続せずに開発できる
- 将来、他の開発端末でも環境を再現しやすい

Dockerを利用しない場合は、MacへPostgreSQLを直接導入する方法を代替案とする。

### 13.4 H2の扱い

H2は高速な自動テスト用として維持するが、PostgreSQL固有の挙動確認には使用しない。

SQL、制約、マイグレーションの結合確認にはローカルPostgreSQLを使用する。

### 13.5 今後必要になる環境

| Spring Profile | 接続先 | 用途 |
| --- | --- | --- |
| `local` | ローカルPostgreSQL | 日常開発 |
| `test` | H2または将来のTestcontainers | 自動テスト |
| `prod` | AWS RDS PostgreSQL | 本番 |

`local`プロファイル、Docker Compose、DBマイグレーションツールは、HundredのDBテーブル実装前に別タスクとして追加する。

---

## 14. エラー・ローディング

最低限、次の状態を画面ごとに考慮する。

- セッション確認中
- 認証失敗
- ネットワーク切断
- APIタイムアウト
- Store一覧取得失敗
- App起動失敗
- 設定保存失敗
- セッション期限切れ

セッション期限切れの場合は入力中データの有無を確認し、安全にSign in画面へ戻す。

---

## 15. セキュリティ方針

- 認証トークンをソースコードへ保存しない。
- 長期間有効な秘密情報をLocalStorageへ保存しない。
- 認証方式決定時はHttpOnly、Secure、SameSite属性を持つCookieを第一候補とする。
- 画面の表示制御だけを認可として扱わない。
- API側でユーザーIDとデータ所有者を照合する。
- 本番RDSはEC2など許可した接続元からのみ接続する。
- ログへパスワード、トークン、個人情報を出力しない。

---

## 16. 実装順序

1. Hundred詳細設計の確定
2. 認証詳細設計
3. ローカル開発DBの構築
4. 認証APIとセッション管理
5. ルーティング・ルートガード
6. Record Hubの画面とデータ設計
7. Record Hub起動
8. Store設計・実装
9. Mail設計・実装

DBを必要としないUIモックは、ローカル開発DBの構築前でも進めてよい。

---

## 17. 詳細設計で残っている判断事項

- 実認証をGoogleのみとするか、メール認証も用意するか
- ゲストデータを会員登録時に引き継ぐか
- 認証セッションをCookie方式にするか
- HundredとRecord HubでPostgreSQL Schemaを分けるか
- 壁紙・音量を端末設定のままにするか、会員設定として同期するか
- Appインストール状態をゲスト時にどこへ保存するか
- User AppからHundred Homeへ戻る共通UIをどこへ置くか
- 本番DB名、Javaパッケージ名、EC2配置名に残る`recordhub`をHundredへ移行する時期

これらは関連機能の実装前に決定し、本書へ反映する。
