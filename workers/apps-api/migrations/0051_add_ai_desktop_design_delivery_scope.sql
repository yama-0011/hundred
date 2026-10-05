ALTER TABLE ai_desktop_design_deliveries
  ADD COLUMN scope_domain TEXT NOT NULL DEFAULT 'application'
  CHECK (scope_domain IN ('common', 'application', 'infrastructure'));

ALTER TABLE ai_desktop_design_deliveries
  ADD COLUMN scope_phase TEXT NOT NULL DEFAULT 'basic-design'
  CHECK (scope_phase IN ('common', 'planning', 'requirements', 'basic-design', 'detailed-design', 'implementation', 'test', 'release', 'operation', 'research'));

CREATE INDEX idx_ai_desktop_design_deliveries_scope
  ON ai_desktop_design_deliveries(project_id, scope_domain, scope_phase, updated_at DESC);
