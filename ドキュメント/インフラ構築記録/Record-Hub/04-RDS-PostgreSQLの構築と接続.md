# Record Hub AWS 第4フェーズ構築記録

## 1. 第4フェーズの目的

第4フェーズでは、AWS上に本番用のRDS
PostgreSQLを構築し、EC2上で稼働しているSpring
Bootからデータベースへ接続できる構成を構築した。

第3フェーズまでで完成していた独自ドメイン +
HTTPSによるAPI公開経路に、本番データベースを追加する。

``` text
Client
  ↓ HTTPS
api.yamahit.com
  ↓
Cloudflare Tunnel
  ↓
EC2
  ↓
Nginx :80
  ↓
Spring Boot :8080
  ↓ JDBC
RDS PostgreSQL
```

また、DBパスワードなどの秘密情報をGit管理下の設定ファイルへ直接記述せず、EC2側の環境変数からSpring
Bootへ渡す構成とした。

------------------------------------------------------------------------

## 2. 第4フェーズ開始時の構成

開始時点では、以下の公開経路まで構築済みだった。

``` text
Mac / Client
 ↓ HTTPS
api.yamahit.com
 ↓
Cloudflare
 ↓
Cloudflare Tunnel
 ↓
EC2 / cloudflared
 ↓
Nginx :80
 ↓
Spring Boot :8080
```

`/api/hello`
へのアクセスは成功していたが、永続データを保存する本番データベースはまだ接続されていなかった。

------------------------------------------------------------------------

## 3. RDS PostgreSQLの構築

AWS RDSに本番用PostgreSQLデータベースを用意した。

``` text
DBエンジン: PostgreSQL
DB名: recordhub
マスターユーザー: recordhub_admin
ポート: 5432
```

RDSのマスターパスワードは秘密情報として扱い、Gitや構築記録には保存しない。

------------------------------------------------------------------------

## 4. EC2へPostgreSQLクライアントを導入

Amazon Linux 2023で利用可能なPostgreSQLパッケージを確認した。

``` bash
dnf search postgresql
```

PostgreSQL
15〜18のパッケージが利用可能であることを確認し、RDSへの接続確認に使用するPostgreSQLクライアントを導入した。

``` bash
psql --version
```

結果:

``` text
psql (PostgreSQL) 18.4
```

EC2上にPostgreSQLサーバーを構築するのではなく、RDSへ接続するためのクライアントとして使用する。

------------------------------------------------------------------------

## 5. EC2 → RDSの接続確認

RDSへ接続した。

``` bash
psql -h <RDS_ENDPOINT> -p 5432 -U recordhub_admin -d recordhub
```

接続成功時:

``` text
psql (18.4, server 18.3)
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off, ALPN: postgresql)
recordhub=>
```

接続先を確認した。

``` sql
SELECT current_database(), current_user;
```

結果:

``` text
 current_database |  current_user
------------------+-----------------
 recordhub        | recordhub_admin
```

EC2からRDS PostgreSQLへ正常に接続できることを確認した。

psqlを終了する場合:

``` text
\q
```

------------------------------------------------------------------------

## 6. Spring BootへJDBC/PostgreSQL対応を追加

`pom.xml` にSpring JDBCとPostgreSQL JDBC Driverを追加した。

``` xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-jdbc</artifactId>
</dependency>

<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>
```

Spring JDBCによって `JdbcTemplate`
やDataSourceを利用できるようになり、PostgreSQL JDBC
DriverによってJavaからPostgreSQLへ接続できるようになった。

------------------------------------------------------------------------

## 7. JDBC追加後のテスト失敗

JDBCを追加した状態でビルドすると、既存の
`BackendApplicationTests.contextLoads` が失敗した。

``` text
Failed to configure a DataSource: 'url' attribute is not specified and no embedded datasource could be configured.

Reason: Failed to determine a suitable driver class
```

Spring
JDBCを追加したことでDataSourceの自動構成が行われるようになった一方、ローカルテスト用の接続先DBが存在しなかったことが原因だった。

------------------------------------------------------------------------

## 8. テスト用H2 Databaseの追加

ローカルテストで本番RDSへの接続を必要としないよう、テスト用インメモリDBとしてH2を追加した。

再度ビルド。

``` bash
./mvnw clean package
```

結果:

``` text
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

------------------------------------------------------------------------

## 9. 本番用Spring Profileの作成

以下の2つの設定ファイルを使用する構成にした。

``` text
src/main/resources/application.properties
src/main/resources/application-prod.properties
```

本番用 `application-prod.properties`
では、RDS接続情報を環境変数から取得する。

``` properties
spring.datasource.url=${DB_URL}
spring.datasource.username=${DB_USERNAME}
spring.datasource.password=${DB_PASSWORD}
spring.datasource.driver-class-name=org.postgresql.Driver
```

これにより、RDSのパスワードなどをソースコードへ直接記述しない構成にした。

------------------------------------------------------------------------

## 10. EC2側で本番環境変数を管理

EC2上に本番用の環境変数ファイルを用意した。

``` text
/etc/recordhub/backend.env
```

構成:

``` text
SPRING_PROFILES_ACTIVE=prod
DB_URL=jdbc:postgresql://<RDS_ENDPOINT>:5432/recordhub
DB_USERNAME=recordhub_admin
DB_PASSWORD=<RDS_PASSWORD>
```

実際のRDSエンドポイントやパスワードはこの構築記録には残さない。

------------------------------------------------------------------------

## 11. systemdと環境変数ファイルを連携

Spring Bootのsystemdサービス:

``` text
/etc/systemd/system/recordhub-backend.service
```

`[Service]` に以下を追加した。

``` ini
# 本番用の環境変数を読み込む
EnvironmentFile=/etc/recordhub/backend.env
```

主要部分:

``` ini
[Service]

# Spring Bootを実行するLinuxユーザー
User=ec2-user

# アプリケーションの配置ディレクトリ
WorkingDirectory=/opt/recordhub

# 本番用の環境変数を読み込む
EnvironmentFile=/etc/recordhub/backend.env

# Spring Bootの起動コマンド
ExecStart=/usr/bin/java -jar /opt/recordhub/backend-0.0.1-SNAPSHOT.jar

# JavaがSIGTERMで終了した場合も正常終了として扱う
SuccessExitStatus=143

# 異常終了した場合は自動的に再起動する
Restart=on-failure
```

確認:

``` bash
sudo systemctl cat recordhub-backend
```

`EnvironmentFile=/etc/recordhub/backend.env`
が表示されることを確認した。

------------------------------------------------------------------------

## 12. 本番用JARのビルドと転送

MacでJARを作成。

``` bash
./mvnw clean package
```

`clean` は以前のビルド成果物を削除し、`package`
はコンパイル・テスト・JAR作成までを行う。

生成物:

``` text
target/backend-0.0.1-SNAPSHOT.jar
```

EC2へSCPで転送。

``` bash
scp -i ~/.ssh/record-hub/recordhub-ec2-key.pem \
target/backend-0.0.1-SNAPSHOT.jar \
ec2-user@<EC2_PUBLIC_IP>:/home/ec2-user/
```

本番配置場所へ上書き。

``` bash
sudo cp /home/ec2-user/backend-0.0.1-SNAPSHOT.jar /opt/recordhub/backend-0.0.1-SNAPSHOT.jar
```

------------------------------------------------------------------------

## 13. application-prod.propertiesがJARに入っていない問題

最初のデプロイではSpring Bootが起動失敗と自動再起動を繰り返した。

``` text
Active: activating (auto-restart)
Result: exit-code
status=1/FAILURE
```

ログを確認。

``` bash
sudo journalctl -u recordhub-backend -n 50 --no-pager
```

`prod` Profile自体は有効だった。

``` text
The following 1 profile is active: "prod"
```

一方でDataSource設定を読み込めていなかった。

``` text
Failed to configure a DataSource: 'url' attribute is not specified
Reason: Failed to determine a suitable driver class
```

JAR内部を確認。

``` bash
jar tf /opt/recordhub/backend-0.0.1-SNAPSHOT.jar | grep application
```

最初のJAR:

``` text
BOOT-INF/classes/application.properties
```

`application-prod.properties` が含まれていないことが判明した。

------------------------------------------------------------------------

## 14. JARを再ビルドして解消

Mac側では両方のファイルが存在することを確認した。

``` text
application-prod.properties
application.properties
```

再ビルド後、JAR内部を確認。

``` bash
jar tf target/backend-0.0.1-SNAPSHOT.jar | grep application
```

結果:

``` text
BOOT-INF/classes/application-prod.properties
BOOT-INF/classes/application.properties
```

新しいJARをEC2へ再転送し、本番配置場所へ上書きした。

サービスを起動。

``` bash
sudo systemctl start recordhub-backend
sudo systemctl status recordhub-backend
```

結果:

``` text
Active: active (running)
```

既存APIも確認。

``` bash
curl http://localhost/api/hello
```

``` text
Record Hub API is running
```

------------------------------------------------------------------------

## 15. Spring Boot → RDS接続確認APIの追加

実際のSpring
BootアプリケーションからRDSへ接続できることを確認するため、DB疎通確認APIを追加した。

``` text
GET /api/db-check
```

`JdbcTemplate` を使用して以下のSQLを実行する。

``` sql
SELECT current_database()
```

RDS PostgreSQLへ正常に接続している場合、データベース名 `recordhub`
を返す。

既存の `HelloController` と `/api/hello`
は変更せず、新しい依存関係も追加していない。

テスト結果:

``` text
Tests run: 1
Failures: 0
Errors: 0
```

------------------------------------------------------------------------

## 16. DB接続確認APIを本番へデプロイ

最新ソースを再度ビルド。

``` bash
./mvnw clean package
```

`BUILD SUCCESS` を確認。

JARをEC2へ転送して本番JARを上書きし、サービスを再起動した。

``` bash
sudo systemctl restart recordhub-backend
sudo systemctl status recordhub-backend
```

結果:

``` text
Active: active (running)
```

------------------------------------------------------------------------

## 17. 独自ドメイン経由で最終疎通確認

Macから本番APIへアクセス。

``` bash
curl https://api.yamahit.com/api/db-check
```

結果:

``` text
recordhub
```

この `recordhub` はSpring BootがRDS PostgreSQL上で
`SELECT current_database()` を実行した結果である。

最終的に以下の経路がすべて正常に動作した。

``` text
Mac / Client
 ↓ HTTPS
api.yamahit.com
 ↓
Cloudflare
 ↓
Cloudflare Tunnel
 ↓
EC2 / cloudflared
 ↓
Nginx :80
 ↓
Spring Boot :8080
 ↓ JdbcTemplate / JDBC
RDS PostgreSQL
 ↓
recordhub
```

------------------------------------------------------------------------

## 18. 本番DB認証情報の管理構成

``` text
Git管理
│
└─ application-prod.properties
     ├─ ${DB_URL}
     ├─ ${DB_USERNAME}
     └─ ${DB_PASSWORD}
             ▲
             │
EC2          │
│            │
└─ /etc/recordhub/backend.env
     ├─ SPRING_PROFILES_ACTIVE=prod
     ├─ DB_URL=...
     ├─ DB_USERNAME=...
     └─ DB_PASSWORD=...
             │
             ▼
          systemd
             │
             ▼
        Spring Boot
```

DBパスワードをGitHubへ登録せず、本番EC2側だけが実値を保持する構成になった。

------------------------------------------------------------------------

## 19. 第4フェーズ完了時の構成

``` text
Mac / Client
 ↓ HTTPS
api.yamahit.com
 ↓
Cloudflare
 ↓
Cloudflare Tunnel
 ↓
EC2
 ├─ cloudflared
 ├─ Nginx :80
 ├─ Spring Boot :8080
 │       ↓ JDBC
 │   RDS PostgreSQL
 │       └─ recordhub
 │
 └─ /etc/recordhub/backend.env
         └─ 本番DB接続情報
```

------------------------------------------------------------------------

## 20. 第4フェーズで学んだこと

-   Amazon RDSの役割
-   PostgreSQLをRDSで利用する構成
-   RDSエンドポイント
-   PostgreSQL標準ポート5432
-   EC2 → RDSの接続
-   PostgreSQLクライアント `psql`
-   `psql -h -p -U -d`
-   `\q`
-   `SELECT current_database(), current_user`
-   PostgreSQL JDBC Driver
-   Spring JDBC
-   `JdbcTemplate`
-   Spring BootのDataSource自動構成
-   テスト用H2 Database
-   Spring Profile
-   `application.properties`
-   `application-prod.properties`
-   環境変数によるDB接続情報の管理
-   systemdの `EnvironmentFile`
-   `./mvnw clean package`
-   `jar tf` によるJAR内容確認
-   SCPによるJAR転送
-   systemdによるSpring Boot再起動
-   `journalctl` による障害調査
-   `/api/db-check` によるSpring Boot → RDSの実接続確認

------------------------------------------------------------------------

## 21. 第4フェーズ完了

第4フェーズのゴール:

**AWS RDS PostgreSQLを本番データベースとして構築し、EC2上のSpring
Bootから秘密情報をソースコードへ埋め込まずに接続できる状態を作る。**

最終疎通確認:

``` bash
curl https://api.yamahit.com/api/db-check
```

結果:

``` text
recordhub
```

**本番公開されているSpring Boot APIから、RDS
PostgreSQLへ実際にSQLを実行できる状態になった。**

次フェーズからは、この本番DB基盤を利用してRecord
Hub本体のテーブル設計・マイグレーション・CRUD
APIなどのアプリケーション機能開発へ進む。
