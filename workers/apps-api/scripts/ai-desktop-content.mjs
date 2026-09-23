import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { JSDOM } from "jsdom";

const mermaidDom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = mermaidDom.window;
globalThis.document = mermaidDom.window.document;
globalThis.DOMParser = mermaidDom.window.DOMParser;
globalThis.XMLSerializer = mermaidDom.window.XMLSerializer;
globalThis.HTMLElement = mermaidDom.window.HTMLElement;
globalThis.SVGElement = mermaidDom.window.SVGElement;
globalThis.Node = mermaidDom.window.Node;
Object.defineProperty(globalThis, "navigator", { value: mermaidDom.window.navigator, configurable: true });
const { default: mermaid } = await import("mermaid");

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(apiRoot, "../..");
const wrangler = resolve(apiRoot, "node_modules/.bin/wrangler");
const database = "hundred-apps-prod";
const blockCatalogPath = resolve(workspaceRoot, "frontend/src/pages/AIDesktop/contentBlockCatalog.json");
const blockCatalog = JSON.parse(readFileSync(blockCatalogPath, "utf8"));
const supportedBlockTypes = new Set([...blockCatalog.allowedTypes, "checklist", "toc", "glossary"]);
const badgeTones = new Set(["neutral", "info", "success", "warning", "danger"]);
const diagramStarts = {
  flowchart: /^\s*(?:flowchart|graph)\b/iu,
  sequence: /^\s*sequenceDiagram\b/u,
  architecture: /^\s*architecture-beta\b/u,
  er: /^\s*erDiagram\b/u,
  state: /^\s*stateDiagram(?:-v2)?\b/u,
};

function usage(message) {
  if (message) console.error(`エラー: ${message}\n`);
  console.error(`使い方:
  npm run ai-desktop:pull -- --service codex --category <ID> --content <ID> [--local|--remote] [--file <path>]
  npm run ai-desktop:push -- --file <path> [--service codex --category <ID> --content <ID>] [--local|--remote] [--dry-run]`);
  process.exit(1);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--local" || token === "--remote" || token === "--dry-run") {
      values[token.slice(2)] = true;
      continue;
    }
    if (!token.startsWith("--")) usage(`不明な引数です: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) usage(`${token} の値がありません`);
    values[token.slice(2)] = value;
    index += 1;
  }
  if (values.local && values.remote) usage("--local と --remote は同時に指定できません");
  return values;
}

function targetFlag(args) {
  return args.remote ? "--remote" : "--local";
}

function databaseTarget(args) {
  return targetFlag(args).slice(2);
}

function defaultWorkspacePath(args, serviceId, categoryId, contentId) {
  return resolve(workspaceRoot, "ai-desktop-workspace", databaseTarget(args), safeName(serviceId), safeName(categoryId), `${safeName(contentId)}.json`);
}

function executeD1(args, extraArgs) {
  const output = execFileSync(wrangler, ["d1", "execute", database, targetFlag(args), "--json", ...extraArgs], {
    cwd: apiRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", WRANGLER_LOG_PATH: resolve(tmpdir(), "hundred-wrangler.log") },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || !parsed.every((entry) => entry?.success)) throw new Error("D1の処理に失敗しました");
  return parsed.flatMap((entry) => Array.isArray(entry.results) ? entry.results : []);
}

function requiredId(value, name) {
  if (typeof value !== "string" || !value || value.length > 300) usage(`${name} を指定してください`);
  return value;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function safeName(value) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
}

function validGlossary(value) {
  return Array.isArray(value) && value.length <= 500 && value.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.id === "string" && entry.id.length <= 300 && typeof entry.term === "string" && entry.term.length <= 500 && typeof entry.description === "string" && entry.description.length <= 20_000);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 300 && !value.startsWith("example-");
}

function validBadges(value, max) {
  return value === undefined || (Array.isArray(value) && value.length <= max && value.every((badge) => isRecord(badge) && validId(badge.id) && typeof badge.label === "string" && badge.label.length <= 40 && badgeTones.has(badge.tone)));
}

function registerNestedIds(entries, ids) {
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`IDが重複しています: ${entry.id}`);
    ids.add(entry.id);
  }
}

function validateBlocks(blocks, nested = false, ids = new Set()) {
  if (!Array.isArray(blocks) || blocks.length > 1_000) throw new Error("content.blocksの形式または件数が正しくありません");
  for (const block of blocks) {
    if (!isRecord(block) || !validId(block.id) || typeof block.type !== "string" || !supportedBlockTypes.has(block.type) || !isRecord(block.data)) throw new Error("ブロックのid・type・dataが正しくありません");
    if (ids.has(block.id)) throw new Error(`ブロックIDが重複しています: ${block.id}`);
    ids.add(block.id);
    const data = block.data;
    switch (block.type) {
      case "heading":
        if (typeof data.text !== "string" || ![1, 2, 3].includes(data.level)) throw new Error(`${block.id}: 見出しの形式が正しくありません`);
        break;
      case "text":
        if (typeof data.text !== "string") throw new Error(`${block.id}: テキストの形式が正しくありません`);
        break;
      case "image":
        if (typeof data.imageId !== "string" || data.imageId.length > 300 || typeof data.url !== "string" || data.url.length > 2_000 || typeof data.alt !== "string" || data.alt.length > 500 || typeof data.caption !== "string" || data.caption.length > 2_000) throw new Error(`${block.id}: 画像の形式または文字数が正しくありません`);
        break;
      case "code":
        if (typeof data.code !== "string" || typeof data.language !== "string" || (data.filename !== undefined && typeof data.filename !== "string")) throw new Error(`${block.id}: コードの形式が正しくありません`);
        break;
      case "checklist":
        if (!Array.isArray(data.items) || !data.items.every((item) => isRecord(item) && validId(item.id) && typeof item.text === "string")) throw new Error(`${block.id}: チェックリストの形式が正しくありません`);
        for (const item of data.items) { if (ids.has(item.id)) throw new Error(`IDが重複しています: ${item.id}`); ids.add(item.id); }
        break;
      case "callout":
        if (typeof data.text !== "string" || !["info", "warning", "tip"].includes(data.tone) || (data.title !== undefined && typeof data.title !== "string")) throw new Error(`${block.id}: 注意／補足の形式が正しくありません`);
        break;
      case "divider":
      case "toc":
        break;
      case "link":
        if (typeof data.label !== "string" || typeof data.url !== "string") throw new Error(`${block.id}: リンクの形式が正しくありません`);
        break;
      case "glossary":
        if (!validGlossary(data.entries)) throw new Error(`${block.id}: 用語ブロックの形式が正しくありません`);
        break;
      case "card": {
        if (![1, 2, 3].includes(data.columns) || !Array.isArray(data.items) || data.items.length > 12 || !data.items.every((item) => isRecord(item) && validId(item.id) && typeof item.title === "string" && item.title.length <= 200 && typeof item.description === "string" && item.description.length <= 5_000 && validBadges(item.badges, 4) && (item.link === undefined || (isRecord(item.link) && typeof item.link.label === "string" && typeof item.link.url === "string")))) throw new Error(`${block.id}: カードの形式が正しくありません`);
        registerNestedIds(data.items, ids);
        registerNestedIds(data.items.flatMap((item) => item.badges ?? []), ids);
        break;
      }
      case "steps": {
        if (!Array.isArray(data.items) || data.items.length > 20 || !data.items.every((item) => isRecord(item) && validId(item.id) && typeof item.title === "string" && item.title.length <= 200 && typeof item.text === "string" && item.text.length <= 5_000 && validBadges(item.badges, 3))) throw new Error(`${block.id}: 手順の形式が正しくありません`);
        registerNestedIds(data.items, ids);
        registerNestedIds(data.items.flatMap((item) => item.badges ?? []), ids);
        break;
      }
      case "diagram":
        if (nested || typeof data.kind !== "string" || !diagramStarts[data.kind] || typeof data.title !== "string" || typeof data.source !== "string" || data.source.length > 50_000 || !diagramStarts[data.kind].test(data.source) || (data.caption !== undefined && typeof data.caption !== "string")) throw new Error(`${block.id}: 技術図の形式または種類が正しくありません`);
        break;
      case "table": {
        const columns = data.columns;
        const rows = data.rows;
        if (!Array.isArray(columns) || columns.length === 0 || !columns.every((column) => isRecord(column) && validId(column.id) && typeof column.label === "string" && typeof column.width === "number" && Number.isFinite(column.width) && column.width >= 10 && column.width <= 100)) throw new Error(`${block.id}: 表の列が正しくありません`);
        if (!Array.isArray(rows) || !rows.every((row) => isRecord(row) && validId(row.id) && Array.isArray(row.cells) && row.cells.length === columns.length && row.cells.every((cell) => typeof cell === "string"))) throw new Error(`${block.id}: 表の行が正しくありません`);
        if (!["compact", "standard", "comfortable"].includes(data.rowHeight) || (data.tableWidth !== undefined && (typeof data.tableWidth !== "number" || data.tableWidth < 100 || data.tableWidth > 300))) throw new Error(`${block.id}: 表の表示設定が正しくありません`);
        for (const entry of [...columns, ...rows]) { if (ids.has(entry.id)) throw new Error(`IDが重複しています: ${entry.id}`); ids.add(entry.id); }
        break;
      }
      case "columns":
        if (nested) throw new Error(`${block.id}: 2カラム内に2カラムは配置できません`);
        validateBlocks(data.left, true, ids);
        validateBlocks(data.right, true, ids);
        break;
    }
  }
  return true;
}

async function validateMermaidBlocks(blocks) {
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, suppressErrorRendering: true, maxTextSize: 50_000, maxEdges: 200 });
  for (const block of blocks) {
    if (block.type === "diagram") {
      const valid = await mermaid.parse(block.data.source, { suppressErrors: true });
      if (!valid) throw new Error(`${block.id}: Mermaid構文を解析できません`);
    }
    if (block.type === "columns") await validateMermaidBlocks([...block.data.left, ...block.data.right]);
  }
}

function currentBlockCatalog() {
  return structuredClone(blockCatalog);
}

function automaticLayoutContent(content) {
  const next = structuredClone(content);
  delete next.pageWidth;
  return next;
}

function loadPublishedCategory(args, serviceId, categoryId) {
  const rows = executeD1(args, ["--command", `SELECT catalog_json FROM ai_desktop_catalogs WHERE service_id = ${sqlText(serviceId)} LIMIT 1;`]);
  if (!rows[0]?.catalog_json) throw new Error(`${serviceId} の公開カタログがDBにありません`);
  const catalog = JSON.parse(rows[0].catalog_json);
  const category = catalog.categoryGroups?.flatMap((group) => group.categories ?? []).find((candidate) => candidate.id === categoryId);
  if (!category) throw new Error(`カテゴリが見つかりません: ${categoryId}`);
  return category;
}

function pull(args) {
  const serviceId = requiredId(args.service, "--service");
  const categoryId = requiredId(args.category, "--category");
  const contentId = requiredId(args.content, "--content");
  const source = args.source ?? "published";
  if (source !== "published" && source !== "draft") throw new Error("--source は published または draft を指定してください");
  if (source === "draft") {
    const key = `content:${serviceId}:${categoryId}:${contentId}`;
    const rows = executeD1(args, ["--command", `SELECT payload_json, revision FROM ai_desktop_content_drafts WHERE draft_key = ${sqlText(key)} LIMIT 1;`]);
    if (!rows[0]?.payload_json) throw new Error(`${contentId} のAI下書きがDBにありません`);
    const payload = JSON.parse(rows[0].payload_json);
    payload.content = automaticLayoutContent(payload.content);
    if (payload.glossary === undefined) payload.glossary = loadPublishedCategory(args, serviceId, categoryId).glossary ?? [];
    payload.blockCatalog = currentBlockCatalog();
    payload.target = { serviceId, categoryId, contentId, source: "draft", databaseTarget: databaseTarget(args), pulledAt: Date.now() };
    const defaultPath = defaultWorkspacePath(args, serviceId, categoryId, contentId);
    const outputPath = resolve(process.cwd(), args.file ?? defaultPath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`取得しました: ${outputPath}`);
    console.log(`対象: ${serviceId} / AI下書き 第${rows[0].revision}版`);
    return;
  }
  const category = loadPublishedCategory(args, serviceId, categoryId);
  const content = category.items?.find((candidate) => candidate.id === contentId);
  if (!content) throw new Error(`コンテンツが見つかりません: ${contentId}`);
  const payload = {
    format: "hundred-ai-desktop-content",
    version: 1,
    target: { serviceId, categoryId, contentId, source: "published", databaseTarget: databaseTarget(args), pulledAt: Date.now() },
    instructions: [
      "content内の文章とブロックを編集し、id・type・data構造を維持してください。",
      "glossaryはカテゴリ共通の用語一覧です。必要な用語の追加・編集・削除ができます。",
      "カテゴリ名、説明、所属グループ、アイコンなどのカテゴリ設定は変更対象外です。",
      "ページ幅はHundredが自動調整するため、content.pageWidthは設定しないでください。",
      "ブロックの追加時はblockCatalog.templatesを複製し、使用するtypeをblockCatalog.allowedTypesから選んでください。",
      "example-で始まる見本IDは一意なIDへ変更し、2カラム内ではblockCatalog.nestedAllowedTypesだけを使用してください。",
      "編集後は ai-desktop:push で下書きDBと履歴へ登録してください。",
      "calloutのtoneはinfo・warning・tip、表の列widthは10〜100です。",
    ],
    glossary: category.glossary ?? [],
    blockCatalog: currentBlockCatalog(),
    content: automaticLayoutContent(content),
  };
  const defaultPath = defaultWorkspacePath(args, serviceId, categoryId, contentId);
  const outputPath = resolve(process.cwd(), args.file ?? defaultPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`取得しました: ${outputPath}`);
  console.log(`対象: ${serviceId} / ${category.title} / ${content.navTitle}`);
}

async function push(args) {
  if (!args.file) usage("--file を指定してください");
  const inputPath = resolve(process.cwd(), args.file);
  if (!existsSync(inputPath)) throw new Error(`ファイルが見つかりません: ${inputPath}`);
  const payload = JSON.parse(readFileSync(inputPath, "utf8"));
  if (payload?.format !== "hundred-ai-desktop-content" || payload?.version !== 1 || !payload.content || typeof payload.content !== "object" || Array.isArray(payload.content)) throw new Error("コンテンツJSONの形式が正しくありません");
  const serviceId = requiredId(args.service ?? payload.target?.serviceId, "--service または target.serviceId");
  const categoryId = requiredId(args.category ?? payload.target?.categoryId, "--category または target.categoryId");
  const contentId = requiredId(args.content ?? payload.target?.contentId, "--content または target.contentId");
  const storedDatabaseTarget = payload.target?.databaseTarget;
  if (storedDatabaseTarget !== undefined && storedDatabaseTarget !== "local" && storedDatabaseTarget !== "remote") throw new Error("target.databaseTarget は local または remote を指定してください");
  if (storedDatabaseTarget && storedDatabaseTarget !== databaseTarget(args)) throw new Error(`JSONの対象は ${storedDatabaseTarget} です。${storedDatabaseTarget === "remote" ? "--remote" : "--local"} を指定してください`);
  if (payload.content.id !== contentId) throw new Error(`content.id が対象IDと一致しません: ${payload.content.id ?? "未設定"}`);
  if (!Array.isArray(payload.content.blocks) || typeof payload.content.navTitle !== "string") throw new Error("content.navTitle または content.blocks が正しくありません");
  if (payload.glossary !== undefined && !validGlossary(payload.glossary)) throw new Error("glossaryの形式が正しくありません");
  if (payload.blockCatalog !== undefined && payload.blockCatalog?.version !== blockCatalog.version) throw new Error("blockCatalogの版が現在の画面と一致しません。ai-desktop:pullで再取得してください");
  validateBlocks(payload.content.blocks);
  await validateMermaidBlocks(payload.content.blocks);
  payload.target = { serviceId, categoryId, contentId, source: payload.target?.source ?? "published", databaseTarget: databaseTarget(args), pulledAt: payload.target?.pulledAt ?? null };
  const storedPayload = structuredClone(payload);
  delete storedPayload.blockCatalog;
  storedPayload.content = automaticLayoutContent(storedPayload.content);
  const payloadJson = JSON.stringify(storedPayload);
  if (payloadJson.length > 2_000_000) throw new Error("JSONが2MBを超えています");
  if (args["dry-run"]) {
    console.log(`検証しました: ${inputPath}`);
    console.log(`登録先: ${targetFlag(args).slice(2)} / ${serviceId} / ${categoryId} / ${contentId}`);
    return;
  }
  const now = Date.now();
  const key = `content:${serviceId}:${categoryId}:${contentId}`;
  const sql = `
INSERT INTO ai_desktop_content_drafts (draft_key, scope, service_id, category_id, content_id, payload_json, revision, status, updated_by, created_at, updated_at)
VALUES (${sqlText(key)}, 'content', ${sqlText(serviceId)}, ${sqlText(categoryId)}, ${sqlText(contentId)}, ${sqlText(payloadJson)}, 1, 'editing', 'codex-cli', ${now}, ${now})
ON CONFLICT(draft_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  revision = ai_desktop_content_drafts.revision + 1,
  status = 'editing',
  updated_by = 'codex-cli',
  updated_at = excluded.updated_at;

INSERT INTO ai_desktop_content_draft_history (draft_key, service_id, category_id, content_id, content_title, revision, saved_by, saved_at, payload_json)
SELECT draft_key, service_id, category_id, content_id, ${sqlText(payload.content.navTitle.slice(0, 200) || "名称未設定")}, revision, 'codex-cli', ${now}, payload_json
FROM ai_desktop_content_drafts
WHERE draft_key = ${sqlText(key)};

DELETE FROM ai_desktop_content_draft_history
WHERE service_id = ${sqlText(serviceId)} AND category_id = ${sqlText(categoryId)}
  AND id NOT IN (
    SELECT id FROM ai_desktop_content_draft_history
    WHERE service_id = ${sqlText(serviceId)} AND category_id = ${sqlText(categoryId)}
    ORDER BY saved_at DESC, id DESC LIMIT 50
  );
`;
  const sqlPath = resolve(tmpdir(), `hundred-ai-desktop-${process.pid}-${Date.now()}.sql`);
  try {
    writeFileSync(sqlPath, sql);
    executeD1(args, ["--file", sqlPath]);
  } finally {
    if (existsSync(sqlPath)) unlinkSync(sqlPath);
  }
  const rows = executeD1(args, ["--command", `SELECT revision FROM ai_desktop_content_drafts WHERE draft_key = ${sqlText(key)} LIMIT 1;`]);
  console.log(`下書きDBへ登録しました: ${basename(inputPath)}`);
  console.log(`履歴: 第${rows[0]?.revision ?? "?"}版 / ${targetFlag(args).slice(2)}`);
}

const operation = process.argv[2];
const args = parseArgs(process.argv.slice(3));
try {
  if (operation === "pull") pull(args);
  else if (operation === "push") await push(args);
  else usage("pull または push を指定してください");
} catch (error) {
  console.error(`エラー: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
