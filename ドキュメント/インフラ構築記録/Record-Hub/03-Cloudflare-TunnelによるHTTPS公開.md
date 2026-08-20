# Record Hub AWS 第3フェーズ構築記録

## 1. 第3フェーズの目的

第3フェーズでは、EC2の可変パブリックIPへ直接アクセスする構成から、独自ドメインを使ってRecord Hub APIへアクセスできる構成へ変更した。

今回のゴールは以下。

```text
https://api.yamahit.com
        ↓
Cloudflare
        ↓
Cloudflare Tunnel
        ↓
EC2
        ↓
Nginx :80
        ↓
Spring Boot :8080
```

EC2のパブリックIPが停止・起動などによって変更されても、利用者がEC2のIPアドレスを意識せず `api.yamahit.com` からアクセスできる状態を目指した。

また、固定パブリックIPとしてElastic IPを利用する案も検討したが、継続的なIPv4コストを避けるため、Cloudflare Tunnelを採用した。

---

## 2. 第3フェーズ開始時の構成

開始時点では、MacからEC2のパブリックIPを指定してSpring Boot APIへアクセスしていた。

```text
Mac
 ↓
http://EC2-PUBLIC-IP:8080
 ↓
Security Group
 ↓
EC2
 ↓
Spring Boot :8080
```

この構成では、EC2のパブリックIPが変更された場合、アクセス先も変更する必要がある。

そこで、独自ドメインとCloudflare Tunnelを利用して、EC2のパブリックIPへ依存しない公開経路を構築することにした。

---

## 3. Nginxの導入

EC2へNginxをインストールした。

```bash
sudo dnf install nginx -y
sudo systemctl start nginx
sudo systemctl status nginx
sudo systemctl enable nginx
```

`Active: active (running)` を確認し、EC2起動時の自動起動も有効化した。

---

## 4. Nginx単体の動作確認

```bash
curl http://localhost
```

Nginxの `Welcome to nginx!` ページが返却され、EC2内部で80番ポートを待ち受けていることを確認した。

---

## 5. Nginxをリバースプロキシとして設定

設定ファイルを編集。

```bash
sudo nano /etc/nginx/nginx.conf
```

80番ポートの `server` ブロック内に以下を追加した。

```nginx
# すべてのHTTPリクエストをSpring Bootへ転送
location / {
    proxy_pass http://127.0.0.1:8080;
}
```

設定チェックを実施。

```bash
sudo nginx -t
```

結果:

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

設定を反映。

```bash
sudo systemctl restart nginx
```

---

## 6. Nginx → Spring Boot の疎通確認

EC2内部から確認。

```bash
curl http://localhost/api/hello
```

結果:

```text
Record Hub API is running
```

これにより以下の経路が正常に動作することを確認した。

```text
localhost:80
    ↓
Nginx
    ↓ proxy_pass
127.0.0.1:8080
    ↓
Spring Boot
```

---

## 7. 外部からNginx経由でアクセス

Security GroupでHTTPの80番ポートを許可し、Macから確認した。

```bash
curl http://EC2-PUBLIC-IP/api/hello
```

結果:

```text
Record Hub API is running
```

---

## 8. Spring Bootの8080番を外部公開から除外

Security GroupからSpring Boot用の8080番インバウンドルールを削除した。

Nginx経由は引き続き成功。

```bash
curl http://EC2-PUBLIC-IP/api/hello
```

Spring Bootへの直接アクセスはタイムアウトすることを確認。

```bash
curl --connect-timeout 5 http://EC2-PUBLIC-IP:8080/api/hello
```

```text
curl: (28) Failed to connect ... port 8080 ... Timeout was reached
```

これにより、外部からはNginxのみを入口とし、Spring Bootの8080番を直接公開しない構成になった。

---

## 9. Cloudflare Zero Trust Freeの設定

Cloudflareで管理している独自ドメイン `yamahit.com` を使用した。

Cloudflare Zero Trustの初期設定を行い、無料の `Zero Trust Free` を選択した。

今回利用する主な役割:

- 独自ドメイン
- DNS
- HTTPS
- Cloudflare Tunnel

---

## 10. Cloudflare Tunnelの作成

Cloudflare Zero Trustから新しい `cloudflared` Tunnelを作成した。

Tunnel名:

```text
recordhub-prod
```

本番環境を示す `prod` を付け、将来的に `recordhub-stg`、`recordhub-dev` などと区別できる命名とした。

---

## 11. EC2へcloudflaredをインストール

Cloudflare公式RPMリポジトリを登録。

```bash
curl -fsSl https://pkg.cloudflare.com/cloudflared.repo | sudo tee /etc/yum.repos.d/cloudflared.repo
sudo yum update
sudo yum install cloudflared
```

バージョン確認。

```bash
cloudflared --version
```

確認時:

```text
cloudflared version 2026.8.2
```

---

## 12. cloudflaredをsystemdサービスとして登録

Cloudflareから発行されたTunnelトークンを利用してサービス登録した。

**Tunnelトークンは秘密情報のため、Git・README・構築記録などには保存しない。**

```bash
sudo cloudflared service install <TUNNEL_TOKEN>
```

結果:

```text
Using Systemd
Linux service for cloudflared installed successfully
```

状態確認。

```bash
sudo systemctl status cloudflared
```

以下を確認した。

```text
Loaded: loaded (...; enabled; ...)
Active: active (running)
Environment is healthy
DNS Resolved successfully
QUIC connection successful
HTTP/2 connection successful
Cloudflare API is reachable
```

---

## 13. Cloudflare Tunnelの通信方式

今回の構成では、CloudflareからEC2のパブリックIPへ直接接続するのではなく、EC2上の `cloudflared` がCloudflareへ外向きにTunnel接続を作る。

```text
EC2
 ↓ outbound
cloudflared
 ↓
Cloudflare
```

そのため、公開APIの接続先としてEC2の可変パブリックIPをCloudflare DNSへ直接登録する必要がない。

---

## 14. 公開アプリケーションルートの設定

`recordhub-prod` Tunnelへ公開アプリケーションルートを追加した。

```text
サブドメイン: api
ドメイン: yamahit.com
パス: *
サービス: HTTP
URL: localhost:80
```

公開ホスト名:

```text
api.yamahit.com
```

転送先:

```text
http://localhost:80
```

Spring Bootへ直接転送せず、Nginxを経由させる。

```text
api.yamahit.com
      ↓
Cloudflare Tunnel
      ↓
localhost:80
      ↓
Nginx
      ↓
localhost:8080
      ↓
Spring Boot
```

---

## 15. 独自ドメイン + HTTPSで疎通確認

Macから実行。

```bash
curl https://api.yamahit.com/api/hello
```

結果:

```text
Record Hub API is running
```

これにより、EC2のパブリックIPを指定せず、独自ドメイン + HTTPSでRecord Hub APIへアクセスできることを確認した。

---

## 16. Tunnelトークンのローテーション

構築途中でTunnelトークンを外部へ露出させてしまったため、セキュリティ対策としてCloudflare側でTunnelトークンを更新した。

Cloudflareの `recordhub-prod` 管理画面から「トークンを更新」を実行。

旧トークンを利用していたEC2側サービスを削除。

```bash
sudo cloudflared service uninstall
```

結果:

```text
Linux service for cloudflared uninstalled successfully
```

新しいTunnelトークンで再登録。

```bash
sudo cloudflared service install <NEW_TUNNEL_TOKEN>
```

結果:

```text
Linux service for cloudflared installed successfully
```

新旧いずれのTunnelトークンも構築記録には残さない。

---

## 17. トークン更新後の確認

EC2で確認。

```bash
sudo systemctl status cloudflared
```

以下を確認。

```text
Active: active (running)
Environment is healthy
QUIC connection successful
HTTP/2 connection successful
Cloudflare API is reachable
```

Macから再度確認。

```bash
curl https://api.yamahit.com/api/hello
```

結果:

```text
Record Hub API is running
```

旧トークン無効化後、新しいトークンを使用したTunnelでも正常に公開できていることを確認した。

---

## 18. 第3フェーズ完了時の構成

```text
Mac / Client
      │
      │ HTTPS
      ▼
api.yamahit.com
      │
      ▼
Cloudflare
├─ DNS
├─ HTTPS
└─ Cloudflare Tunnel
      │
      ▼
EC2
└─ cloudflared
      │
      │ http://localhost:80
      ▼
Nginx :80
      │
      │ proxy_pass
      ▼
Spring Boot :8080
      │
      ▼
Record Hub API
```

EC2上では以下のサービスがsystemd管理下で動作する。

```text
systemd
├─ recordhub-backend.service
│    └─ Spring Boot :8080
├─ nginx.service
│    └─ Nginx :80
└─ cloudflared.service
     └─ Cloudflare Tunnel
```

---

## 19. 第3フェーズで学んだこと

- EC2のパブリックIPが可変であること
- 固定IPとElastic IPの考え方
- 独自ドメインとIPアドレスの関係
- DNSの役割
- Nginxの導入
- HTTP標準ポート80
- Nginxのリバースプロキシ
- `proxy_pass`
- `nginx -t` による設定チェック
- Security Groupで8080番を閉じる意味
- Cloudflare Zero Trust
- Cloudflare Tunnel
- `cloudflared`
- EC2からCloudflareへの外向きTunnel接続
- systemdによるcloudflaredの常駐
- 独自ドメイン `api.yamahit.com`
- HTTPSでのAPI公開
- Tunnelトークンの管理
- 秘密情報をGit等へ保存しないこと
- Tunnelトークンのローテーション

---

## 20. 第3フェーズ完了

第3フェーズのゴール:

**EC2の可変パブリックIPへ依存せず、独自ドメイン `https://api.yamahit.com` からRecord Hub APIへアクセスできる本番公開経路を構築する。**

開始時:

```text
Mac
 ↓
http://EC2-PUBLIC-IP:8080
 ↓
Spring Boot
```

第3フェーズ完了後:

```text
Mac
 ↓
https://api.yamahit.com
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

最終疎通確認:

```bash
curl https://api.yamahit.com/api/hello
```

```text
Record Hub API is running
```

**AWS上のSpring Boot APIを、可変IPを意識せず独自ドメイン + HTTPSで利用できる状態になった。**
