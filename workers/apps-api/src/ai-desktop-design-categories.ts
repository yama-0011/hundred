import type { AIDesktopProjectActor, AIDesktopProjectsEnv } from './ai-desktop-projects';

const standardNames = new Map([
  ['planning', '企画'],
  ['requirements', '要件定義'],
  ['basic-design', '基本設計'],
  ['detailed-design', '詳細設計'],
  ['implementation', '実装'],
  ['test', 'テスト'],
  ['release', 'リリース'],
  ['operation', '運用'],
  ['research', '調査'],
  ['common', '設計判断（ADR）'],
]);

type CategoryRow = {
  category_id: string;
  project_id: string;
  name: string;
  standard_key: string | null;
  sort_order: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  can_edit: number;
};

type CategoryInput = {
  projectId: string;
  name: string;
  standardKey: string | null;
  sortOrder: number;
};

export class AIDesktopDesignCategoryError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT') {
    super(code);
    this.name = 'AIDesktopDesignCategoryError';
  }
}

function requiredText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function validateInput(value: unknown): CategoryInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AIDesktopDesignCategoryError('INVALID_INPUT');
  const source = value as Record<string, unknown>;
  const standardKey = source.standardKey == null || source.standardKey === '' ? null : String(source.standardKey);
  if (!requiredText(source.projectId, 100) || !requiredText(source.name, 100) || (standardKey !== null && !standardNames.has(standardKey)) || !Number.isInteger(source.sortOrder) || Number(source.sortOrder) < 0 || Number(source.sortOrder) > 100_000) throw new AIDesktopDesignCategoryError('INVALID_INPUT');
  return {
    projectId: String(source.projectId),
    name: standardKey ? standardNames.get(standardKey)! : String(source.name).trim(),
    standardKey,
    sortOrder: Number(source.sortOrder),
  };
}

async function projectAccess(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, projectId: string) {
  const row = await env.DB.prepare(`SELECT project.project_id,
      CASE WHEN project.created_by = ? OR EXISTS (
        SELECT 1 FROM ai_desktop_project_members owner_member
        WHERE owner_member.project_id = project.project_id AND owner_member.user_id = ? AND (owner_member.role = 'owner' OR owner_member.can_edit = 1)
      ) THEN 1 ELSE 0 END AS can_edit
    FROM ai_desktop_projects project
    WHERE project.project_id = ? AND (
      project.created_by = ? OR EXISTS (
        SELECT 1 FROM ai_desktop_project_members member
        WHERE member.project_id = project.project_id AND member.user_id = ?
      )
    )`).bind(actor.username, actor.ownerUserId, projectId, actor.username, actor.ownerUserId).first<{ project_id: string; can_edit: number }>();
  if (!row) throw new AIDesktopDesignCategoryError('NOT_FOUND');
  return { canEdit: Boolean(row.can_edit) };
}

function fromRow(row: CategoryRow) {
  return {
    id: row.category_id,
    projectId: row.project_id,
    name: row.name,
    standardKey: row.standard_key,
    sortOrder: row.sort_order,
    canEdit: Boolean(row.can_edit),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const selectCategory = `SELECT category.*,
  CASE WHEN project.created_by = ? OR EXISTS (
    SELECT 1 FROM ai_desktop_project_members owner_member
    WHERE owner_member.project_id = project.project_id AND owner_member.user_id = ? AND (owner_member.role = 'owner' OR owner_member.can_edit = 1)
  ) THEN 1 ELSE 0 END AS can_edit
  FROM ai_desktop_design_categories category
  JOIN ai_desktop_projects project ON project.project_id = category.project_id`;

export async function listAIDesktopDesignCategories(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  const result = await env.DB.prepare(`${selectCategory}
    WHERE project.created_by = ? OR EXISTS (
      SELECT 1 FROM ai_desktop_project_members member
      WHERE member.project_id = project.project_id AND member.user_id = ?
    )
    ORDER BY category.project_id, category.sort_order, category.created_at`)
    .bind(actor.username, actor.ownerUserId, actor.username, actor.ownerUserId).all<CategoryRow>();
  return { categories: result.results.map(fromRow) };
}

export async function createAIDesktopDesignCategory(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  const input = validateInput(await request.json());
  const access = await projectAccess(env, actor, input.projectId);
  if (!access.canEdit) throw new AIDesktopDesignCategoryError('FORBIDDEN');
  const conflict = await env.DB.prepare(`SELECT category_id FROM ai_desktop_design_categories
    WHERE project_id = ? AND (lower(trim(name)) = lower(trim(?)) OR (? IS NOT NULL AND standard_key = ?)) LIMIT 1`)
    .bind(input.projectId, input.name, input.standardKey, input.standardKey).first();
  if (conflict) throw new AIDesktopDesignCategoryError('CONFLICT');
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO ai_desktop_design_categories
    (category_id, project_id, name, standard_key, sort_order, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.projectId, input.name, input.standardKey, input.sortOrder, actor.username, now, now).run();
  const row = await env.DB.prepare(`${selectCategory} WHERE category.category_id = ?`)
    .bind(actor.username, actor.ownerUserId, id).first<CategoryRow>();
  if (!row) throw new AIDesktopDesignCategoryError('NOT_FOUND');
  return { category: fromRow(row) };
}

export async function updateAIDesktopDesignCategory(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const existing = await env.DB.prepare(`${selectCategory} WHERE category.category_id = ?`)
    .bind(actor.username, actor.ownerUserId, id).first<CategoryRow>();
  if (!existing) throw new AIDesktopDesignCategoryError('NOT_FOUND');
  if (!existing.can_edit) throw new AIDesktopDesignCategoryError('FORBIDDEN');
  const input = validateInput(await request.json());
  if (input.projectId !== existing.project_id || input.standardKey !== existing.standard_key) throw new AIDesktopDesignCategoryError('INVALID_INPUT');
  const conflict = await env.DB.prepare(`SELECT category_id FROM ai_desktop_design_categories
    WHERE project_id = ? AND lower(trim(name)) = lower(trim(?)) AND category_id <> ? LIMIT 1`)
    .bind(input.projectId, input.name, id).first();
  if (conflict) throw new AIDesktopDesignCategoryError('CONFLICT');
  await env.DB.prepare('UPDATE ai_desktop_design_categories SET name = ?, sort_order = ?, updated_at = ? WHERE category_id = ?')
    .bind(input.name, input.sortOrder, Date.now(), id).run();
  const row = await env.DB.prepare(`${selectCategory} WHERE category.category_id = ?`)
    .bind(actor.username, actor.ownerUserId, id).first<CategoryRow>();
  if (!row) throw new AIDesktopDesignCategoryError('NOT_FOUND');
  return { category: fromRow(row) };
}

export async function deleteAIDesktopDesignCategory(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const existing = await env.DB.prepare(`${selectCategory} WHERE category.category_id = ?`)
    .bind(actor.username, actor.ownerUserId, id).first<CategoryRow>();
  if (!existing) throw new AIDesktopDesignCategoryError('NOT_FOUND');
  if (!existing.can_edit) throw new AIDesktopDesignCategoryError('FORBIDDEN');
  await env.DB.batch([
    env.DB.prepare('UPDATE ai_desktop_design_documents SET category_id = NULL WHERE category_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ai_desktop_design_categories WHERE category_id = ?').bind(id),
  ]);
  return { deleted: true, categoryId: id };
}
