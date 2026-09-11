PRAGMA foreign_keys = ON;

-- 初期版の進化先を設定データとして管理し、ゲームロジックへの固定を避ける。
ALTER TABLE anigram_species_settings
ADD COLUMN next_evolution_stage TEXT NOT NULL DEFAULT 'stage_2';

-- 管理画面から行われたゲームバランス変更の監査履歴。
CREATE TABLE anigram_settings_history (
  id TEXT PRIMARY KEY,
  species TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  previous_settings_json TEXT NOT NULL,
  next_settings_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (species)
    REFERENCES anigram_species_settings(species),
  FOREIGN KEY (updated_by_user_id)
    REFERENCES users(owner_user_id)
);

CREATE INDEX idx_anigram_settings_history_species_updated
  ON anigram_settings_history(species, updated_at DESC);

-- 管理画面の閲覧は公開し、更新権限だけをこの登録簿で管理する。
CREATE TABLE anigram_admin_users (
  user_id TEXT PRIMARY KEY,
  registered_by_user_id TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO anigram_admin_users (user_id, registered_by_user_id, created_at)
VALUES
  (
    'google_111775636874477287570',
    NULL,
    CAST(unixepoch('subsec') * 1000 AS INTEGER)
  ),
  (
    '2704da88-b051-703c-954f-61783444551b',
    NULL,
    CAST(unixepoch('subsec') * 1000 AS INTEGER)
  );
