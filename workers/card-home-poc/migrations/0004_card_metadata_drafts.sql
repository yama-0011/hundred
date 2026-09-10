CREATE TABLE card_metadata_drafts (
  card_id TEXT PRIMARY KEY,
  master_version TEXT NOT NULL REFERENCES master_releases(version),
  set_id TEXT NOT NULL REFERENCES card_sets(set_id),
  name TEXT NOT NULL,
  english_name TEXT NOT NULL DEFAULT '',
  card_type TEXT NOT NULL,
  color TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK(rarity IN ('C','R','X')),
  tribe TEXT NOT NULL DEFAULT '',
  cost INTEGER NOT NULL CHECK(cost BETWEEN 0 AND 12),
  status TEXT NOT NULL DEFAULT 'EDITING' CHECK(status IN ('UNSET','EDITING','LOCKED','COMPLETE')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX card_metadata_drafts_set_id ON card_metadata_drafts(set_id,card_id);
