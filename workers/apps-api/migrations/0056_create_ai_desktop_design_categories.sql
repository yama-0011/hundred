CREATE TABLE ai_desktop_design_categories (
  category_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  standard_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES ai_desktop_projects(project_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_ai_desktop_design_categories_standard
  ON ai_desktop_design_categories(project_id, standard_key)
  WHERE standard_key IS NOT NULL;

CREATE UNIQUE INDEX idx_ai_desktop_design_categories_name
  ON ai_desktop_design_categories(project_id, lower(trim(name)));

CREATE INDEX idx_ai_desktop_design_categories_project_sort
  ON ai_desktop_design_categories(project_id, sort_order, created_at);

ALTER TABLE ai_desktop_design_documents ADD COLUMN category_id TEXT;
CREATE INDEX idx_ai_desktop_design_documents_category
  ON ai_desktop_design_documents(category_id, updated_at DESC);

ALTER TABLE ai_desktop_design_master_templates ADD COLUMN standard_category_key TEXT;
UPDATE ai_desktop_design_master_templates SET standard_category_key = phase;

-- 既存資料だけは、現在の工程を同名の標準カテゴリへ移行する。
-- 新規プロジェクトにはカテゴリを自動作成しない。
INSERT INTO ai_desktop_design_categories
  (category_id, project_id, name, standard_key, sort_order, created_by, created_at, updated_at)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  document.project_id,
  CASE document.phase
    WHEN 'common' THEN '設計判断（ADR）'
    WHEN 'planning' THEN '企画'
    WHEN 'requirements' THEN '要件定義'
    WHEN 'basic-design' THEN '基本設計'
    WHEN 'detailed-design' THEN '詳細設計'
    WHEN 'implementation' THEN '実装'
    WHEN 'test' THEN 'テスト'
    WHEN 'release' THEN 'リリース'
    WHEN 'operation' THEN '運用'
    WHEN 'research' THEN '調査'
  END,
  document.phase,
  CASE document.phase
    WHEN 'planning' THEN 10 WHEN 'requirements' THEN 20 WHEN 'basic-design' THEN 30
    WHEN 'detailed-design' THEN 40 WHEN 'implementation' THEN 50 WHEN 'test' THEN 60
    WHEN 'release' THEN 70 WHEN 'operation' THEN 80 WHEN 'research' THEN 90 ELSE 100
  END,
  MIN(document.created_by), MIN(document.created_at), MAX(document.updated_at)
FROM ai_desktop_design_documents document
GROUP BY document.project_id, document.phase;

UPDATE ai_desktop_design_documents
SET category_id = (
  SELECT category.category_id
  FROM ai_desktop_design_categories category
  WHERE category.project_id = ai_desktop_design_documents.project_id
    AND category.standard_key = ai_desktop_design_documents.phase
);
