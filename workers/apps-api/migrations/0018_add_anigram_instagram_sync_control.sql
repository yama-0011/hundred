PRAGMA foreign_keys = ON;

-- Cron Trigger自体は維持したまま、Instagram APIへのアクセスを運用画面から停止する。
ALTER TABLE anigram_instagram_delivery_settings
ADD COLUMN reaction_sync_enabled INTEGER NOT NULL DEFAULT 1
CHECK (reaction_sync_enabled IN (0, 1));

ALTER TABLE anigram_instagram_delivery_settings
ADD COLUMN sync_pause_reason TEXT;

ALTER TABLE anigram_instagram_delivery_settings
ADD COLUMN sync_paused_by_user_id TEXT;

ALTER TABLE anigram_instagram_delivery_settings
ADD COLUMN sync_paused_at INTEGER;

ALTER TABLE anigram_instagram_delivery_settings
ADD COLUMN last_sync_at INTEGER;

ALTER TABLE anigram_instagram_delivery_settings
ADD COLUMN last_sync_status TEXT
CHECK (last_sync_status IN ('success', 'partial', 'failed'));
