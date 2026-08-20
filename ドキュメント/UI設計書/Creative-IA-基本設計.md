# Creative IA 基本設計

## 1. 目的

本書は、Hundred上で動作するUser App「Creative IA」の基本方針、主要機能、責務、システム構成、および段階的な開発範囲を定義する。

Creative IAは、AIを活用してコンテンツの企画・制作・最適化・投稿を効率化する。初期利用者として美容師を想定し、ブログ記事の作成からWordPressへの下書き保存までを簡単にすることを最初の目的とする。

将来的には、SEO支援、Instagram等へのコンテンツ展開、効果分析、次回コンテンツの提案へ拡張できる構造とする。ただし、すべてを初期版へ実装せず、実際の作業フローを確認しながら段階的に追加する。

細かな画面仕様、入力項目、API仕様は、実装と詳細設計を進めながら決定する。

---

## 2. App名称

- App名: `Creative IA`
- IA: `Intelligent Automation`

単純な定型処理だけでなく、AIによる文章生成、提案、判断支援を組み合わせ、コンテンツ制作業務全体を効率化する。

---

## 3. 基本コンセプト

```text
Create   = コンテンツを作成・編集する
Content  = 作成済みコンテンツを確認する
Data     = AIが参照する知識を管理する
Media    = コンテンツ制作に使用する素材を管理する
Settings = WordPressなど外部サービスとの連携を管理する
```

将来的にはAI ChatをCreative IA全体の操作・相談の入口とする。ただし、Phase 1ではブログ作成フローを確実に完成させることを優先し、自由会話型のAIエージェントを必須としない。

利用者が複雑なプロンプトやWordPress APIの操作方法を覚えなくても、テーマ入力、AI生成、編集、確認、下書き保存の順に作業を完了できることを重視する。

---

## 4. 設計原則

### 4.1 サーバーレスを基本とする

Creative IAは、EC2・RDSを必須としない。

- フロントエンドはHundredと同じCloudflare Pagesで配信する
- API処理はCloudflare Workersで実行する
- 構造化データが必要になった場合はCloudflare D1を使用する
- 画像保存が必要になった場合はCloudflare R2を使用する
- WordPress記事はWordPressを正本とする

### 4.2 Hundredの認証を共通利用する

Creative IA専用のログイン画面は作成しない。Hundredで利用しているAmazon Cognitoの認証セッションを使用する。

```text
利用者
  ↓ Googleサインイン
Hundred / Amazon Cognito
  ↓ Access Token
Creative IA Worker
  ↓ JWT検証
認証済み処理のみ実行
```

Cloudflare WorkerはCognito Access Tokenの署名、発行者、対象クライアント、有効期限を検証する。

### 4.3 AI生成結果を自動公開しない

AIが生成した内容は必ず利用者が確認・修正する。Phase 1ではWordPressへ`draft`として保存し、AIやCreative IAから直接`publish`しない。

```text
AI生成
  ↓
利用者が確認・修正
  ↓
WordPressへ下書き保存
  ↓
WordPress側で最終確認・公開
```

### 4.4 外部サービスの秘密情報をフロントエンドへ渡さない

Gemini APIキー、WordPress認証情報、暗号化キー等はブラウザへ配布しない。Cloudflare Workerだけが外部APIを呼び出す。

---

## 5. Phase 1の完成目標

Phase 1では、WordPress.com OAuthによる利用者ごとの接続を実装する。開発時は1人のテスト利用者・1つの投稿先サイトで、次のフローを最後まで動かす。製品上は、各Hundred利用者が自分のWordPress.comアカウントを認可し、投稿先を1サイト選択できる構造とする。

```text
Hundredへサインイン
  ↓
Creative IAを開く
  ↓
WordPress.comと接続し、投稿先サイトを選択
  ↓
記事のテーマ・要点を入力
  ↓
Geminiでタイトル・本文を生成
  ↓
利用者が編集・プレビュー
  ↓
WordPressへ下書き保存
  ↓
保存結果とWordPress記事URLを確認
```

Phase 1の対象機能:

- Hundred認証の確認
- WordPress.com OAuth接続
- WordPress.comサイト一覧の取得
- 投稿先サイトの選択と接続状態の確認
- 記事テーマと要点の入力
- Geminiによるタイトルと本文の生成
- 生成結果の編集
- 記事プレビュー
- WordPressへの下書き保存
- 保存成功・失敗の表示

Phase 1で対象外とする機能:

- WordPressへの自動公開
- 複数WordPressサイトの接続
- 利用者ごとのGeminiログイン
- 利用者ごとのGemini APIキー
- Instagram APIによる自動投稿
- R2による画像管理
- AI画像生成
- 高度なSEO分析
- アクセス解析
- 自律的なAIエージェント実行

---

## 6. 初期対象媒体

### 6.1 WordPress.com

Phase 1の対象媒体とする。

- OAuthによる利用者ごとのアカウント接続
- 利用可能なサイト一覧の取得
- 投稿先サイトの選択
- ブログ記事の作成
- AIによるタイトルと本文の生成
- 利用者による編集とプレビュー
- WordPressへの下書き保存
- 投稿結果の確認

将来的な候補:

- カテゴリー・タグ設定
- アイキャッチ画像
- 承認待ち
- 予約投稿
- 公開済み記事の更新
- SEOプラグインとの連携

### 6.2 Instagram

Phase 1では対象外とする。WordPress記事と同じテーマから、Instagram向け文章を生成する機能を将来追加する。

将来的な候補:

- 投稿文生成
- ハッシュタグ候補
- CTA候補
- 画像案
- Instagram APIによる投稿連携

Instagramへの自動投稿は、Meta側の権限、審査、アカウント種別を確認してから設計する。

---

## 7. AI連携方針

### 7.1 Phase 1の認証方式

Phase 1では、Creative IA共通のGemini APIキーをCloudflare Workers Secretsへ保存する。

```text
利用者
  ↓ Hundred認証
Creative IA Worker
  ↓ 共通APIキー
Gemini Developer API
```

利用者はHundredにだけサインインし、Geminiへ個別ログインしない。

GoogleアカウントによるHundredへのサインインと、Gemini APIの利用権・料金は別に扱う。個人向けGeminiプランの契約をCreative IAのAPI利用へ自動適用できることを前提としない。

Phase 1の初期モデルは、安定版かつ低コストの`gemini-3.5-flash-lite`とする。モデル名はWorkerの環境変数`GEMINI_MODEL`で切り替え可能にし、UIと記事保存処理を特定モデルへ依存させない。新規Google Cloudプロジェクトでは旧2.5系モデルが404になる場合があるため、現行のFlash-Liteを使用する。

### 7.2 共通APIキーを採用する理由

- 初期利用者の設定負担が少ない
- APIキーをブラウザへ公開せずに済む
- Workerで利用回数と入力サイズを制限できる
- 失敗時の監視とモデル変更を一元管理できる
- 単一利用者の検証を低コストで開始できる

### 7.3 将来の選択肢

必要性が明確になった場合に限り、次を検討する。

1. プランごとの利用上限
2. BYOK（利用者自身のAPIキーを登録）
3. Google OAuthによるGemini API認可
4. Gemini以外のAIプロバイダー

利用者ごとのOAuthは、同意画面、Access Token、Refresh Token、失効、再認証、暗号化保存が必要になるため、Phase 1では採用しない。

### 7.4 AIプロバイダーの抽象化

UIやWordPress連携がGemini固有のレスポンス形式へ直接依存しないよう、Worker内にAIプロバイダー境界を設ける。

```text
Creative IA
  ↓ 共通の生成要求
AI Provider Interface
  ├─ Gemini
  └─ 将来: その他のAI
```

Phase 1の生成結果:

- title
- content
- excerpt
- warnings

`suggestedSlug`、カテゴリ、タグはWordPress側の運用を確認してから追加する。

---

## 8. Content

AIと利用者が作成したコンテンツを扱う。

### 8.1 WordPress記事

- 新規作成
- AI生成
- 編集
- プレビュー
- WordPressへの下書き保存
- 保存結果の確認

### 8.2 記事の正本

Phase 1では、WordPressへ保存した記事の正本はWordPressとする。

- Creative IAの編集内容はWordPressへ送信するまで一時状態として扱う
- WordPressへ保存後はWordPressのPost IDを結果として保持する
- Creative IAとWordPressの両方で同じ記事を永続管理しない
- 自動保存やCreative IA独自の下書き管理は、必要性が明確になってから追加する

### 8.3 投稿状態

Phase 1でCreative IAが作成できる状態は`draft`だけとする。

将来の候補:

- draft: 下書き
- pending: 承認待ち
- future: 予約投稿
- publish: 公開済み

`publish`をCreative IAから実行可能にする場合は、送信直前に利用者の明示的な確認を必須とする。

### 8.4 SEO候補

Phase 1では、タイトルと基本的な見出し構成を対象にする。

将来的な生成・管理候補:

- SEOキーワード候補
- メタディスクリプション
- スラッグ候補
- 内部リンク候補
- 構造化データ候補

実際のWordPress環境とSEOプラグインを確認してから詳細を決定する。

---

## 9. Data

AIがコンテンツ生成時に参照する知識を管理する。

将来的な候補:

- 商品
- ブランド
- 会社情報
- 店舗情報
- スタッフ情報
- 施術・サービス
- 投稿テンプレート
- ターゲット情報

美容師が毎回商品情報や店舗情報を説明しなくても、登録済みデータを生成へ利用できることを目指す。

Phase 1では、D1による本格的なマスタ管理を必須としない。最初の記事生成に必要な情報は入力画面または固定設定で受け取り、必要性が確認できたデータからD1へ移行する。

---

## 10. Media

コンテンツ制作に使用する画像等の素材を管理する。

将来的な候補:

- 写真一覧
- 写真アップロード
- 施術写真
- 商品と写真の関連付け
- アイキャッチ画像
- Instagram投稿用画像
- AI画像生成・編集

画像本体をD1へ保存しない。画像管理が必要になった場合はCloudflare R2等のオブジェクトストレージを使用し、D1には所有者ID、保存先キー、メタデータだけを保存する。

人物が写る施術写真を扱う場合は、本人同意、公開範囲、削除、保持期間を別途定義する。

---

## 11. Settings

### 11.1 WordPress設定

- WordPress.com接続・再接続
- 接続状態
- WordPress.comユーザー
- 利用可能なサイト一覧
- 投稿先サイトの選択
- 接続解除
- カテゴリー・タグ取得

WordPress.comとの連携にはOAuth 2.0を使用する。通常のWordPress.comログインパスワードやApplication PasswordをCreative IAへ入力させない。

OAuth認可後に取得したAccess Tokenは利用者ごとに暗号化してD1へ保存し、Cognito `sub`と関連付ける。WordPress.comのClient IDとClient Secret、およびトークン暗号化用マスターキーはWorkers Secretsへ保存する。

Phase 1では、1人の利用者につき投稿先1サイトを選択する。複数サイトの切り替えは将来対応とする。

### 11.2 AI設定

- 使用モデル
- 文体
- 記事の長さ
- 対象読者
- 基本プロンプトバージョン

Gemini APIキーそのものをCreative IAのUIへ表示しない。

### 11.3 秘密情報の保存区分

| 情報 | 保存先 | 補足 |
|---|---|---|
| 共通Gemini APIキー | Workers Secrets | ブラウザへ配布しない |
| WordPress.com Client ID | Worker環境変数またはWorkers Secrets | 公開範囲は実装時に確認する |
| WordPress.com Client Secret | Workers Secrets | ブラウザとD1へ保存しない |
| トークン暗号化用マスターキー | Workers Secrets | 定期的なローテーションを考慮する |
| 利用者ごとのWordPress.com Access Token | D1へ暗号化して保存 | Cognito `sub`と関連付ける |
| WordPress.com Site ID・URL・サイト名 | D1 | 投稿先として選択した1サイトを保持する |
| OAuth state・一時情報 | 短期間のサーバー側ストレージ | 1回使用後または期限切れで削除する |
| 商品・店舗データ | 必要になるまで保留 | 将来D1へ保存する |

Workers Secretsはデプロイ単位の共通秘密情報であり、利用者が自由に追加・変更する個別認証情報の保存先として使用しない。

---

## 12. AIエージェント方針

将来、AI ChatをCreative IA全体の入口として追加する。

```text
利用者の依頼
      ↓
Creative IA Agent
      ↓
├─ 実行可能
│    └─ 必要な機能・操作へ誘導する
├─ 確認後に実行可能
│    └─ 内容を提示し、利用者の承認後に実行する
├─ 一部実行可能
│    └─ 可能な範囲と制限を説明する
└─ 実行不可
     └─ 未対応であることと代替案を説明する
```

原則:

- AIが未実装機能を実行できると案内しない
- AIの文章を利用者の確認なしに外部公開しない
- 外部サービスへの書き込み前に対象と内容を提示する
- 利用可能な機能と引数を構造化して管理する
- AIの出力を信頼せず、Worker側で入力値と権限を再検証する

---

## 13. 想定システム構成

### 13.1 Phase 1

```text
Hundred / Cloudflare Pages
  ↓ Cognito Access Token
Creative IA Frontend
  ↓ HTTPS
Cloudflare Worker
  ├─ Cognito JWT検証
  ├─ WordPress.com OAuth開始・コールバック
  ├─ 入力検証
  ├─ レート制限
  ├─ Gemini Developer API
  ├─ WordPress.com REST API
  └─ D1

Cloudflare Workers Secrets
  ├─ Gemini APIキー
  ├─ WordPress.com Client Secret
  └─ トークン暗号化用マスターキー

Cloudflare D1
  ├─ Cognito sub
  ├─ 暗号化済みWordPress.com Access Token
  └─ 選択済みWordPress.com Site ID
```

Phase 1からD1を使用する。D1はWordPress.com接続情報を利用者ごとに保持するために使用し、記事本文の正本にはしない。記事データの保存先はWordPress.comとする。R2はPhase 1では使用しない。

### 13.2 将来の機能拡張

```text
Hundred / Amazon Cognito
  ↓ Cognito sub
Cloudflare Worker
  ├─ Gemini API
  ├─ WordPress API
  ├─ D1
  └─ R2

D1
  ├─ 利用者設定
  ├─ 暗号化済みWordPress接続情報
  ├─ 商品・店舗・スタッフ
  ├─ テンプレート
  └─ 利用量・監査情報

R2
  └─ 利用者ごとの画像・メディア
```

---

## 14. 利用者とデータ分離

Phase 1から、Amazon Cognitoが発行する`sub`をCreative IAの所有者IDとして使用する。

```text
owner_user_id = Cognito sub
```

メールアドレス、表示名、Cognito内部ユーザー名`google_...`を主キーとして使用しない。

D1へ保存する利用者所有データには、原則として`owner_user_id`を持たせる。

Phase 1の必須テーブル:

- users
- wordpress_connections

将来の候補テーブル:

- products
- stores
- staff
- services
- templates
- generation_usage
- audit_logs

Workerはリクエスト本文の所有者IDを信用せず、検証済みAccess Tokenの`sub`から所有者を決定する。

---

## 15. コンテンツ生成の基本フロー

```text
利用者
「今日のカラーについて記事を作りたい」
       ↓
テーマ・要点・対象読者を入力
       ↓
Creative IA Worker
       ├─ Cognito JWT検証
       ├─ 入力検証
       └─ 利用上限確認
       ↓
Geminiによる記事生成
       ↓
タイトル・本文をCreative IAへ返す
       ↓
利用者が確認・修正
       ↓
WordPressへdraftとして保存
       ↓
Post ID・編集URL・公開URL候補を表示
```

AIが生成したHTMLは、許可する要素と属性を制限してからWordPressへ送信する。プロンプト内の指示やAI出力だけを根拠に、外部APIの操作権限を決定しない。

---

## 16. Phase 1の主要画面

```text
Creative IA
├─ 作成
│   ├─ テーマ・要点入力
│   ├─ AI生成
│   ├─ 編集
│   └─ プレビュー
├─ 記事
│   └─ WordPress下書き確認
└─ 設定
    ├─ WordPress接続状態
    └─ AI生成設定
```

Chat、Data、Media、Instagramは将来構造として保持し、Phase 1のナビゲーションには必要に応じて「準備中」として表示するか、非表示にする。

---

## 17. Worker APIの初期候補

```text
GET  /api/creative-ia/health
GET  /api/creative-ia/wordpress/oauth/start
GET  /api/creative-ia/wordpress/oauth/callback
GET  /api/creative-ia/wordpress/status
GET  /api/creative-ia/wordpress/sites
PUT  /api/creative-ia/wordpress/site
DELETE /api/creative-ia/wordpress/connection
GET  /api/creative-ia/wordpress/categories
POST /api/creative-ia/generate
POST /api/creative-ia/wordpress/posts
```

`POST /api/creative-ia/wordpress/posts`は、Phase 1ではWordPressの`draft`だけを受け付ける。

OAuthコールバック以外の共通要件:

- Cognito Access Tokenを必須とする
- JSONの形式と文字数を検証する
- Gemini生成回数を制限する
- タイムアウトを設定する
- 外部APIの生エラーや秘密情報をフロントエンドへ返さない
- 同一操作の連打による重複投稿を防止する
- ログへ本文、APIキー、WordPress認証情報を記録しない

OAuth要件:

- OAuth開始時に推測困難な`state`を発行する
- `state`をCognito `sub`と関連付け、短い有効期限を設定する
- コールバックで`state`を検証し、1回使用したら無効化する
- 認可コードとClient Secretの交換はWorker内だけで行う
- Access Tokenを暗号化してからD1へ保存する
- 接続解除時は保存済みトークンとサイト情報を削除する

---

## 18. 非機能要件

### 18.1 セキュリティ

- Cognito JWTをWorkerで検証する
- APIキーと認証情報をフロントエンドへ送らない
- CORSはHundredの本番ドメインとローカル開発環境に限定する
- WordPress APIはHTTPS接続だけを許可する
- WordPress.com OAuthの`state`を検証してCSRFを防止する
- WordPress.com Access Tokenを暗号化してD1へ保存する
- Access Tokenをログ、URL、フロントエンドへ出力しない
- 入力文字数と生成トークン数に上限を設ける
- AI出力をサニタイズする
- WordPressへの下書き保存は利用者の明示操作で実行する

### 18.2 コスト管理

- Gemini APIの呼び出し回数を利用者単位で制限できる構造にする
- Phase 1は利用者ごとに1分3回、UTC日次20回までに制限する
- D1には生成日時、モデル、成否だけを記録し、入力文と生成本文は保存しない
- 長すぎる会話履歴を毎回AIへ送らない
- Phase 1では無料枠内で検証し、利用量を確認してから課金を有効にする
- 課金を有効にする場合は予算通知と利用上限を設定する

### 18.3 可用性とエラー表示

- Gemini停止時も入力内容を失わない
- WordPress送信失敗時も生成内容を画面へ残す
- 外部サービスごとに日本語で状態を案内する
- 再試行可能なエラーと設定変更が必要なエラーを区別する
- WordPressへの重複投稿を防止する

### 18.4 監査

将来、外部書き込みを追跡するため、次の情報を保存できる構造を検討する。

- Cognito `sub`
- 実行日時
- 操作種別
- 対象WordPressサイト
- WordPress Post ID
- 結果
- エラー分類

記事本文、Gemini APIキー、WordPress認証情報は監査ログへ保存しない。

---

## 19. 開発フェーズ

```text
Phase 1: WordPress.com OAuth接続と記事生成から下書き保存まで
Phase 2: 商品・店舗・テンプレート等のData管理
Phase 3: SEO支援とWordPress連携拡張
Phase 4: 複数WordPressサイトの切り替え対応
Phase 5: Instagram等SNS向けコンテンツ展開
Phase 6: アクセス・流入・反応の分析
Phase 7: 分析結果を利用した提案・エージェント支援
```

各Phaseは、前段階の利用結果と要望を確認してから詳細化する。

---

## 20. Phase 1の実装順序

1. WordPress.com開発者アプリを登録する
2. OAuthコールバックURLを決定・登録する
3. Cloudflare WorkerとD1の最小構成を作成する
4. WorkerでCognito Access Tokenを検証する
5. `users`と`wordpress_connections`テーブルを作成する
6. WordPress.com OAuth開始・コールバックを実装する
7. Access Tokenの暗号化保存と接続解除を実装する
8. サイト一覧取得と投稿先1サイトの選択を実装する
9. WordPress.comへテスト記事を`draft`で保存する
10. Gemini APIと記事生成APIを実装する（実装済み・本番設定待ち）
11. Creative IAの入力・編集・プレビュー画面を作成する（実装済み）
12. 生成からWordPress下書き保存までを結合する（実装済み）
13. エラー、レート制限、OAuth state、重複投稿防止を確認する

AIや画面を先に完成させず、最初にWordPressへ安全に下書きを保存できることを確認する。

---

## 21. 今後確認する事項

### Phase 1開始前に確認する事項

- WordPress.com開発者アプリの登録方法
- OAuthコールバックURL
- WordPress.com OAuthで要求する権限
- OAuth後のサイト一覧取得API
- WordPress.comユーザーが複数サイトを持つ場合の選択方法
- WordPress.com REST APIの投稿先URLとSite IDの扱い
- WordPress側の下書き・承認フロー
- 利用しているSEOプラグイン
- Gemini APIキーの本番Secret登録
- Gemini無料枠のデータ利用条件を踏まえ、実データを送信する範囲

### 将来確認する事項

- 商品マスタの具体的な項目
- 店舗・スタッフ情報の管理範囲
- 画像保存方式と保持期間
- 人物写真の同意と削除方法
- AI画像生成の利用範囲
- 生成履歴の保存期間
- 複数利用者の料金・利用制限
- BYOKまたは利用者ごとのAI OAuthの必要性
- Instagram連携範囲
- 投稿結果・アクセス・SNS反応の分析方法
- AIエージェントが直接実行できる操作範囲
- 利用者の実際のブログ・Instagram投稿作業フロー
