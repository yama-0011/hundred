import type { AIDesktopProjectsEnv } from './ai-desktop-projects';

type MasterTemplateRow = {
  master_template_id: string;
  name: string;
  description: string;
  domain: string;
  phase: string;
  document_type: string;
  standard_category_key: string | null;
  sort_order: number;
  version: number;
  content_json: string | null;
  is_active: number;
  allow_multiple: number;
  create_by_default: number;
  created_at: number;
  updated_at: number;
};

function fromRow(row: MasterTemplateRow) {
  return {
    id: row.master_template_id,
    name: row.name,
    description: row.description,
    domain: row.domain,
    phase: row.phase,
    documentType: row.document_type,
    standardCategoryKey: row.standard_category_key,
    sortOrder: row.sort_order,
    version: row.version,
    content: row.content_json ? JSON.parse(row.content_json) as unknown : null,
    isActive: Boolean(row.is_active),
    allowMultiple: Boolean(row.allow_multiple),
    createByDefault: Boolean(row.create_by_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAIDesktopDesignMasterTemplates(env: AIDesktopProjectsEnv) {
  const result = await env.DB.prepare(`SELECT *
    FROM ai_desktop_design_master_templates
    ORDER BY phase, sort_order, name`).all<MasterTemplateRow>();
  return { masterTemplates: result.results.map(fromRow) };
}
