PRAGMA foreign_keys = ON;

CREATE TABLE anigram_story_renders (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  image_key TEXT NOT NULL,
  image_content_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  browser_ms_used INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_anigram_story_renders_created
  ON anigram_story_renders(created_at DESC);
