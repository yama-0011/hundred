PRAGMA foreign_keys = ON;

-- Instagram自動配信の条件を独立して保持する。
-- メッセージ・画像・投稿先の詳細は、配信処理を実装する段階で拡張する。
CREATE TABLE anigram_instagram_delivery_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  species TEXT NOT NULL,
  delivery_time TEXT NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  updated_by_user_id TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (species)
    REFERENCES anigram_species_settings(species)
);

INSERT INTO anigram_instagram_delivery_settings (
  id, enabled, species, delivery_time, timezone,
  updated_by_user_id, updated_at
)
VALUES (
  1,
  0,
  'hedgehog',
  '09:00',
  'Asia/Tokyo',
  NULL,
  CAST(unixepoch('subsec') * 1000 AS INTEGER)
);
