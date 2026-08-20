# Record Hub AWS 第2フェーズ構築記録

## 1. 第2フェーズの目的

第1フェーズでは、ローカルMacでビルドしたSpring
BootのJARをEC2へ配置し、手動で起動して外部からAPIへアクセスできるところまで確認した。

第2フェーズでは、手動の `java -jar` 起動をやめ、Spring BootをLinuxの
`systemd` サービスとして管理する。

``` text
EC2起動
  ↓
Amazon Linux
  ↓
systemd
  ↓
recordhub-backend.service
  ↓
Spring Boot自動起動
  ↓
MacからAPIへアクセス
```

------------------------------------------------------------------------

## 2. Spring Bootプロセスの確認

以前手動起動したSpring Bootが残っていないことを確認。

``` bash
ps -ef | grep backend-0.0.1-SNAPSHOT.jar
```

`grep` 自身のみ表示されたため、Spring Bootは停止中と判断した。

-   `ps -ef`: 全プロセスを詳細表示
-   `|`: 左側の結果を右側へ渡す
-   `grep`: 指定文字列を含む行を検索

------------------------------------------------------------------------

## 3. JARを `/opt/recordhub` へ配置

Record Hub専用ディレクトリを作成。

``` bash
sudo mkdir -p /opt/recordhub
```

`opt`
は「オプト」と読み、Linuxでは追加アプリケーションなどの配置に利用される。

JARを移動。

``` bash
sudo mv /home/ec2-user/backend-0.0.1-SNAPSHOT.jar /opt/recordhub/
```

確認。

``` bash
ls -lh /opt/recordhub
```

結果:

``` text
backend-0.0.1-SNAPSHOT.jar  19M
```

------------------------------------------------------------------------

## 4. systemdサービス定義を作成

``` bash
sudo nano /etc/systemd/system/recordhub-backend.service
```

完成した設定:

``` ini
[Unit]
# サービスの説明
Description=Record Hub Backend

# ネットワークの基本準備後に起動する
After=network.target

[Service]
# Spring Bootを実行するLinuxユーザー
User=ec2-user

# アプリケーションの配置ディレクトリ
WorkingDirectory=/opt/recordhub

# Spring Bootの起動コマンド
ExecStart=/usr/bin/java -jar /opt/recordhub/backend-0.0.1-SNAPSHOT.jar

# JavaがSIGTERMで終了した場合も正常終了として扱う
SuccessExitStatus=143

# 異常終了した場合は自動的に再起動する
Restart=on-failure

[Install]
# 通常のサーバー起動時に自動起動できるようにする
WantedBy=multi-user.target
```

`systemd` はLinuxでサービスの起動・停止・監視などを管理する仕組み。

------------------------------------------------------------------------

## 5. systemdへ設定を反映

``` bash
sudo systemctl daemon-reload
```

`.service`
ファイルを新規作成・変更した場合に、systemdへ設定を再読込させる。

------------------------------------------------------------------------

## 6. systemd経由でSpring Bootを起動

``` bash
sudo systemctl start recordhub-backend
sudo systemctl status recordhub-backend
```

以下を確認。

``` text
Active: active (running)
```

API確認:

``` bash
curl http://localhost:8080/api/hello
```

結果:

``` text
Record Hub API is running
```

手動の `java -jar` ではなく、systemd経由でSpring
Bootが起動していることを確認した。

------------------------------------------------------------------------

## 7. EC2起動時の自動起動を有効化

``` bash
sudo systemctl enable recordhub-backend
```

結果:

``` text
Created symlink /etc/systemd/system/multi-user.target.wants/recordhub-backend.service → /etc/systemd/system/recordhub-backend.service.
```

### `start` と `enable`

-   `systemctl start`: 今すぐサービスを起動
-   `systemctl enable`: OS起動時にサービスを自動起動する設定

------------------------------------------------------------------------

## 8. EC2再起動による自動起動テスト

AWSコンソールからEC2を再起動。

再起動直後は一時的にMacから接続できなかったが、起動完了後、SSHで
`java -jar` を実行せずMacから直接確認した。

``` bash
curl http://13.196.179.134:8080/api/hello
```

結果:

``` text
Record Hub API is running
```

これにより以下を実証した。

``` text
EC2再起動
  ↓
Amazon Linux起動
  ↓
systemd起動
  ↓
recordhub-backend.service 自動起動
  ↓
Spring Boot起動
  ↓
MacからAPIアクセス成功
```

------------------------------------------------------------------------

## 9. サービス停止と終了コード143

``` bash
sudo systemctl stop recordhub-backend
sudo systemctl status recordhub-backend
```

当初は以下となった。

``` text
Active: failed (Result: exit-code)
status=143
```

Spring
Bootはシャットダウンしていたが、systemdが終了コード143を異常終了として扱っていた。

そこでサービス定義へ追加。

``` ini
SuccessExitStatus=143
```

設定変更後:

``` bash
sudo systemctl daemon-reload
sudo systemctl start recordhub-backend
sudo systemctl stop recordhub-backend
sudo systemctl status recordhub-backend
```

結果:

``` text
Active: inactive (dead)
```

ログでも以下を確認。

``` text
Deactivated successfully.
Stopped recordhub-backend.service - Record Hub Backend.
```

通常停止を正常終了として扱えるようになった。

------------------------------------------------------------------------

## 10. systemctlの基本操作

``` bash
# 状態確認
sudo systemctl status recordhub-backend

# 起動
sudo systemctl start recordhub-backend

# 停止
sudo systemctl stop recordhub-backend

# 再起動
sudo systemctl restart recordhub-backend

# OS起動時の自動起動
sudo systemctl enable recordhub-backend
```

`restart`
は、今後JARを新しいバージョンへ差し替えた後などにも利用できる。

------------------------------------------------------------------------

## 11. journalctlによるログ確認

``` bash
sudo journalctl -u recordhub-backend
```

systemdによるサービス起動、Spring
Bootの起動、停止、EC2再起動後の自動起動などのログを確認した。

EC2再起動部分には以下の区切りが記録されていた。

``` text
-- Boot xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --
```

その後に、

``` text
Started recordhub-backend.service - Record Hub Backend.
```

が記録されており、EC2再起動後の自動起動をログ上でも確認できた。

最新50行:

``` bash
sudo journalctl -u recordhub-backend -n 50
```

リアルタイム監視:

``` bash
sudo journalctl -u recordhub-backend -f
```

------------------------------------------------------------------------

## 12. 第2フェーズ完了時の構成

``` text
Mac
 │ HTTP :8080
 ▼
AWS セキュリティグループ
 │
 ▼
EC2 / Amazon Linux
 │
 └── systemd
      │
      └── recordhub-backend.service
           │
           └── /usr/bin/java -jar
                │
                └── /opt/recordhub/
                     └── backend-0.0.1-SNAPSHOT.jar
                          │
                          └── Spring Boot / Tomcat :8080
```

------------------------------------------------------------------------

## 13. 第2フェーズで学んだこと

-   Linux上でのアプリ配置
-   `/opt` の用途
-   `systemd` の役割
-   `.service` ファイルの作成
-   `systemctl daemon-reload`
-   `start / stop / restart / status`
-   `enable` によるOS起動時の自動起動
-   EC2再起動後のSpring Boot自動起動
-   Javaの終了コード143
-   `SuccessExitStatus`
-   `journalctl` によるログ確認

------------------------------------------------------------------------

## 14. 第2フェーズ完了

**ゴール: Spring
Bootをsystemdサービスとして登録し、EC2起動時の自動起動、停止・再起動・状態確認、ログ確認までできる状態を構築。**

第1フェーズ:

``` text
ローカル開発
  ↓
JARビルド
  ↓
EC2へ手動デプロイ
  ↓
外部からAPI疎通
```

第2フェーズ:

``` text
EC2
  ↓
systemd
  ↓
Spring Boot自動起動
  ↓
サービス管理
  ↓
journalctlでログ確認
```

次フェーズでは、現在の `http://<PUBLIC_IP>:8080`
という直接アクセス構成から、より本番環境らしい公開方法へ進める。
