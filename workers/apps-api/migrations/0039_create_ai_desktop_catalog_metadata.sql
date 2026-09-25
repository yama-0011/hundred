CREATE TABLE ai_desktop_catalogs_dynamic (
  service_id TEXT PRIMARY KEY,
  catalog_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO ai_desktop_catalogs_dynamic (service_id, catalog_json, updated_at)
SELECT service_id, catalog_json, updated_at FROM ai_desktop_catalogs;

DROP TABLE ai_desktop_catalogs;
ALTER TABLE ai_desktop_catalogs_dynamic RENAME TO ai_desktop_catalogs;

CREATE TABLE ai_desktop_content_drafts_dynamic (
  draft_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('category', 'content')),
  service_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  content_id TEXT,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'editing' CHECK (status IN ('editing', 'review', 'applied')),
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO ai_desktop_content_drafts_dynamic
SELECT * FROM ai_desktop_content_drafts;

DROP TABLE ai_desktop_content_drafts;
ALTER TABLE ai_desktop_content_drafts_dynamic RENAME TO ai_desktop_content_drafts;

CREATE INDEX idx_ai_desktop_content_drafts_target
  ON ai_desktop_content_drafts(service_id, category_id, content_id, updated_at DESC);

CREATE TABLE ai_desktop_documents_dynamic (
  document_key TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'unpublished')),
  visibility TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('private', 'team', 'link')),
  owner_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  published_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  UNIQUE (service_id, category_id, content_id)
);

INSERT INTO ai_desktop_documents_dynamic
SELECT * FROM ai_desktop_documents;

DROP TABLE ai_desktop_documents;
ALTER TABLE ai_desktop_documents_dynamic RENAME TO ai_desktop_documents;

CREATE INDEX idx_ai_desktop_documents_status_updated
  ON ai_desktop_documents(status, updated_at DESC);
CREATE INDEX idx_ai_desktop_documents_owner_updated
  ON ai_desktop_documents(owner_id, updated_at DESC);

CREATE TABLE ai_desktop_catalog_metadata (
  service_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'unpublished')),
  owner_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  published_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE INDEX idx_ai_desktop_catalog_metadata_status_updated
  ON ai_desktop_catalog_metadata(status, updated_at DESC);
