UPDATE ai_desktop_design_master_templates
SET
  description = '目的、対象範囲、利用者、機能・データ・連携要件と受入条件を整理します。',
  version = 3,
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE master_template_id = 'master-common-requirements-requirements';

UPDATE ai_desktop_design_master_templates
SET
  description = '性能、可用性、セキュリティ、運用などの品質要件と判定基準を整理します。',
  version = 3,
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE master_template_id = 'master-common-requirements-non-functional';
