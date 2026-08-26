PRAGMA foreign_keys = ON;

CREATE TABLE instagram_story_snapshots (
  owner_user_id TEXT NOT NULL,
  instagram_user_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  media_type TEXT,
  story_published_at INTEGER,
  current_total_interactions INTEGER NOT NULL DEFAULT 0
    CHECK (current_total_interactions >= 0),
  max_total_interactions INTEGER NOT NULL DEFAULT 0
    CHECK (max_total_interactions >= 0),
  total_food_awarded INTEGER NOT NULL DEFAULT 0
    CHECK (total_food_awarded >= 0),
  first_seen_at INTEGER NOT NULL,
  last_checked_at INTEGER NOT NULL,
  PRIMARY KEY (owner_user_id, story_id),
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_instagram_story_snapshots_owner_checked
  ON instagram_story_snapshots(owner_user_id, last_checked_at DESC);

CREATE TABLE instagram_food_events (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  instagram_user_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  observed_total_interactions INTEGER NOT NULL
    CHECK (observed_total_interactions > 0),
  interaction_delta INTEGER NOT NULL
    CHECK (interaction_delta > 0),
  food_amount INTEGER NOT NULL
    CHECK (food_amount > 0),
  created_at INTEGER NOT NULL,
  applied_at INTEGER,
  UNIQUE (owner_user_id, story_id, observed_total_interactions),
  FOREIGN KEY (owner_user_id, story_id)
    REFERENCES instagram_story_snapshots(owner_user_id, story_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_instagram_food_events_owner_created
  ON instagram_food_events(owner_user_id, created_at DESC);

CREATE TABLE hundred_pet_states (
  owner_user_id TEXT PRIMARY KEY,
  species TEXT NOT NULL DEFAULT 'hedgehog',
  life_status TEXT NOT NULL DEFAULT 'alive'
    CHECK (life_status IN ('alive', 'dead', 'evolved')),
  fullness INTEGER NOT NULL DEFAULT 0
    CHECK (fullness BETWEEN 0 AND 100),
  last_fed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);
