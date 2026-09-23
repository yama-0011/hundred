CREATE TABLE ai_desktop_content_drafts (
  draft_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('category', 'content')),
  service_id TEXT NOT NULL CHECK (service_id IN ('chatgpt', 'codex', 'claude')),
  category_id TEXT NOT NULL,
  content_id TEXT,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'editing' CHECK (status IN ('editing', 'review', 'applied')),
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_ai_desktop_content_drafts_target
  ON ai_desktop_content_drafts(service_id, category_id, content_id, updated_at DESC);
