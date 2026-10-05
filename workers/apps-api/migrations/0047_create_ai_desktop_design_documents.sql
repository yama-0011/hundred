CREATE TABLE ai_desktop_design_documents (
  design_document_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('common', 'application', 'infrastructure')),
  phase TEXT NOT NULL CHECK (phase IN ('common', 'planning', 'requirements', 'basic-design', 'detailed-design', 'implementation', 'test', 'release', 'operation', 'research')),
  document_type TEXT NOT NULL,
  template_id TEXT NOT NULL DEFAULT '',
  template_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved')),
  content_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id)
    REFERENCES ai_desktop_projects(project_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_ai_desktop_design_documents_project_updated
  ON ai_desktop_design_documents(project_id, updated_at DESC);

CREATE INDEX idx_ai_desktop_design_documents_updated
  ON ai_desktop_design_documents(updated_at DESC);
