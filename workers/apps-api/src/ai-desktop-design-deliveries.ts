import type { AIDesktopProjectActor, AIDesktopProjectsEnv } from './ai-desktop-projects';

const statuses = new Set(['preparing', 'exported', 'submitted', 'resubmission', 'completed']);
const scopes = new Set([
  'common:common', 'common:planning', 'common:requirements', 'common:basic-design', 'common:implementation', 'common:release', 'common:operation', 'common:research',
  'application:basic-design', 'application:detailed-design', 'application:test',
  'infrastructure:basic-design', 'infrastructure:detailed-design', 'infrastructure:operation',
]);

type DeliveryInput = {
  projectId: string;
  name: string;
  scopeDomain: string;
  scopePhase: string;
  status: string;
  recipient: string;
  deliveryMethod: string;
  submittedAt: number | null;
  receivedAt: number | null;
  inspectionAt: number | null;
  notes: string;
  documentIds: string[];
};

type DeliveryRow = {
  delivery_id: string;
  project_id: string;
  project_name: string;
  name: string;
  scope_domain: string;
  scope_phase: string;
  status: string;
  recipient: string;
  delivery_method: string;
  submitted_at: number | null;
  received_at: number | null;
  inspection_at: number | null;
  notes: string;
  revision: number;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
  can_edit: number;
  item_count: number;
};

type DeliveryItemRow = {
  delivery_item_id: string;
  delivery_id: string;
  design_document_id: string | null;
  document_title: string;
  domain: string;
  phase: string;
  document_type: string;
  source_updated_at: number;
  snapshot_json: string;
  sort_order: number;
  added_at: number;
};

type DocumentSnapshotRow = {
  design_document_id: string;
  project_id: string;
  title: string;
  domain: string;
  phase: string;
  document_type: string;
  template_id: string;
  template_version: number;
  status: string;
  content_json: string;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
  format: string;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  file_content_type: string | null;
};

export class AIDesktopDesignDeliveryError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'LOCKED') {
    super(code);
    this.name = 'AIDesktopDesignDeliveryError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const requiredText = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
const nullableDate = (value: unknown) => value === null || (Number.isInteger(value) && Number(value) >= 0);

function validateInput(value: unknown): DeliveryInput {
  if (!isRecord(value) || !requiredText(value.projectId, 100) || !requiredText(value.name, 200) || !scopes.has(`${String(value.scopeDomain)}:${String(value.scopePhase)}`) || !statuses.has(String(value.status)) || !text(value.recipient, 300) || !text(value.deliveryMethod, 300) || !nullableDate(value.submittedAt) || !nullableDate(value.receivedAt) || !nullableDate(value.inspectionAt) || !text(value.notes, 10_000) || !Array.isArray(value.documentIds) || value.documentIds.length < 1 || value.documentIds.length > 100 || !value.documentIds.every((id) => requiredText(id, 100))) throw new AIDesktopDesignDeliveryError('INVALID_INPUT');
  const documentIds = value.documentIds.map(String);
  if (new Set(documentIds).size !== documentIds.length) throw new AIDesktopDesignDeliveryError('INVALID_INPUT');
  return {
    projectId: String(value.projectId),
    name: String(value.name).trim(),
    scopeDomain: String(value.scopeDomain),
    scopePhase: String(value.scopePhase),
    status: String(value.status),
    recipient: String(value.recipient).trim(),
    deliveryMethod: String(value.deliveryMethod).trim(),
    submittedAt: value.submittedAt === null ? null : Number(value.submittedAt),
    receivedAt: value.receivedAt === null ? null : Number(value.receivedAt),
    inspectionAt: value.inspectionAt === null ? null : Number(value.inspectionAt),
    notes: String(value.notes).trim(),
    documentIds,
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
  if (!row) throw new AIDesktopDesignDeliveryError('NOT_FOUND');
  return { canEdit: Boolean(row.can_edit) };
}

const selectDelivery = `SELECT delivery.*, project.name AS project_name,
  CASE WHEN project.created_by = ? OR EXISTS (
    SELECT 1 FROM ai_desktop_project_members owner_member
    WHERE owner_member.project_id = project.project_id AND owner_member.user_id = ? AND (owner_member.role = 'owner' OR owner_member.can_edit = 1)
  ) THEN 1 ELSE 0 END AS can_edit,
  (SELECT COUNT(*) FROM ai_desktop_design_delivery_items item WHERE item.delivery_id = delivery.delivery_id) AS item_count
  FROM ai_desktop_design_deliveries delivery
  JOIN ai_desktop_projects project ON project.project_id = delivery.project_id`;

function fromRow(row: DeliveryRow) {
  return {
    id: row.delivery_id,
    projectId: row.project_id,
    projectName: row.project_name,
    name: row.name,
    scopeDomain: row.scope_domain,
    scopePhase: row.scope_phase,
    status: row.status,
    recipient: row.recipient,
    deliveryMethod: row.delivery_method,
    submittedAt: row.submitted_at,
    receivedAt: row.received_at,
    inspectionAt: row.inspection_at,
    notes: row.notes,
    revision: row.revision,
    itemCount: row.item_count,
    canEdit: Boolean(row.can_edit),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function itemFromRow(row: DeliveryItemRow) {
  return {
    id: row.delivery_item_id,
    deliveryId: row.delivery_id,
    designDocumentId: row.design_document_id,
    documentTitle: row.document_title,
    domain: row.domain,
    phase: row.phase,
    documentType: row.document_type,
    sourceUpdatedAt: row.source_updated_at,
    snapshot: JSON.parse(row.snapshot_json) as unknown,
    sortOrder: row.sort_order,
    addedAt: row.added_at,
  };
}

async function deliveryDocuments(env: AIDesktopProjectsEnv, projectId: string, ids: string[]) {
  const placeholders = ids.map(() => '?').join(', ');
  const result = await env.DB.prepare(`SELECT design_document_id, project_id, title, domain, phase, document_type, template_id, template_version, status, content_json, created_by, updated_by, created_at, updated_at, format, file_key, file_name, file_size, file_content_type
    FROM ai_desktop_design_documents WHERE project_id = ? AND design_document_id IN (${placeholders})`).bind(projectId, ...ids).all<DocumentSnapshotRow>();
  const byId = new Map(result.results.map((row) => [row.design_document_id, row]));
  if (byId.size !== ids.length) throw new AIDesktopDesignDeliveryError('NOT_FOUND');
  const ordered = ids.map((id) => byId.get(id)!);
  return ordered;
}

function requireScopeDocument(documents: DocumentSnapshotRow[], input: DeliveryInput) {
  if (!documents.some((document) => document.domain === input.scopeDomain && document.phase === input.scopePhase)) throw new AIDesktopDesignDeliveryError('INVALID_INPUT');
}

function itemStatement(env: AIDesktopProjectsEnv, deliveryId: string, document: DocumentSnapshotRow, sortOrder: number, now: number) {
  const snapshot = {
    id: document.design_document_id,
    title: document.title,
    domain: document.domain,
    phase: document.phase,
    documentType: document.document_type,
    templateId: document.template_id,
    templateVersion: document.template_version,
    status: document.status,
    content: JSON.parse(document.content_json) as unknown,
    format: document.format,
    // ファイルは差し替えずに保存しているため、保存先を記録すれば追加時点の内容を参照できる。
    file: document.format === 'document' ? null : { key: document.file_key, name: document.file_name, size: document.file_size, contentType: document.file_content_type },
    createdBy: document.created_by,
    updatedBy: document.updated_by,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
  return env.DB.prepare(`INSERT INTO ai_desktop_design_delivery_items
    (delivery_item_id, delivery_id, design_document_id, document_title, domain, phase, document_type, source_updated_at, snapshot_json, sort_order, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), deliveryId, document.design_document_id, document.title, document.domain, document.phase, document.document_type, document.updated_at, JSON.stringify(snapshot), sortOrder, now);
}

function itemStatements(env: AIDesktopProjectsEnv, deliveryId: string, documents: DocumentSnapshotRow[], now: number) {
  return documents.map((document, index) => itemStatement(env, deliveryId, document, index, now));
}

export async function listAIDesktopDesignDeliveries(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  const result = await env.DB.prepare(`${selectDelivery}
    WHERE project.created_by = ? OR EXISTS (
      SELECT 1 FROM ai_desktop_project_members member
      WHERE member.project_id = project.project_id AND member.user_id = ?
    ) ORDER BY delivery.updated_at DESC LIMIT 300`).bind(actor.username, actor.ownerUserId, actor.username, actor.ownerUserId).all<DeliveryRow>();
  return { deliveries: result.results.map(fromRow) };
}

export async function getAIDesktopDesignDelivery(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const row = await env.DB.prepare(`${selectDelivery}
    WHERE delivery.delivery_id = ? AND (
      project.created_by = ? OR EXISTS (
        SELECT 1 FROM ai_desktop_project_members member
        WHERE member.project_id = project.project_id AND member.user_id = ?
      )
    )`).bind(actor.username, actor.ownerUserId, id, actor.username, actor.ownerUserId).first<DeliveryRow>();
  if (!row) throw new AIDesktopDesignDeliveryError('NOT_FOUND');
  const items = await env.DB.prepare('SELECT * FROM ai_desktop_design_delivery_items WHERE delivery_id = ? ORDER BY sort_order, added_at').bind(id).all<DeliveryItemRow>();
  return { delivery: { ...fromRow(row), items: items.results.map(itemFromRow) } };
}

export async function createAIDesktopDesignDelivery(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  const input = validateInput(await request.json());
  const access = await projectAccess(env, actor, input.projectId);
  if (!access.canEdit) throw new AIDesktopDesignDeliveryError('FORBIDDEN');
  const documents = await deliveryDocuments(env, input.projectId, input.documentIds);
  requireScopeDocument(documents, input);
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ai_desktop_design_deliveries
      (delivery_id, project_id, name, scope_domain, scope_phase, status, recipient, delivery_method, submitted_at, received_at, inspection_at, notes, revision, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .bind(id, input.projectId, input.name, input.scopeDomain, input.scopePhase, input.status, input.recipient, input.deliveryMethod, input.submittedAt, input.receivedAt, input.inspectionAt, input.notes, actor.username, actor.username, now, now),
    ...itemStatements(env, id, documents, now),
  ]);
  return getAIDesktopDesignDelivery(env, actor, id);
}

export async function updateAIDesktopDesignDelivery(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const existing = await getAIDesktopDesignDelivery(env, actor, id);
  if (!existing.delivery.canEdit) throw new AIDesktopDesignDeliveryError('FORBIDDEN');
  const input = validateInput(await request.json());
  if (input.projectId !== existing.delivery.projectId) throw new AIDesktopDesignDeliveryError('INVALID_INPUT');
  const existingIds = existing.delivery.items.map((item) => item.designDocumentId).filter((value): value is string => Boolean(value));
  const sameItems = existingIds.length === input.documentIds.length && existingIds.every((value, index) => value === input.documentIds[index]);
  const sameScope = existing.delivery.scopeDomain === input.scopeDomain && existing.delivery.scopePhase === input.scopePhase;
  if (existing.delivery.status !== 'preparing' && (!sameItems || !sameScope)) throw new AIDesktopDesignDeliveryError('LOCKED');
  const now = Date.now();
  const update = env.DB.prepare(`UPDATE ai_desktop_design_deliveries SET name = ?, scope_domain = ?, scope_phase = ?, status = ?, recipient = ?, delivery_method = ?, submitted_at = ?, received_at = ?, inspection_at = ?, notes = ?, updated_by = ?, updated_at = ? WHERE delivery_id = ?`)
    .bind(input.name, input.scopeDomain, input.scopePhase, input.status, input.recipient, input.deliveryMethod, input.submittedAt, input.receivedAt, input.inspectionAt, input.notes, actor.username, now, id);
  if (existing.delivery.status === 'preparing' && (!sameItems || !sameScope)) {
    const scopedDocuments = await deliveryDocuments(env, input.projectId, input.documentIds);
    requireScopeDocument(scopedDocuments, input);
    const existingSet = new Set(existingIds);
    const newIds = input.documentIds.filter((documentId) => !existingSet.has(documentId));
    const newIdSet = new Set(newIds);
    const newDocuments = scopedDocuments.filter((document) => newIdSet.has(document.design_document_id));
    const newById = new Map(newDocuments.map((document) => [document.design_document_id, document]));
    const placeholders = input.documentIds.map(() => '?').join(', ');
    await env.DB.batch([
      update,
      env.DB.prepare(`DELETE FROM ai_desktop_design_delivery_items WHERE delivery_id = ? AND design_document_id NOT IN (${placeholders})`).bind(id, ...input.documentIds),
      ...input.documentIds.flatMap((documentId, index) => existingSet.has(documentId) ? [env.DB.prepare('UPDATE ai_desktop_design_delivery_items SET sort_order = ? WHERE delivery_id = ? AND design_document_id = ?').bind(index, id, documentId)] : []),
      ...input.documentIds.flatMap((documentId, index) => {
        const document = newById.get(documentId);
        return document ? [itemStatement(env, id, document, index, now)] : [];
      }),
    ]);
  } else {
    await update.run();
  }
  return getAIDesktopDesignDelivery(env, actor, id);
}

export async function deleteAIDesktopDesignDelivery(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, id: string) {
  const existing = await getAIDesktopDesignDelivery(env, actor, id);
  if (!existing.delivery.canEdit) throw new AIDesktopDesignDeliveryError('FORBIDDEN');
  if (existing.delivery.status !== 'preparing') throw new AIDesktopDesignDeliveryError('LOCKED');
  const result = await env.DB.prepare('DELETE FROM ai_desktop_design_deliveries WHERE delivery_id = ?').bind(id).run();
  if (!result.meta.changes) throw new AIDesktopDesignDeliveryError('NOT_FOUND');
  return { deleted: true, deliveryId: id };
}
