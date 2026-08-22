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
Create     = AIとの会話を通じてコンテンツを作成・編集する
Content    = 作成中・保存済み・将来の公開済みコンテンツを管理する
References = AIが参照するコンテンツ素材とAIルールを管理する
Settings   = 外部サービス、AI、表示方法を管理する
```

Creative IAの中心思想は、次のとおりとする。

> 操作方法を覚えるのではなく、AIに話すことで仕事が進む。

作成画面は「記事作成フォームにAI補助を付けた画面」にしない。Chatを操作の本体とし、利用者の発言に応じて、商品候補、サービス候補、確認項目、保存先などの必要なUIを会話内へ段階的に表示する。

利用者が複雑なプロンプトやWordPress APIの操作方法を覚えなくても、AIとの会話、候補の選択、成果物の確認、下書き保存の順に作業を完了できることを重視する。

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
  ↓ Googleまたはメールアドレスでサインイン
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

### 4.5 会話主導のUIとする

Chatは補助機能ではなく、Creative IAの主要な操作面とする。

- 利用者は自然文で目的を伝える
- AIは不足情報を一度に要求せず、必要な順に確認する
- 選択に適した情報は、会話内へボタン、候補カード、一覧として表示する
- 会話によって作成中の成果物を更新する
- 外部サービスへ書き込む前に、対象と内容を明示して確認する
- AIが未実装の操作を実行できるように案内しない

会話ログと記事本文を同一のデータとして扱わない。Chatは指示と判断の履歴、Contentは現在の成果物として分離する。

### 4.6 Creative IA独自の表示設計を使用する

Creative IAはHundred HomeのXMB型レイアウトを継承せず、コンテンツ制作に適した独自レイアウトを使用する。ただし、色、余白、フォーカス表示、日本語表記等の共通UI原則はHundredに合わせる。

表示テーマは次の3種類とする。

- 自動
- ライト
- ダーク

初期値は`自動`とし、利用者が選択した場合はCreative IA専用設定として保存する。Hundred Homeの壁紙設定とは分離する。

---

## 5. Phase 1の完成目標

Phase 1では、WordPress.com OAuthと、独自ドメインWordPressのApplication Passwordによる利用者ごとの接続を実装する。開発時は1人のテスト利用者・1つの投稿先サイトで、次のフローを最後まで動かす。製品上は、各Hundred利用者が接続方式を選び、投稿先を1サイト登録できる構造とする。

```text
Hundredへサインイン
  ↓
Creative IAを開く
  ↓
WordPress.comまたは独自ドメインWordPressと接続
  ↓
AIへ作成したい内容を話す
  ↓
AIが不足情報と参照データを確認
  ↓
Geminiでタイトル・本文を生成し、成果物へ反映
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
- 独自ドメインWordPressのApplication Password接続
- WordPress.comサイト一覧の取得
- 投稿先サイトの選択と接続状態の確認
- AIへ作成目的を伝える会話UI
- 会話内の選択肢・候補カード
- AIが参照する商品・サービス等の選択
- Geminiによるタイトルと本文の生成
- Chatと成果物の分離表示
- 生成結果の編集
- 記事プレビュー
- 接続済みWordPressの下書き一覧と再編集
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
- 利用者の確認なしに進行する自律的なAIエージェント実行

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

### 6.2 独自ドメインWordPress

WordPress 5.6以降のApplication PasswordとREST APIを使用する。

- HTTPSのサイトURLだけを許可する
- WordPressユーザー名とApplication Passwordで接続確認する
- 通常のWordPressログインパスワードは受け付けない
- Application PasswordはWorker内で暗号化し、D1へ保存する
- 認証情報をブラウザへ再表示せず、ログとAPIレスポンスへ出力しない
- 投稿は`POST /wp-json/wp/v2/posts`へ`status=draft`固定で送信する
- 接続解除時に暗号化済み認証情報を削除する

初期実装では1人のHundred利用者につき、WordPress.comまたは独自ドメインWordPressのどちらか1接続とする。新しい接続が成功した時点で以前の接続情報を削除する。

#### 6.2.1 Application Password方式の技術検証結果

2026年8月22日、ローカルに構築したWordPressを使用し、Application Password方式の一連の処理を検証した。

検証構成:

```text
Hundred / Creative IA
  ↓ Cognito Access Token
Cloudflare Worker
  ↓ HTTPS・Basic認証
Cloudflare Quick Tunnel
  ↓ ローカル転送
ローカルWordPress REST API
```

確認済みの項目:

- WordPressプロフィール画面で検証専用Application Passwordを発行できる
- ローカルWordPressの`/wp-json/`が正常に応答する
- Cloudflare Quick Tunnelの一時HTTPS URLを経由して、WorkerからローカルWordPressへ到達できる
- WordPressサイトURL、WordPressユーザー名、Application PasswordをCreative IAから登録できる
- Application Passwordのintrospect APIとユーザーAPIによる認証・権限確認が成功する
- Geminiで記事案を生成し、利用者が内容を確認・編集できる
- WordPress REST APIへ`status=draft`で記事を送信し、WordPress側で記事を確認できる

ローカル検証時の制約:

- `.local`ドメインとHTTP URLはCloudflare Workerから直接参照できず、入力値としても許可しない
- 検証時のみCloudflare Quick Tunnelで一時HTTPS URLを発行し、ローカルWordPressへ転送する
- Quick Tunnelは開発・検証専用とし、会社WordPressとの本番接続には使用しない
- Quick TunnelのURLは起動ごとに変わるため、再起動後はCreative IAの接続情報を登録し直す
- 検証中はローカルWordPressが一時的に外部から到達可能になるため、検証データだけを使用する
- 検証終了後はCreative IAの接続解除、Application Passwordの失効、Tunnelの停止を行う

本検証では、通常のWordPressログインパスワード、Application Passwordの値、一時Tunnel URLをドキュメント・ソースコード・テストデータへ記録しない。

### 6.3 Instagram

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

GoogleまたはメールアドレスによるHundredへのサインインと、Gemini APIの利用権・料金は別に扱う。個人向けGeminiプランの契約をCreative IAのAPI利用へ自動適用できることを前提としない。

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

画面上の名称は、WordPress下書きが中心の間は「下書き」とする。ただし、Instagram投稿案や公開済みコンテンツを将来扱えるよう、内部の機能名、データモデル、ルートは最初から`Content`とする。

推奨ルート:

```text
/creative-ia/content
/creative-ia/content/:contentId
```

### 8.1 WordPress記事

- 新規作成
- AI生成
- 編集
- プレビュー
- 接続済みWordPressの下書き一覧取得
- WordPress下書きの再編集
- WordPressへの下書き保存
- 保存結果の確認

### 8.2 記事の正本

Phase 1では、WordPressへ保存した記事の正本はWordPressとする。

- Creative IAの編集内容はWordPressへ送信するまで一時状態として扱う
- WordPressへ保存後はWordPressのPost IDを結果として保持する
- 「下書き」画面は接続済みWordPressの下書きを取得し、Creative IAの`Content`として集約表示する
- 保存済み記事を開く際は、WordPressから現在のタイトル・本文・状態を取得する
- Phase 1ではCreative IAとWordPressの両方へ同じ本文を永続保存しない
- 一覧表示に必要なPost ID、媒体、投稿先、更新日時等のメタデータは、必要に応じてD1へキャッシュできる
- Creative IA独自の自動保存、版管理、Instagram投稿案の本文保存は、保持期間と削除方法を決めてから追加する

この構成により、画面上は媒体横断の`Content`として扱いながら、WordPress記事の正本はWordPressへ一元化できる。

### 8.3 投稿状態

Phase 1でCreative IAが作成できる状態は`draft`だけとする。

将来の候補:

- draft: 下書き
- pending: 承認待ち
- future: 予約投稿
- publish: 公開済み

`publish`をCreative IAから実行可能にする場合は、送信直前に利用者の明示的な確認を必須とする。

内部状態の初期候補:

- editing: Creative IAで編集中
- ready: 外部サービスへ保存できる状態
- saved_as_draft: 外部サービスへ下書き・投稿案として保存済み
- published: 公開済み
- failed: 保存または投稿に失敗

媒体ごとに「下書き」の意味が異なるため、WordPressの`draft`等の外部状態とCreative IA内部状態を同一の値として扱わない。

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

## 9. References（参照データ）

AIがコンテンツ生成時に参照する情報を、「コンテンツ素材」と「AIルール」に分けて管理する。

```text
参照データ
├─ コンテンツ素材
│  ├─ 商品
│  ├─ サービス
│  ├─ 写真
│  └─ 会社・店舗
│
└─ AIルール
   ├─ 想定読者
   ├─ 表記ルール
   ├─ 使用可能な事実
   ├─ 禁止表現
   └─ AIへの送信ルール
```

### 9.1 コンテンツ素材

記事や投稿へ何を書くかを決める情報を管理する。

- 商品名、説明、特徴、使用方法
- 施術・サービス名、対象、流れ、注意事項
- 会社・店舗名、所在地、営業時間、連絡先
- コンテンツに利用可能な写真

美容師が毎回商品情報や店舗情報を説明しなくても、会話の中で候補を選択し、登録済みデータを生成へ利用できることを目指す。

### 9.2 AIルール

AIがどのように書くか、何を書いてよいか、何を書いてはいけないかを管理する。

- 想定読者と文体
- ブランド・サービス固有の表記ルール
- 根拠を確認済みの事実と数値
- 薬機法等を考慮した禁止表現・注意表現
- AIへ送信してよいデータの範囲

コンテンツ素材の登録とAIルールの変更は、利用者にとって異なる作業であるため、同一フォームや同一一覧へ混在させない。

AIルールは将来「設定」配下へ移動する可能性がある。初期実装から内部ルートとデータモデルを分離し、ナビゲーション変更だけで移動できる構造とする。

推奨ルート:

```text
/creative-ia/references/materials
/creative-ia/references/rules
```

Phase 1では、D1による本格的な参照データ管理を必須としない。会話で必要性を確認できたデータから段階的にD1へ移行する。

---

## 10. Media

コンテンツ制作に使用する画像等の素材を管理する。Mediaは独立した主ナビゲーションにせず、「参照データ > コンテンツ素材 > 写真」として利用者へ表示する。内部では画像本体とメタデータを適切なストレージへ分離する。

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
- 独自ドメインWordPressのサイトURL・ユーザー名・Application Password登録
- 接続方式の表示

WordPress.comとの連携にはOAuth 2.0を使用する。通常のWordPress.comログインパスワードやApplication PasswordをCreative IAへ入力させない。

独自ドメインWordPressとの連携には、WordPressが発行したApplication Passwordを使用する。通常のWordPressログインパスワードは受け付けない。接続時に`GET /wp-json/wp/v2/users/me/application-passwords/introspect`でApplication Passwordによる認証であることを確認し、続いて`GET /wp-json/wp/v2/users/me?context=edit`でユーザーを確認する。両方の成功後にApplication Passwordを暗号化して保存する。

OAuth認可後に取得したAccess Tokenは利用者ごとに暗号化してD1へ保存し、Cognito `sub`と関連付ける。WordPress.comのClient IDとClient Secret、およびトークン暗号化用マスターキーはWorkers Secretsへ保存する。

Phase 1では、1人の利用者につき投稿先1サイトを選択する。複数サイトの切り替えは将来対応とする。

### 11.2 AI設定

- 使用モデル
- 文体
- 記事の長さ
- 対象読者
- 基本プロンプトバージョン

Gemini APIキーそのものをCreative IAのUIへ表示しない。

AIルールのうち、モデルやCreative IA全体の挙動に関する項目は設定で扱う。商品・サービス固有のルールは参照データとの関係を維持する。

### 11.3 表示設定

- テーマ: 自動、ライト、ダーク
- 会話領域の文字サイズ
- 成果物パネルの初期表示
- 動きを減らす設定への対応

### 11.4 Hundredへの導線

「Hundredへ戻る」は設定画面の奥だけに置かない。

- PCでは左サイドバー下部へ常設する
- スマートフォンでは画面上部へ戻る操作を表示する
- 未保存の成果物がある場合は、移動前に確認する

### 11.5 秘密情報の保存区分

| 情報 | 保存先 | 補足 |
|---|---|---|
| 共通Gemini APIキー | Workers Secrets | ブラウザへ配布しない |
| WordPress.com Client ID | Worker環境変数またはWorkers Secrets | 公開範囲は実装時に確認する |
| WordPress.com Client Secret | Workers Secrets | ブラウザとD1へ保存しない |
| トークン暗号化用マスターキー | Workers Secrets | 定期的なローテーションを考慮する |
| 利用者ごとのWordPress.com Access Token | D1へ暗号化して保存 | Cognito `sub`と関連付ける |
| 利用者ごとのApplication Password | D1の専用テーブルへ暗号化して保存 | 通常パスワードは禁止。Cognito `sub`と関連付ける |
| WordPress.com Site ID・URL・サイト名 | D1 | 投稿先として選択した1サイトを保持する |
| OAuth state・一時情報 | 短期間のサーバー側ストレージ | 1回使用後または期限切れで削除する |
| 商品・店舗データ | 必要になるまで保留 | 将来D1へ保存する |

Workers Secretsはデプロイ単位の共通秘密情報であり、利用者が自由に追加・変更する個別認証情報の保存先として使用しない。

---

## 12. AIエージェント方針

AI ChatをCreative IAの作成操作の入口とする。Phase 1では、許可された機能と会話内UIを組み合わせる構造化された会話を対象とし、利用者の確認なしに複数処理を進める自律エージェントは対象外とする。

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
- 選択可能な候補は文章だけで列挙せず、会話内の構造化UIとして表示する
- Chatの履歴と作成中Contentのデータを分離する
- Contentを更新した操作は、取り消しまたは直前状態へ戻せる構造を検討する

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
  ├─ 独自ドメインWordPress REST API
  └─ D1

Cloudflare Workers Secrets
  ├─ Gemini APIキー
  ├─ WordPress.com Client Secret
  └─ トークン暗号化用マスターキー

Cloudflare D1
  ├─ Cognito sub
  ├─ 暗号化済みWordPress.com Access Token
  ├─ 選択済みWordPress.com Site ID
  └─ 暗号化済みApplication Password・サイトURL・WordPressユーザー名
```

Phase 1からD1を使用する。D1はWordPress接続情報を利用者ごとに保持するために使用し、記事本文の正本にはしない。記事データの保存先は接続先WordPressとする。R2はPhase 1では使用しない。

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
- wordpress_application_password_connections

将来の候補テーブル:

- contents
- content_versions
- conversations
- conversation_messages
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
「このトリートメントの記事を書きたい」
       ↓
AIが依頼の目的と不足情報を確認
       ↓
参照データから商品・サービス候補を会話内へ表示
       ↓
利用者が対象を選択
       ↓
Creative IA Worker
       ├─ Cognito JWT検証
       ├─ 入力検証
       └─ 利用上限確認
       ↓
Geminiによる記事生成
       ↓
タイトル・本文をContentへ反映
       ↓
右側の成果物パネルを更新
       ↓
利用者がChatで修正を依頼、または直接編集
       ↓
WordPressへdraftとして保存
       ↓
Post ID・編集URL・公開URL候補を表示
```

AIが生成したHTMLは、許可する要素と属性を制限してからWordPressへ送信する。プロンプト内の指示やAI出力だけを根拠に、外部APIの操作権限を決定しない。

---

## 16. 主要画面構成（段階実装）

```text
Creative IA
├─ 作成
│   ├─ AIとの会話
│   ├─ 会話内の候補カード・確認UI
│   ├─ 右側の成果物パネル
│   ├─ 編集・プレビュー
│   └─ WordPressへの下書き保存
├─ 下書き（内部名: Content）
│   ├─ WordPress下書き
│   ├─ 状態・投稿先による絞り込み
│   └─ 編集・再保存
├─ 参照データ
│   ├─ コンテンツ素材
│   │   ├─ 商品
│   │   ├─ サービス
│   │   ├─ 写真
│   │   └─ 会社・店舗
│   └─ AIルール
│       ├─ 想定読者・表記ルール
│       ├─ 使用可能な事実・禁止表現
│       └─ AIへの送信ルール
└─ 設定
    ├─ WordPress等の接続状態
    ├─ AI生成設定
    └─ 表示設定
```

### 16.1 PCレイアウト

```text
┌────────────┬──────────────────────┬──────────────────┐
│ Creative IA  │ AIとの会話             │ 現在の成果物       │
│              │                       │                  │
│ 作成          │ メッセージ             │ タイトル           │
│ 下書き        │ 候補カード             │ 本文               │
│ 参照データ    │ 確認UI                 │ 注意事項           │
│ 設定          │                       │ 保存・プレビュー    │
│              │                       │                  │
│ ← Hundred    │ 入力欄                 │                  │
└────────────┴──────────────────────┴──────────────────┘
```

- 左サイドバーを主ナビゲーションとして固定する
- 作成画面はChatを中央の主領域とする
- 右側に現在のContentを表示し、会話に応じて更新する
- 成果物パネルは閉じられるようにし、Chatだけへ集中できる状態を用意する
- 画面幅が不足する場合は、成果物をオーバーレイまたは切り替え表示にする

### 16.2 スマートフォンレイアウト

スマートフォンでは、次の下部ナビゲーションを使用する。

```text
作成 | 下書き | 参照データ | 設定
```

- PCのChatと成果物を横並びにしない
- Chatと記事案はタブ切り替えまたは「記事案を見る」による全画面表示とする
- 入力欄はソフトウェアキーボード表示時も操作できる位置へ固定する
- Hundredへ戻る操作は画面上部へ表示する
- 下部ナビゲーションは4項目を基本とし、Hundredへの導線を5項目目として追加しない

### 16.3 ナビゲーション名と内部名

| 画面表示 | 内部名 | 補足 |
|---|---|---|
| 作成 | Create | Chatが操作の本体 |
| 下書き | Content | Instagramや公開済み対応後に「コンテンツ」へ変更可能 |
| 参照データ | References | コンテンツ素材とAIルールを分離 |
| 設定 | Settings | 外部接続、AI、表示方法を管理 |

Instagramは将来構造として保持し、未実装の項目は「準備中」として常設せず、利用者が操作できる段階で表示する。

### 16.4 作成画面の初期状態

作成画面を開いた直後から入力フォームを並べず、AIからの短い問いかけと開始候補を表示する。

```text
AI
今日は何を作りますか？

[商品紹介] [施術紹介] [相談]

┌──────────────────────────┐
│ AIに相談する...           │
└──────────────────────────┘
```

- 開始候補は会話を始めるためのショートカットであり、作成内容を固定しない
- 利用者は候補を選ばず、自然文だけでも開始できる
- 参照データに該当候補がある場合は、AIが会話内へ選択カードを表示する
- 成果物が生成されるまでは右パネルへ空のフォームを表示せず、会話へ集中できる状態にする
- 成果物が生まれた時点で右パネルを表示し、会話に応じて内容を育てる

---

## 17. Worker APIの初期候補

```text
GET  /api/creative-ia/health
GET  /api/creative-ia/wordpress/oauth/start
GET  /api/creative-ia/wordpress/oauth/callback
GET  /api/creative-ia/wordpress/status
POST /api/creative-ia/wordpress/application-password
DELETE /api/creative-ia/wordpress/connection
GET  /api/creative-ia/wordpress/sites
PUT  /api/creative-ia/wordpress/site
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

Application Password要件:

- HTTPSのサイトURLだけを許可する
- IPアドレス、localhost、内部向けホスト名を拒否し、SSRFを防止する
- 接続確認と投稿では外部リダイレクトを追跡しない
- Basic認証ヘッダーはWorker内だけで生成する
- introspect APIで通常のログインパスワードを拒否する
- Application PasswordをAES-256-GCMで暗号化してD1へ保存する
- 通常のWordPressログインパスワードを保存しない
- Application Password、Authorizationヘッダー、外部レスポンス本文をログへ出力しない
- APIレスポンスへApplication Passwordを含めない
- 接続解除時に暗号化済みApplication Passwordを削除する

会話主導UIとContent管理の段階追加候補:

```text
POST /api/creative-ia/conversations
POST /api/creative-ia/conversations/:conversationId/messages
GET  /api/creative-ia/contents
GET  /api/creative-ia/contents/:contentId
PUT  /api/creative-ia/contents/:contentId
GET  /api/creative-ia/references/materials
GET  /api/creative-ia/references/rules
```

会話APIは文章だけでなく、候補カード、確認操作、Content更新等の構造化された応答を返せる形式とする。外部サービスへの保存は会話APIから暗黙に実行せず、専用APIと利用者の明示操作を経由する。

---

## 18. 非機能要件

### 18.1 セキュリティ

- Cognito JWTをWorkerで検証する
- APIキーと認証情報をフロントエンドへ送らない
- CORSはHundredの本番ドメインとローカル開発環境に限定する
- WordPress APIはHTTPS接続だけを許可する
- WordPress.com OAuthの`state`を検証してCSRFを防止する
- WordPress.com Access Tokenを暗号化してD1へ保存する
- Application Passwordを専用テーブルへ暗号化して保存する
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
Phase 1: WordPress接続、記事生成、下書き保存、下書き一覧まで
Phase 2: 商品・サービス・会社情報・AIルール等の参照データ管理
Phase 3: SEO支援とWordPress連携拡張
Phase 4: 複数WordPressサイトの切り替え対応
Phase 5: Instagram等SNS向けコンテンツ展開
Phase 6: アクセス・流入・反応の分析
Phase 7: 分析結果を利用した提案・エージェント支援
```

各Phaseは、前段階の利用結果と要望を確認してから詳細化する。

---

## 20. Phase 1の実装順序

1. WordPress.com開発者アプリを登録する（完了）
2. OAuthコールバックURLを決定・登録する（完了）
3. Cloudflare WorkerとD1の最小構成を作成する（完了）
4. WorkerでCognito Access Tokenを検証する（完了）
5. `users`とWordPress接続用テーブルを作成する（完了）
6. WordPress.com OAuth開始・コールバックを実装する（完了）
7. Access Tokenの暗号化保存と接続解除を実装する（完了）
8. サイト一覧取得と投稿先1サイトの選択を実装する（完了）
9. WordPress.comへテスト記事を`draft`で保存する（検証済み）
10. 独自ドメインWordPressのApplication Password接続、暗号化保存、接続解除を実装する（完了）
11. ローカルWordPressを使用してApplication Password接続から`draft`保存までを検証する（検証済み）
12. Gemini APIと記事生成APIを実装する（実装・検証済み）
13. Creative IAの入力・編集・プレビュー画面を作成する（実装済み）
14. 生成から各方式のWordPress下書き保存までを結合する（検証済み）
15. エラー、レート制限、OAuth state、重複投稿防止を継続確認する

AIや画面を先に完成させず、最初にWordPressへ安全に下書きを保存できることを確認する。

---

## 21. 今後確認する事項

### Phase 1で継続確認する事項

- 実際に利用予定の会社WordPressが外部からHTTPSで到達可能であること
- 会社WordPressのバージョンとREST APIの利用可否
- 利用者のWordPressユーザーに記事を作成・編集する権限があること
- 会社WordPressでApplication Passwordを発行・失効できること
- セキュリティプラグイン、WAF、サーバー設定がREST APIのBasic認証を遮断しないこと
- WordPress側の下書き・承認フロー
- 利用しているSEOプラグイン
- 実環境テストでも公開せず、`draft`として保存されること
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
