import type { UsedReference } from "./provider";

type ReferenceCategory = "product" | "service" | "organization" | "contact";
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
  category: ReferenceCategory;
  parent_name: string | null;
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
  duration?: unknown;
  target?: unknown;
  process?: unknown;
  organizationType?: unknown;
  address?: unknown;
  phone?: unknown;
  businessHours?: unknown;
  department?: unknown;
  role?: unknown;
  specialties?: unknown;
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

function formatService(row: ReferenceItemRow): string {
  const attributes = parseAttributes(row.attributes_json);
  const fields: Array<[string, string]> = [
    ["サービス名", row.name],
    ["カテゴリ", optionalText(attributes.category)],
    ["サービス説明", row.description.trim()],
    ["特徴", optionalText(attributes.features)],
    ["価格", optionalText(attributes.price)],
    ["所要時間", optionalText(attributes.duration)],
    ["対象", optionalText(attributes.target)],
    ["提供内容・流れ", optionalText(attributes.process)],
    ["注意事項", optionalText(attributes.cautions)],
    ["AI向け補足", row.ai_notes.trim()],
    ["情報元URL", row.source_url ?? ""],
  ];
  return fields
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

function formatOrganization(row: ReferenceItemRow): string {
  const attributes = parseAttributes(row.attributes_json);
  const type = attributes.organizationType === "store" ? "店舗" : "会社";
  const fields: Array<[string, string]> = [
    ["名称", row.name], ["種別", type], ["所属会社", row.parent_name ?? ""],
    ["説明", row.description.trim()], ["所在地", optionalText(attributes.address)],
    ["電話番号", optionalText(attributes.phone)], ["営業時間", optionalText(attributes.businessHours)],
    ["特徴", optionalText(attributes.features)], ["AI向け補足", row.ai_notes.trim()],
    ["情報元URL", row.source_url ?? ""],
  ];
  return fields.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n");
}

function formatContact(row: ReferenceItemRow): string {
  const attributes = parseAttributes(row.attributes_json);
  const fields: Array<[string, string]> = [
    ["担当者名", row.name], ["所属先", row.parent_name ?? ""],
    ["部署", optionalText(attributes.department)], ["役職", optionalText(attributes.role)],
    ["紹介文", row.description.trim()], ["専門分野・担当業務", optionalText(attributes.specialties)],
    ["AI向け補足", row.ai_notes.trim()],
  ];
  return fields.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n");
}

/**
 * 認証利用者のAI利用可能な参照データから、明示済みIDと依頼文中の名称を解決する。
 * 参照データ自体はフロントエンドから受け取らず、必ずD1の所有者条件で取得する。
 */
export async function resolveReferenceContext(
  db: D1Database,
  ownerUserId: string,
  requestText: string,
  existingReferenceIds: string[],
): Promise<ResolvedReferenceContext> {
  const result = await db.prepare(
    `SELECT item.id, item.name, item.source_url, item.description, item.attributes_json,
            item.ai_notes, item.updated_at, item.category, parent.name AS parent_name
       FROM creative_ia_reference_items item
       LEFT JOIN creative_ia_reference_items parent ON parent.id = item.parent_reference_id
      WHERE item.owner_user_id = ?1
        AND item.category IN ('product', 'service', 'organization', 'contact')
        AND item.ai_enabled = 1
      ORDER BY item.updated_at DESC`,
  )
    .bind(ownerUserId)
    .all<ReferenceItemRow>();

  const references = result.results;
  const referenceById = new Map(
    references.map((reference) => [reference.id, reference]),
  );
  const selected: ReferenceItemRow[] = [];
  const selectedIds = new Set<string>();

  for (const id of existingReferenceIds) {
    const reference = referenceById.get(id);
    if (!reference || selectedIds.has(reference.id)) continue;
    selected.push(reference);
    selectedIds.add(reference.id);
  }

  const normalizedRequest = normalizeReferenceNameForMatch(requestText);
  const detected = references
    .map((reference) => ({
      reference,
      name: normalizeReferenceNameForMatch(reference.name),
    }))
    .filter(({ name }) => name && normalizedRequest.includes(name))
    .sort((left, right) => right.name.length - left.name.length);
  const selectedNames: string[] = [];

  for (const { reference, name } of detected) {
    if (
      selectedIds.has(reference.id) ||
      selectedNames.some((selectedName) => selectedName.includes(name))
    ) {
      continue;
    }
    selected.push(reference);
    selectedIds.add(reference.id);
    selectedNames.push(name);
  }

  const limited = selected.slice(0, maxReferenceItems);
  const blocks: string[] = [];
  let currentLength = 0;

  for (const reference of limited) {
    const [label, body] = reference.category === "service"
      ? ["サービス", formatService(reference)]
      : reference.category === "organization"
        ? ["会社・店舗", formatOrganization(reference)]
        : reference.category === "contact"
          ? ["担当者", formatContact(reference)]
          : ["商品", formatProduct(reference)];
    const block = `[${label}]\n${body}`;
    const remaining = maxReferenceContextLength - currentLength;
    if (remaining <= 0) break;
    blocks.push(block.slice(0, remaining));
    currentLength += Math.min(block.length, remaining);
  }

  return {
    context: blocks.join("\n\n"),
    references: limited.map((reference) => ({
      id: reference.id,
      category: reference.category,
      name: reference.name,
      updatedAt: reference.updated_at,
    })),
  };
}
