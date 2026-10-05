CREATE UNIQUE INDEX idx_ai_desktop_design_templates_project_classification
  ON ai_desktop_design_templates(project_id, domain, phase, document_type);
