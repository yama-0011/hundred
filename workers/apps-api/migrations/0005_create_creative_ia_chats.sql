PRAGMA foreign_keys = ON;

CREATE TABLE creative_ia_chats (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  article_title TEXT NOT NULL DEFAULT '',
  article_content TEXT NOT NULL DEFAULT '',
  article_excerpt TEXT NOT NULL DEFAULT '',
  article_warnings_json TEXT NOT NULL DEFAULT '[]',
  article_model TEXT,
  production_memos_json TEXT NOT NULL DEFAULT '[]',
  applied_rule_ids_json TEXT NOT NULL DEFAULT '[]',
  saved_draft_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_creative_ia_chats_owner_updated
  ON creative_ia_chats(owner_user_id, updated_at DESC);

CREATE TABLE creative_ia_chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('assistant', 'user')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (chat_id)
    REFERENCES creative_ia_chats(id)
    ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_creative_ia_chat_messages_chat_created
  ON creative_ia_chat_messages(chat_id, created_at);

CREATE INDEX idx_creative_ia_chat_messages_owner
  ON creative_ia_chat_messages(owner_user_id);
