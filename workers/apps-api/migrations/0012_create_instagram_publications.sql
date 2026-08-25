PRAGMA foreign_keys = ON;

CREATE TABLE creative_ia_instagram_publications (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL UNIQUE,
  image_key TEXT NOT NULL,
  image_content_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processing', 'published', 'failed')),
  container_id TEXT,
  instagram_media_id TEXT,
  provider_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (chat_id)
    REFERENCES creative_ia_chats(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_instagram_publications_owner_updated
  ON creative_ia_instagram_publications(owner_user_id, updated_at DESC);
