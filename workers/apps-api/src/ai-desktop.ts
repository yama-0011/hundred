export interface AIDesktopEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
}

const validServiceId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value);
const blockTypes = new Set(["heading", "text", "image", "code", "checklist", "callout", "divider", "table", "link", "toc", "glossary", "card", "steps", "diagram", "columns"]);
const badgeTones = new Set(["neutral", "info", "success", "warning", "danger"]);
const diagramKinds = new Set(["flowchart", "sequence", "architecture", "er", "state"]);
const diagramStarts: Record<string, RegExp> = { flowchart: /^\s*(?:flowchart|graph)\b/iu, sequence: /^\s*sequenceDiagram\b/u, architecture: /^\s*architecture-beta\b/u, er: /^\s*erDiagram\b/u, state: /^\s*stateDiagram(?:-v2)?\b/u };

export class AIDesktopContentError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT") {
    super(code);
    this.name = "AIDesktopContentError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validText(value: unknown, max: number, optional = false) {
  return (optional && value === undefined) || (typeof value === "string" && value.length <= max);
}

function validBadges(value: unknown, max: number) {
  return value === undefined || (Array.isArray(value) && value.length <= max && value.every((badge) => isRecord(badge) && validText(badge.id, 300) && validText(badge.label, 40) && badgeTones.has(String(badge.tone))));
}

function validateBlocks(value: unknown, nested = false): boolean {
  if (!Array.isArray(value) || value.length > 200) return false;
  return value.every((block) => {
    if (!isRecord(block) || typeof block.id !== "string" || !blockTypes.has(String(block.type)) || !isRecord(block.data)) return false;
    const data = block.data;
    switch (block.type) {
      case "heading": return validText(data.text, 500) && (data.level === 1 || data.level === 2 || data.level === 3);
      case "text": return validText(data.text, 100_000);
      case "image": return validText(data.imageId, 300) && validText(data.url, 2_000) && validText(data.alt, 500) && validText(data.caption, 2_000);
      case "code": return validText(data.code, 200_000) && validText(data.language, 100) && validText(data.filename, 500, true);
      case "checklist": return Array.isArray(data.items) && data.items.length <= 500 && data.items.every((item) => isRecord(item) && validText(item.id, 300) && validText(item.text, 2_000));
      case "callout": return (data.tone === "info" || data.tone === "warning" || data.tone === "tip") && validText(data.title, 500, true) && validText(data.text, 50_000);
      case "divider": return true;
      case "link": return validText(data.label, 500) && validText(data.url, 2_000);
      case "toc": return true;
      case "glossary": return Array.isArray(data.entries) && data.entries.length <= 200 && data.entries.every((entry) => isRecord(entry) && validText(entry.id, 300) && validText(entry.term, 500) && validText(entry.description, 5_000));
      case "card": return (data.columns === 1 || data.columns === 2 || data.columns === 3) && Array.isArray(data.items) && data.items.length <= 12 && data.items.every((item) => isRecord(item) && validText(item.id, 300) && validText(item.title, 200) && validText(item.description, 5_000) && validBadges(item.badges, 4) && (item.link === undefined || (isRecord(item.link) && validText(item.link.label, 500) && validText(item.link.url, 2_000))));
      case "steps": return Array.isArray(data.items) && data.items.length <= 20 && data.items.every((item) => isRecord(item) && validText(item.id, 300) && validText(item.title, 200) && validText(item.text, 5_000) && validBadges(item.badges, 3));
      case "diagram": return !nested && diagramKinds.has(String(data.kind)) && validText(data.title, 500) && validText(data.source, 50_000) && diagramStarts[String(data.kind)]?.test(String(data.source)) === true && validText(data.caption, 2_000, true);
      case "table": return Array.isArray(data.columns) && data.columns.length > 0 && data.columns.length <= 20 && data.columns.every((column) => isRecord(column) && validText(column.id, 300) && validText(column.label, 500) && typeof column.width === "number" && column.width >= 10 && column.width <= 100) && Array.isArray(data.rows) && data.rows.length <= 500 && data.rows.every((row) => isRecord(row) && validText(row.id, 300) && Array.isArray(row.cells) && row.cells.length === data.columns.length && row.cells.every((cell) => validText(cell, 10_000))) && (data.rowHeight === "compact" || data.rowHeight === "standard" || data.rowHeight === "comfortable") && (data.tableWidth === undefined || (typeof data.tableWidth === "number" && data.tableWidth >= 100 && data.tableWidth <= 300));
      case "columns": return !nested && validateBlocks(data.left, true) && validateBlocks(data.right, true) && [...(data.left as unknown[]), ...(data.right as unknown[])].every((child) => isRecord(child) && child.type !== "columns");
      default: return false;
    }
  });
}

// Screen Mapブロックの検証。frontend/src/pages/AIDesktop/screenMap.ts と scripts/ai-desktop-content.mjs と揃える。
const screenMapIdPattern = /^[a-z0-9][a-z0-9-]{0,99}$/u;
const screenMapLimits = { groups: 50, screens: 300, transitions: 1_000, imagesPerScreen: 10 };
const screenMapCoordinateLimit = 1_000_000;

function screenMapIds(entries: unknown[]) {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !screenMapIdPattern.test(entry.id) || ids.has(entry.id)) return null;
    ids.add(entry.id);
  }
  return ids;
}

function validScreenMap(value: Record<string, unknown>) {
  const { groups, screens, transitions, layout } = value;
  if (value.schemaVersion !== 1 || !Array.isArray(groups) || !Array.isArray(screens) || !Array.isArray(transitions) || !isRecord(layout) || !isRecord(layout.screens) || !isRecord(layout.groups)) return false;
  if (groups.length > screenMapLimits.groups || screens.length > screenMapLimits.screens || transitions.length > screenMapLimits.transitions) return false;
  const groupIds = screenMapIds(groups);
  const screenIds = screenMapIds(screens);
  if (!groupIds || !screenIds || !screenMapIds(transitions)) return false;
  const verification = (candidate: unknown) => candidate === "confirmed" || candidate === "ai-inferred";
  const coordinate = (candidate: unknown) => typeof candidate === "number" && Number.isFinite(candidate) && Math.abs(candidate) <= screenMapCoordinateLimit;
  const size = (candidate: unknown) => typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0 && candidate <= screenMapCoordinateLimit;
  const pixels = (candidate: unknown) => candidate === undefined || (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0 && candidate <= 100_000);
  const cardWidth = (candidate: unknown) => candidate === undefined || (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 40 && candidate <= 4_000);
  return groups.every((group) => isRecord(group) && validText(group.name, 100) && validText(group.description, 2_000))
    && screens.every((screen) => isRecord(screen) && validText(screen.name, 100)
      && (screen.groupId === undefined || (typeof screen.groupId === "string" && groupIds.has(screen.groupId)))
      && (screen.stateOf === undefined || (typeof screen.stateOf === "string" && screen.stateOf !== screen.id && screenIds.has(screen.stateOf)))
      && validText(screen.url, 2_000) && validText(screen.description, 5_000) && verification(screen.verification)
      && Array.isArray(screen.images) && screen.images.length <= screenMapLimits.imagesPerScreen
      && screen.images.every((image) => isRecord(image) && validText(image.imageId, 300) && validText(image.url, 2_000) && validText(image.thumbnailImageId, 300, true) && validText(image.thumbnailUrl, 2_000, true) && pixels(image.width) && pixels(image.height) && typeof image.masked === "boolean" && (image.capturedAt === undefined || (typeof image.capturedAt === "number" && Number.isInteger(image.capturedAt) && image.capturedAt > 0))))
    && transitions.every((transition) => isRecord(transition) && typeof transition.from === "string" && screenIds.has(transition.from) && typeof transition.to === "string" && screenIds.has(transition.to)
      && validText(transition.action, 200) && validText(transition.condition, 1_000) && verification(transition.verification))
    && Object.entries(layout.screens).every(([id, position]) => screenIds.has(id) && isRecord(position) && coordinate(position.x) && coordinate(position.y) && cardWidth(position.width))
    && Object.entries(layout.groups).every(([id, frame]) => groupIds.has(id) && isRecord(frame) && coordinate(frame.x) && coordinate(frame.y) && size(frame.width) && size(frame.height));
}

// kindが"screen-map"のカテゴリは、先頭にScreen Mapのページ（Screen Mapブロック1つだけ）を1つ持ち、ほかに通常のページを持てる。
// 通常のページにはScreen Mapブロックを置かせない。
function validCategoryItems(category: Record<string, unknown>) {
  const items = category.items;
  if (!Array.isArray(items) || items.length > 500) return false;
  const validItem = (item: unknown): item is Record<string, unknown> => isRecord(item) && validText(item.id, 300) && validText(item.navTitle, 200) && (item.pageWidth === undefined || item.pageWidth === "standard" || item.pageWidth === "wide" || item.pageWidth === "compact");
  const validPages = (pages: unknown[]) => pages.every((item) => validItem(item) && validateBlocks(item.blocks));
  if (category.kind === undefined) return validPages(items);
  if (category.kind !== "screen-map" || items.length === 0 || !validItem(items[0])) return false;
  const blocks = items[0].blocks;
  return Array.isArray(blocks) && blocks.length === 1 && isRecord(blocks[0]) && typeof blocks[0].id === "string" && blocks[0].type === "screenMap" && isRecord(blocks[0].data) && validScreenMap(blocks[0].data) && validPages(items.slice(1));
}

function validateCatalog(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new AIDesktopContentError("INVALID_INPUT");
  }
  const catalog = value;
  if (
    typeof catalog.name !== "string" ||
    typeof catalog.eyebrow !== "string" ||
    typeof catalog.introduction !== "string" ||
    catalog.schemaVersion !== 3 ||
    !Array.isArray(catalog.categoryGroups) ||
    catalog.categoryGroups.length > 100 ||
    !catalog.categoryGroups.every((group) => isRecord(group) && validText(group.id, 300) && validText(group.title, 100) && validText(group.description, 500) && Array.isArray(group.categories) && group.categories.length <= 100 && group.categories.every((category) => isRecord(category) && validText(category.id, 300) && validText(category.title, 100) && validText(category.description, 500) && validText(category.icon, 20) && (category.glossary === undefined || (Array.isArray(category.glossary) && category.glossary.length <= 500 && category.glossary.every((entry) => isRecord(entry) && validText(entry.id, 300) && validText(entry.term, 500) && validText(entry.description, 20_000)))) && validCategoryItems(category)))
  ) {
    throw new AIDesktopContentError("INVALID_INPUT");
  }
  const serialized = JSON.stringify(catalog);
  if (serialized.length > 2_000_000) {
    throw new AIDesktopContentError("INVALID_INPUT");
  }
  return catalog;
}

export async function listAIDesktopCatalogs(env: AIDesktopEnv, includeUnpublished = false) {
  const [result, metadataResult] = await Promise.all([
    env.DB.prepare("SELECT service_id, catalog_json, updated_at FROM ai_desktop_catalogs").all<{ service_id: string; catalog_json: string; updated_at: number }>(),
    env.DB.prepare("SELECT service_id, status, owner_id, created_by, updated_by, published_by, created_at, updated_at, published_at FROM ai_desktop_catalog_metadata").all<{ service_id: string; status: string; owner_id: string; created_by: string; updated_by: string; published_by: string | null; created_at: number; updated_at: number; published_at: number | null }>(),
  ]);
  const metadata = new Map(metadataResult.results.map((row) => [row.service_id, row]));
  const visibleRows = result.results.filter((row) => includeUnpublished || (metadata.get(row.service_id)?.status ?? "published") === "published");
  const catalogs = Object.fromEntries(visibleRows.map((row) => [row.service_id, JSON.parse(row.catalog_json) as Record<string, unknown>]));
  const publications = Object.fromEntries(visibleRows.map((row) => {
    const saved = metadata.get(row.service_id);
    return [row.service_id, {
      status: saved?.status === "draft" || saved?.status === "unpublished" ? saved.status : "published",
      ownerId: saved?.owner_id ?? "system",
      createdBy: saved?.created_by ?? "system",
      updatedBy: saved?.updated_by ?? "system",
      publishedBy: saved?.published_by ?? saved?.updated_by ?? "system",
      createdAt: saved?.created_at ?? row.updated_at,
      updatedAt: saved?.updated_at ?? row.updated_at,
      publishedAt: saved?.published_at ?? row.updated_at,
    }];
  }));
  return {
    catalogs,
    publications,
    updatedAt: Math.max(0, ...result.results.map((row) => row.updated_at)),
  };
}

export async function createAIDesktopCatalog(request: Request, env: AIDesktopEnv, createdBy: string) {
  const body = await request.json();
  if (!isRecord(body) || !validText(body.name, 100) || !String(body.name).trim() || !validText(body.eyebrow, 100) || !validText(body.introduction, 2_000)) throw new AIDesktopContentError("INVALID_INPUT");
  const baseId = String(body.name).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "material";
  const serviceId = `${baseId}-${crypto.randomUUID().slice(0, 8)}`;
  const catalog = validateCatalog({
    schemaVersion: 3,
    name: String(body.name).trim(),
    eyebrow: String(body.eyebrow).trim() || "KNOWLEDGE BASE",
    introduction: String(body.introduction).trim(),
    categoryGroups: [{ id: `group-${crypto.randomUUID().slice(0, 8)}`, title: "知識", description: "資料のカテゴリを整理します。", categories: [] }],
  });
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO ai_desktop_catalogs (service_id, catalog_json, updated_at) VALUES (?, ?, ?)").bind(serviceId, JSON.stringify(catalog), now),
    env.DB.prepare(`INSERT INTO ai_desktop_catalog_metadata (service_id, status, owner_id, created_by, updated_by, created_at, updated_at)
      VALUES (?, 'draft', ?, ?, ?, ?, ?)`).bind(serviceId, createdBy, createdBy, createdBy, now, now),
  ]);
  return { serviceId, catalog, publication: { status: "draft" as const, ownerId: createdBy, createdBy, updatedBy: createdBy, publishedBy: null, createdAt: now, updatedAt: now, publishedAt: null } };
}

export async function setAIDesktopCatalogPublication(request: Request, env: AIDesktopEnv, updatedBy: string, serviceId: string) {
  if (!validServiceId(serviceId)) throw new AIDesktopContentError("INVALID_INPUT");
  const body = await request.json();
  if (!isRecord(body) || typeof body.published !== "boolean") throw new AIDesktopContentError("INVALID_INPUT");
  const exists = await env.DB.prepare("SELECT service_id FROM ai_desktop_catalogs WHERE service_id = ?").bind(serviceId).first();
  if (!exists) throw new AIDesktopContentError("NOT_FOUND");
  const now = Date.now();
  const status = body.published ? "published" : "unpublished";
  await env.DB.prepare(`INSERT INTO ai_desktop_catalog_metadata (service_id, status, owner_id, created_by, updated_by, published_by, created_at, updated_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(service_id) DO UPDATE SET status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
      published_by = CASE WHEN excluded.status = 'published' THEN excluded.published_by ELSE ai_desktop_catalog_metadata.published_by END,
      published_at = CASE WHEN excluded.status = 'published' THEN excluded.published_at ELSE ai_desktop_catalog_metadata.published_at END`)
    .bind(serviceId, status, updatedBy, updatedBy, updatedBy, body.published ? updatedBy : null, now, now, body.published ? now : null).run();
  return { publication: { serviceId, status, updatedBy, updatedAt: now, publishedBy: body.published ? updatedBy : null, publishedAt: body.published ? now : null } };
}

type CatalogDocument = {
  key: string;
  serviceId: string;
  serviceName: string;
  categoryId: string;
  categoryTitle: string;
  contentId: string;
  title: string;
  serialized: string;
};

function documentsFromCatalog(serviceId: string, catalog: Record<string, unknown>) {
  const documents = new Map<string, CatalogDocument>();
  const serviceName = typeof catalog.name === "string" ? catalog.name : serviceId;
  const groups = Array.isArray(catalog.categoryGroups) ? catalog.categoryGroups : [];
  for (const groupValue of groups) {
    if (!isRecord(groupValue) || !Array.isArray(groupValue.categories)) continue;
    for (const categoryValue of groupValue.categories) {
      if (!isRecord(categoryValue) || typeof categoryValue.id !== "string" || !Array.isArray(categoryValue.items)) continue;
      const categoryTitle = typeof categoryValue.title === "string" ? categoryValue.title : categoryValue.id;
      for (const itemValue of categoryValue.items) {
        if (!isRecord(itemValue) || typeof itemValue.id !== "string") continue;
        const key = `${serviceId}:${categoryValue.id}:${itemValue.id}`;
        documents.set(key, {
          key,
          serviceId,
          serviceName,
          categoryId: categoryValue.id,
          categoryTitle,
          contentId: itemValue.id,
          title: typeof itemValue.navTitle === "string" ? itemValue.navTitle : itemValue.id,
          serialized: JSON.stringify(itemValue),
        });
      }
    }
  }
  return documents;
}

export async function listAIDesktopDocuments(env: AIDesktopEnv, includeUnpublished = false) {
  const [catalogRows, metadataRows, catalogMetadataRows] = await Promise.all([
    env.DB.prepare("SELECT service_id, catalog_json, updated_at FROM ai_desktop_catalogs").all<{ service_id: string; catalog_json: string; updated_at: number }>(),
    env.DB.prepare("SELECT document_key, status, visibility, owner_id, created_by, updated_by, published_by, created_at, updated_at, published_at FROM ai_desktop_documents").all<{ document_key: string; status: string; visibility: string; owner_id: string; created_by: string; updated_by: string; published_by: string | null; created_at: number; updated_at: number; published_at: number | null }>(),
    env.DB.prepare("SELECT service_id, status FROM ai_desktop_catalog_metadata").all<{ service_id: string; status: string }>(),
  ]);
  const metadata = new Map(metadataRows.results.map((row) => [row.document_key, row]));
  const catalogStatuses = new Map(catalogMetadataRows.results.map((row) => [row.service_id, row.status]));
  const documents = catalogRows.results.filter((row) => includeUnpublished || (catalogStatuses.get(row.service_id) ?? "published") === "published").flatMap((row) => {
    const catalog = JSON.parse(row.catalog_json) as Record<string, unknown>;
    return [...documentsFromCatalog(row.service_id, catalog).values()].map((document) => {
      const saved = metadata.get(document.key);
      const catalogStatus = catalogStatuses.get(row.service_id);
      const status = catalogStatus === "draft" || catalogStatus === "unpublished" ? catalogStatus : "published";
      return {
        serviceId: document.serviceId,
        serviceName: document.serviceName,
        categoryId: document.categoryId,
        categoryTitle: document.categoryTitle,
        contentId: document.contentId,
        title: document.title,
        status,
        visibility: saved?.visibility ?? "team",
        ownerId: saved?.owner_id ?? "system",
        createdBy: saved?.created_by ?? "system",
        updatedBy: saved?.updated_by ?? "system",
        publishedBy: saved?.published_by ?? saved?.updated_by ?? "system",
        createdAt: saved?.created_at ?? row.updated_at,
        updatedAt: saved?.updated_at ?? row.updated_at,
        publishedAt: saved?.published_at ?? row.updated_at,
      };
    });
  });
  return { documents: documents.sort((a, b) => b.updatedAt - a.updatedAt) };
}

function collectImageReferences(value: unknown, path: string, references: Map<string, string[]>) {
  if (Array.isArray(value)) {
    value.forEach((child) => collectImageReferences(child, path, references));
    return;
  }
  if (!isRecord(value)) return;
  if (value.type === "image" && isRecord(value.data) && typeof value.data.imageId === "string" && value.data.imageId) {
    references.set(value.data.imageId, [...(references.get(value.data.imageId) ?? []), path]);
  }
  // Screen Mapのスクリーンショットも、画像一覧で「使われている画像」として数える。
  if (value.type === "screenMap" && isRecord(value.data) && Array.isArray(value.data.screens)) {
    for (const screen of value.data.screens) {
      if (!isRecord(screen) || !Array.isArray(screen.images)) continue;
      for (const image of screen.images) {
        if (!isRecord(image)) continue;
        for (const imageId of [image.imageId, image.thumbnailImageId]) {
          if (typeof imageId === "string" && imageId) references.set(imageId, [...(references.get(imageId) ?? []), path]);
        }
      }
    }
  }
  Object.values(value).forEach((child) => collectImageReferences(child, path, references));
}

export async function listAIDesktopImages(request: Request, env: AIDesktopEnv) {
  const [objects, catalogs] = await Promise.all([
    env.MEDIA.list({ prefix: "ai-desktop/", limit: 1000, include: ["httpMetadata", "customMetadata"] }),
    env.DB.prepare("SELECT service_id, catalog_json FROM ai_desktop_catalogs").all<{ service_id: string; catalog_json: string }>(),
  ]);
  const references = new Map<string, string[]>();
  for (const row of catalogs.results) {
    try {
      const catalog = JSON.parse(row.catalog_json) as Record<string, unknown>;
      const categories = Array.isArray(catalog.categoryGroups) ? catalog.categoryGroups.flatMap((group) => isRecord(group) && Array.isArray(group.categories) ? group.categories : []) : Array.isArray(catalog.categories) ? catalog.categories : [];
      for (const categoryValue of categories) {
        if (!isRecord(categoryValue)) continue;
        const categoryTitle = typeof categoryValue.title === "string" ? categoryValue.title : "カテゴリ";
        const items = Array.isArray(categoryValue.items) ? categoryValue.items : [];
        for (const itemValue of items) {
          if (!isRecord(itemValue)) continue;
          const itemTitle = typeof itemValue.navTitle === "string" ? itemValue.navTitle : typeof itemValue.title === "string" ? itemValue.title : "コンテンツ";
          const referencePath = `${row.service_id} / ${categoryTitle} / ${itemTitle}`;
          if (Array.isArray(itemValue.images)) {
            for (const image of itemValue.images) {
              if (isRecord(image) && typeof image.id === "string" && image.id) references.set(image.id, [...(references.get(image.id) ?? []), referencePath]);
            }
          }
          collectImageReferences(itemValue, referencePath, references);
        }
      }
    } catch { /* 壊れたカタログは画像一覧全体を失敗させない。 */ }
  }
  const origin = new URL(request.url).origin;
  return {
    images: objects.objects.map((object) => {
      const id = object.key.slice("ai-desktop/".length);
      const imageReferences = references.get(id) ?? [];
      const folders = new Set(imageReferences.map((reference) => reference.split(" / ", 1)[0]).filter(validServiceId));
      if (validServiceId(object.customMetadata?.folder)) folders.add(object.customMetadata.folder);
      return { id, url: `${origin}/api/ai-desktop/images/${id}`, name: object.customMetadata?.originalName ?? id, size: object.size, uploadedAt: object.uploaded.getTime(), references: imageReferences, folders: folders.size ? [...folders] : ["unfiled"] };
    }).sort((a, b) => b.uploadedAt - a.uploadedAt),
    truncated: objects.truncated,
  };
}

export async function saveAIDesktopCatalog(
  request: Request,
  env: AIDesktopEnv,
  serviceId: string,
  updatedBy: string,
) {
  if (!validServiceId(serviceId)) throw new AIDesktopContentError("NOT_FOUND");
  const catalog = validateCatalog(await request.json());
  const updatedAt = Date.now();
  const currentRow = await env.DB.prepare("SELECT catalog_json FROM ai_desktop_catalogs WHERE service_id = ?").bind(serviceId).first<{ catalog_json: string }>();
  const previousCatalog = currentRow ? JSON.parse(currentRow.catalog_json) as Record<string, unknown> : null;
  const previousDocuments = previousCatalog ? documentsFromCatalog(serviceId, previousCatalog) : new Map<string, CatalogDocument>();
  const nextDocuments = documentsFromCatalog(serviceId, catalog);
  const saveCatalogStatement = env.DB.prepare(
    `INSERT INTO ai_desktop_catalogs (service_id, catalog_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(service_id) DO UPDATE SET
       catalog_json = excluded.catalog_json,
       updated_at = excluded.updated_at`,
  ).bind(serviceId, JSON.stringify(catalog), updatedAt);
  const statements: D1PreparedStatement[] = [];
  for (const document of nextDocuments.values()) {
    if (previousDocuments.get(document.key)?.serialized === document.serialized) continue;
    statements.push(env.DB.prepare(`INSERT INTO ai_desktop_documents (document_key, service_id, category_id, content_id, title, status, visibility, owner_id, created_by, updated_by, published_by, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, 'published', 'team', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_key) DO UPDATE SET title = excluded.title, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(document.key, serviceId, document.categoryId, document.contentId, document.title, updatedBy, updatedBy, updatedBy, updatedBy, updatedAt, updatedAt, updatedAt));
  }
  for (const document of previousDocuments.values()) {
    if (!nextDocuments.has(document.key)) statements.push(env.DB.prepare("UPDATE ai_desktop_documents SET status = 'unpublished', updated_by = ?, updated_at = ? WHERE document_key = ?").bind(updatedBy, updatedAt, document.key));
  }
  const updateCatalogMetadata = env.DB.prepare("UPDATE ai_desktop_catalog_metadata SET updated_by = ?, updated_at = ? WHERE service_id = ?").bind(updatedBy, updatedAt, serviceId);
  await env.DB.batch([saveCatalogStatement, updateCatalogMetadata, ...statements]);
  return { catalog, updatedAt };
}

export async function createAIDesktopDocument(request: Request, env: AIDesktopEnv, createdBy: string) {
  const body = await request.json();
  if (!isRecord(body) || !validServiceId(body.serviceId) || !validText(body.categoryId, 300) || !validText(body.title, 200) || !String(body.title).trim()) throw new AIDesktopContentError("INVALID_INPUT");
  const serviceId = String(body.serviceId);
  const categoryId = String(body.categoryId);
  const row = await env.DB.prepare("SELECT catalog_json FROM ai_desktop_catalogs WHERE service_id = ?").bind(serviceId).first<{ catalog_json: string }>();
  if (!row) throw new AIDesktopContentError("NOT_FOUND");
  const catalog = JSON.parse(row.catalog_json) as Record<string, unknown>;
  const groups = Array.isArray(catalog.categoryGroups) ? catalog.categoryGroups : [];
  let found = false;
  const contentId = `document-${crypto.randomUUID()}`;
  const title = String(body.title).trim();
  catalog.categoryGroups = groups.map((groupValue) => {
    if (!isRecord(groupValue) || !Array.isArray(groupValue.categories)) return groupValue;
    return { ...groupValue, categories: groupValue.categories.map((categoryValue) => {
      if (!isRecord(categoryValue) || categoryValue.id !== categoryId || !Array.isArray(categoryValue.items)) return categoryValue;
      found = true;
      return { ...categoryValue, items: [...categoryValue.items, { id: contentId, navTitle: title, blocks: [] }] };
    }) };
  });
  if (!found) throw new AIDesktopContentError("NOT_FOUND");
  const validatedCatalog = validateCatalog(catalog);
  const now = Date.now();
  const documentKey = `${serviceId}:${categoryId}:${contentId}`;
  await env.DB.batch([
    env.DB.prepare("UPDATE ai_desktop_catalogs SET catalog_json = ?, updated_at = ? WHERE service_id = ?").bind(JSON.stringify(validatedCatalog), now, serviceId),
    env.DB.prepare(`INSERT INTO ai_desktop_documents (document_key, service_id, category_id, content_id, title, status, visibility, owner_id, created_by, updated_by, published_by, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, 'draft', 'private', ?, ?, ?, NULL, ?, ?, NULL)`).bind(documentKey, serviceId, categoryId, contentId, title, createdBy, createdBy, createdBy, now, now),
  ]);
  return { document: { serviceId, categoryId, contentId, title, status: "draft" as const, visibility: "private" as const, ownerId: createdBy, createdBy, updatedBy: createdBy, publishedBy: null, createdAt: now, updatedAt: now, publishedAt: null }, catalog: validatedCatalog };
}

function draftKey(scope: string, serviceId: string, categoryId: string, contentId?: string) {
  if ((scope !== "category" && scope !== "content") || !validServiceId(serviceId) || !categoryId || categoryId.length > 300 || (scope === "content" && (!contentId || contentId.length > 300))) throw new AIDesktopContentError("INVALID_INPUT");
  return `${scope}:${serviceId}:${categoryId}:${scope === "content" ? contentId : "_"}`;
}

export async function getAIDesktopContentDraft(env: AIDesktopEnv, scope: string, serviceId: string, categoryId: string, contentId?: string) {
  const key = draftKey(scope, serviceId, categoryId, contentId);
  const row = await env.DB.prepare("SELECT payload_json, revision, status, updated_by, created_at, updated_at FROM ai_desktop_content_drafts WHERE draft_key = ?").bind(key).first<{ payload_json: string; revision: number; status: string; updated_by: string; created_at: number; updated_at: number }>();
  return row ? { draft: { scope, serviceId, categoryId, contentId: scope === "content" ? contentId : null, payload: JSON.parse(row.payload_json), revision: row.revision, status: row.status, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at } } : { draft: null };
}

export async function saveAIDesktopContentDraft(request: Request, env: AIDesktopEnv, updatedBy: string, scope: string, serviceId: string, categoryId: string, contentId?: string) {
  const key = draftKey(scope, serviceId, categoryId, contentId);
  const body = await request.json();
  if (!isRecord(body) || !isRecord(body.payload) || (body.expectedRevision !== undefined && (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 0))) throw new AIDesktopContentError("INVALID_INPUT");
  const payloadJson = JSON.stringify(body.payload);
  if (payloadJson.length > 2_000_000) throw new AIDesktopContentError("INVALID_INPUT");
  const current = await env.DB.prepare("SELECT revision FROM ai_desktop_content_drafts WHERE draft_key = ?").bind(key).first<{ revision: number }>();
  if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== (current?.revision ?? 0)) throw new AIDesktopContentError("CONFLICT");
  const now = Date.now();
  const revision = (current?.revision ?? 0) + 1;
  await env.DB.prepare(`INSERT INTO ai_desktop_content_drafts (draft_key, scope, service_id, category_id, content_id, payload_json, revision, status, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'editing', ?, ?, ?) ON CONFLICT(draft_key) DO UPDATE SET payload_json = excluded.payload_json, revision = excluded.revision, status = 'editing', updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(key, scope, serviceId, categoryId, scope === "content" ? contentId : null, payloadJson, revision, updatedBy, now, now).run();
  if (scope === "content") {
    const content = isRecord(body.payload.content) ? body.payload.content : null;
    const contentTitle = content && typeof content.navTitle === "string" ? content.navTitle.slice(0, 200) : "名称未設定";
    await env.DB.prepare("INSERT INTO ai_desktop_content_draft_history (draft_key, service_id, category_id, content_id, content_title, revision, saved_by, saved_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(key, serviceId, categoryId, contentId ?? "", contentTitle, revision, updatedBy, now, payloadJson).run();
    await env.DB.prepare("DELETE FROM ai_desktop_content_draft_history WHERE service_id = ? AND category_id = ? AND id NOT IN (SELECT id FROM ai_desktop_content_draft_history WHERE service_id = ? AND category_id = ? ORDER BY saved_at DESC, id DESC LIMIT 50)").bind(serviceId, categoryId, serviceId, categoryId).run();
  }
  return { draft: { scope, serviceId, categoryId, contentId: scope === "content" ? contentId : null, payload: body.payload, revision, status: "editing", updatedBy, createdAt: now, updatedAt: now } };
}

export async function listAIDesktopContentDraftHistory(env: AIDesktopEnv, serviceId: string, categoryId: string, contentId: string) {
  if (!validServiceId(serviceId) || !categoryId || categoryId.length > 300 || !contentId || contentId.length > 300) throw new AIDesktopContentError("INVALID_INPUT");
  const result = await env.DB.prepare("SELECT id, content_id, content_title, revision, saved_by, saved_at, payload_json IS NOT NULL AS has_preview FROM ai_desktop_content_draft_history WHERE service_id = ? AND category_id = ? AND content_id = ? ORDER BY saved_at DESC, id DESC LIMIT 10").bind(serviceId, categoryId, contentId).all<{ id: number; content_id: string; content_title: string; revision: number; saved_by: string; saved_at: number; has_preview: number }>();
  return { history: result.results.map((row) => ({ id: row.id, contentId: row.content_id, contentTitle: row.content_title, revision: row.revision, savedBy: row.saved_by, savedAt: row.saved_at, hasPreview: Boolean(row.has_preview) })) };
}

export async function getAIDesktopContentDraftHistory(env: AIDesktopEnv, serviceId: string, categoryId: string, historyId: string) {
  if (!validServiceId(serviceId) || !categoryId || categoryId.length > 300 || !/^\d+$/.test(historyId)) throw new AIDesktopContentError("INVALID_INPUT");
  const row = await env.DB.prepare("SELECT id, content_id, content_title, revision, saved_by, saved_at, payload_json FROM ai_desktop_content_draft_history WHERE id = ? AND service_id = ? AND category_id = ?").bind(Number(historyId), serviceId, categoryId).first<{ id: number; content_id: string; content_title: string; revision: number; saved_by: string; saved_at: number; payload_json: string | null }>();
  if (!row) throw new AIDesktopContentError("NOT_FOUND");
  return { history: { id: row.id, contentId: row.content_id, contentTitle: row.content_title, revision: row.revision, savedBy: row.saved_by, savedAt: row.saved_at, payload: row.payload_json ? JSON.parse(row.payload_json) : null } };
}

export async function deleteAIDesktopContentDraftHistory(env: AIDesktopEnv, serviceId: string, categoryId: string, contentId: string) {
  if (!validServiceId(serviceId) || !categoryId || categoryId.length > 300 || !contentId || contentId.length > 300) throw new AIDesktopContentError("INVALID_INPUT");
  const key = draftKey("content", serviceId, categoryId, contentId);
  const [deleted] = await env.DB.batch([
    env.DB.prepare("DELETE FROM ai_desktop_content_draft_history WHERE service_id = ? AND category_id = ? AND content_id = ?").bind(serviceId, categoryId, contentId),
    env.DB.prepare("UPDATE ai_desktop_content_drafts SET revision = 0 WHERE draft_key = ?").bind(key),
  ]);
  return { deleted: deleted.meta.changes ?? 0, revision: 0 };
}

const imageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

export async function uploadAIDesktopImage(
  request: Request,
  env: AIDesktopEnv,
) {
  const formData = await request.formData();
  const file = formData.get("file");
  const requestedFolder = formData.get("folder");
  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) {
    throw new AIDesktopContentError("INVALID_INPUT");
  }
  const extension = imageTypes.get(file.type);
  if (!extension) throw new AIDesktopContentError("INVALID_INPUT");
  const id = `${crypto.randomUUID()}.${extension}`;
  await env.MEDIA.put(`ai-desktop/${id}`, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { originalName: file.name.slice(0, 200), ...(validServiceId(requestedFolder) ? { folder: requestedFolder } : {}) },
  });
  return {
    id,
    url: `${new URL(request.url).origin}/api/ai-desktop/images/${id}`,
    contentType: file.type,
    size: file.size,
  };
}

export async function serveAIDesktopImage(env: AIDesktopEnv, id: string) {
  const object = await env.MEDIA.get(`ai-desktop/${id}`);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}

export async function deleteAIDesktopImage(env: AIDesktopEnv, id: string) {
  await env.MEDIA.delete(`ai-desktop/${id}`);
}


const desktopAppIds = ["my-documents", "documents", "projects", "design-documents", "explorer", "settings"] as const;

function validateDesktopState(value: unknown) {
  if (!isRecord(value) || typeof value.taskbarVisible !== "boolean" || !isRecord(value.iconPositions)) throw new AIDesktopContentError("INVALID_INPUT");
  if (value.theme !== "light" && value.theme !== "dark") throw new AIDesktopContentError("INVALID_INPUT");
  const iconPositions = Object.fromEntries(desktopAppIds.map((id) => {
    const fallbackPositions = { "my-documents": { x: 18, y: 18 }, documents: { x: 18, y: 110 }, projects: { x: 18, y: 202 }, "design-documents": { x: 18, y: 294 }, explorer: { x: 18, y: 386 }, settings: { x: 18, y: 478 } } as const;
    const position = value.iconPositions[id] ?? fallbackPositions[id];
    if (!isRecord(position) || typeof position.x !== "number" || typeof position.y !== "number" || !Number.isFinite(position.x) || !Number.isFinite(position.y) || position.x < 0 || position.y < 0 || position.x > 10_000 || position.y > 10_000) throw new AIDesktopContentError("INVALID_INPUT");
    return [id, { x: Math.round(position.x), y: Math.round(position.y) }];
  }));
  const customAppsValue = value.customApps ?? [];
  if (!Array.isArray(customAppsValue) || customAppsValue.length > 50) throw new AIDesktopContentError("INVALID_INPUT");
  const customApps = customAppsValue.map((app) => {
    if (!isRecord(app) || !validText(app.id, 100) || !/^custom-[a-zA-Z0-9-]+$/.test(String(app.id)) || !validText(app.name, 80) || !validText(app.url, 2_000) || !validText(app.mark, 20) || !validText(app.color, 20) || !/^#[0-9a-fA-F]{6}$/.test(String(app.color))) throw new AIDesktopContentError("INVALID_INPUT");
    let url: URL;
    try { url = new URL(String(app.url)); } catch { throw new AIDesktopContentError("INVALID_INPUT"); }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new AIDesktopContentError("INVALID_INPUT");
    return { id: String(app.id), name: String(app.name), url: url.toString(), mark: String(app.mark), color: String(app.color) };
  });
  if (new Set(customApps.map((app) => app.id)).size !== customApps.length) throw new AIDesktopContentError("INVALID_INPUT");
  const visibilityValue = value.desktopAppVisibility ?? {};
  if (!isRecord(visibilityValue)) throw new AIDesktopContentError("INVALID_INPUT");
  const allowedAppIds = new Set([...desktopAppIds, ...customApps.map((app) => app.id)]);
  const desktopAppVisibility = Object.fromEntries(Object.entries(visibilityValue).filter(([id, visible]) => allowedAppIds.has(id) && typeof visible === "boolean"));
  // タスクバーの位置は後から追加した項目のため、未設定なら従来どおり下に置く。
  const taskbarPosition = value.taskbarPosition === "left" || value.taskbarPosition === "right" ? value.taskbarPosition : "bottom";
  return { iconPositions, taskbarVisible: value.taskbarVisible, taskbarPosition, theme: value.theme, customApps, desktopAppVisibility };
}

export async function getAIDesktopState(env: AIDesktopEnv) {
  const row = await env.DB.prepare("SELECT state_json, updated_at, updated_by FROM ai_desktop_state WHERE state_key = 'shared'").first<{ state_json: string; updated_at: number; updated_by: string | null }>();
  return row ? { state: JSON.parse(row.state_json), updatedAt: row.updated_at, updatedBy: row.updated_by } : { state: null, updatedAt: 0, updatedBy: null };
}

export async function saveAIDesktopState(request: Request, env: AIDesktopEnv, updatedBy: string) {
  const state = validateDesktopState(await request.json());
  const updatedAt = Date.now();
  await env.DB.prepare(`INSERT INTO ai_desktop_state (state_key, state_json, updated_at, updated_by) VALUES ('shared', ?, ?, ?) ON CONFLICT(state_key) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).bind(JSON.stringify(state), updatedAt, updatedBy).run();
  return { state, updatedAt, updatedBy };
}
