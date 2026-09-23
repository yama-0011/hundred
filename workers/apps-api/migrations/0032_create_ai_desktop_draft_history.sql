CREATE TABLE ai_desktop_content_draft_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_key TEXT NOT NULL,
  service_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  content_title TEXT NOT NULL,
  revision INTEGER NOT NULL,
  saved_by TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);

CREATE INDEX idx_ai_desktop_draft_history_recent
  ON ai_desktop_content_draft_history(service_id, category_id, saved_at DESC);
