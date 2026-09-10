CREATE TABLE card_visual_drafts_next (
  card_id TEXT PRIMARY KEY,
  master_version TEXT NOT NULL REFERENCES master_releases(version),
  object_key TEXT NOT NULL,
  image_version INTEGER NOT NULL CHECK(image_version > 0),
  position_x REAL NOT NULL DEFAULT 0.5 CHECK(position_x BETWEEN 0 AND 1),
  position_y REAL NOT NULL DEFAULT 0.5 CHECK(position_y BETWEEN 0 AND 1),
  scale REAL NOT NULL DEFAULT 1 CHECK(scale BETWEEN 0.5 AND 3),
  template_id TEXT NOT NULL DEFAULT 'red-spirit-v1',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO card_visual_drafts_next SELECT * FROM card_visual_drafts;
DROP TABLE card_visual_drafts;
ALTER TABLE card_visual_drafts_next RENAME TO card_visual_drafts;

