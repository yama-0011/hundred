PRAGMA foreign_keys = ON;

CREATE TABLE creative_ia_reference_items (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  source_url TEXT,
  description TEXT NOT NULL DEFAULT '',
  attributes_json TEXT NOT NULL DEFAULT '{}',
  ai_notes TEXT NOT NULL DEFAULT '',
  ai_enabled INTEGER NOT NULL DEFAULT 1 CHECK (ai_enabled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_creative_ia_reference_items_owner_category_updated
  ON creative_ia_reference_items(owner_user_id, category, updated_at DESC);

CREATE INDEX idx_creative_ia_reference_items_owner_name
  ON creative_ia_reference_items(owner_user_id, name);
