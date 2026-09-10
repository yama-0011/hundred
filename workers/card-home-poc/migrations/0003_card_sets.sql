CREATE TABLE card_sets (
  set_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  release_date TEXT,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(length(set_id) BETWEEN 2 AND 20),
  CHECK(length(name) BETWEEN 1 AND 80),
  CHECK(release_date IS NULL OR release_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);

CREATE UNIQUE INDEX card_sets_sort_order ON card_sets(sort_order);

INSERT INTO card_sets (set_id, name, release_date, sort_order)
VALUES ('BS01', '第1弾', NULL, 1);
