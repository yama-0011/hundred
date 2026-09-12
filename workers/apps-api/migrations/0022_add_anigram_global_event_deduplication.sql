PRAGMA foreign_keys = ON;

-- 共有ペットでは、同じ外部反応をCognitoユーザーごとに加算しない。
-- claim_tokenは、その処理が重複判定キーを最初に確保したことを確認するために使う。
CREATE TABLE anigram_growth_event_claims (
  source TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  claim_token TEXT NOT NULL UNIQUE,
  first_owner_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (source, external_event_id)
);

-- 既存履歴は削除せず、各外部反応の最初の記録を重複判定の正本として引き継ぐ。
INSERT OR IGNORE INTO anigram_growth_event_claims (
  source,
  external_event_id,
  claim_token,
  first_owner_user_id,
  created_at
)
SELECT
  source,
  external_event_id,
  id,
  owner_user_id,
  created_at
FROM anigram_growth_events
ORDER BY created_at ASC, id ASC;
