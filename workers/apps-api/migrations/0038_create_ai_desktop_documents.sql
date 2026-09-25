CREATE TABLE ai_desktop_documents (
  document_key TEXT PRIMARY KEY,
  service_id TEXT NOT NULL CHECK (service_id IN ('chatgpt', 'codex', 'claude', 'ai-desktop')),
  category_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'unpublished')),
  visibility TEXT NOT NULL DEFAULT 'team'
    CHECK (visibility IN ('private', 'team', 'link')),
  owner_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  published_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  UNIQUE (service_id, category_id, content_id)
);

CREATE INDEX idx_ai_desktop_documents_status_updated
  ON ai_desktop_documents(status, updated_at DESC);

CREATE INDEX idx_ai_desktop_documents_owner_updated
  ON ai_desktop_documents(owner_id, updated_at DESC);
