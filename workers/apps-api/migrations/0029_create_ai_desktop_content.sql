CREATE TABLE ai_desktop_catalogs (
  service_id TEXT PRIMARY KEY CHECK (service_id IN ('chatgpt', 'codex', 'claude')),
  catalog_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
