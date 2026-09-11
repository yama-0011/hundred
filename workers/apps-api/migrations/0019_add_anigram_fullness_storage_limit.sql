PRAGMA foreign_keys = ON;

-- 表示上の100%を超えて反応を蓄積できる上限。初期値は120%。
ALTER TABLE anigram_species_settings
ADD COLUMN fullness_storage_limit_percent REAL NOT NULL DEFAULT 120
  CHECK (fullness_storage_limit_percent BETWEEN 100 AND 500);
