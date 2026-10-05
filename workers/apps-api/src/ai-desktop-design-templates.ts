import type { AIDesktopProjectActor, AIDesktopProjectsEnv } from './ai-desktop-projects';
import { maxContentBytes } from './ai-desktop-design-documents';

const domains = new Set(['common', 'application', 'infrastructure']);
const phases = new Set(['common', 'planning', 'requirements', 'basic-design', 'detailed-design', 'implementation', 'test', 'release', 'operation', 'research']);

type TemplateInput = {
  projectId: string;
  name: string;
  description: string;
  domain: string;
  phase: string;
  documentType: string;
  version: number;
  content: Record<string, unknown>;
};

type TemplateRow = {
  template_id: string;
  project_id: string;
  project_name: string;
  name: string;
  description: string;
  domain: string;
  phase: string;
  document_type: string;
  version: number;
  content_json: string;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
  can_edit: number;
};

export class AIDesktopDesignTemplateError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'TOO_LARGE') {
    super(code);
    this.name = 'AIDesktopDesignTemplateError';
  }
}

async function requireAvailableClassification(env: AIDesktopProjectsEnv, input: TemplateInput, excludedTemplateId?: string) {
  const master = await env.DB.prepare(`SELECT master_template_id FROM ai_desktop_design_master_templates
    WHERE domain = ? AND phase = ? AND document_type = ? AND is_active = 1`)
    .bind(input.domain, input.phase, input.documentType).first();
  if (!master) throw new AIDesktopDesignTemplateError('INVALID_INPUT');
  const row = await env.DB.prepare(`SELECT template_id FROM ai_desktop_design_templates
    WHERE project_id = ? AND domain = ? AND phase = ? AND document_type = ?
      AND (? IS NULL OR template_id <> ?)
    LIMIT 1`).bind(input.projectId, input.domain, input.phase, input.documentType, excludedTemplateId ?? null, excludedTemplateId ?? null).first();
  if (row) throw new AIDesktopDesignTemplateError('CONFLICT');
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const requiredText = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
const validPage = (value: unknown) => isRecord(value) && requiredText(value.id, 300) && requiredText(value.navTitle, 200) && Array.isArray(value.blocks) && value.blocks.length <= 300;
const validContent = (value: Record<string, unknown>) => validPage(value) || (value.schemaVersion === 2 && Array.isArray(value.pages) && value.pages.length > 0 && value.pages.length <= 100 && value.pages.every(validPage));

function validateInput(value: unknown): TemplateInput {
  if (!isRecord(value) || !requiredText(value.projectId, 100) || !requiredText(value.name, 200) || !text(value.description, 2_000) || !domains.has(String(value.domain)) || !phases.has(String(value.phase)) || !requiredText(value.documentType, 100) || !Number.isInteger(value.version) || Number(value.version) < 1 || Number(value.version) > 1_000 || !isRecord(value.content)) throw new AIDesktopDesignTemplateError('INVALID_INPUT');
  const content = value.content;
  if (!validContent(content)) throw new AIDesktopDesignTemplateError('INVALID_INPUT');
  // D1の1行の上限は2MB（バイト単位）。文書と同じく1.5MBまでとする。
  if (new TextEncoder().encode(JSON.stringify(content)).length > maxContentBytes) throw new AIDesktopDesignTemplateError('TOO_LARGE');
  return { projectId: String(value.projectId), name: String(value.name).trim(), description: String(value.description).trim(), domain: String(value.domain), phase: String(value.phase), documentType: String(value.documentType), version: Number(value.version), content: content as TemplateInput['content'] };
}

async function requireProjectOwner(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, projectId: string) {
  const row = await env.DB.prepare(`SELECT project.project_id FROM ai_desktop_projects project
    WHERE project.project_id = ? AND (project.created_by = ? OR EXISTS (
      SELECT 1 FROM ai_desktop_project_members member
      WHERE member.project_id = project.project_id AND member.user_id = ? AND (member.role = 'owner' OR member.can_edit = 1)
    ))`).bind(projectId, actor.username, actor.ownerUserId).first();
  if (!row) throw new AIDesktopDesignTemplateError('FORBIDDEN');
}

const selectTemplate = `SELECT template.*, project.name AS project_name,
  CASE WHEN project.created_by = ? OR EXISTS (
    SELECT 1 FROM ai_desktop_project_members owner_member
    WHERE owner_member.project_id = project.project_id AND owner_member.user_id = ? AND (owner_member.role = 'owner' OR owner_member.can_edit = 1)
  ) THEN 1 ELSE 0 END AS can_edit
  FROM ai_desktop_design_templates template
  JOIN ai_desktop_projects project ON project.project_id = template.project_id`;

function fromRow(row: TemplateRow) {
  return { id: row.template_id, projectId: row.project_id, projectName: row.project_name, name: row.name, description: row.description, domain: row.domain, phase: row.phase, documentType: row.document_type, version: row.version, content: JSON.parse(row.content_json) as unknown, canEdit: Boolean(row.can_edit), createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listAIDesktopDesignTemplates(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  const result = await env.DB.prepare(`${selectTemplate}
    WHERE project.created_by = ? OR EXISTS (
      SELECT 1 FROM ai_desktop_project_members member
      WHERE member.project_id = project.project_id AND member.user_id = ?
    ) ORDER BY template.updated_at DESC LIMIT 300`).bind(actor.username, actor.ownerUserId, actor.username, actor.ownerUserId).all<TemplateRow>();
  return { templates: result.results.map(fromRow) };
}

async function getTemplate(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const row = await env.DB.prepare(`${selectTemplate}
    WHERE template.template_id = ? AND (project.created_by = ? OR EXISTS (
      SELECT 1 FROM ai_desktop_project_members member
      WHERE member.project_id = project.project_id AND member.user_id = ?
    ))`).bind(actor.username, actor.ownerUserId, id, actor.username, actor.ownerUserId).first<TemplateRow>();
  if (!row) throw new AIDesktopDesignTemplateError('NOT_FOUND');
  return { template: fromRow(row) };
}

export async function createAIDesktopDesignTemplate(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  const input = validateInput(await request.json());
  await requireProjectOwner(env, actor, input.projectId);
  await requireAvailableClassification(env, input);
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO ai_desktop_design_templates
    (template_id, project_id, name, description, domain, phase, document_type, version, content_json, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.projectId, input.name, input.description, input.domain, input.phase, input.documentType, input.version, JSON.stringify(input.content), actor.username, actor.username, now, now).run();
  return getTemplate(env, actor, id);
}

export async function updateAIDesktopDesignTemplate(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const existing = await getTemplate(env, actor, id);
  if (!existing.template.canEdit) throw new AIDesktopDesignTemplateError('FORBIDDEN');
  const input = validateInput(await request.json());
  if (input.projectId !== existing.template.projectId) throw new AIDesktopDesignTemplateError('INVALID_INPUT');
  const classificationChanged = input.domain !== existing.template.domain || input.phase !== existing.template.phase || input.documentType !== existing.template.documentType;
  if (classificationChanged) await requireAvailableClassification(env, input, id);
  const now = Date.now();
  const result = await env.DB.prepare(`UPDATE ai_desktop_design_templates SET name = ?, description = ?, domain = ?, phase = ?, document_type = ?, version = ?, content_json = ?, updated_by = ?, updated_at = ? WHERE template_id = ?`)
    .bind(input.name, input.description, input.domain, input.phase, input.documentType, input.version, JSON.stringify(input.content), actor.username, now, id).run();
  if (!result.meta.changes) throw new AIDesktopDesignTemplateError('NOT_FOUND');
  return getTemplate(env, actor, id);
}

export async function deleteAIDesktopDesignTemplate(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const existing = await getTemplate(env, actor, id);
  if (!existing.template.canEdit) throw new AIDesktopDesignTemplateError('FORBIDDEN');
  const result = await env.DB.prepare('DELETE FROM ai_desktop_design_templates WHERE template_id = ?').bind(id).run();
  if (!result.meta.changes) throw new AIDesktopDesignTemplateError('NOT_FOUND');
  return { deleted: true, templateId: id };
}
