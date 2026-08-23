const organizationCategory = "organization";
const contactCategory = "contact";

export interface CreativeIAReferenceOrganizationEnv { DB: D1Database }

interface ReferenceItemRow {
  id: string;
  name: string;
  source_url: string | null;
  description: string;
  attributes_json: string;
  ai_notes: string;
  ai_enabled: number;
  parent_reference_id: string | null;
  parent_name: string | null;
  created_at: number;
  updated_at: number;
}

type OrganizationType = "company" | "store";
interface OrganizationAttributes {
  organizationType: OrganizationType;
  address: string;
  phone: string;
  businessHours: string;
  features: string;
}
interface OrganizationInput extends OrganizationAttributes {
  name: string;
  parentCompanyId: string | null;
  sourceUrl: string | null;
  description: string;
  aiNotes: string;
  aiEnabled: boolean;
}
interface ContactAttributes {
  department: string;
  role: string;
  specialties: string;
}
interface ContactInput extends ContactAttributes {
  name: string;
  organizationId: string;
  description: string;
  aiNotes: string;
  aiEnabled: boolean;
}

export class CreativeIAReferenceOrganizationError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "HAS_RELATIONS") {
    super(code);
    this.name = "CreativeIAReferenceOrganizationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionalString(value: unknown, maxLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
  const result = value.trim();
  if (result.length > maxLength) throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
  return result;
}
function requiredString(value: unknown, maxLength: number): string {
  const result = optionalString(value, maxLength);
  if (!result) throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
  return result;
}
function sourceUrl(value: unknown): string | null {
  const result = optionalString(value, 2_000);
  if (!result) return null;
  try {
    const parsed = new URL(result);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
  }
}
function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch { return {}; }
}
function attribute(value: unknown): string { return typeof value === "string" ? value : "" }

function parseOrganizationInput(value: unknown): OrganizationInput {
  if (!isRecord(value)) throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
  const organizationType = value.organizationType;
  if (organizationType !== "company" && organizationType !== "store") {
    throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
  }
  const parentCompanyId = organizationType === "store"
    ? requiredString(value.parentCompanyId, 100)
    : null;
  return {
    name: requiredString(value.name, 200), organizationType, parentCompanyId,
    sourceUrl: sourceUrl(value.sourceUrl), description: optionalString(value.description, 10_000),
    address: optionalString(value.address, 1_000), phone: optionalString(value.phone, 200),
    businessHours: optionalString(value.businessHours, 2_000), features: optionalString(value.features, 20_000),
    aiNotes: optionalString(value.aiNotes, 20_000), aiEnabled: value.aiEnabled !== false,
  };
}
function parseContactInput(value: unknown): ContactInput {
  if (!isRecord(value)) throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
  return {
    name: requiredString(value.name, 200), organizationId: requiredString(value.organizationId, 100),
    department: optionalString(value.department, 200), role: optionalString(value.role, 200),
    description: optionalString(value.description, 10_000), specialties: optionalString(value.specialties, 20_000),
    aiNotes: optionalString(value.aiNotes, 20_000), aiEnabled: value.aiEnabled !== false,
  };
}
async function body<T>(request: Request, parser: (value: unknown) => T): Promise<T> {
  try { return parser(await request.json()); }
  catch (error) {
    if (error instanceof CreativeIAReferenceOrganizationError) throw error;
    throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
  }
}
async function ensureUser(env: CreativeIAReferenceOrganizationEnv, ownerUserId: string) {
  await env.DB.prepare(`INSERT INTO users (owner_user_id) VALUES (?1)
    ON CONFLICT(owner_user_id) DO UPDATE SET updated_at = unixepoch()`).bind(ownerUserId).run();
}
async function requireOrganization(env: CreativeIAReferenceOrganizationEnv, ownerUserId: string, id: string, requiredType?: OrganizationType) {
  const row = await env.DB.prepare(`SELECT attributes_json FROM creative_ia_reference_items
    WHERE id = ?1 AND owner_user_id = ?2 AND category = ?3`)
    .bind(id, ownerUserId, organizationCategory).first<{ attributes_json: string }>();
  if (!row) throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
  if (requiredType && parseJson(row.attributes_json).organizationType !== requiredType) {
    throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
  }
}
function serializeOrganization(row: ReferenceItemRow) {
  const values = parseJson(row.attributes_json);
  return {
    id: row.id, name: row.name,
    organizationType: values.organizationType === "store" ? "store" : "company",
    parentCompanyId: row.parent_reference_id, parentCompanyName: row.parent_name,
    sourceUrl: row.source_url, description: row.description,
    address: attribute(values.address), phone: attribute(values.phone),
    businessHours: attribute(values.businessHours), features: attribute(values.features),
    aiNotes: row.ai_notes, aiEnabled: row.ai_enabled === 1,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function serializeContact(row: ReferenceItemRow) {
  const values = parseJson(row.attributes_json);
  return {
    id: row.id, name: row.name, organizationId: row.parent_reference_id ?? "",
    organizationName: row.parent_name ?? "", department: attribute(values.department),
    role: attribute(values.role), description: row.description,
    specialties: attribute(values.specialties), aiNotes: row.ai_notes,
    aiEnabled: row.ai_enabled === 1, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
const selectRows = `SELECT item.id, item.name, item.source_url, item.description,
  item.attributes_json, item.ai_notes, item.ai_enabled, item.parent_reference_id,
  parent.name AS parent_name, item.created_at, item.updated_at
  FROM creative_ia_reference_items item
  LEFT JOIN creative_ia_reference_items parent ON parent.id = item.parent_reference_id`;

export async function listCreativeIAReferenceOrganizations(env: CreativeIAReferenceOrganizationEnv, ownerUserId: string) {
  await ensureUser(env, ownerUserId);
  const rows = await env.DB.prepare(`${selectRows}
    WHERE item.owner_user_id = ?1 AND item.category = ?2 ORDER BY item.updated_at DESC`)
    .bind(ownerUserId, organizationCategory).all<ReferenceItemRow>();
  return { organizations: rows.results.map(serializeOrganization), count: rows.results.length };
}
export async function getCreativeIAReferenceOrganization(env: CreativeIAReferenceOrganizationEnv, ownerUserId: string, id: string) {
  const row = await env.DB.prepare(`${selectRows}
    WHERE item.id = ?1 AND item.owner_user_id = ?2 AND item.category = ?3`)
    .bind(id, ownerUserId, organizationCategory).first<ReferenceItemRow>();
  if (!row) throw new CreativeIAReferenceOrganizationError("NOT_FOUND");
  const related = await env.DB.prepare(`SELECT id, name, category, attributes_json FROM creative_ia_reference_items
    WHERE owner_user_id = ?1 AND parent_reference_id = ?2 ORDER BY updated_at DESC`)
    .bind(ownerUserId, id).all<{ id: string; name: string; category: string; attributes_json: string }>();
  return {
    ...serializeOrganization(row),
    stores: related.results.filter((item) => item.category === organizationCategory && parseJson(item.attributes_json).organizationType === "store").map(({ id: childId, name }) => ({ id: childId, name })),
    contacts: related.results.filter((item) => item.category === contactCategory).map(({ id: childId, name }) => ({ id: childId, name })),
  };
}
export async function createCreativeIAReferenceOrganization(request: Request, env: CreativeIAReferenceOrganizationEnv, ownerUserId: string) {
  const input = await body(request, parseOrganizationInput);
  await ensureUser(env, ownerUserId);
  if (input.parentCompanyId) await requireOrganization(env, ownerUserId, input.parentCompanyId, "company");
  const id = crypto.randomUUID(); const now = Date.now();
  const attributes: OrganizationAttributes = {
    organizationType: input.organizationType, address: input.address, phone: input.phone,
    businessHours: input.businessHours, features: input.features,
  };
  await env.DB.prepare(`INSERT INTO creative_ia_reference_items
    (id, owner_user_id, category, name, source_url, description, attributes_json, ai_notes,
     ai_enabled, parent_reference_id, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`)
    .bind(id, ownerUserId, organizationCategory, input.name, input.sourceUrl, input.description,
      JSON.stringify(attributes), input.aiNotes, input.aiEnabled ? 1 : 0, input.parentCompanyId, now).run();
  return getCreativeIAReferenceOrganization(env, ownerUserId, id);
}
export async function updateCreativeIAReferenceOrganization(request: Request, env: CreativeIAReferenceOrganizationEnv, ownerUserId: string, id: string) {
  const input = await body(request, parseOrganizationInput);
  if (input.parentCompanyId) {
    if (input.parentCompanyId === id) throw new CreativeIAReferenceOrganizationError("INVALID_INPUT");
    await requireOrganization(env, ownerUserId, input.parentCompanyId, "company");
  }
  const attributes: OrganizationAttributes = {
    organizationType: input.organizationType, address: input.address, phone: input.phone,
    businessHours: input.businessHours, features: input.features,
  };
  const result = await env.DB.prepare(`UPDATE creative_ia_reference_items SET name=?1, source_url=?2,
    description=?3, attributes_json=?4, ai_notes=?5, ai_enabled=?6, parent_reference_id=?7, updated_at=?8
    WHERE id=?9 AND owner_user_id=?10 AND category=?11`)
    .bind(input.name, input.sourceUrl, input.description, JSON.stringify(attributes), input.aiNotes,
      input.aiEnabled ? 1 : 0, input.parentCompanyId, Date.now(), id, ownerUserId, organizationCategory).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new CreativeIAReferenceOrganizationError("NOT_FOUND");
  return getCreativeIAReferenceOrganization(env, ownerUserId, id);
}
export async function deleteCreativeIAReferenceOrganization(env: CreativeIAReferenceOrganizationEnv, ownerUserId: string, id: string) {
  const child = await env.DB.prepare(`SELECT 1 FROM creative_ia_reference_items
    WHERE owner_user_id=?1 AND parent_reference_id=?2 LIMIT 1`).bind(ownerUserId, id).first();
  if (child) throw new CreativeIAReferenceOrganizationError("HAS_RELATIONS");
  const result = await env.DB.prepare(`DELETE FROM creative_ia_reference_items
    WHERE id=?1 AND owner_user_id=?2 AND category=?3`).bind(id, ownerUserId, organizationCategory).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new CreativeIAReferenceOrganizationError("NOT_FOUND");
  return { deleted: true };
}

export async function listCreativeIAReferenceContacts(env: CreativeIAReferenceOrganizationEnv, ownerUserId: string) {
  await ensureUser(env, ownerUserId);
  const rows = await env.DB.prepare(`${selectRows}
    WHERE item.owner_user_id=?1 AND item.category=?2 ORDER BY item.updated_at DESC`)
    .bind(ownerUserId, contactCategory).all<ReferenceItemRow>();
  return { contacts: rows.results.map(serializeContact), count: rows.results.length };
}
export async function getCreativeIAReferenceContact(env: CreativeIAReferenceOrganizationEnv, ownerUserId: string, id: string) {
  const row = await env.DB.prepare(`${selectRows}
    WHERE item.id=?1 AND item.owner_user_id=?2 AND item.category=?3`)
    .bind(id, ownerUserId, contactCategory).first<ReferenceItemRow>();
  if (!row) throw new CreativeIAReferenceOrganizationError("NOT_FOUND");
  return serializeContact(row);
}
export async function createCreativeIAReferenceContact(request: Request, env: CreativeIAReferenceOrganizationEnv, ownerUserId: string) {
  const input = await body(request, parseContactInput);
  await ensureUser(env, ownerUserId); await requireOrganization(env, ownerUserId, input.organizationId);
  const id = crypto.randomUUID(); const now = Date.now();
  const attributes: ContactAttributes = { department: input.department, role: input.role, specialties: input.specialties };
  await env.DB.prepare(`INSERT INTO creative_ia_reference_items
    (id, owner_user_id, category, name, description, attributes_json, ai_notes, ai_enabled,
     parent_reference_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)`)
    .bind(id, ownerUserId, contactCategory, input.name, input.description, JSON.stringify(attributes),
      input.aiNotes, input.aiEnabled ? 1 : 0, input.organizationId, now).run();
  return getCreativeIAReferenceContact(env, ownerUserId, id);
}
export async function updateCreativeIAReferenceContact(request: Request, env: CreativeIAReferenceOrganizationEnv, ownerUserId: string, id: string) {
  const input = await body(request, parseContactInput); await requireOrganization(env, ownerUserId, input.organizationId);
  const attributes: ContactAttributes = { department: input.department, role: input.role, specialties: input.specialties };
  const result = await env.DB.prepare(`UPDATE creative_ia_reference_items SET name=?1, description=?2,
    attributes_json=?3, ai_notes=?4, ai_enabled=?5, parent_reference_id=?6, updated_at=?7
    WHERE id=?8 AND owner_user_id=?9 AND category=?10`)
    .bind(input.name, input.description, JSON.stringify(attributes), input.aiNotes,
      input.aiEnabled ? 1 : 0, input.organizationId, Date.now(), id, ownerUserId, contactCategory).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new CreativeIAReferenceOrganizationError("NOT_FOUND");
  return getCreativeIAReferenceContact(env, ownerUserId, id);
}
export async function deleteCreativeIAReferenceContact(env: CreativeIAReferenceOrganizationEnv, ownerUserId: string, id: string) {
  const result = await env.DB.prepare(`DELETE FROM creative_ia_reference_items
    WHERE id=?1 AND owner_user_id=?2 AND category=?3`).bind(id, ownerUserId, contactCategory).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new CreativeIAReferenceOrganizationError("NOT_FOUND");
  return { deleted: true };
}
