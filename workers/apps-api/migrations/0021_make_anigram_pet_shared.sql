PRAGMA foreign_keys = ON;

-- Anigram全体で育てる共有ペットを1匹だけ選択する。
-- owner_user_idは既存イベントの反応元を追跡するために残し、
-- ゲーム状態の参照先はこのシングルトンを正本とする。
CREATE TABLE anigram_shared_pet (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pet_id TEXT NOT NULL UNIQUE,
  selected_at INTEGER NOT NULL,
  FOREIGN KEY (pet_id)
    REFERENCES anigram_pets(id)
    ON DELETE CASCADE
);

-- 既存環境では、累計反映ポイントが最も多いペットを共有ペットとして引き継ぐ。
-- 同点の場合は直近で更新されたペットを優先する。
INSERT INTO anigram_shared_pet (id, pet_id, selected_at)
SELECT
  1,
  pet.id,
  CAST(unixepoch('subsec') * 1000 AS INTEGER)
FROM anigram_pets AS pet
LEFT JOIN anigram_growth_events AS growth
  ON growth.pet_id = pet.id
GROUP BY pet.id
ORDER BY COALESCE(SUM(growth.applied_points), 0) DESC, pet.updated_at DESC
LIMIT 1;

CREATE INDEX idx_anigram_growth_events_pet_applied
  ON anigram_growth_events(pet_id, applied_at DESC);
