# Hundred Amazon Cognito・Google／メール認証構築手順

## 1. 目的

Hundredの静的フロントエンドへAmazon Cognitoによる認証を追加し、Googleアカウントまたはメールアドレスで安全にサインインできるようにする。

- HundredはCloudflare Pagesで常時配信する
- 認証基盤にはAmazon Cognito User Poolsを使用する
- Google認証はGoogle Auth PlatformとCognitoを連携して提供する
- メール認証はCognito User Pool Directoryのマネージドログインで提供する
- HundredのフロントエンドはOAuth 2.0 Authorization Code Flow with PKCEを使用する
- AWS上のRecord Hubが停止していても、Hundredへのサインインは利用できる構成にする
- HundredはGoogleパスワード、Cognitoユーザーのパスワードを保存しない

この文書は、2026年8月に実施したGoogle認証とメール認証の構築内容を記録したものである。

---

## 2. 完成後の構成

```text
利用者
  ↓ HTTPS
yamahit.com
  ↓
Cloudflare Pages / Hundred
  ↓ Authorization Code + PKCE
Amazon Cognito User Pool
  ├─ Google OAuth 2.0
  └─ Cognito User Pool Directory
       ├─ メールアドレス・パスワード
       ├─ メール確認
       └─ パスワード再設定
  ↓ 認証結果
Amazon Cognito
  ↓ ID・Access・Refresh Token
Hundred
```

Cloudflare Pages、Cognito、Googleの役割は次のとおり。

| サービス | 役割 |
|---|---|
| Cloudflare Pages | Hundredの静的ファイルを常時配信する |
| Amazon Cognito | Hundredのユーザー、メール認証、認証セッション、トークンを管理する |
| Google Auth Platform | Googleアカウントによる本人確認を行う |
| AWS Record Hub環境 | 認証後に必要となる各AppのAPIを提供する。停止中でもHundredの認証には影響しない |

---

## 3. 今回の設定値

### 3.1 Amazon Cognito

| 項目 | 設定値 |
|---|---|
| AWSリージョン | Asia Pacific (Tokyo) / `ap-northeast-1` |
| User Pool ID | `ap-northeast-1_CqkNv5buN` |
| App Client名 | `hundred-web-prod` |
| App Client ID | `6lp8qk50nnuf5n4a8u71dl9idi` |
| App Client Secret | なし |
| Cognitoドメイン | `ap-northeast-1cqknv5bun.auth.ap-northeast-1.amazoncognito.com` |
| OAuthフロー | Authorization Code Grant |
| OpenID Connectスコープ | `openid email profile` |
| IDプロバイダー | Cognito User Pool Directory、Google |

User Pool ID、App Client ID、Cognitoドメインは、ブラウザへ配布される公開識別子である。AWSアクセスキーやGoogleクライアントシークレットとは異なる。

### 3.2 コールバックURL

| 用途 | URL |
|---|---|
| ローカル・サインイン | `http://localhost:5173/auth/callback` |
| 本番・サインイン | `https://yamahit.com/auth/callback` |
| ローカル・サインアウト | `http://localhost:5173/` |
| 本番・サインアウト | `https://yamahit.com/` |

OAuthのURLは完全一致で検証される。スキーム、ホスト名、ポート番号、パス、末尾のスラッシュを勝手に変更しない。

ローカル確認には`http://localhost:5173`を使用する。`http://127.0.0.1:5173`はCognitoの登録URLとオリジンが一致しないため、Cognitoサインインの確認には使用しない。

### 3.3 Google Auth Platform

| 項目 | 設定値 |
|---|---|
| Google Cloudプロジェクト | `hundred-prod` |
| OAuthクライアント名 | `Hundred Cognito Production` |
| アプリケーション種別 | ウェブアプリケーション |
| 対象 | 外部 |
| 公開状態 | 構築時はテスト |
| 承認済みJavaScript生成元 | `https://ap-northeast-1cqknv5bun.auth.ap-northeast-1.amazoncognito.com` |
| 承認済みリダイレクトURI | `https://ap-northeast-1cqknv5bun.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse` |

Google OAuthクライアントIDとクライアントシークレットはCognito側へ登録する。特にクライアントシークレットは、ソースコード、Git、Markdown、スクリーンショットへ記録しない。

---

## 4. Cognito User Poolを作成する

1. AWSマネジメントコンソールを開く
2. リージョンを「Asia Pacific (Tokyo)」へ切り替える
3. Amazon Cognitoを開く
4. User Poolを作成する
5. サインイン識別子としてメールアドレスを利用できるようにする
6. User Poolの作成後、User Pool IDを記録する

### リージョンの注意

CognitoのUser Pool、App Client、ドメインはリージョン単位で管理される。東京環境を使用する場合は、URLとIDがすべて`ap-northeast-1`のものになっていることを確認する。

別リージョンに誤って作成したUser PoolのApp Client IDやドメインを混在させない。

---

## 5. SPA用App Clientを作成する

Hundredはブラウザ上で動作するSingle Page Applicationであるため、クライアントシークレットを持たないPublic Clientとして作成する。

1. User Poolの「アプリケーションクライアント」を開く
2. SPA向けのApp Clientを作成する
3. 名前を`hundred-web-prod`にする
4. クライアントシークレットを生成しない
5. 認証コード付与を有効にする
6. `openid`、`email`、`profile`スコープを許可する
7. コールバックURLとサインアウトURLを登録する
8. トークンの取り消しを有効にする
9. ユーザー存在エラーの防止を有効にする

### 今回設定したトークン有効期間

| トークン | 有効期間 |
|---|---|
| Access Token | 60分 |
| ID Token | 60分 |
| Refresh Token | 5日 |
| 認証フローセッション | 3分 |

有効期間はセキュリティと利便性のバランスを見て変更する。変更した場合は、この文書と実環境を同時に更新する。

---

## 6. Cognitoドメインとログインページを設定する

1. User PoolのApp Clientを開く
2. 「ログインページ」を開く
3. Cognitoドメインを作成する
4. マネージドログインページを有効にする
5. 許可するコールバックURLとサインアウトURLを登録する
6. OAuth付与タイプとして認証コード付与を選択する
7. `openid email profile`を選択する

今回のCognitoドメインは次のとおり。

```text
https://ap-northeast-1cqknv5bun.auth.ap-northeast-1.amazoncognito.com
```

Cognitoの標準ドメインはGoogle同意画面にも表示される。将来、ユーザー向け表示をHundredに統一する場合は、Cognitoのカスタムドメインとマネージドログインのブランディングを別途検討する。

---

## 7. Google Auth Platformを構成する

### 7.1 Google Auth Platformを開始する

1. Google Cloud Consoleで`hundred-prod`プロジェクトを選択する
2. Google Auth Platformを開く
3. 初期設定の「開始」を選択する
4. アプリ名、サポート用メールアドレス、連絡先を登録する
5. 対象を「外部」にする
6. 構築中は公開状態を「テスト」にする
7. 動作確認に利用するGoogleアカウントをテストユーザーへ追加する

テスト状態では、テストユーザーへ登録したGoogleアカウントだけが認証できる。本番公開前に、Google Auth Platformの公開状態と必要な審査項目を確認する。

### 7.2 OAuthクライアントを作成する

1. 「クライアント」を開く
2. 「OAuthクライアントを作成」を選択する
3. 種類を「ウェブアプリケーション」にする
4. 名前を`Hundred Cognito Production`にする
5. 承認済みJavaScript生成元へCognitoドメインを登録する
6. 承認済みリダイレクトURIへCognitoの`/oauth2/idpresponse`を登録する
7. 作成後に表示されるクライアントIDとシークレットを安全な場所へ一時保存する

Googleから直接Hundredへ戻すのではなく、必ずCognitoの`/oauth2/idpresponse`へ戻す。

```text
Google
  ↓
Cognito /oauth2/idpresponse
  ↓
Hundred /auth/callback
```

---

## 8. GoogleをCognitoのIDプロバイダーへ追加する

1. Cognito User Poolを開く
2. 「ソーシャルプロバイダーとカスタムプロバイダー」を開く
3. 「アイデンティティプロバイダーを追加」を選択する
4. Googleを選択する
5. Google OAuthクライアントIDを入力する
6. Google OAuthクライアントシークレットを入力する
7. 許可するスコープへ`openid email profile`を入力する
8. Google属性とCognito User Pool属性をマッピングする

今回の属性マッピングは次のとおり。

| Google属性 | Cognito User Pool属性 | 用途 |
|---|---|---|
| `email` | `email` | メールアドレス |
| `email_verified` | `email_verified` | Googleで確認済みかどうか |
| `name` | `name` | 表示名 |
| `picture` | `picture` | プロフィール画像URL |

Google連携を作成しただけではApp Clientから利用できない。続けてApp Clientのマネージドログイン設定を編集し、IDプロバイダーとしてGoogleを追加する。

最終的なIDプロバイダー選択は次の状態にする。

- Cognito User Pool Directory
- Google

---

## 9. Hundredフロントエンドへ実装する

### 9.1 Amplifyを追加する

```bash
cd "/Users/yama/Desktop/ひまつぶし/Workspace/hundred/frontend"
npm install aws-amplify
```

今回導入したバージョンは`aws-amplify ^6.20.0`である。依存関係を更新した後は、`package-lock.json`もコミットする。

### 9.2 Cognito公開設定

認証設定は次のファイルで管理する。

```text
frontend/src/components/Hundred/Auth/hundredAuth.ts
```

設定する内容は次のとおり。

- User Pool ID
- App Client ID
- Cognitoドメイン
- `openid email profile`スコープ
- ローカルと本番のコールバックURL
- Authorization Code Flow
- Googleプロバイダー

これらはブラウザから利用される公開設定であるため、フロントエンドへ含められる。GoogleクライアントシークレットやAWS認証情報は含めない。

### 9.3 Amplifyの初期化

`frontend/src/main.tsx`でReactを描画する前に、Cognito認証を初期化する。

```text
configureHundredAuth()
  ↓
Reactを描画
```

OAuthコールバックの処理に必要なリスナーも有効にする。

### 9.4 コールバックルート

`frontend/src/App.tsx`へ次のルートを追加する。

```text
/auth/callback
```

Googleまたはメール認証後はこのルートでCognitoの認証コードを受け取り、Amplifyがトークンへ交換する。完了後は`/`へ戻す。

Cloudflare PagesでSPAのルートを直接再読み込みする場合も、`/auth/callback`から`index.html`を表示できることを確認する。

### 9.5 サインイン・セッション・サインアウト

`frontend/src/components/Hundred/Home/HundredHome.tsx`で、次のAmplify APIを使用する。

| API | 用途 |
|---|---|
| `signInWithRedirect({ provider: 'Google' })` | Cognitoを経由してGoogleへ移動する |
| `signInWithRedirect()` | Cognito User Poolのメール認証画面へ移動する |
| `getCurrentUser` | Cognitoのログイン済みユーザーを確認する |
| `fetchAuthSession` | IDトークンから表示名とメールアドレスを取得する |
| `fetchUserAttributes` | Cognitoの最新ユーザー属性を取得する |
| `signOut` | Cognitoセッションを終了する |
| `Hub.listen('auth')` | サインイン、サインアウト、トークン更新を検知する |

表示名とメールアドレスはIDトークンの`name`、`email`クレームから取得し、取得できる場合はCognito User Attributesの値で更新する。

メール認証のサインイン、アカウント作成、メール確認、パスワード再設定はCognitoのマネージドログインで行う。Hundredの画面ではメールアドレスやパスワードを直接入力・保存しない。Google認証とメール認証は同じ`/auth/callback`へ戻り、以降のセッション処理を共用する。

Hundredからマネージドログインを開始する際は`lang=ja`を指定し、Cognitoが対応している画面を日本語で表示する。

### 9.6 ユーザーID

プロフィール画面の「メンバーID」は、Cognitoが発行する`sub`である。

- User Pool内でユーザーを一意に識別する
- 表示名やメールアドレスが変わっても変わらない
- Google側のアカウントIDやCognito内部ユーザー名`google_...`とは異なる
- Record Hubなど各Appのユーザーデータを紐づける主キーとして利用できる
- Cognitoユーザーを削除して作り直した場合は新しいIDになる

メールアドレスは変更される可能性があるため、アプリ間の主キーとして使用しない。

---

## 10. ローカル動作確認

### 10.1 起動

```bash
cd "/Users/yama/Desktop/ひまつぶし/Workspace/hundred/frontend"
npm run dev
```

ブラウザで次を開く。

```text
http://localhost:5173
```

### 10.2 初回サインイン

1. 「Googleアカウントで続ける」を選択する
2. Googleのアカウント選択画面が表示されることを確認する
3. Googleが共有する情報を確認する
4. 同意して次へ進む
5. `http://localhost:5173/auth/callback`へ戻ることを確認する
6. Hundredのホーム画面が表示されることを確認する
7. プロフィール画面を開く
8. 表示名、メールアドレス、メンバーIDが表示されることを確認する
9. Cognitoの「ユーザー」に`Google_...`または`google_...`の外部プロバイダーユーザーが作成されていることを確認する

### 10.3 メールアドレスでの初回サインイン

1. 「メールアドレスで続ける」を選択する
2. Cognitoのマネージドログインが表示されることを確認する
3. 未登録の場合は「アカウントを作成」からメールアドレスとパスワードを登録する
4. Cognitoから届いた確認メールでアカウントを確認する
5. メールアドレスとパスワードでサインインする
6. `/auth/callback`を経由してHundredのホームへ戻ることを確認する
7. プロフィールの連携アカウントが「メールアドレス」と表示されることを確認する
8. 表示名、メールアドレス、メンバーIDを確認する
9. 「パスワードを忘れた場合」から再設定メールを受け取れることを確認する

2026年8月22日の検証では、Cognito User Pool Directoryへのメールユーザー作成、管理者によるアカウント確認、メールアドレスとパスワードでのHundredへのサインイン、プロフィールへのメールアドレス認証表示まで確認した。

検証時は確認メールの受信を確認できなかったため、管理者確認で認証フローの機能検証を継続した。これはメールアドレスの所有確認を代替するものではない。本番前にCognito標準メールまたはAmazon SESによる確認メールとパスワード再設定メールの到達性を別途検証する。

メールユーザーは`name`属性を持たない場合がある。HundredはCognito内部ユーザー名やUUIDを表示名として使用せず、`name`が未設定の場合はメールアドレスのローカル部を暫定表示する。恒久的な表示名の登録・編集はプロフィール機能の拡張時に対応する。

### 10.4 セッション復元

1. ログインした状態でページを再読み込みする
2. Google認証をやり直さず、Hundredのホームへ入れることを確認する
3. ブラウザを閉じて再度開いた場合も、Refresh Tokenの有効期間内ならセッションが復元されることを確認する

### 10.5 サインアウト

1. プロフィール画面を開く
2. 「サインアウト」を選択する
3. Hundredのサインイン画面へ戻ることを確認する
4. 再読み込みしても会員状態へ自動復帰しないことを確認する

---

## 11. 今回発生した問題と対応

### 11.1 `UserAlreadyAuthenticatedException`

表示された開発情報:

```text
UserAlreadyAuthenticatedException: There is already a signed in user.
```

これはGoogle認証が失敗したという意味ではなく、Amplifyにすでに有効なユーザーセッションが存在する状態で、再度`signInWithRedirect`を呼び出したことを示す。

今回の原因は、OAuthコールバック処理がReactより先に動き始め、開発時のReact StrictModeによるEffect再実行と認証イベントの購読タイミングがすれ違ったことだった。

対応内容:

- Auth Hubリスナーを登録してから初期セッションを確認する
- `/auth/callback`では一定時間後にセッションを再同期する
- 認証済みセッションをプロフィール属性取得の成否から独立させる

このエラーが再発した場合は、Googleログインを何度も繰り返さず、まずページを再読み込みして既存セッションを確認する。

### 11.2 表示名が`google_...`になる

`google_...`はCognito内部で使用されるフェデレーションユーザー名であり、ユーザー向け表示名ではない。

プロフィール属性取得APIが失敗した場合もログイン自体を維持し、IDトークンの`name`と`email`クレームから表示名とメールアドレスを取得するようにした。

### 11.3 メールアドレスが「未取得」になる

次を確認する。

- Googleのスコープに`email`が含まれている
- Googleの`email`がCognitoの`email`へマッピングされている
- App Clientが`email`と`name`を読み取り可能である
- IDトークンに`email`と`name`クレームが含まれている

認証済みセッションは属性取得の失敗だけで破棄しない。

### 11.4 GoogleユーザーがCognitoに作成されるがHomeへ入れない

この状態では、GoogleからCognitoまでの認証とユーザー作成は成功している。問題はHundred側の認証コード交換またはセッション反映に絞られる。

確認順序:

1. Cognitoのユーザー一覧に外部プロバイダーユーザーが存在するか
2. ブラウザのURLが`/auth/callback`へ戻っているか
3. App Client ID、ドメイン、コールバックURLが同じリージョンのものか
4. AmplifyのOAuthリスナーが有効か
5. 既存セッションがある状態で再度サインインしていないか

### 11.5 Googleの同意画面に長いCognitoドメインが表示される

Cognitoの標準ドメインを使用しているため正常な表示である。認証機能には影響しない。

ユーザー体験を改善する場合は、次を検討する。

- Cognitoのカスタムドメイン
- マネージドログインページのブランディング
- Google Auth Platformのアプリ名、ロゴ、ホームページ、プライバシーポリシー

---

## 12. 本番反映と確認

### 12.1 デプロイ前確認

```bash
cd "/Users/yama/Desktop/ひまつぶし/Workspace/hundred/frontend"
npm ci
npm run lint
npm run build
npm audit --omit=dev
```

### 12.2 Cloudflare Pagesへ反映

認証実装を`main`へpushすると、Cloudflare Pagesが自動的にビルドとデプロイを行う。

本番では次を確認する。

- `https://yamahit.com`からGoogleへ遷移する
- Google認証後に`https://yamahit.com/auth/callback`へ戻る
- `https://yamahit.com`からCognitoのメール認証へ遷移する
- メール認証後に`https://yamahit.com/auth/callback`へ戻る
- メールアドレスの確認とパスワード再設定を実行できる
- Hundredのホームが表示される
- 表示名、メールアドレス、メンバーIDが表示される
- ページ再読み込み後もログイン状態を復元できる
- サインアウトできる
- AWSのRecord Hub環境を停止しても、HundredへのGoogle・メールサインインが利用できる

---

## 13. セキュリティ上の注意

- SPAのApp Clientにはクライアントシークレットを設定しない
- GoogleクライアントシークレットをフロントエンドやGitへ保存しない
- OAuthにはAuthorization Code Flow with PKCEを使用する
- コールバックURLは必要なローカルURLと本番URLだけを登録する
- `openid email profile`を超えるGoogleスコープは、必要性を確認してから追加する
- メールアドレスではなくCognitoの`sub`をアプリ内ユーザーIDにする
- ID Tokenはプロフィール表示と本人識別に、Access TokenはAPI認可に使用する
- Record Hub APIではAccess Tokenの署名、発行者、対象クライアント、有効期限をサーバー側で検証する
- ブラウザで認証トークンを扱うため、XSS対策、Content Security Policy、依存関係監査を継続する
- 本番公開前にGoogle Auth Platformのテスト状態、公開設定、プライバシーポリシーを確認する

---

## 14. 料金に関する考え方

GoogleログインではSMS送信を使用しないため、SMS認証の送信料金は発生しない。

Amazon Cognitoの料金は、利用プラン、月間アクティブユーザー数、追加機能によって変わる。無料利用枠と最新料金は本番公開前に公式料金ページで再確認する。

メール認証を追加する場合は、CognitoだけでなくAmazon SESなどのメール送信料金も確認する。

---

## 15. メール認証の運用要件

- Googleアカウントを持たない利用者向けに、メールアドレスとパスワードによる認証を提供する
- サインイン、アカウント作成、メール確認、パスワード再設定はCognitoのマネージドログインで処理する
- Hundredはパスワードを受け取らず、ソースコード、ログ、ブラウザ保存領域へ記録しない
- Cognito User Poolでは自己サインアップ、メール属性の確認、アカウント復旧を有効にする
- メールアドレスの存在有無を推測しにくいエラー表示を使用する
- Googleログインを第一選択として維持する
- Cognitoの送信制限、APIクォータ、失敗状況を監視する
- 独自のTurnstileやWorkerレート制限が必要になった場合は、Cognito直結のマネージドログインとは分離して追加設計する

---

## 16. 公式資料

- [既存のCognitoリソースをAmplify Authで使用する](https://docs.amplify.aws/javascript/build-a-backend/auth/use-existing-cognito-resources/)
- [Amplifyで外部IDプロバイダーへサインインする](https://docs.amplify.aws/react/frontend/auth/sign-in/)
- [Cognito User PoolでソーシャルIDプロバイダーを使用する](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp.html)
- [Cognitoの属性マッピング](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-specifying-attribute-mapping.html)
- [Cognito App Clientの設定](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html)
- [Amazon Cognitoの料金](https://aws.amazon.com/cognito/pricing/)
- [Cloudflare Turnstileのサーバー側検証](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
