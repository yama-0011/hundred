CREATE TABLE ai_desktop_projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'proposal', 'design', 'development', 'review', 'completed', 'on-hold')),
  design_notes TEXT NOT NULL DEFAULT '',
  development_notes TEXT NOT NULL DEFAULT '',
  related_documents_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_ai_desktop_projects_updated_at
  ON ai_desktop_projects(updated_at DESC);
