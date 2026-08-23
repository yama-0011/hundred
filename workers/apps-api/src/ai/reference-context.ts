import type { UsedReference } from "./provider";

const productCategory = "product";
const maxReferenceItems = 5;
const maxReferenceContextLength = 24_000;

interface ReferenceItemRow {
  id: string;
  name: string;
  source_url: string | null;
  description: string;
  attributes_json: string;
  ai_notes: string;
  updated_at: number;
}

interface ProductAttributes {
  brand?: unknown;
  category?: unknown;
  features?: unknown;
  price?: unknown;
  capacity?: unknown;
  specifications?: unknown;
  usage?: unknown;
  cautions?: unknown;
}

export interface ResolvedReferenceContext {
  context: string;
  references: UsedReference[];
}

export function normalizeReferenceNameForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/\s+/gu, " ")
    .trim();
}

function parseAttributes(value: string): ProductAttributes {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as ProductAttributes)
      : {};
  } catch {
    return {};
  }
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatProduct(row: ReferenceItemRow): string {
  const attributes = parseAttributes(row.attributes_json);
  const fields: Array<[string, string]> = [
    ["商品名", row.name],
    ["ブランド", optionalText(attributes.brand)],
    ["カテゴリ", optionalText(attributes.category)],
    ["商品説明", row.description.trim()],
    ["特徴", optionalText(attributes.features)],
    ["価格", optionalText(attributes.price)],
    ["容量", optionalText(attributes.capacity)],
    ["仕様", optionalText(attributes.specifications)],
    ["使用方法", optionalText(attributes.usage)],
    ["注意事項", optionalText(attributes.cautions)],
    ["AI向け補足", row.ai_notes.trim()],
    ["情報元URL", row.source_url ?? ""],
  ];

  return fields
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

/**
 * 認証利用者のAI利用可能な商品から、明示済みIDと依頼文中の商品名を解決する。
 * 商品データ自体はフロントエンドから受け取らず、必ずD1の所有者条件で取得する。
 */
export async function resolveProductReferenceContext(
  db: D1Database,
  ownerUserId: string,
  requestText: string,
  existingReferenceIds: string[],
): Promise<ResolvedReferenceContext> {
  const result = await db.prepare(
    `SELECT id, name, source_url, description, attributes_json,
            ai_notes, updated_at
       FROM creative_ia_reference_items
      WHERE owner_user_id = ?1
        AND category = ?2
        AND ai_enabled = 1
      ORDER BY updated_at DESC`,
  )
    .bind(ownerUserId, productCategory)
    .all<ReferenceItemRow>();

  const products = result.results;
  const productById = new Map(products.map((product) => [product.id, product]));
  const selected: ReferenceItemRow[] = [];
  const selectedIds = new Set<string>();

  for (const id of existingReferenceIds) {
    const product = productById.get(id);
    if (!product || selectedIds.has(product.id)) continue;
    selected.push(product);
    selectedIds.add(product.id);
  }

  const normalizedRequest = normalizeReferenceNameForMatch(requestText);
  const detected = products
    .map((product) => ({
      product,
      name: normalizeReferenceNameForMatch(product.name),
    }))
    .filter(({ name }) => name && normalizedRequest.includes(name))
    .sort((left, right) => right.name.length - left.name.length);
  const selectedNames: string[] = [];

  for (const { product, name } of detected) {
    if (
      selectedIds.has(product.id) ||
      selectedNames.some((selectedName) => selectedName.includes(name))
    ) {
      continue;
    }
    selected.push(product);
    selectedIds.add(product.id);
    selectedNames.push(name);
  }

  const limited = selected.slice(0, maxReferenceItems);
  const blocks: string[] = [];
  let currentLength = 0;

  for (const product of limited) {
    const block = `[商品]\n${formatProduct(product)}`;
    const remaining = maxReferenceContextLength - currentLength;
    if (remaining <= 0) break;
    blocks.push(block.slice(0, remaining));
    currentLength += Math.min(block.length, remaining);
  }

  return {
    context: blocks.join("\n\n"),
    references: limited.map((product) => ({
      id: product.id,
      category: productCategory,
      name: product.name,
      updatedAt: product.updated_at,
    })),
  };
}
