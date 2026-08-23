const productCategory = "product";

export interface CreativeIAReferenceProductEnv {
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

interface ProductAttributes {
  brand: string;
  category: string;
  features: string;
  price: string;
  capacity: string;
  specifications: string;
  usage: string;
  cautions: string;
}

interface ProductInput extends ProductAttributes {
  name: string;
  sourceUrl: string | null;
  description: string;
  aiNotes: string;
  aiEnabled: boolean;
}

export class CreativeIAReferenceProductError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND") {
    super(code);
    this.name = "CreativeIAReferenceProductError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalString(value: unknown, maxLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new CreativeIAReferenceProductError("INVALID_INPUT");
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new CreativeIAReferenceProductError("INVALID_INPUT");
  }
  return normalized;
}

function parseRequiredString(value: unknown, maxLength: number): string {
  const normalized = parseOptionalString(value, maxLength);
  if (!normalized) throw new CreativeIAReferenceProductError("INVALID_INPUT");
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
    throw new CreativeIAReferenceProductError("INVALID_INPUT");
  }
}

function parseProductInput(value: unknown): ProductInput {
  if (!isRecord(value)) {
    throw new CreativeIAReferenceProductError("INVALID_INPUT");
  }

  return {
    name: parseRequiredString(value.name, 200),
    brand: parseOptionalString(value.brand, 200),
    category: parseOptionalString(value.category, 200),
    sourceUrl: parseSourceUrl(value.sourceUrl),
    description: parseOptionalString(value.description, 10_000),
    features: parseOptionalString(value.features, 20_000),
    price: parseOptionalString(value.price, 200),
    capacity: parseOptionalString(value.capacity, 200),
    specifications: parseOptionalString(value.specifications, 20_000),
    usage: parseOptionalString(value.usage, 20_000),
    cautions: parseOptionalString(value.cautions, 20_000),
    aiNotes: parseOptionalString(value.aiNotes, 20_000),
    aiEnabled: value.aiEnabled !== false,
  };
}

async function readProductInput(request: Request): Promise<ProductInput> {
  try {
    return parseProductInput(await request.json());
  } catch (error) {
    if (error instanceof CreativeIAReferenceProductError) throw error;
    throw new CreativeIAReferenceProductError("INVALID_INPUT");
  }
}

function parseAttributes(value: string): ProductAttributes {
  try {
    const attributes: unknown = JSON.parse(value);
    if (!isRecord(attributes)) throw new Error("invalid attributes");
    return {
      brand: typeof attributes.brand === "string" ? attributes.brand : "",
      category:
        typeof attributes.category === "string" ? attributes.category : "",
      features:
        typeof attributes.features === "string" ? attributes.features : "",
      price: typeof attributes.price === "string" ? attributes.price : "",
      capacity:
        typeof attributes.capacity === "string" ? attributes.capacity : "",
      specifications:
        typeof attributes.specifications === "string"
          ? attributes.specifications
          : "",
      usage: typeof attributes.usage === "string" ? attributes.usage : "",
      cautions:
        typeof attributes.cautions === "string" ? attributes.cautions : "",
    };
  } catch {
    return {
      brand: "",
      category: "",
      features: "",
      price: "",
      capacity: "",
      specifications: "",
      usage: "",
      cautions: "",
    };
  }
}

function serializeProduct(row: ReferenceItemRow) {
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

async function ensureUser(
  env: CreativeIAReferenceProductEnv,
  ownerUserId: string,
) {
  await env.DB.prepare(
    `INSERT INTO users (owner_user_id)
     VALUES (?1)
     ON CONFLICT(owner_user_id)
     DO UPDATE SET updated_at = unixepoch()`,
  )
    .bind(ownerUserId)
    .run();
}

async function getOwnedProduct(
  env: CreativeIAReferenceProductEnv,
  ownerUserId: string,
  productId: string,
) {
  return env.DB.prepare(
    `SELECT id, name, source_url, description, attributes_json,
            ai_notes, ai_enabled, created_at, updated_at
       FROM creative_ia_reference_items
      WHERE id = ?1 AND owner_user_id = ?2 AND category = ?3`,
  )
    .bind(productId, ownerUserId, productCategory)
    .first<ReferenceItemRow>();
}

/** 利用者が登録した商品を更新順で取得する。 */
export async function listCreativeIAReferenceProducts(
  env: CreativeIAReferenceProductEnv,
  ownerUserId: string,
) {
  await ensureUser(env, ownerUserId);
  const products = await env.DB.prepare(
    `SELECT id, name, source_url, description, attributes_json,
            ai_notes, ai_enabled, created_at, updated_at
       FROM creative_ia_reference_items
      WHERE owner_user_id = ?1 AND category = ?2
      ORDER BY updated_at DESC`,
  )
    .bind(ownerUserId, productCategory)
    .all<ReferenceItemRow>();

  return {
    products: products.results.map(serializeProduct),
    count: products.results.length,
  };
}

/** 商品を1件取得する。 */
export async function getCreativeIAReferenceProduct(
  env: CreativeIAReferenceProductEnv,
  ownerUserId: string,
  productId: string,
) {
  const product = await getOwnedProduct(env, ownerUserId, productId);
  if (!product) throw new CreativeIAReferenceProductError("NOT_FOUND");
  return serializeProduct(product);
}

/** 商品を汎用参照データへ登録する。 */
export async function createCreativeIAReferenceProduct(
  request: Request,
  env: CreativeIAReferenceProductEnv,
  ownerUserId: string,
) {
  const input = await readProductInput(request);
  await ensureUser(env, ownerUserId);
  const id = crypto.randomUUID();
  const now = Date.now();
  const attributes: ProductAttributes = {
    brand: input.brand,
    category: input.category,
    features: input.features,
    price: input.price,
    capacity: input.capacity,
    specifications: input.specifications,
    usage: input.usage,
    cautions: input.cautions,
  };

  await env.DB.prepare(
    `INSERT INTO creative_ia_reference_items
       (id, owner_user_id, category, name, source_url, description,
        attributes_json, ai_notes, ai_enabled, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
  )
    .bind(
      id,
      ownerUserId,
      productCategory,
      input.name,
      input.sourceUrl,
      input.description,
      JSON.stringify(attributes),
      input.aiNotes,
      input.aiEnabled ? 1 : 0,
      now,
    )
    .run();

  return getCreativeIAReferenceProduct(env, ownerUserId, id);
}

/** 所有する商品を更新する。 */
export async function updateCreativeIAReferenceProduct(
  request: Request,
  env: CreativeIAReferenceProductEnv,
  ownerUserId: string,
  productId: string,
) {
  const input = await readProductInput(request);
  const attributes: ProductAttributes = {
    brand: input.brand,
    category: input.category,
    features: input.features,
    price: input.price,
    capacity: input.capacity,
    specifications: input.specifications,
    usage: input.usage,
    cautions: input.cautions,
  };
  const result = await env.DB.prepare(
    `UPDATE creative_ia_reference_items
        SET name = ?1,
            source_url = ?2,
            description = ?3,
            attributes_json = ?4,
            ai_notes = ?5,
            ai_enabled = ?6,
            updated_at = ?7
      WHERE id = ?8 AND owner_user_id = ?9 AND category = ?10`,
  )
    .bind(
      input.name,
      input.sourceUrl,
      input.description,
      JSON.stringify(attributes),
      input.aiNotes,
      input.aiEnabled ? 1 : 0,
      Date.now(),
      productId,
      ownerUserId,
      productCategory,
    )
    .run();

  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new CreativeIAReferenceProductError("NOT_FOUND");
  }

  return getCreativeIAReferenceProduct(env, ownerUserId, productId);
}

/** 所有する商品を削除する。 */
export async function deleteCreativeIAReferenceProduct(
  env: CreativeIAReferenceProductEnv,
  ownerUserId: string,
  productId: string,
) {
  const result = await env.DB.prepare(
    `DELETE FROM creative_ia_reference_items
      WHERE id = ?1 AND owner_user_id = ?2 AND category = ?3`,
  )
    .bind(productId, ownerUserId, productCategory)
    .run();

  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new CreativeIAReferenceProductError("NOT_FOUND");
  }
  return { deleted: true };
}
