PRAGMA foreign_keys = ON;

-- Cron・手動実行ごとの結果を、管理画面で確認できる監査履歴として保存する。
CREATE TABLE anigram_instagram_sync_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cron', 'manual')),
  triggered_by_user_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  processed_connections INTEGER NOT NULL CHECK (processed_connections >= 0),
  succeeded_connections INTEGER NOT NULL CHECK (succeeded_connections >= 0),
  failed_connections INTEGER NOT NULL CHECK (failed_connections >= 0),
  stories_checked INTEGER NOT NULL CHECK (stories_checked >= 0),
  reaction_increase INTEGER NOT NULL CHECK (reaction_increase >= 0),
  applied_points REAL NOT NULL CHECK (applied_points >= 0),
  failures_json TEXT NOT NULL DEFAULT '[]',
  started_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL
);

CREATE INDEX idx_anigram_instagram_sync_runs_completed
ON anigram_instagram_sync_runs(completed_at DESC);
