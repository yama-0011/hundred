CREATE TABLE ai_desktop_catalogs_next (
  service_id TEXT PRIMARY KEY CHECK (service_id IN ('chatgpt', 'codex', 'claude', 'ai-desktop')),
  catalog_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO ai_desktop_catalogs_next (service_id, catalog_json, updated_at)
SELECT service_id, catalog_json, updated_at
FROM ai_desktop_catalogs;

DROP TABLE ai_desktop_catalogs;
ALTER TABLE ai_desktop_catalogs_next RENAME TO ai_desktop_catalogs;

CREATE TABLE ai_desktop_content_drafts_next (
  draft_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('category', 'content')),
  service_id TEXT NOT NULL CHECK (service_id IN ('chatgpt', 'codex', 'claude', 'ai-desktop')),
  category_id TEXT NOT NULL,
  content_id TEXT,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'editing' CHECK (status IN ('editing', 'review', 'applied')),
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO ai_desktop_content_drafts_next (
  draft_key,
  scope,
  service_id,
  category_id,
  content_id,
  payload_json,
  revision,
  status,
  updated_by,
  created_at,
  updated_at
)
SELECT
  draft_key,
  scope,
  service_id,
  category_id,
  content_id,
  payload_json,
  revision,
  status,
  updated_by,
  created_at,
  updated_at
FROM ai_desktop_content_drafts;

DROP TABLE ai_desktop_content_drafts;
ALTER TABLE ai_desktop_content_drafts_next RENAME TO ai_desktop_content_drafts;

CREATE INDEX idx_ai_desktop_content_drafts_target
  ON ai_desktop_content_drafts(service_id, category_id, content_id, updated_at DESC);
