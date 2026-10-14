import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
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
const mediaBucket = "hundred-creative-ia-media";
const blockCatalogPath = resolve(workspaceRoot, "frontend/src/pages/AIDesktop/contentBlockCatalog.json");
const blockCatalog = JSON.parse(readFileSync(blockCatalogPath, "utf8"));
const supportedBlockTypes = new Set([...blockCatalog.allowedTypes, "checklist", "toc", "glossary", "screenMap"]);
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

// Screen Mapブロックの検証。frontend/src/pages/AIDesktop/screenMap.ts と src/ai-desktop.ts と揃える。
// AIが直せるように、問題のある場所をメッセージに含める。
const screenMapIdPattern = /^[a-z0-9][a-z0-9-]{0,99}$/u;
const screenMapLimits = { groups: 50, screens: 300, transitions: 1_000, imagesPerScreen: 10 };
const screenMapVerifications = new Set(["confirmed", "ai-inferred"]);
const screenMapCoordinate = (value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000;

function screenMapIdSet(blockId, label, entries) {
  const ids = new Set();
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !screenMapIdPattern.test(entry.id)) throw new Error(`${blockId}: ${label}のidは英小文字・数字・ハイフンで設定してください: ${isRecord(entry) ? entry.id ?? "未設定" : "形式が不正"}`);
    if (ids.has(entry.id)) throw new Error(`${blockId}: ${label}のidが重複しています: ${entry.id}`);
    ids.add(entry.id);
  }
  return ids;
}

function validateScreenMap(blockId, data) {
  const text = (value, max) => typeof value === "string" && value.length <= max;
  if (data.schemaVersion !== 1 || !Array.isArray(data.groups) || !Array.isArray(data.screens) || !Array.isArray(data.transitions) || !isRecord(data.layout) || !isRecord(data.layout.screens) || !isRecord(data.layout.groups)) throw new Error(`${blockId}: Screen MapはschemaVersion 1と、groups・screens・transitions・layout（screens・groups）を持つ必要があります`);
  if (data.groups.length > screenMapLimits.groups || data.screens.length > screenMapLimits.screens || data.transitions.length > screenMapLimits.transitions) throw new Error(`${blockId}: グループは${screenMapLimits.groups}件、画面は${screenMapLimits.screens}件、遷移は${screenMapLimits.transitions}件までです`);
  const groupIds = screenMapIdSet(blockId, "グループ", data.groups);
  const screenIds = screenMapIdSet(blockId, "画面", data.screens);
  screenMapIdSet(blockId, "遷移", data.transitions);
  for (const group of data.groups) {
    if (!text(group.name, 100) || !text(group.description, 2_000)) throw new Error(`${blockId}: グループ ${group.id} のnameまたはdescriptionが正しくありません`);
  }
  for (const screen of data.screens) {
    if (!text(screen.name, 100) || !text(screen.url, 2_000) || !text(screen.description, 5_000)) throw new Error(`${blockId}: 画面 ${screen.id} のname・url・descriptionが正しくありません`);
    if (screen.groupId !== undefined && !groupIds.has(screen.groupId)) throw new Error(`${blockId}: 画面 ${screen.id} のgroupIdに存在しないグループが設定されています: ${screen.groupId}`);
    if (screen.stateOf !== undefined && (screen.stateOf === screen.id || !screenIds.has(screen.stateOf))) throw new Error(`${blockId}: 画面 ${screen.id} のstateOfには、自分以外の存在する画面のidを設定してください: ${screen.stateOf}`);
    if (!screenMapVerifications.has(screen.verification)) throw new Error(`${blockId}: 画面 ${screen.id} のverificationはconfirmedまたはai-inferredです`);
    if (!Array.isArray(screen.images) || screen.images.length > screenMapLimits.imagesPerScreen || !screen.images.every((image) => isRecord(image) && text(image.imageId, 300) && text(image.url, 2_000) && (image.thumbnailImageId === undefined || text(image.thumbnailImageId, 300)) && (image.thumbnailUrl === undefined || text(image.thumbnailUrl, 2_000)) && [image.width, image.height].every((value) => value === undefined || (Number.isInteger(value) && value > 0 && value <= 100_000)) && typeof image.masked === "boolean" && (image.capturedAt === undefined || (Number.isInteger(image.capturedAt) && image.capturedAt > 0)))) throw new Error(`${blockId}: 画面 ${screen.id} のimagesが正しくありません（imageId・url・maskedが必要、${screenMapLimits.imagesPerScreen}枚まで）`);
  }
  for (const transition of data.transitions) {
    if (!screenIds.has(transition.from) || !screenIds.has(transition.to)) throw new Error(`${blockId}: 遷移 ${transition.id} のfromまたはtoに存在しない画面が設定されています`);
    if (!text(transition.action, 200) || !text(transition.condition, 1_000)) throw new Error(`${blockId}: 遷移 ${transition.id} のactionまたはconditionが正しくありません`);
    if (!screenMapVerifications.has(transition.verification)) throw new Error(`${blockId}: 遷移 ${transition.id} のverificationはconfirmedまたはai-inferredです`);
  }
  for (const [id, position] of Object.entries(data.layout.screens)) {
    if (!screenIds.has(id) || !isRecord(position) || !screenMapCoordinate(position.x) || !screenMapCoordinate(position.y) || (position.width !== undefined && !(typeof position.width === "number" && position.width >= 40 && position.width <= 4_000))) throw new Error(`${blockId}: layout.screens.${id} が正しくありません`);
  }
  for (const [id, frame] of Object.entries(data.layout.groups)) {
    if (!groupIds.has(id) || !isRecord(frame) || !screenMapCoordinate(frame.x) || !screenMapCoordinate(frame.y) || !(frame.width > 0) || !(frame.height > 0) || !screenMapCoordinate(frame.width) || !screenMapCoordinate(frame.height)) throw new Error(`${blockId}: layout.groups.${id} が正しくありません`);
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
      case "screenMap":
        if (nested || blocks.length !== 1) throw new Error(`${block.id}: Screen Mapブロックは、Screen Mapのカテゴリのページに1つだけ置けます`);
        validateScreenMap(block.id, data);
        break;
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

// Screen Mapのページなら、スクリーンショットをJSONと同じ場所の「<コンテンツID>-images」へ保存する。
// AIが質問に必要な画面の画像だけを開けるよう、画面IDごとのファイルにして、パスをscreenImagesに書く。
const isScreenMapPage = (content) => Array.isArray(content?.blocks) && content.blocks.length === 1 && content.blocks[0]?.type === "screenMap";

function saveScreenMapImages(args, content, outputPath) {
  const block = isScreenMapPage(content) ? content.blocks[0] : null;
  if (!block) return null;
  const directory = outputPath.replace(/\.json$/u, "") + "-images";
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const images = {};
  for (const screen of block.data?.screens ?? []) {
    const image = screen.images?.[0];
    if (!image || typeof image.imageId !== "string" || !/^[0-9a-f-]+\.(?:jpg|png|webp|gif|avif)$/u.test(image.imageId)) continue;
    const file = resolve(directory, `${safeName(screen.id)}.${image.imageId.split(".").pop()}`);
    execFileSync(wrangler, ["r2", "object", "get", `${mediaBucket}/ai-desktop/${image.imageId}`, targetFlag(args), "--file", file], {
      cwd: apiRoot,
      env: { ...process.env, NO_COLOR: "1", WRANGLER_LOG_PATH: resolve(tmpdir(), "hundred-wrangler.log") },
      stdio: ["ignore", "ignore", "inherit"],
    });
    images[screen.id] = { name: screen.name, path: relative(dirname(outputPath), file), masked: image.masked === true };
  }
  return images;
}

const screenMapImageInstruction = "画面のスクリーンショットはscreenImagesのパスにあります。質問に答えるのに必要な画面の画像だけを開いてください。maskedがtrueの画像は、黒い四角の部分を意図的に隠しています。画像の追加・変更はしないでください。";

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
    const draftImages = saveScreenMapImages(args, payload.content, outputPath);
    if (draftImages) { payload.screenImages = draftImages; payload.instructions = [...(Array.isArray(payload.instructions) ? payload.instructions : []), screenMapImageInstruction]; }
    writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`取得しました: ${outputPath}`);
    console.log(`対象: ${serviceId} / AI下書き 第${rows[0].revision}版`);
    return;
  }
  const category = loadPublishedCategory(args, serviceId, categoryId);
  const content = category.items?.find((candidate) => candidate.id === contentId);
  if (!content) throw new Error(`コンテンツが見つかりません: ${contentId}`);
  const screenMapInstructions = [
    "このページはScreen Mapです。contentのScreen Mapブロック1つのdataだけを編集し、ブロックの追加・削除はしないでください。",
    "dataの形と各項目の意味はblockCatalog.screenMapを参照してください。",
    "グループ・画面・遷移のidは英小文字・数字・ハイフンで重複しない値にし、groupId・stateOf・from・toには存在するidを設定してください。",
    "AIが追加・変更した画面と遷移のverificationはai-inferredにしてください。",
    "カテゴリ名、説明、所属グループ、アイコン、カテゴリの種類などのカテゴリ設定は変更対象外です。",
    "編集後は ai-desktop:push で下書きDBと履歴へ登録してください。",
  ];
  const payload = {
    format: "hundred-ai-desktop-content",
    version: 1,
    target: { serviceId, categoryId, contentId, source: "published", databaseTarget: databaseTarget(args), pulledAt: Date.now() },
    instructions: isScreenMapPage(content) ? screenMapInstructions : [
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
  const images = saveScreenMapImages(args, payload.content, outputPath);
  if (images) { payload.screenImages = images; payload.instructions.push(screenMapImageInstruction); }
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`取得しました: ${outputPath}`);
  console.log(`対象: ${serviceId} / ${category.title} / ${content.navTitle}`);
  if (images) console.log(`画像: ${Object.keys(images).length}件を ${dirname(outputPath)} に保存しました`);
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
  delete storedPayload.screenImages;
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
