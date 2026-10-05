UPDATE ai_desktop_design_documents
SET phase = CASE
  WHEN domain = 'application' AND document_type IN ('external-design', 'ui-design') THEN 'basic-design'
  WHEN domain = 'application' AND document_type IN ('internal-design', 'api-design', 'database-design') THEN 'detailed-design'
  WHEN domain = 'application' AND document_type = 'test-specification' THEN 'test'
  WHEN domain = 'common' AND document_type = 'project-plan' THEN 'planning'
  WHEN domain = 'common' AND document_type IN ('requirements', 'non-functional') THEN 'requirements'
  WHEN domain = 'common' AND document_type = 'system-design' THEN 'basic-design'
  WHEN domain = 'common' AND document_type = 'implementation-policy' THEN 'implementation'
  WHEN domain = 'common' AND document_type = 'release-plan' THEN 'release'
  WHEN domain = 'common' AND document_type = 'operation-procedure' THEN 'operation'
  WHEN domain = 'common' AND document_type = 'adr' THEN 'common'
  WHEN domain = 'common' AND document_type = 'research' THEN 'research'
  WHEN domain = 'infrastructure' AND document_type IN ('cloud-architecture', 'network-design') THEN 'basic-design'
  WHEN domain = 'infrastructure' AND document_type IN ('iam-design', 'monitoring-design', 'backup-dr') THEN 'detailed-design'
  WHEN domain = 'infrastructure' AND document_type = 'operation-design' THEN 'operation'
  ELSE phase
END;

UPDATE ai_desktop_design_templates
SET phase = CASE
  WHEN domain = 'application' AND document_type IN ('external-design', 'ui-design') THEN 'basic-design'
  WHEN domain = 'application' AND document_type IN ('internal-design', 'api-design', 'database-design') THEN 'detailed-design'
  WHEN domain = 'application' AND document_type = 'test-specification' THEN 'test'
  WHEN domain = 'common' AND document_type = 'project-plan' THEN 'planning'
  WHEN domain = 'common' AND document_type IN ('requirements', 'non-functional') THEN 'requirements'
  WHEN domain = 'common' AND document_type = 'system-design' THEN 'basic-design'
  WHEN domain = 'common' AND document_type = 'implementation-policy' THEN 'implementation'
  WHEN domain = 'common' AND document_type = 'release-plan' THEN 'release'
  WHEN domain = 'common' AND document_type = 'operation-procedure' THEN 'operation'
  WHEN domain = 'common' AND document_type = 'adr' THEN 'common'
  WHEN domain = 'common' AND document_type = 'research' THEN 'research'
  WHEN domain = 'infrastructure' AND document_type IN ('cloud-architecture', 'network-design') THEN 'basic-design'
  WHEN domain = 'infrastructure' AND document_type IN ('iam-design', 'monitoring-design', 'backup-dr') THEN 'detailed-design'
  WHEN domain = 'infrastructure' AND document_type = 'operation-design' THEN 'operation'
  ELSE phase
END;
