PRAGMA foreign_keys = ON;

-- Instagram連携の技術検証テーブルと分離した、Anigramゲーム本体の正本。
CREATE TABLE anigram_species_settings (
  species TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  hatch_required_points INTEGER NOT NULL CHECK (hatch_required_points > 0),
  hatching_duration_seconds INTEGER NOT NULL
    CHECK (hatching_duration_seconds >= 0),
  initial_fullness_points REAL NOT NULL CHECK (initial_fullness_points >= 0),
  max_fullness_points REAL NOT NULL CHECK (max_fullness_points > 0),
  fullness_decay_rate_per_hour REAL NOT NULL
    CHECK (fullness_decay_rate_per_hour >= 0),
  starvation_grace_seconds INTEGER NOT NULL
    CHECK (starvation_grace_seconds >= 0),
  evolution_fullness_threshold REAL NOT NULL
    CHECK (evolution_fullness_threshold BETWEEN 0 AND 1),
  evolution_hold_seconds INTEGER NOT NULL CHECK (evolution_hold_seconds >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Phase 1技術検証用の初期値。管理機能実装後はコード変更なしで調整する。
INSERT INTO anigram_species_settings (
  species,
  display_name,
  hatch_required_points,
  hatching_duration_seconds,
  initial_fullness_points,
  max_fullness_points,
  fullness_decay_rate_per_hour,
  starvation_grace_seconds,
  evolution_fullness_threshold,
  evolution_hold_seconds,
  created_at,
  updated_at
) VALUES (
  'hedgehog',
  'ハリネズミ',
  5,
  30,
  80,
  100,
  0.01,
  86400,
  0.9,
  604800,
  CAST(unixepoch('subsec') * 1000 AS INTEGER),
  CAST(unixepoch('subsec') * 1000 AS INTEGER)
);

CREATE TABLE anigram_pets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL UNIQUE,
  species TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'alive'
    CHECK (status IN ('alive', 'dead')),
  life_stage TEXT NOT NULL DEFAULT 'egg'
    CHECK (life_stage IN ('egg', 'hatching', 'baby', 'adult')),
  evolution_stage TEXT NOT NULL DEFAULT 'base',
  hatch_points REAL NOT NULL DEFAULT 0 CHECK (hatch_points >= 0),
  fullness_points REAL NOT NULL DEFAULT 0 CHECK (fullness_points >= 0),
  state_calculated_at INTEGER NOT NULL,
  last_fed_at INTEGER,
  hatching_started_at INTEGER,
  hatched_at INTEGER,
  zero_started_at INTEGER,
  evolution_started_at INTEGER,
  died_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (species)
    REFERENCES anigram_species_settings(species)
);

CREATE INDEX idx_anigram_pets_status_stage
  ON anigram_pets(status, life_stage, updated_at);

CREATE TABLE anigram_growth_events (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  reaction_type TEXT,
  applied_target TEXT NOT NULL
    CHECK (applied_target IN ('hatch', 'fullness', 'ignored')),
  requested_points REAL NOT NULL CHECK (requested_points >= 0),
  applied_points REAL NOT NULL CHECK (applied_points >= 0),
  occurred_at INTEGER NOT NULL,
  applied_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (owner_user_id, source, external_event_id),
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (pet_id)
    REFERENCES anigram_pets(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_anigram_growth_events_owner_applied
  ON anigram_growth_events(owner_user_id, applied_at DESC);

CREATE TABLE anigram_state_history (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  previous_value TEXT,
  next_value TEXT,
  reason TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (pet_id)
    REFERENCES anigram_pets(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_anigram_state_history_pet_occurred
  ON anigram_state_history(pet_id, occurred_at DESC);
