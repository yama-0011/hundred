PRAGMA foreign_keys = ON;

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

