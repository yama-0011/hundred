# データベース

> AI Desktopが生成したファイルです。直接編集せず、AI Desktopで変更してください。

## users
分類：Cloudflare D1・Hundred共通
Hundredの利用者を所有者IDで登録します。Apple Intelligenceのチャットなど、利用者に紐づくデータの基点です。

```sql
CREATE TABLE users (
  owner_user_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

## hundred_user_directory
分類：Cloudflare D1・Hundred共通
Hundredの利用者一覧です。メンバー検索と、更新者などの表示名に使います。表示名は、現在AI Desktopを開いたときに同期しています。

```sql
CREATE TABLE hundred_user_directory (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL,
  display_name TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_hundred_user_directory_display_name
  ON hundred_user_directory(display_name COLLATE NOCASE);
CREATE INDEX idx_hundred_user_directory_username
  ON hundred_user_directory(username COLLATE NOCASE);
```

## apple_intelligence_chats
分類：Cloudflare D1・Apple Intelligence
Hundred共通のApple Intelligenceとの会話です。どのAppから開いたかをapp_idとrouteに記録します。

```sql
CREATE TABLE apple_intelligence_chats (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  app_id TEXT NOT NULL CHECK (app_id IN ('hundred', 'ai-desktop', 'creative-ia', 'anigram', 'card-home', 'record-hub')),
  route TEXT NOT NULL DEFAULT '/',
  title TEXT NOT NULL DEFAULT '新しいチャット',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_apple_intelligence_chats_owner_updated
  ON apple_intelligence_chats(owner_user_id, updated_at DESC);
```

## apple_intelligence_chat_messages
分類：Cloudflare D1・Apple Intelligence
会話のメッセージと、回答時に読み取ったファイルの一覧です。

```sql
CREATE TABLE apple_intelligence_chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('assistant', 'user')),
  content TEXT NOT NULL,
  files_read_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (chat_id)
    REFERENCES apple_intelligence_chats(id)
    ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_apple_intelligence_messages_chat_created
  ON apple_intelligence_chat_messages(chat_id, created_at);
```
