CREATE TABLE ai_desktop_design_deliveries (
  delivery_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'exported', 'submitted', 'resubmission', 'completed')),
  recipient TEXT NOT NULL DEFAULT '',
  delivery_method TEXT NOT NULL DEFAULT '',
  submitted_at INTEGER,
  received_at INTEGER,
  inspection_at INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id)
    REFERENCES ai_desktop_projects(project_id)
    ON DELETE CASCADE
);

CREATE TABLE ai_desktop_design_delivery_items (
  delivery_item_id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  design_document_id TEXT,
  document_title TEXT NOT NULL,
  domain TEXT NOT NULL,
  phase TEXT NOT NULL,
  document_type TEXT NOT NULL,
  source_updated_at INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  FOREIGN KEY (delivery_id)
    REFERENCES ai_desktop_design_deliveries(delivery_id)
    ON DELETE CASCADE,
  FOREIGN KEY (design_document_id)
    REFERENCES ai_desktop_design_documents(design_document_id)
    ON DELETE SET NULL,
  UNIQUE (delivery_id, design_document_id)
);

CREATE INDEX idx_ai_desktop_design_deliveries_project_updated
  ON ai_desktop_design_deliveries(project_id, updated_at DESC);

CREATE INDEX idx_ai_desktop_design_delivery_items_delivery_order
  ON ai_desktop_design_delivery_items(delivery_id, sort_order);
