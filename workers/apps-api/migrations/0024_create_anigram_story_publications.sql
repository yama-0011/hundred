PRAGMA foreign_keys = ON;

CREATE TABLE anigram_instagram_story_publications (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  image_key TEXT NOT NULL,
  image_content_type TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('processing', 'published', 'failed')),
  container_id TEXT,
  instagram_media_id TEXT,
  provider_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_anigram_story_one_processing_per_owner
  ON anigram_instagram_story_publications(owner_user_id)
  WHERE status = 'processing';

CREATE INDEX idx_anigram_story_publications_created
  ON anigram_instagram_story_publications(created_at DESC);
