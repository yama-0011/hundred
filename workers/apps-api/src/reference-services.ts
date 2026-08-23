const serviceCategory = "service";

export interface CreativeIAReferenceServiceEnv {
  DB: D1Database;
}

interface ReferenceItemRow {
  id: string;
  name: string;
  source_url: string | null;
  description: string;
  attributes_json: string;
  ai_notes: string;
  ai_enabled: number;
  created_at: number;
  updated_at: number;
}

interface ServiceAttributes {
  category: string;
  features: string;
  price: string;
  duration: string;
  target: string;
  process: string;
  cautions: string;
}

interface ServiceInput extends ServiceAttributes {
  name: string;
  sourceUrl: string | null;
  description: string;
  aiNotes: string;
  aiEnabled: boolean;
}

export class CreativeIAReferenceServiceError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND") {
    super(code);
    this.name = "CreativeIAReferenceServiceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalString(value: unknown, maxLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new CreativeIAReferenceServiceError("INVALID_INPUT");
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new CreativeIAReferenceServiceError("INVALID_INPUT");
  }
  return normalized;
}

function parseRequiredString(value: unknown, maxLength: number): string {
  const normalized = parseOptionalString(value, maxLength);
  if (!normalized) throw new CreativeIAReferenceServiceError("INVALID_INPUT");
  return normalized;
}

function parseSourceUrl(value: unknown): string | null {
  const normalized = parseOptionalString(value, 2_000);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
    return url.toString();
  } catch {
    throw new CreativeIAReferenceServiceError("INVALID_INPUT");
  }
}

function parseServiceInput(value: unknown): ServiceInput {
  if (!isRecord(value)) {
    throw new CreativeIAReferenceServiceError("INVALID_INPUT");
  }
  return {
    name: parseRequiredString(value.name, 200),
    category: parseOptionalString(value.category, 200),
    sourceUrl: parseSourceUrl(value.sourceUrl),
    description: parseOptionalString(value.description, 10_000),
    features: parseOptionalString(value.features, 20_000),
    price: parseOptionalString(value.price, 200),
    duration: parseOptionalString(value.duration, 200),
    target: parseOptionalString(value.target, 20_000),
    process: parseOptionalString(value.process, 20_000),
    cautions: parseOptionalString(value.cautions, 20_000),
    aiNotes: parseOptionalString(value.aiNotes, 20_000),
    aiEnabled: value.aiEnabled !== false,
  };
}

async function readServiceInput(request: Request): Promise<ServiceInput> {
  try {
    return parseServiceInput(await request.json());
  } catch (error) {
    if (error instanceof CreativeIAReferenceServiceError) throw error;
    throw new CreativeIAReferenceServiceError("INVALID_INPUT");
  }
}

function emptyAttributes(): ServiceAttributes {
  return { category: "", features: "", price: "", duration: "", target: "", process: "", cautions: "" };
}

function parseAttributes(value: string): ServiceAttributes {
  try {
    const attributes: unknown = JSON.parse(value);
    if (!isRecord(attributes)) return emptyAttributes();
    return {
      category: typeof attributes.category === "string" ? attributes.category : "",
      features: typeof attributes.features === "string" ? attributes.features : "",
      price: typeof attributes.price === "string" ? attributes.price : "",
      duration: typeof attributes.duration === "string" ? attributes.duration : "",
      target: typeof attributes.target === "string" ? attributes.target : "",
      process: typeof attributes.process === "string" ? attributes.process : "",
      cautions: typeof attributes.cautions === "string" ? attributes.cautions : "",
    };
  } catch {
    return emptyAttributes();
  }
}

function serializeService(row: ReferenceItemRow) {
  return {
    id: row.id,
    name: row.name,
    sourceUrl: row.source_url,
    description: row.description,
    ...parseAttributes(row.attributes_json),
    aiNotes: row.ai_notes,
    aiEnabled: row.ai_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureUser(env: CreativeIAReferenceServiceEnv, ownerUserId: string) {
  await env.DB.prepare(
    `INSERT INTO users (owner_user_id) VALUES (?1)
     ON CONFLICT(owner_user_id) DO UPDATE SET updated_at = unixepoch()`,
  ).bind(ownerUserId).run();
}

async function getOwnedService(env: CreativeIAReferenceServiceEnv, ownerUserId: string, serviceId: string) {
  return env.DB.prepare(
    `SELECT id, name, source_url, description, attributes_json,
            ai_notes, ai_enabled, created_at, updated_at
       FROM creative_ia_reference_items
      WHERE id = ?1 AND owner_user_id = ?2 AND category = ?3`,
  ).bind(serviceId, ownerUserId, serviceCategory).first<ReferenceItemRow>();
}

export async function listCreativeIAReferenceServices(env: CreativeIAReferenceServiceEnv, ownerUserId: string) {
  await ensureUser(env, ownerUserId);
  const services = await env.DB.prepare(
    `SELECT id, name, source_url, description, attributes_json,
            ai_notes, ai_enabled, created_at, updated_at
       FROM creative_ia_reference_items
      WHERE owner_user_id = ?1 AND category = ?2
      ORDER BY updated_at DESC`,
  ).bind(ownerUserId, serviceCategory).all<ReferenceItemRow>();
  return { services: services.results.map(serializeService), count: services.results.length };
}

export async function getCreativeIAReferenceService(env: CreativeIAReferenceServiceEnv, ownerUserId: string, serviceId: string) {
  const service = await getOwnedService(env, ownerUserId, serviceId);
  if (!service) throw new CreativeIAReferenceServiceError("NOT_FOUND");
  return serializeService(service);
}

export async function createCreativeIAReferenceService(request: Request, env: CreativeIAReferenceServiceEnv, ownerUserId: string) {
  const input = await readServiceInput(request);
  await ensureUser(env, ownerUserId);
  const id = crypto.randomUUID();
  const now = Date.now();
  const attributes: ServiceAttributes = {
    category: input.category, features: input.features, price: input.price,
    duration: input.duration, target: input.target, process: input.process, cautions: input.cautions,
  };
  await env.DB.prepare(
    `INSERT INTO creative_ia_reference_items
       (id, owner_user_id, category, name, source_url, description,
        attributes_json, ai_notes, ai_enabled, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
  ).bind(id, ownerUserId, serviceCategory, input.name, input.sourceUrl, input.description,
    JSON.stringify(attributes), input.aiNotes, input.aiEnabled ? 1 : 0, now).run();
  return getCreativeIAReferenceService(env, ownerUserId, id);
}

export async function updateCreativeIAReferenceService(request: Request, env: CreativeIAReferenceServiceEnv, ownerUserId: string, serviceId: string) {
  const input = await readServiceInput(request);
  const attributes: ServiceAttributes = {
    category: input.category, features: input.features, price: input.price,
    duration: input.duration, target: input.target, process: input.process, cautions: input.cautions,
  };
  const result = await env.DB.prepare(
    `UPDATE creative_ia_reference_items
        SET name = ?1, source_url = ?2, description = ?3, attributes_json = ?4,
            ai_notes = ?5, ai_enabled = ?6, updated_at = ?7
      WHERE id = ?8 AND owner_user_id = ?9 AND category = ?10`,
  ).bind(input.name, input.sourceUrl, input.description, JSON.stringify(attributes), input.aiNotes,
    input.aiEnabled ? 1 : 0, Date.now(), serviceId, ownerUserId, serviceCategory).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new CreativeIAReferenceServiceError("NOT_FOUND");
  return getCreativeIAReferenceService(env, ownerUserId, serviceId);
}

export async function deleteCreativeIAReferenceService(env: CreativeIAReferenceServiceEnv, ownerUserId: string, serviceId: string) {
  const result = await env.DB.prepare(
    `DELETE FROM creative_ia_reference_items WHERE id = ?1 AND owner_user_id = ?2 AND category = ?3`,
  ).bind(serviceId, ownerUserId, serviceCategory).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new CreativeIAReferenceServiceError("NOT_FOUND");
  return { deleted: true };
}
