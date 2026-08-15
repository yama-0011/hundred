# Record Hub AWS 第1フェーズ構築シナリオ

## 1. 目的

Record Hub を実際の本番環境で運用するための第一歩として、AWS 上に EC2
を構築し、ローカルでビルドした Spring Boot アプリケーションを EC2
に配置して起動できるところまで確認する。

このフェーズでは、DB・独自ドメイン・HTTPS・CI/CD
などはまだ扱わず、以下の最小構成を完成させる。

``` text
Mac（開発環境）
  ↓ build
Spring Boot JAR
  ↓ SCP / SSH
AWS EC2（Amazon Linux 2023）
  ↓
Java 21
  ↓
Spring Boot
  ↓
GET /api/hello
```

------------------------------------------------------------------------

## 2. AWS アカウント初期設定

### 実施内容

-   AWS アカウントの利用開始
-   リージョンを東京リージョンに設定
-   AWS Budgets で予算を設定
-   CloudWatch ダッシュボードを作成
-   ルートユーザーに MFA を設定
-   IAM ユーザーを作成
-   IAM ユーザーにも MFA を設定

### 学習ポイント

-   ルートユーザーは AWS アカウント全体を管理する強力なユーザー
-   日常操作では IAM ユーザーを使用する
-   MFA により認証を強化する
-   AWS はリソースごとに料金が発生するため、Budgets で予算を監視する

------------------------------------------------------------------------

## 3. EC2 インスタンス作成

### インスタンス

-   用途: Record Hub アプリケーションサーバー
-   名前: `recordhub-prod-app`
-   OS: Amazon Linux 2023
-   インスタンスタイプ: `t3.small`
-   VPC: デフォルト VPC
-   パブリック IPv4: 有効

### セキュリティグループ

初期構築時は SSH のみ許可。

``` text
SSH / TCP 22
送信元: 自分のグローバル IP（/32）
```

HTTP / HTTPS / 8080 はこの時点では公開しない。

### EBS

-   容量: 8 GiB
-   種類: gp3
-   暗号化: 有効
-   終了時に削除: 有効

### 学習ポイント

EC2 の主な料金対象として、現時点では以下を意識する。

1.  EC2 インスタンスの稼働
2.  EBS ストレージ

EC2 を停止するとコンピューティング料金は停止するが、EBS
はデータを保持するため停止中も料金対象になり得る。

------------------------------------------------------------------------

## 4. Mac から EC2 へ SSH 接続

EC2 作成時に秘密鍵を作成。

``` text
recordhub-ec2-key.pem
```

秘密鍵の権限を変更。

``` bash
chmod 400 recordhub-ec2-key.pem
```

EC2 へ SSH 接続。

``` bash
ssh -i ~/.ssh/record-hub/recordhub-ec2-key.pem ec2-user@<PUBLIC_IP>
```

接続成功時の例。

``` text
[ec2-user@ip-172-31-xx-xxx ~]$
```

### 学習ポイント

-   SSH: リモートサーバーを安全に操作する仕組み
-   `.pem`: EC2 に接続するための秘密鍵
-   `ec2-user`: Amazon Linux の標準ログインユーザー

------------------------------------------------------------------------

## 5. EC2 に Java 21 を導入

EC2 には Java が入っていなかったため Amazon Corretto 21 をインストール。

確認コマンド:

``` bash
java -version
javac -version
```

確認結果:

``` text
openjdk version "21.0.12"
javac 21.0.12
```

### 学習ポイント

-   `java`: Java プログラムを実行
-   `javac`: Java ソースコードをコンパイル
-   Spring Boot の実行環境として Java 21 を使用

------------------------------------------------------------------------

## 6. Record Hub のプロジェクト構成整理

既存リポジトリを以下の構成に整理。

``` text
record-hub/
├── frontend/
├── backend/
└── README.md
```

Cloudflare 検証用に存在していた `my-next-app` は削除。

フロントエンドの既存変更を Git に保存。

``` text
acf1a67 フロントエンドの初期構成を作成
```

Record Hub の Git コミットメッセージは日本語で統一する。

------------------------------------------------------------------------

## 7. Mac の開発環境構築

Mac に Homebrew が入っていなかったためインストール。

確認:

``` bash
brew --version
```

結果:

``` text
Homebrew 6.0.17
```

Amazon Corretto 21 を Homebrew でインストール。

``` bash
brew install --cask corretto@21
```

確認:

``` bash
java -version
javac -version
```

Mac と EC2 の両方を Java 21.0.12 に統一。

------------------------------------------------------------------------

## 8. Spring Boot バックエンド作成

Spring Initializr を利用して `backend` を生成。

### 設定

-   Project: Maven
-   Language: Java
-   Spring Boot: 4.0.7
-   Group: `com.recordhub`
-   Artifact: `backend`
-   Package: `com.recordhub.backend`
-   Packaging: Jar
-   Java: 21
-   Dependency: Spring Web

生成後の主な構成:

``` text
backend/
├── pom.xml
├── mvnw
├── .mvn/
└── src/
    ├── main/
    └── test/
```

------------------------------------------------------------------------

## 9. Spring Boot 起動確認

Mac でバックエンドを起動。

``` bash
cd backend
./mvnw spring-boot:run
```

起動ログで以下を確認。

``` text
Tomcat started on port 8080
Started BackendApplication
```

最初は Controller がなかったため、

``` bash
curl http://localhost:8080
```

で 404 が返ることを確認。

404 でも Tomcat までリクエストが到達しているため、Spring Boot
自体は正常に起動している。

------------------------------------------------------------------------

## 10. 最小 API 作成

以下に `HelloController.java` を作成。

``` text
backend/src/main/java/com/recordhub/backend/HelloController.java
```

API:

``` text
GET /api/hello
```

レスポンス:

``` text
Record Hub API is running
```

Mac から確認。

``` bash
curl http://localhost:8080/api/hello
```

結果:

``` text
Record Hub API is running
```

これにより Record Hub の最初のバックエンド API が動作した。

------------------------------------------------------------------------

## 11. Spring Boot を JAR にビルド

Spring Boot を停止後、Maven でビルド。

``` bash
./mvnw clean package
```

生成物を確認。

``` bash
ls -lh target/*.jar
```

生成された JAR:

``` text
target/backend-0.0.1-SNAPSHOT.jar
```

サイズは約 19 MB。

### 学習ポイント

``` text
Javaソース
  ↓ compile / test / package
Maven
  ↓
実行可能JAR
```

EC2 にはソースコードではなく、ビルド済み JAR を配置する。

------------------------------------------------------------------------

## 12. Mac から EC2 へ JAR を転送

SCP を使用。

``` bash
scp -i ~/.ssh/record-hub/recordhub-ec2-key.pem target/backend-0.0.1-SNAPSHOT.jar ec2-user@<PUBLIC_IP>:/home/ec2-user/
```

EC2 側で確認。

``` bash
ls -lh
```

結果:

``` text
backend-0.0.1-SNAPSHOT.jar
```

### 学習ポイント

-   SSH: リモートサーバーを操作
-   SCP: SSH を利用してファイルを転送

------------------------------------------------------------------------

## 13. EC2 上で Spring Boot を起動

EC2 で実行。

``` bash
java -jar backend-0.0.1-SNAPSHOT.jar
```

ログで確認。

``` text
Tomcat started on port 8080
Started BackendApplication
```

別の SSH セッションから EC2 内部の API を確認。

``` bash
curl http://localhost:8080/api/hello
```

結果:

``` text
Record Hub API is running
```

これにより、

``` text
Mac
  ↓ build
Spring Boot JAR
  ↓ SCP
EC2
  ↓ java -jar
Spring Boot
  ↓
/api/hello
```

という最小のデプロイフローが完成した。

------------------------------------------------------------------------

## 14. サーバー停止手順

作業終了時は以下の順番で停止する。

### 1. Spring Boot を停止

`java -jar` を実行しているターミナルで:

``` text
Ctrl + C
```

### 2. SSH 接続を終了

``` bash
exit
```

### 3. EC2 を停止

AWS コンソール:

``` text
EC2
→ インスタンス
→ recordhub-prod-app
→ インスタンスの状態
→ インスタンスを停止
```

「終了（削除）」ではなく「停止」を使用する。

------------------------------------------------------------------------

## 15. 次回の再開手順

EC2 を停止・起動するとパブリック IPv4 が変わる可能性がある。

1.  `recordhub-prod-app` を起動
2.  新しいパブリック IPv4 を確認
3.  SSH 接続
4.  JAR が残っていることを確認
5.  `java -jar backend-0.0.1-SNAPSHOT.jar` で起動
6.  EC2 内部から `/api/hello` を確認

------------------------------------------------------------------------

## 16. EC2 停止・再起動後の復旧確認

EC2 を停止した後、再度起動して環境が保持されていることを確認した。

-   停止前のパブリック IPv4: `18.180.248.91`
-   再起動後のパブリック IPv4: `13.196.179.134`
-   プライベート IPv4: `172.31.17.253` のまま

EC2 の通常の自動割り当てパブリック IPv4
は、停止・起動によって変更される場合がある。

再起動後に以下を実行した。

``` bash
ls -lh
```

結果、前回配置した以下の JAR が残っていた。

``` text
backend-0.0.1-SNAPSHOT.jar  19M
```

これにより、EC2 を停止しても EBS 上の OS、Java、JAR
などのデータが保持されることを実際に確認した。

------------------------------------------------------------------------

## 17. SSH 秘密鍵の整理

EC2 の秘密鍵を Git 管理中の Record Hub プロジェクト外へ移動した。

``` text
~/.ssh/record-hub/recordhub-ec2-key.pem
```

実体は以下。

``` text
/Users/yama/.ssh/record-hub/recordhub-ec2-key.pem
```

権限は `chmod 400` 相当の `-r--------`。

今後の SSH 接続は以下を使用する。

``` bash
ssh -i ~/.ssh/record-hub/recordhub-ec2-key.pem ec2-user@<PUBLIC_IP>
```

秘密鍵を Git リポジトリ外へ置くことで、`git add .` などによる GitHub
への誤コミットを防ぐ。

------------------------------------------------------------------------

## 18. セキュリティグループで 8080 を許可

EC2 内部では以下の API 呼び出しが成功していた。

``` bash
curl http://localhost:8080/api/hello
```

EC2 外部の Mac からアクセスするため、EC2
に適用しているセキュリティグループ `launch-wizard-1` に以下を追加した。

``` text
タイプ: カスタム TCP
プロトコル: TCP
ポート: 8080
送信元: 自分のグローバル IP /32
説明: Spring Boot API
```

既存の SSH ルールも維持した。

``` text
SSH / TCP 22
送信元: 自分のグローバル IP /32
```

動作確認時点では `0.0.0.0/0` で全世界へ公開せず、自分の IP
のみ許可した。

### 学習ポイント

セキュリティグループは、EC2 などの AWS
リソースに対して「どの通信を許可するか」を設定する仮想ファイアウォール。

EC2
に紐づくのはセキュリティグループであり、個々のセキュリティグループルール
ID を EC2 に直接紐づけるわけではない。

------------------------------------------------------------------------

## 19. Mac から EC2 上の API へ外部アクセス

セキュリティグループ設定後、Mac から EC2 のパブリック IPv4
を指定して確認した。

``` bash
curl http://13.196.179.134:8080/api/hello
```

結果:

``` text
Record Hub API is running
```

これにより以下の通信経路が成立した。

``` text
Mac
  ↓ HTTP
インターネット
  ↓
AWS セキュリティグループ :8080
  ↓
EC2
  ↓
Spring Boot / Tomcat :8080
  ↓
HelloController
  ↓
Record Hub API is running
```

EC2 内部だけではなく、外部クライアントから AWS 上の Record Hub API
へアクセスできることを確認した。

------------------------------------------------------------------------

## 20. VPC・サブネット・セキュリティグループの整理

現時点では以下のように理解する。

-   **VPC**: AWS 上の大きな仮想ネットワーク
-   **サブネット**: VPC
    内を用途や配置場所ごとに区切った小さなネットワーク
-   **EC2**: サブネット内に配置されるサーバー
-   **セキュリティグループ**: VPC に属し、EC2
    などに適用する仮想ファイアウォール
-   **セキュリティグループルール**:
    ポート、プロトコル、送信元などの具体的な許可条件
-   **EBS**: EC2 が利用する永続的なブロックストレージ

``` text
VPC
│
├── サブネット
│    └── EC2
│         └── セキュリティグループを適用
│
└── セキュリティグループ
     ├── TCP 22
     └── TCP 8080
```

Public / Private
Subnet、AZ、ルートテーブルなどは必要になった段階で学習する。

------------------------------------------------------------------------

## 21. 第1フェーズ完了

第1フェーズの最終的な流れ:

``` text
Mac（開発環境）
  ↓ Maven build
Spring Boot JAR
  ↓ SCP
AWS EC2
  ↓ java -jar
Spring Boot / Tomcat :8080
  ↓
セキュリティグループで自分のIPから8080を許可
  ↓
MacからEC2のパブリックIPv4へcurl
  ↓
GET /api/hello
  ↓
Record Hub API is running
```

**第1フェーズのゴール: ローカルで開発・ビルドした Java
アプリケーションを AWS の Linux
サーバーへ手動デプロイし、インターネット経由で API
を呼び出すところまで達成。**

------------------------------------------------------------------------

## 22. 第2フェーズ

次は、現在手動で実行している Spring Boot を Linux
サービスとして常駐運用できる状態にする。

``` text
現在:
SSH接続
  ↓
java -jar backend-0.0.1-SNAPSHOT.jar

次:
EC2起動
  ↓
systemd
  ↓
Spring Bootをサービスとして管理
```

主な学習対象:

-   `systemd`
-   `systemctl start / stop / restart / status`
-   EC2 起動時の Spring Boot 自動起動
-   Linux サービスのログ確認

その後、HTTP /
HTTPS、独自ドメイン、PostgreSQL、本番用環境変数、監視、フロントエンド接続、CI/CD
などへ進む。
