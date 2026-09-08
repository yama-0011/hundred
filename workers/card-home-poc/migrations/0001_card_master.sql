-- Published snapshots are immutable. Editing a deck creates a new deck ID.
CREATE TABLE master_releases (
  version TEXT PRIMARY KEY,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  sha256 TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE decks (
  deck_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  master_version TEXT NOT NULL REFERENCES master_releases(version),
  cards_json TEXT NOT NULL CHECK(json_valid(cards_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER master_no_update BEFORE UPDATE ON master_releases BEGIN SELECT RAISE(ABORT, 'published_master_is_immutable'); END;
CREATE TRIGGER master_no_delete BEFORE DELETE ON master_releases BEGIN SELECT RAISE(ABORT, 'published_master_is_immutable'); END;
CREATE TRIGGER deck_no_update BEFORE UPDATE ON decks BEGIN SELECT RAISE(ABORT, 'saved_deck_is_immutable'); END;
CREATE TRIGGER deck_no_delete BEFORE DELETE ON decks BEGIN SELECT RAISE(ABORT, 'saved_deck_is_immutable'); END;
