import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const agentRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = resolve(agentRoot, "..");
const contentTool = resolve(workspaceRoot, "workers/apps-api/scripts/ai-desktop-content.mjs");
const appleOrigin = process.env.APPLE_INTELLIGENCE_ORIGIN ?? "http://127.0.0.1:11434";
const port = Number(process.env.HUNDRED_LOCAL_AGENT_PORT ?? 11435);
const host = "127.0.0.1";
const allowedServices = new Set(["chatgpt", "codex", "claude", "ai-desktop"]);
const appSourceRoots = {
  hundred: ["frontend/src/App.tsx", "frontend/src/components/Hundred", "frontend/src/pages/Hundred", "frontend/src/styles/Hundred"],
  "ai-desktop": ["frontend/src/pages/AIDesktop", "frontend/src/services/AIDesktop", "frontend/src/services/AppleIntelligence", "frontend/src/styles/AIDesktop", "local-agent", "workers/apps-api/src/ai-desktop.ts", "workers/apps-api/scripts/ai-desktop-content.mjs"],
  "creative-ia": ["frontend/src/pages/CreativeIA", "frontend/src/services/CreativeIA", "frontend/src/styles/CreativeIA"],
  anigram: ["frontend/src/pages/Anigram", "frontend/src/styles/Anigram"],
  "card-home": ["frontend/src"],
  "record-hub": ["frontend/src"],
};

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "yamahit.com" || url.hostname.endsWith(".yamahit.com") || url.hostname.endsWith(".trycloudflare.com");
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : "http://localhost:5173",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function respond(response, origin, status, body) {
  response.writeHead(status, { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 3_000_000) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validateTarget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("TARGET_REQUIRED");
  const { serviceId, categoryId, contentId, databaseTarget } = value;
  const source = value.source === "draft" ? "draft" : "published";
  if (!allowedServices.has(serviceId) || typeof categoryId !== "string" || !categoryId || categoryId.length > 300 || typeof contentId !== "string" || !contentId || contentId.length > 300 || (databaseTarget !== "local" && databaseTarget !== "remote")) throw new Error("INVALID_TARGET");
  return { serviceId, categoryId, contentId, source, databaseTarget };
}

function validateMessages(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) throw new Error("INVALID_MESSAGES");
  return value.map((message) => {
    if (!message || typeof message !== "object" || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string" || !message.content.trim() || message.content.length > 50_000) throw new Error("INVALID_MESSAGES");
    return { role: message.role, content: message.content };
  });
}

function validateCurrentContent(value, target) {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || value.id !== target.contentId || typeof value.navTitle !== "string" || !Array.isArray(value.blocks) || value.blocks.length > 200 || !value.blocks.every((block) => validBlock(block))) throw new Error("INVALID_CONTENT");
  const serialized = JSON.stringify(value);
  if (serialized.length > 2_000_000) throw new Error("INVALID_CONTENT");
  return { format: "hundred-ai-desktop-content", version: 1, target, content: structuredClone(value) };
}

function validateGeneralContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(appSourceRoots, value.appId) || typeof value.route !== "string" || value.route.length > 500) throw new Error("INVALID_CONTEXT");
  return { appId: value.appId, route: value.route };
}

function isAllowedAppFile(appId, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.length > 500 || relativePath.includes("\\") || relativePath.split("/").some((part) => part === ".." || part.startsWith(".env"))) return false;
  if (["node_modules", ".git", ".wrangler", "dist"].some((part) => relativePath.split("/").includes(part))) return false;
  return appSourceRoots[appId].some((root) => relativePath === root || relativePath.startsWith(`${root}/`));
}

async function readAppFiles(appId, requestedPaths) {
  if (!Array.isArray(requestedPaths)) return [];
  const uniquePaths = [...new Set(requestedPaths)].slice(0, 8);
  const workspaceReal = await realpath(workspaceRoot);
  const files = [];
  let totalSize = 0;
  const maxFileCharacters = 6_000;
  const maxTotalSize = 18_000;
  for (const relativePath of uniquePaths) {
    if (!isAllowedAppFile(appId, relativePath)) continue;
    try {
      const absolute = await realpath(resolve(workspaceRoot, relativePath));
      if (absolute !== workspaceReal && !absolute.startsWith(`${workspaceReal}/`)) continue;
      const rawContent = await readFile(absolute, "utf8");
      const content = rawContent.length > maxFileCharacters ? `${rawContent.slice(0, maxFileCharacters)}\n\n[このファイルは長いため、ここまでを参照しています]` : rawContent;
      totalSize += Buffer.byteLength(content);
      if (totalSize > maxTotalSize) break;
      files.push({ path: relativePath, content });
    } catch {
      // 存在しないファイルやディレクトリはモデルへ渡さない。
    }
  }
  return files;
}

async function runContentTool(operation, target, file) {
  const args = [contentTool, operation, "--service", target.serviceId, "--category", target.categoryId, "--content", target.contentId, "--source", target.source, `--${target.databaseTarget}`, "--file", file];
  return execFileAsync(process.execPath, args, { cwd: workspaceRoot, timeout: 120_000, maxBuffer: 8_000_000, env: process.env });
}

async function loadTargetContent(target) {
  const directory = await mkdtemp(resolve(tmpdir(), "hundred-local-agent-"));
  const file = resolve(directory, "content.json");
  try {
    await runContentTool("pull", target, file);
    return JSON.parse(await readFile(file, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const blockFields = new Set(["text", "title", "tone", "label", "url", "code", "language", "filename", "imageId", "alt", "caption", "level", "rowHeight", "tableWidth", "columns", "rows", "items", "entries"]);

function applyEditPlan(currentContent, edits) {
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > 100) return null;
  const draft = structuredClone(currentContent);
  for (const edit of edits) {
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) throw new Error("INVALID_EDIT");
    if (edit.op === "set_content_field") {
      if (edit.field === "navTitle" && typeof edit.value === "string" && edit.value.length <= 200) draft.navTitle = edit.value;
      else throw new Error("INVALID_EDIT");
      continue;
    }
    if (edit.op === "set_block_field") {
      if (typeof edit.blockId !== "string" || typeof edit.field !== "string" || !blockFields.has(edit.field)) throw new Error("INVALID_EDIT");
      const block = draft.blocks.find((candidate) => candidate?.id === edit.blockId);
      if (!block || !block.data || typeof block.data !== "object" || Array.isArray(block.data) || !(edit.field in block.data)) throw new Error("INVALID_EDIT");
      const currentValue = block.data[edit.field];
      if (typeof currentValue === "string" && typeof edit.value !== "string") throw new Error("INVALID_EDIT");
      if (typeof currentValue === "number" && typeof edit.value !== "number") throw new Error("INVALID_EDIT");
      if (Array.isArray(currentValue) && !Array.isArray(edit.value)) throw new Error("INVALID_EDIT");
      block.data[edit.field] = edit.value;
      continue;
    }
    if (edit.op === "replace_blocks") {
      if (!Array.isArray(edit.blocks) || edit.blocks.length > 200 || !edit.blocks.every((block) => validBlock(block))) throw new Error("INVALID_EDIT");
      draft.blocks = structuredClone(edit.blocks);
      continue;
    }
    if (edit.op === "insert_block") {
      if (!validBlock(edit.block)) throw new Error("INVALID_EDIT");
      const insertAt = edit.afterBlockId === null ? 0 : draft.blocks.findIndex((block) => block?.id === edit.afterBlockId) + 1;
      if (insertAt <= 0 && edit.afterBlockId !== null) throw new Error("INVALID_EDIT");
      draft.blocks.splice(insertAt, 0, structuredClone(edit.block));
      continue;
    }
    if (edit.op === "delete_block") {
      if (typeof edit.blockId !== "string") throw new Error("INVALID_EDIT");
      const index = draft.blocks.findIndex((block) => block?.id === edit.blockId);
      if (index < 0) throw new Error("INVALID_EDIT");
      draft.blocks.splice(index, 1);
      continue;
    }
    throw new Error("INVALID_EDIT");
  }
  return draft;
}

const badgeTones = new Set(["neutral", "info", "success", "warning", "danger"]);
const diagramStarts = { flowchart: /^\s*(?:flowchart|graph)\b/iu, sequence: /^\s*sequenceDiagram\b/u, architecture: /^\s*architecture-beta\b/u, er: /^\s*erDiagram\b/u, state: /^\s*stateDiagram(?:-v2)?\b/u };
const validBadges = (value, max) => value === undefined || (Array.isArray(value) && value.length <= max && value.every((badge) => badge && typeof badge === "object" && typeof badge.id === "string" && typeof badge.label === "string" && badgeTones.has(badge.tone)));

function validBlock(block, nested = false) {
  if (!block || typeof block !== "object" || Array.isArray(block) || typeof block.id !== "string" || !block.id || typeof block.type !== "string" || !block.data || typeof block.data !== "object" || Array.isArray(block.data)) return false;
  const data = block.data;
  if (block.type === "heading") return typeof data.text === "string" && [1, 2, 3].includes(data.level);
  if (block.type === "text") return typeof data.text === "string";
  if (block.type === "image") return [data.imageId, data.url, data.alt, data.caption].every((value) => typeof value === "string");
  if (block.type === "code") return typeof data.code === "string" && typeof data.language === "string" && (data.filename === undefined || typeof data.filename === "string");
  if (block.type === "checklist") return Array.isArray(data.items) && data.items.every((item) => item && typeof item.id === "string" && typeof item.text === "string");
  if (block.type === "callout") return ["info", "warning", "tip"].includes(data.tone) && typeof data.text === "string" && (data.title === undefined || typeof data.title === "string");
  if (block.type === "divider" || block.type === "toc") return true;
  if (block.type === "link") return typeof data.label === "string" && typeof data.url === "string";
  if (block.type === "glossary") return Array.isArray(data.entries) && data.entries.every((entry) => entry && typeof entry.id === "string" && typeof entry.term === "string" && typeof entry.description === "string");
  if (block.type === "card") return [1, 2, 3].includes(data.columns) && Array.isArray(data.items) && data.items.length <= 12 && data.items.every((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.description === "string" && validBadges(item.badges, 4) && (item.link === undefined || (item.link && typeof item.link.label === "string" && typeof item.link.url === "string")));
  if (block.type === "steps") return Array.isArray(data.items) && data.items.length <= 20 && data.items.every((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.text === "string" && validBadges(item.badges, 3));
  if (block.type === "diagram") return !nested && typeof data.kind === "string" && diagramStarts[data.kind] && typeof data.title === "string" && typeof data.source === "string" && data.source.length <= 50_000 && diagramStarts[data.kind].test(data.source) && (data.caption === undefined || typeof data.caption === "string");
  if (block.type === "table") return Array.isArray(data.columns) && data.columns.length > 0 && data.columns.every((column) => column && typeof column.id === "string" && typeof column.label === "string" && typeof column.width === "number" && column.width >= 10 && column.width <= 100) && Array.isArray(data.rows) && data.rows.every((row) => row && typeof row.id === "string" && Array.isArray(row.cells) && row.cells.length === data.columns.length && row.cells.every((cell) => typeof cell === "string")) && ["compact", "standard", "comfortable"].includes(data.rowHeight) && (data.tableWidth === undefined || (typeof data.tableWidth === "number" && data.tableWidth >= 100 && data.tableWidth <= 300));
  if (block.type === "columns") return !nested && Array.isArray(data.left) && Array.isArray(data.right) && [...data.left, ...data.right].every((child) => validBlock(child, true));
  return false;
}

function extractAppleReply(content, target, currentContent) {
  const raw = typeof content === "string" ? content.trim() : "";
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(raw)?.[1] ?? raw;
  try {
    const parsed = JSON.parse(fenced);
    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "修正案を作成しました。";
    const draft = applyEditPlan(currentContent, parsed.edits);
    if (!draft) return { reply, proposal: null };
    return { reply, proposal: { tool: "ai_desktop.content.save_draft", environment: target.databaseTarget, target, content: draft } };
  } catch {
    return { reply: raw || "Apple Intelligenceから回答を取得できませんでした。", proposal: null };
  }
}

function requestsDocumentChange(messages) {
  const latest = messages.at(-1)?.content ?? "";
  return /(資料|ページ|コンテンツ).*(作成|生成|追加|書き|まとめ|構成|編集|修正)|(?:作成|生成|追加|書き直|編集|修正).*(?:資料|ページ|コンテンツ)/u.test(latest);
}

function requestsDocumentComposition(messages) {
  const latest = messages.at(-1)?.content ?? "";
  return /(資料|ページ|コンテンツ).*(作成|生成|一から|まとめ|構成)|(?:作成|生成|一から|まとめ|構成).*(?:資料|ページ|コンテンツ)/u.test(latest);
}

async function requestAppleCompletion(system, messages) {
  const response = await fetch(new URL("/v1/chat/completions", appleOrigin), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "system", content: system }, ...messages], response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`APPLE_HTTP_${response.status}`);
  const body = await response.json();
  return body?.choices?.[0]?.message?.content;
}

async function requestAppleText(system, messages) {
  const response = await fetch(new URL("/v1/chat/completions", appleOrigin), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "system", content: system }, ...messages] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`APPLE_HTTP_${response.status}`);
  const body = await response.json();
  return typeof body?.choices?.[0]?.message?.content === "string" ? body.choices[0].message.content.trim() : "";
}

function documentBlocksFromMarkdown(markdown, fallbackTitle) {
  const raw = markdown.replace(/^```(?:markdown|md)?\s*/u, "").replace(/\s*```$/u, "").trim();
  const lines = raw.split(/\r?\n/u);
  const blocks = [];
  const stamp = Date.now().toString(36);
  let sequence = 0;
  let paragraph = [];
  let checklist = [];
  let title = fallbackTitle;
  const id = (prefix) => `${prefix}-ai-${stamp}-${sequence += 1}`;
  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ id: id("text"), type: "text", data: { text } });
    paragraph = [];
  };
  const flushChecklist = () => {
    if (checklist.length) blocks.push({ id: id("checklist"), type: "checklist", data: { items: checklist.map((text) => ({ id: id("check"), text })) } });
    checklist = [];
  };
  for (const sourceLine of lines) {
    const line = sourceLine.trim();
    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    const bullet = /^[-*]\s+(.+)$/u.exec(line);
    if (heading) {
      flushParagraph();
      flushChecklist();
      const level = Math.min(3, heading[1].length);
      if (level === 1 && blocks.length === 0) title = heading[2].trim();
      blocks.push({ id: id("heading"), type: "heading", data: { text: heading[2].trim(), level } });
    } else if (bullet) {
      flushParagraph();
      checklist.push(bullet[1].trim());
    } else if (!line) {
      flushParagraph();
      flushChecklist();
    } else {
      flushChecklist();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushChecklist();
  if (!blocks.some((block) => block.type === "heading" && block.data.level === 1)) blocks.unshift({ id: id("heading"), type: "heading", data: { text: title || "概要", level: 1 } });
  return { title, blocks };
}

async function composeAppleDocument(messages, currentPayload, target) {
  const system = `あなたはHundredの資料作成者です。利用者の依頼に沿って、実際に掲載できる日本語資料を作成してください。
出力はMarkdown本文だけにしてください。JSON、前置き、作成しましたという報告は不要です。
# は資料タイトル、## は主要セクション、### は補助セクション、箇条書きは「- 」を使用してください。
依頼された各項目に具体的な説明を付け、読み手が理解できる順序で構成してください。
現在日は ${new Date().toISOString().slice(0, 10)} です。Apple公式ソースは提供されていないため、提供時期、対応言語、対応機種、OSバージョンなど変化する情報を推測や古い知識で断定しないでください。「現在の公式情報」を求められた場合は、Apple公式サイトで最新情報を確認する必要があることを明記してください。
現在の資料名: ${currentPayload.content.navTitle}
現在の資料:
${JSON.stringify(currentPayload.content)}`;
  const markdown = await requestAppleText(system, messages);
  if (!markdown) return { reply: "資料本文を生成できませんでした。もう一度依頼してください。", proposal: null };
  const document = documentBlocksFromMarkdown(markdown, currentPayload.content.navTitle);
  if (!document.blocks.every((block) => validBlock(block))) throw new Error("INVALID_EDIT");
  const content = { ...structuredClone(currentPayload.content), navTitle: document.title || currentPayload.content.navTitle, blocks: document.blocks };
  return { reply: `「${content.navTitle}」の資料案を作成しました。内容を確認してAI下書きへ保存してください。`, proposal: { tool: "ai_desktop.content.save_draft", environment: target.databaseTarget, target, content } };
}

async function callAppleIntelligence(messages, currentPayload, target) {
  if (requestsDocumentComposition(messages)) return composeAppleDocument(messages, currentPayload, target);
  const system = `あなたはHundredのAI Desktop資料編集アシスタントです。現在の公開コンテンツJSONと利用者の依頼を確認してください。
回答はMarkdownではなく、必ず単一のJSONだけを返してください。content全体や変更していない値は出力しないでください。
質問や相談だけの場合: {"reply":"利用者向けの短い回答","edits":null}
資料を変更する場合: {"reply":"変更内容の説明","edits":[{"op":"set_content_field","field":"navTitle","value":"新しい値"},{"op":"set_block_field","blockId":"対象ブロックID","field":"text","value":"新しい値"}]}
利用者が資料・ページ・コンテンツの作成、追加、書き直し、編集、修正を依頼した場合は質問回答で終わらず、必ず空でないeditsを返してください。
set_content_fieldで変更できるfieldはnavTitleだけです。ページ幅はHundredがウィンドウサイズに合わせて自動調整するため、pageWidthは設定しないでください。set_block_fieldでは現在のdataに存在するfieldを変更できます。
資料全体を構成し直す場合は {"op":"replace_blocks","blocks":[...]}、追加は {"op":"insert_block","afterBlockId":"直前のIDまたはnull","block":{...}}、削除は {"op":"delete_block","blockId":"ID"} を使えます。新しいblockのidは重複しない英数字にしてください。対応typeはheading、text、image、code、checklist、callout、divider、table、link、toc、glossary、card、steps、diagram、columnsです。calloutのtoneはinfo・warning・tip、表の列widthは10〜100です。cardは重要情報や選択肢、stepsは人が実行する手順、diagramは技術図にだけ使ってください。badgeはcard・stepsのitems内だけで使用し、toneはneutral・info・success・warning・dangerです。変更する項目だけをeditsへ入れてください。
主なブロック形式: heading={"id":"heading-1","type":"heading","data":{"text":"見出し","level":1}}、text={"id":"text-1","type":"text","data":{"text":"本文"}}、callout={"id":"callout-1","type":"callout","data":{"tone":"info","title":"補足","text":"内容"}}、table={"id":"table-1","type":"table","data":{"columns":[{"id":"column-1","label":"項目","width":40},{"id":"column-2","label":"内容","width":60}],"rows":[{"id":"row-1","cells":["項目","説明"]}],"rowHeight":"standard","tableWidth":100}}、card={"id":"card-1","type":"card","data":{"columns":2,"items":[{"id":"card-item-1","title":"選択肢","description":"説明","badges":[{"id":"badge-1","label":"推奨","tone":"success"}]}]}}、steps={"id":"steps-1","type":"steps","data":{"items":[{"id":"step-1","title":"準備","text":"設定を確認します"}]}}、diagram={"id":"diagram-1","type":"diagram","data":{"kind":"flowchart","title":"処理の流れ","source":"flowchart TD\\n  A[開始] --> B[完了]","caption":""}}。
対象環境: ${target.databaseTarget}
編集元: ${target.source === "draft" ? "直前のAI下書き" : "公開中の資料"}
現在のコンテンツ:
${JSON.stringify(currentPayload.content)}`;
  const first = extractAppleReply(await requestAppleCompletion(system, messages), target, currentPayload.content);
  if (first.proposal || !requestsDocumentChange(messages)) return first;
  const retrySystem = `${system}\n重要: 利用者は実際の資料作成を依頼しています。説明文だけを返さず、現在のblocksを完成した資料へ置き換えるreplace_blocksを含むJSONを返してください。`;
  const retried = extractAppleReply(await requestAppleCompletion(retrySystem, messages), target, currentPayload.content);
  return retried.proposal ? retried : { reply: `${retried.reply}\n\n資料の修正案を生成できませんでした。内容を分けて、もう一度依頼してください。`, proposal: null };
}

function extractGeneralReply(content) {
  const raw = typeof content === "string" ? content.trim() : "";
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(raw)?.[1] ?? raw;
  try {
    const parsed = JSON.parse(fenced);
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply.trim() : "",
      readFiles: Array.isArray(parsed.readFiles) ? parsed.readFiles.filter((path) => typeof path === "string") : [],
    };
  } catch {
    return { reply: raw, readFiles: [] };
  }
}

async function callGeneralAppleIntelligence(messages, context) {
  const sourceRoots = appSourceRoots[context.appId];
  const explicitPaths = [...new Set(messages.flatMap((message) => message.content.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+/gu) ?? []))];
  const explicitFiles = await readAppFiles(context.appId, explicitPaths);
  const system = `あなたはHundred内で動くApple Intelligenceアシスタントです。利用者が現在会話している対象アプリは ${context.appId}、画面は ${context.route} です。
通常の質問には日本語で簡潔に回答してください。Hundredの実装確認にファイルが必要な場合だけreadFilesへ相対パスを指定してください。
参照可能な範囲: ${sourceRoots.join(", ")}
必ずJSONだけを返してください: {"reply":"回答。ファイル参照が必要なら空文字でもよい","readFiles":["frontend/src/.../file.tsx"]}
ファイル変更、コマンド実行、DB操作はできません。存在を確認できないパスを推測で大量に指定しないでください。
${explicitFiles.length ? `利用者が指定した次のファイルは読み取り済みです。内容を根拠に回答し、readFilesは空配列にしてください。\n${explicitFiles.map((file) => `--- ${file.path} ---\n${file.content}`).join("\n")}` : ""}`;
  const firstResponse = await fetch(new URL("/v1/chat/completions", appleOrigin), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "system", content: system }, ...messages], response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!firstResponse.ok) throw new Error(`APPLE_HTTP_${firstResponse.status}`);
  const firstBody = await firstResponse.json();
  const first = extractGeneralReply(firstBody?.choices?.[0]?.message?.content);
  if (explicitFiles.length > 0) return { reply: first.reply || "回答を生成できませんでした。", filesRead: explicitFiles.map((file) => file.path) };
  const files = await readAppFiles(context.appId, first.readFiles);
  if (files.length === 0) return { reply: first.reply || "回答を生成できませんでした。", filesRead: [] };

  const fileResponse = await fetch(new URL("/v1/chat/completions", appleOrigin), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "system", content: `${system}\n次のファイルを読み取りました。内容を根拠に最終回答を作り、readFilesは空配列にしてください。\n${files.map((file) => `--- ${file.path} ---\n${file.content}`).join("\n")}` }, ...messages], response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!fileResponse.ok) throw new Error(`APPLE_HTTP_${fileResponse.status}`);
  const fileBody = await fileResponse.json();
  const final = extractGeneralReply(fileBody?.choices?.[0]?.message?.content);
  return { reply: final.reply || first.reply || "回答を生成できませんでした。", filesRead: files.map((file) => file.path) };
}

async function saveDraft(target, content) {
  if (!content || typeof content !== "object" || Array.isArray(content) || content.id !== target.contentId || typeof content.navTitle !== "string" || !Array.isArray(content.blocks)) throw new Error("INVALID_CONTENT");
  const directory = await mkdtemp(resolve(tmpdir(), "hundred-local-agent-"));
  const file = resolve(directory, "content.json");
  try {
    await writeFile(file, `${JSON.stringify({ format: "hundred-ai-desktop-content", version: 1, target, content }, null, 2)}\n`);
    const { stdout } = await runContentTool("push", target, file);
    const revision = Number(/履歴: 第(\d+)版/u.exec(stdout)?.[1] ?? 0);
    return { revision };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function health() {
  try {
    const response = await fetch(appleOrigin, { signal: AbortSignal.timeout(2500) });
    return { connected: true, endpoint: appleOrigin, status: response.status };
  } catch {
    return { connected: false, endpoint: appleOrigin, status: null };
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin ?? "";
  if (!isAllowedOrigin(origin)) return respond(response, origin, 403, { error: "このOriginからは利用できません" });
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    return response.end();
  }
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") return respond(response, origin, 200, await health());
    if (request.method === "POST" && url.pathname === "/v1/chat") {
      const body = await readJson(request);
      const target = validateTarget(body.target);
      const messages = validateMessages(body.messages);
      const suppliedContent = validateCurrentContent(body.currentContent, target);
      const current = suppliedContent ?? await loadTargetContent(target);
      return respond(response, origin, 200, await callAppleIntelligence(messages, current, target));
    }
    if (request.method === "POST" && url.pathname === "/v1/chat/general") {
      const body = await readJson(request);
      const context = validateGeneralContext(body.context);
      const messages = validateMessages(body.messages);
      return respond(response, origin, 200, await callGeneralAppleIntelligence(messages, context));
    }
    if (request.method === "POST" && url.pathname === "/v1/tools/execute") {
      const body = await readJson(request);
      if (body.tool !== "ai_desktop.content.save_draft") throw new Error("UNKNOWN_TOOL");
      const target = validateTarget(body.target);
      const result = await saveDraft(target, body.content);
      return respond(response, origin, 200, { ok: true, tool: body.tool, environment: target.databaseTarget, ...result });
    }
    return respond(response, origin, 404, { error: "エンドポイントが見つかりません" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("APPLE_") ? 502 : message.includes("TIMEOUT") ? 504 : 400;
    return respond(response, origin, status, { error: message });
  }
});

server.listen(port, host, () => {
  console.log(`Hundred Local Agent: http://${host}:${port}`);
  console.log(`Apple Intelligence: ${appleOrigin}`);
});
