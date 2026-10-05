-- 基本設計を、標準8種類と追加可能な独自設計書へ分割する。
DROP INDEX IF EXISTS idx_ai_desktop_design_documents_project_basic_design;
DROP INDEX IF EXISTS idx_ai_desktop_design_templates_project_basic_design;

UPDATE ai_desktop_design_documents
SET document_type = 'system-overview',
    title = CASE WHEN title IN ('システム全体設計書', 'システム設計書') THEN 'システム概要設計書' ELSE title END,
    template_id = CASE WHEN template_id = 'master-common-basic-system-design' THEN 'master-common-basic-system-overview' ELSE template_id END
WHERE domain = 'common' AND phase = 'basic-design' AND document_type = 'system-design';

UPDATE ai_desktop_design_documents
SET document_type = 'custom',
    title = CASE WHEN title = 'アプリ基本設計書' THEN '旧アプリ基本設計書' ELSE title END
WHERE domain = 'application' AND phase = 'basic-design' AND document_type = 'basic-design';

UPDATE ai_desktop_design_documents
SET document_type = 'table-design',
    title = CASE WHEN title IN ('DB設計書', 'データベース設計書') THEN 'テーブル設計書' ELSE title END,
    template_id = CASE WHEN template_id = 'master-application-database-design' THEN 'master-application-table-design' ELSE template_id END
WHERE domain = 'application' AND phase = 'detailed-design' AND document_type = 'database-design';

UPDATE ai_desktop_design_templates
SET document_type = 'system-overview',
    name = CASE WHEN name IN ('システム全体設計書テンプレート', 'システム全体設計書（Project用）') THEN 'システム概要設計書テンプレート' ELSE name END
WHERE domain = 'common' AND phase = 'basic-design' AND document_type = 'system-design';

UPDATE ai_desktop_design_templates
SET document_type = 'custom',
    name = CASE WHEN name = 'アプリ基本設計書テンプレート' THEN '旧アプリ基本設計書テンプレート' ELSE name END
WHERE domain = 'application' AND phase = 'basic-design' AND document_type = 'basic-design';

UPDATE ai_desktop_design_templates
SET document_type = 'table-design',
    name = CASE WHEN name IN ('DB設計書テンプレート', 'DB設計書（Project用）') THEN 'テーブル設計書テンプレート' ELSE name END
WHERE domain = 'application' AND phase = 'detailed-design' AND document_type = 'database-design';

CREATE UNIQUE INDEX idx_ai_desktop_design_documents_standard_basic_design
  ON ai_desktop_design_documents(project_id, domain, phase, document_type)
  WHERE phase = 'basic-design' AND document_type <> 'custom';

CREATE UNIQUE INDEX idx_ai_desktop_design_documents_custom_basic_design_name
  ON ai_desktop_design_documents(project_id, domain, phase, lower(trim(title)))
  WHERE phase = 'basic-design' AND document_type = 'custom';
