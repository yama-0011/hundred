import type { AIDesktopProjectActor, AIDesktopProjectsEnv } from './ai-desktop-projects';

export const maxContentBytes = 1_500_000;
const domains = new Set(['common', 'application', 'infrastructure']);
const phases = new Set(['common', 'planning', 'requirements', 'basic-design', 'detailed-design', 'implementation', 'test', 'release', 'operation', 'research']);
const statuses = new Set(['draft', 'review', 'approved']);

type DesignDocumentRow = {
  design_document_id: string;
  project_id: string;
  project_name: string;
  title: string;
  domain: string;
  phase: string;
  document_type: string;
  template_id: string;
  template_version: number;
  category_id: string | null;
  status: string;
  content_json: string;
  created_by: string;
  updated_by: string;
  updated_by_name: string | null;
  created_at: number;
  updated_at: number;
  can_edit: number;
  format: DesignDocumentFormat;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  file_content_type: string | null;
};

type DesignDocumentFormat = 'document' | 'pdf' | 'word' | 'excel';

// ファイルの取り込みと編集中の記録で使う。ファイル本体は既存のR2バケットへ保存する。
export type AIDesktopDesignDocumentsEnv = AIDesktopProjectsEnv & { MEDIA: R2Bucket };

type DesignDocumentInput = {
  projectId: string;
  title: string;
  domain: string;
  phase: string;
  documentType: string;
  templateId: string;
  templateVersion: number;
  categoryId: string | null;
  status: string;
  content: Record<string, unknown>;
};

export class AIDesktopDesignDocumentError extends Error {
  // LOCKED のときは、編集中の人と最後に接続を確認した時刻を lock に入れる。
  constructor(readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'STALE' | 'LOCKED' | 'TOO_LARGE', readonly lock?: { name: string; lastSeenAt: number; canTakeOver: boolean }) {
    super(code);
    this.name = 'AIDesktopDesignDocumentError';
  }
}

async function requireAvailableDocumentType(env: AIDesktopProjectsEnv, input: DesignDocumentInput, excludedDocumentId?: string) {
  const master = await env.DB.prepare(`SELECT allow_multiple FROM ai_desktop_design_master_templates
    WHERE domain = ? AND phase = ? AND document_type = ? AND is_active = 1`)
    .bind(input.domain, input.phase, input.documentType).first<{ allow_multiple: number }>();
  if (!master) throw new AIDesktopDesignDocumentError('INVALID_INPUT');
  const row = await env.DB.prepare(`SELECT design_document_id FROM ai_desktop_design_documents
    WHERE project_id = ? AND domain = ? AND phase = ? AND (
      (? = 1 AND document_type = ? AND lower(trim(title)) = lower(trim(?))) OR
      (? = 0 AND document_type = ?)
    )
      AND (? IS NULL OR design_document_id <> ?)
    LIMIT 1`).bind(input.projectId, input.domain, input.phase, master.allow_multiple, input.documentType, input.title, master.allow_multiple, input.documentType, excludedDocumentId ?? null, excludedDocumentId ?? null).first();
  if (row) throw new AIDesktopDesignDocumentError('CONFLICT');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function validPage(value: unknown) {
  return isRecord(value) && requiredText(value.id, 300) && requiredText(value.navTitle, 200) && Array.isArray(value.blocks) && value.blocks.length <= 300;
}

function validContent(value: Record<string, unknown>) {
  if (validPage(value)) return true;
  return value.schemaVersion === 2 && Array.isArray(value.pages) && value.pages.length > 0 && value.pages.length <= 100 && value.pages.every(validPage);
}

function validateInput(value: unknown): DesignDocumentInput {
  if (!isRecord(value) || !requiredText(value.projectId, 100) || !requiredText(value.title, 200) || !domains.has(String(value.domain)) || !phases.has(String(value.phase)) || !requiredText(value.documentType, 100) || !requiredText(value.templateId, 150) || !Number.isInteger(value.templateVersion) || Number(value.templateVersion) < 1 || Number(value.templateVersion) > 1_000 || !statuses.has(String(value.status)) || !isRecord(value.content)) throw new AIDesktopDesignDocumentError('INVALID_INPUT');
  const content = value.content;
  if (!validContent(content)) throw new AIDesktopDesignDocumentError('INVALID_INPUT');
  const serialized = JSON.stringify(content);
  // D1の1行の上限は2MB（バイト単位）。成果物に内容をコピーする分の余裕を残し、1.5MBまでとする。
  if (new TextEncoder().encode(serialized).length > maxContentBytes) throw new AIDesktopDesignDocumentError('TOO_LARGE');
  return {
    projectId: String(value.projectId), title: String(value.title).trim(), domain: String(value.domain), phase: String(value.phase), documentType: String(value.documentType), templateId: String(value.templateId), templateVersion: Number(value.templateVersion), status: String(value.status), categoryId: typeof value.categoryId === 'string' && value.categoryId ? value.categoryId : null,
    content: content as DesignDocumentInput['content'],
  };
}

async function requireCategory(env: AIDesktopProjectsEnv, projectId: string, categoryId: string | null) {
  if (!categoryId) return;
  const row = await env.DB.prepare('SELECT category_id FROM ai_desktop_design_categories WHERE category_id = ? AND project_id = ?').bind(categoryId, projectId).first();
  if (!row) throw new AIDesktopDesignDocumentError('INVALID_INPUT');
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
  if (!row) throw new AIDesktopDesignDocumentError('NOT_FOUND');
  return { canEdit: Boolean(row.can_edit) };
}

function fromRow(row: DesignDocumentRow, includeContent: boolean) {
  return {
    id: row.design_document_id,
    projectId: row.project_id,
    projectName: row.project_name,
    title: row.title,
    domain: row.domain,
    phase: row.phase,
    documentType: row.document_type,
    templateId: row.template_id,
    templateVersion: row.template_version,
    categoryId: row.category_id,
    status: row.status,
    ...(includeContent ? { content: JSON.parse(row.content_json) as unknown } : {}),
    canEdit: Boolean(row.can_edit),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name || row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    format: row.format,
    file: row.format === 'document' ? null : { name: row.file_name ?? '', size: row.file_size ?? 0, contentType: row.file_content_type ?? 'application/octet-stream' },
  };
}

const selectDocument = `SELECT document.*, project.name AS project_name,
  (SELECT NULLIF(directory.display_name, '') FROM hundred_user_directory directory
    WHERE directory.username = document.updated_by LIMIT 1) AS updated_by_name,
  CASE WHEN project.created_by = ? OR EXISTS (
    SELECT 1 FROM ai_desktop_project_members owner_member
    WHERE owner_member.project_id = project.project_id AND owner_member.user_id = ? AND (owner_member.role = 'owner' OR owner_member.can_edit = 1)
  ) THEN 1 ELSE 0 END AS can_edit
  FROM ai_desktop_design_documents document
  JOIN ai_desktop_projects project ON project.project_id = document.project_id`;

export async function listAIDesktopDesignDocuments(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  const result = await env.DB.prepare(`${selectDocument}
    WHERE project.created_by = ? OR EXISTS (
      SELECT 1 FROM ai_desktop_project_members member
      WHERE member.project_id = project.project_id AND member.user_id = ?
    )
    ORDER BY document.updated_at DESC LIMIT 300`).bind(actor.username, actor.ownerUserId, actor.username, actor.ownerUserId).all<DesignDocumentRow>();
  const editors = await activeEditors(env, actor, result.results.map((row) => row.design_document_id));
  const states = await deliveryStates(env, actor, result.results, null);
  return { documents: result.results.map((row) => ({ ...fromRow(row, false), editingBy: editorNames(editors.get(row.design_document_id)), deliveryState: states.get(row.design_document_id) ?? 'none' })) };
}

export async function getAIDesktopDesignDocument(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const row = await env.DB.prepare(`${selectDocument}
    WHERE document.design_document_id = ? AND (
      project.created_by = ? OR EXISTS (
        SELECT 1 FROM ai_desktop_project_members member
        WHERE member.project_id = project.project_id AND member.user_id = ?
      )
    )`).bind(actor.username, actor.ownerUserId, id, actor.username, actor.ownerUserId).first<DesignDocumentRow>();
  if (!row) throw new AIDesktopDesignDocumentError('NOT_FOUND');
  const editors = await activeEditors(env, actor, [id]);
  const states = await deliveryStates(env, actor, [row], id);
  return { document: { ...fromRow(row, true), editingBy: editorNames(editors.get(id)), editingLock: editors.get(id) ?? null, deliveryState: states.get(id) ?? 'none' } };
}

/**
 * 成果物との関係から、文書の状態を自動で決める。
 * - none: プロジェクトに成果物がまだない（個人開発などで成果物を使わない場合は何も表示しない）
 * - unsubmitted: まだどの成果物にも含まれていない
 * - latest: その文書を含む最新の成果物と、中身が同じ
 * - changed: 最新の成果物を作ったあとに、中身が変わった
 * 名前だけの変更や、変更なしの保存では changed にしないため、更新日時ではなく中身で比べる。
 */
type DeliveryState = 'none' | 'unsubmitted' | 'latest' | 'changed';
// マイグレーションで作った文書は書式が異なる場合があるため、読み直して同じ書式にそろえてから比べる。
const normalizedJson = (value: string) => { try { return JSON.stringify(JSON.parse(value)); } catch { return value; } };
async function deliveryStates(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, rows: DesignDocumentRow[], documentId: string | null) {
  const states = new Map<string, DeliveryState>();
  if (!rows.length) return states;
  const access = `(project.created_by = ? OR EXISTS (SELECT 1 FROM ai_desktop_project_members member WHERE member.project_id = project.project_id AND member.user_id = ?))`;
  const [projects, items] = await Promise.all([
    env.DB.prepare(`SELECT DISTINCT delivery.project_id FROM ai_desktop_design_deliveries delivery JOIN ai_desktop_projects project ON project.project_id = delivery.project_id WHERE ${access}`)
      .bind(actor.username, actor.ownerUserId).all<{ project_id: string }>(),
    env.DB.prepare(`SELECT item.design_document_id, item.snapshot_json FROM ai_desktop_design_delivery_items item
      JOIN ai_desktop_design_documents document ON document.design_document_id = item.design_document_id
      JOIN ai_desktop_projects project ON project.project_id = document.project_id
      WHERE ${access} AND (? IS NULL OR item.design_document_id = ?)
        AND item.added_at = (SELECT MAX(latest.added_at) FROM ai_desktop_design_delivery_items latest WHERE latest.design_document_id = item.design_document_id)`)
      .bind(actor.username, actor.ownerUserId, documentId, documentId).all<{ design_document_id: string; snapshot_json: string }>(),
  ]);
  const projectsWithDeliveries = new Set(projects.results.map((item) => item.project_id));
  const latestContent = new Map(items.results.map((item) => {
    try { return [item.design_document_id, JSON.stringify((JSON.parse(item.snapshot_json) as { content?: unknown }).content)] as const; } catch { return [item.design_document_id, ''] as const; }
  }));
  for (const row of rows) {
    if (!projectsWithDeliveries.has(row.project_id)) states.set(row.design_document_id, 'none');
    else if (!latestContent.has(row.design_document_id)) states.set(row.design_document_id, 'unsubmitted');
    else states.set(row.design_document_id, latestContent.get(row.design_document_id) === normalizedJson(row.content_json) ? 'latest' : 'changed');
  }
  return states;
}

export async function createAIDesktopDesignDocument(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  const input = validateInput(await request.json());
  const access = await projectAccess(env, actor, input.projectId);
  if (!access.canEdit) throw new AIDesktopDesignDocumentError('FORBIDDEN');
  await requireCategory(env, input.projectId, input.categoryId);
  await requireAvailableDocumentType(env, input);
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO ai_desktop_design_documents
    (design_document_id, project_id, title, domain, phase, document_type, template_id, template_version, status, content_json, created_by, updated_by, created_at, updated_at, category_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.projectId, input.title, input.domain, input.phase, input.documentType, input.templateId, input.templateVersion, input.status, JSON.stringify(input.content), actor.username, actor.username, now, now, input.categoryId).run();
  return getAIDesktopDesignDocument(env, actor, id);
}

export async function updateAIDesktopDesignDocument(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const existing = await getAIDesktopDesignDocument(env, actor, id);
  if (!existing.document.canEdit) throw new AIDesktopDesignDocumentError('FORBIDDEN');
  await requireNotLockedByOthers(env, actor, id);
  const body: unknown = await request.json();
  if (existing.document.format !== 'document') return updateFileDocument(env, actor, existing.document, body);
  const input = validateInput(body);
  if (input.projectId !== existing.document.projectId) throw new AIDesktopDesignDocumentError('INVALID_INPUT');
  // 編集を始めた時点の更新日時と比べ、他の画面で保存された内容を上書きしないようにする。
  const expectedUpdatedAt = isRecord(body) && Number.isInteger(body.expectedUpdatedAt) ? Number(body.expectedUpdatedAt) : null;
  if (expectedUpdatedAt !== null && existing.document.updatedAt !== expectedUpdatedAt) throw new AIDesktopDesignDocumentError('STALE');
  await requireCategory(env, input.projectId, input.categoryId);
  const classificationChanged = input.domain !== existing.document.domain || input.phase !== existing.document.phase || input.documentType !== existing.document.documentType;
  if (classificationChanged) await requireAvailableDocumentType(env, input, id);
  else {
    const activeMaster = await env.DB.prepare(`SELECT master_template_id FROM ai_desktop_design_master_templates WHERE domain = ? AND phase = ? AND document_type = ? AND is_active = 1`).bind(input.domain, input.phase, input.documentType).first();
    if (activeMaster) await requireAvailableDocumentType(env, input, id);
  }
  const now = Date.now();
  const result = await env.DB.prepare(`UPDATE ai_desktop_design_documents SET title = ?, domain = ?, phase = ?, document_type = ?, template_id = ?, template_version = ?, status = ?, content_json = ?, updated_by = ?, updated_at = ?, category_id = ? WHERE design_document_id = ? AND (? IS NULL OR updated_at = ?)`)
    .bind(input.title, input.domain, input.phase, input.documentType, input.templateId, input.templateVersion, input.status, JSON.stringify(input.content), actor.username, now, input.categoryId, id, expectedUpdatedAt, expectedUpdatedAt).run();
  if (!result.meta.changes) throw new AIDesktopDesignDocumentError(expectedUpdatedAt === null ? 'NOT_FOUND' : 'STALE');
  return getAIDesktopDesignDocument(env, actor, id);
}

export async function deleteAIDesktopDesignDocument(env: AIDesktopDesignDocumentsEnv, actor: AIDesktopProjectActor, id: string) {
  const existing = await getAIDesktopDesignDocument(env, actor, id);
  if (!existing.document.canEdit) throw new AIDesktopDesignDocumentError('FORBIDDEN');
  await requireNotLockedByOthers(env, actor, id);
  const file = await env.DB.prepare('SELECT file_key FROM ai_desktop_design_documents WHERE design_document_id = ?').bind(id).first<{ file_key: string | null }>();
  const result = await env.DB.prepare('DELETE FROM ai_desktop_design_documents WHERE design_document_id = ?').bind(id).run();
  if (!result.meta.changes) throw new AIDesktopDesignDocumentError('NOT_FOUND');
  // 成果物は追加時点のファイルを参照し続けるため、成果物に含まれているファイルは残す。
  if (file?.file_key) {
    const referenced = await env.DB.prepare('SELECT 1 FROM ai_desktop_design_delivery_items WHERE instr(snapshot_json, ?) > 0 LIMIT 1').bind(file.file_key).first();
    if (!referenced) await env.MEDIA.delete(file.file_key);
  }
  return { deleted: true, designDocumentId: id };
}

const fileFormats: Record<string, { format: Exclude<DesignDocumentFormat, 'document'>; contentType: string }> = {
  pdf: { format: 'pdf', contentType: 'application/pdf' },
  doc: { format: 'word', contentType: 'application/msword' },
  docx: { format: 'word', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xls: { format: 'excel', contentType: 'application/vnd.ms-excel' },
  xlsx: { format: 'excel', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xlsm: { format: 'excel', contentType: 'application/vnd.ms-excel.sheet.macroEnabled.12' },
};
const maxFileSize = 25 * 1024 * 1024;

/**
 * 概要: PDF・Word・Excelのファイルをドキュメントとして取り込む。
 * 責務: 形式と容量を確認してR2へ保存し、カテゴリに対応する工程でドキュメントを登録する。
 */
export async function uploadAIDesktopDesignDocumentFile(request: Request, env: AIDesktopDesignDocumentsEnv, actor: AIDesktopProjectActor) {
  const formData = await request.formData();
  const file = formData.get('file');
  const projectId = formData.get('projectId');
  const rawCategoryId = formData.get('categoryId');
  const rawTitle = formData.get('title');
  if (!(file instanceof File) || file.size === 0 || file.size > maxFileSize || !requiredText(projectId, 100)) throw new AIDesktopDesignDocumentError('INVALID_INPUT');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = fileFormats[extension];
  if (!type) throw new AIDesktopDesignDocumentError('INVALID_INPUT');
  const fileName = file.name.slice(0, 200);
  const title = (typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle : fileName.replace(/\.[^.]+$/u, '')).trim().slice(0, 200);
  const categoryId = typeof rawCategoryId === 'string' && rawCategoryId ? rawCategoryId : null;
  const access = await projectAccess(env, actor, String(projectId));
  if (!access.canEdit) throw new AIDesktopDesignDocumentError('FORBIDDEN');
  await requireCategory(env, String(projectId), categoryId);
  const category = categoryId ? await env.DB.prepare('SELECT standard_key FROM ai_desktop_design_categories WHERE category_id = ?').bind(categoryId).first<{ standard_key: string | null }>() : null;
  const phase = category?.standard_key && phases.has(category.standard_key) ? category.standard_key : 'common';
  const id = crypto.randomUUID();
  const fileKey = `ai-desktop/design-documents/${projectId}/${id}.${extension}`;
  await env.MEDIA.put(fileKey, file.stream(), { httpMetadata: { contentType: type.contentType }, customMetadata: { originalName: fileName } });
  const now = Date.now();
  try {
    await env.DB.prepare(`INSERT INTO ai_desktop_design_documents
      (design_document_id, project_id, title, domain, phase, document_type, template_id, template_version, status, content_json, created_by, updated_by, created_at, updated_at, category_id, format, file_key, file_name, file_size, file_content_type)
      VALUES (?, ?, ?, 'common', ?, 'file', '', 1, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, String(projectId), title, phase, JSON.stringify({ schemaVersion: 2, pages: [] }), actor.username, actor.username, now, now, categoryId, type.format, fileKey, fileName, file.size, type.contentType).run();
  } catch (error) {
    await env.MEDIA.delete(fileKey);
    throw error;
  }
  return getAIDesktopDesignDocument(env, actor, id);
}

/** 概要: 取り込んだファイルを返す。 責務: プロジェクトのメンバーだけがファイルを取得できるようにする。 */
export async function getAIDesktopDesignDocumentFile(env: AIDesktopDesignDocumentsEnv, actor: AIDesktopProjectActor, id: string) {
  await getAIDesktopDesignDocument(env, actor, id);
  const row = await env.DB.prepare('SELECT file_key, file_name, file_content_type FROM ai_desktop_design_documents WHERE design_document_id = ?').bind(id).first<{ file_key: string | null; file_name: string | null; file_content_type: string | null }>();
  if (!row?.file_key) throw new AIDesktopDesignDocumentError('NOT_FOUND');
  const object = await env.MEDIA.get(row.file_key);
  if (!object) throw new AIDesktopDesignDocumentError('NOT_FOUND');
  return { body: object.body, fileName: row.file_name ?? 'document', contentType: row.file_content_type ?? 'application/octet-stream' };
}

async function updateFileDocument(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, existing: ReturnType<typeof fromRow>, body: unknown) {
  if (!isRecord(body) || !requiredText(body.title, 200)) throw new AIDesktopDesignDocumentError('INVALID_INPUT');
  const categoryId = typeof body.categoryId === 'string' && body.categoryId ? body.categoryId : null;
  await requireCategory(env, existing.projectId, categoryId);
  const expectedUpdatedAt = Number.isInteger(body.expectedUpdatedAt) ? Number(body.expectedUpdatedAt) : null;
  if (expectedUpdatedAt !== null && existing.updatedAt !== expectedUpdatedAt) throw new AIDesktopDesignDocumentError('STALE');
  const result = await env.DB.prepare(`UPDATE ai_desktop_design_documents SET title = ?, category_id = ?, updated_by = ?, updated_at = ? WHERE design_document_id = ? AND (? IS NULL OR updated_at = ?)`)
    .bind(String(body.title).trim(), categoryId, actor.username, Date.now(), existing.id, expectedUpdatedAt, expectedUpdatedAt).run();
  if (!result.meta.changes) throw new AIDesktopDesignDocumentError(expectedUpdatedAt === null ? 'NOT_FOUND' : 'STALE');
  return getAIDesktopDesignDocument(env, actor, existing.id);
}

// 編集ロックの時間は wrangler.jsonc の vars で変えられる。
// - AI_DESKTOP_EDIT_LOCK_TIMEOUT_MINUTES: 接続が途絶えてから自動でロックを外すまでの分数（既定30分）
// - AI_DESKTOP_EDIT_LOCK_TAKEOVER_MINUTES: 接続が途絶えてから、ほかの人が引き継げるようになるまでの分数（既定5分）
type EditLockSettingsEnv = { AI_DESKTOP_EDIT_LOCK_TIMEOUT_MINUTES?: string; AI_DESKTOP_EDIT_LOCK_TAKEOVER_MINUTES?: string };
function editLockSettings(env: AIDesktopProjectsEnv) {
  const values = env as unknown as EditLockSettingsEnv;
  const minutes = (value: string | undefined, fallback: number) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 1 && parsed <= 24 * 60 ? parsed : fallback; };
  const timeoutMinutes = minutes(values.AI_DESKTOP_EDIT_LOCK_TIMEOUT_MINUTES, 30);
  const takeoverMinutes = Math.min(minutes(values.AI_DESKTOP_EDIT_LOCK_TAKEOVER_MINUTES, 5), timeoutMinutes);
  return { timeoutMs: timeoutMinutes * 60_000, takeoverMs: takeoverMinutes * 60_000 };
}

type EditLock = { name: string; lastSeenAt: number; canTakeOver: boolean };

/** 概要: ほかの人が編集中かを確認する。 責務: ロック中なら、保存や削除を止めるためにLOCKEDを返す。 */
const editorNames = (lock: EditLock | undefined) => lock ? [lock.name] : [];

async function requireNotLockedByOthers(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const lock = (await activeEditors(env, actor, [id])).get(id);
  if (lock) throw new AIDesktopDesignDocumentError('LOCKED', lock);
}

// 自分以外のロックをドキュメントごとに返す。接続が引き継ぎの時間を超えて途絶えていれば、引き継げることも返す。
async function activeEditors(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, documentIds: string[]) {
  const editors = new Map<string, EditLock>();
  if (!documentIds.length) return editors;
  const { timeoutMs, takeoverMs } = editLockSettings(env);
  const now = Date.now();
  const result = await env.DB.prepare(`SELECT editor.design_document_id, editor.heartbeat_at, COALESCE(NULLIF(directory.display_name, ''), directory.username, editor.username) AS display_name
    FROM ai_desktop_design_document_editors editor
    LEFT JOIN hundred_user_directory directory ON directory.user_id = editor.user_id
    WHERE editor.heartbeat_at > ? AND editor.user_id <> ?
    ORDER BY editor.heartbeat_at DESC`).bind(now - timeoutMs, actor.ownerUserId).all<{ design_document_id: string; heartbeat_at: number; display_name: string }>();
  const ids = new Set(documentIds);
  for (const row of result.results) {
    if (!ids.has(row.design_document_id) || editors.has(row.design_document_id)) continue;
    editors.set(row.design_document_id, { name: row.display_name, lastSeenAt: row.heartbeat_at, canTakeOver: row.heartbeat_at <= now - takeoverMs });
  }
  return editors;
}

/**
 * 概要: ドキュメントの編集ロックを取得・延長する。
 * 責務: ほかの人がロック中でなければ自分のロックを記録する。ロック中ならLOCKEDを返し、記録しない。
 * 引き継ぎを求められ、ロックしている人の接続が一定時間途絶えている場合は、そのロックを外してから取得する。
 */
export async function markAIDesktopDesignDocumentEditing(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const existing = await getAIDesktopDesignDocument(env, actor, id);
  if (!existing.document.canEdit) throw new AIDesktopDesignDocumentError('FORBIDDEN');
  const body: unknown = await request.json().catch(() => null);
  const { timeoutMs, takeoverMs } = editLockSettings(env);
  const now = Date.now();
  const expiredBefore = now - timeoutMs;
  if (isRecord(body) && body.takeover === true) {
    await env.DB.prepare('DELETE FROM ai_desktop_design_document_editors WHERE design_document_id = ? AND user_id <> ? AND heartbeat_at <= ?').bind(id, actor.ownerUserId, now - takeoverMs).run();
  }
  // ほかの人の有効なロックがない場合だけ記録する。確認と記録を1つのSQLで行い、同時に取得しようとしても1人だけが通る。
  const result = await env.DB.prepare(`INSERT INTO ai_desktop_design_document_editors (design_document_id, user_id, username, started_at, heartbeat_at)
    SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (
      SELECT 1 FROM ai_desktop_design_document_editors WHERE design_document_id = ? AND user_id <> ? AND heartbeat_at > ?
    )
    ON CONFLICT(design_document_id, user_id) DO UPDATE SET heartbeat_at = excluded.heartbeat_at,
      started_at = CASE WHEN ai_desktop_design_document_editors.heartbeat_at > ? THEN ai_desktop_design_document_editors.started_at ELSE excluded.started_at END`)
    .bind(id, actor.ownerUserId, actor.username, now, now, id, actor.ownerUserId, expiredBefore, expiredBefore).run();
  if (!result.meta.changes) await requireNotLockedByOthers(env, actor, id);
  await env.DB.prepare('DELETE FROM ai_desktop_design_document_editors WHERE heartbeat_at < ?').bind(now - 24 * 60 * 60 * 1000).run();
  return { locked: true, expiresAt: now + timeoutMs };
}

/** 概要: 編集画面を閉じたことを記録する。 責務: 自分の編集中の記録だけを削除する。 */
export async function clearAIDesktopDesignDocumentEditing(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  await env.DB.prepare('DELETE FROM ai_desktop_design_document_editors WHERE design_document_id = ? AND user_id = ?').bind(id, actor.ownerUserId).run();
  return { cleared: true };
}
