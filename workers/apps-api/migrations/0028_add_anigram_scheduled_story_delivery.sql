PRAGMA foreign_keys = ON;

ALTER TABLE anigram_instagram_delivery_settings
  ADD COLUMN publisher_user_id TEXT
  REFERENCES users(owner_user_id)
  ON DELETE SET NULL;

ALTER TABLE anigram_instagram_delivery_settings
  ADD COLUMN last_delivery_at INTEGER;

ALTER TABLE anigram_instagram_delivery_settings
  ADD COLUMN last_delivery_status TEXT
  CHECK (last_delivery_status IN ('published', 'failed'));

ALTER TABLE anigram_instagram_delivery_settings
  ADD COLUMN last_delivery_error_code TEXT;

UPDATE anigram_instagram_delivery_settings
   SET publisher_user_id = updated_by_user_id
 WHERE id = 1
   AND updated_by_user_id IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM users
      WHERE owner_user_id = updated_by_user_id
   );

CREATE TABLE anigram_instagram_delivery_runs (
  id TEXT PRIMARY KEY,
  delivery_slot TEXT NOT NULL UNIQUE,
  publisher_user_id TEXT,
  publication_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'published', 'failed')),
  error_code TEXT,
  scheduled_for INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (publisher_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE SET NULL,
  FOREIGN KEY (publication_id)
    REFERENCES anigram_instagram_story_publications(id)
    ON DELETE SET NULL
);

CREATE INDEX idx_anigram_delivery_runs_started
  ON anigram_instagram_delivery_runs(started_at DESC);
