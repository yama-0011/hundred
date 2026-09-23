export interface AppleIntelligenceChatEnv {
  DB: D1Database;
}

const appIds = new Set([
  "hundred",
  "ai-desktop",
  "creative-ia",
  "anigram",
  "card-home",
  "record-hub",
]);
const maxChatsPerUser = 100;
const maxMessagesPerChat = 1_000;

interface ChatRow {
  id: string;
  app_id: string;
  route: string;
  title: string;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  role: "assistant" | "user";
  content: string;
  files_read_json: string;
  created_at: number;
}

export class AppleIntelligenceChatError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CHAT_LIMIT_REACHED" | "MESSAGE_LIMIT_REACHED") {
    super(code);
    this.name = "AppleIntelligenceChatError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseText(value: unknown, maxLength: number, allowEmpty = false) {
  if (typeof value !== "string") throw new AppleIntelligenceChatError("INVALID_INPUT");
  const text = value.trim();
  if ((!allowEmpty && !text) || text.length > maxLength) throw new AppleIntelligenceChatError("INVALID_INPUT");
  return text;
}

function parseFiles(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new AppleIntelligenceChatError("INVALID_INPUT");
  return value.map((file) => parseText(file, 1_000));
}

function parseJsonArray(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function serializeChat(row: ChatRow) {
  return {
    id: row.id,
    appId: row.app_id,
    route: row.route,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureUser(env: AppleIntelligenceChatEnv, ownerUserId: string) {
  await env.DB.prepare(
    `INSERT INTO users (owner_user_id)
     VALUES (?1)
     ON CONFLICT(owner_user_id) DO UPDATE SET updated_at = unixepoch()`,
  ).bind(ownerUserId).run();
}

async function getOwnedChat(env: AppleIntelligenceChatEnv, ownerUserId: string, chatId: string) {
  return env.DB.prepare(
    `SELECT id, app_id, route, title, created_at, updated_at
       FROM apple_intelligence_chats
      WHERE id = ?1 AND owner_user_id = ?2`,
  ).bind(chatId, ownerUserId).first<ChatRow>();
}

export async function listAppleIntelligenceChats(env: AppleIntelligenceChatEnv, ownerUserId: string) {
  await ensureUser(env, ownerUserId);
  const result = await env.DB.prepare(
    `SELECT id, app_id, route, title, created_at, updated_at
       FROM apple_intelligence_chats
      WHERE owner_user_id = ?1
      ORDER BY updated_at DESC
      LIMIT 50`,
  ).bind(ownerUserId).all<ChatRow>();
  return { chats: result.results.map(serializeChat) };
}

export async function createAppleIntelligenceChat(request: Request, env: AppleIntelligenceChatEnv, ownerUserId: string) {
  const body: unknown = await request.json();
  if (!isRecord(body) || !appIds.has(String(body.appId))) throw new AppleIntelligenceChatError("INVALID_INPUT");
  const appId = String(body.appId);
  const route = parseText(body.route ?? "/", 1_000, true) || "/";
  await ensureUser(env, ownerUserId);
  const id = crypto.randomUUID();
  const now = Date.now();
  const result = await env.DB.prepare(
    `INSERT INTO apple_intelligence_chats (id, owner_user_id, app_id, route, title, created_at, updated_at)
     SELECT ?1, ?2, ?3, ?4, '新しいチャット', ?5, ?5
      WHERE (SELECT COUNT(*) FROM apple_intelligence_chats WHERE owner_user_id = ?2) < ?6`,
  ).bind(id, ownerUserId, appId, route, now, maxChatsPerUser).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new AppleIntelligenceChatError("CHAT_LIMIT_REACHED");
  const chat = await getOwnedChat(env, ownerUserId, id);
  if (!chat) throw new AppleIntelligenceChatError("NOT_FOUND");
  return { chat: serializeChat(chat) };
}

export async function getAppleIntelligenceChat(env: AppleIntelligenceChatEnv, ownerUserId: string, chatId: string) {
  const chat = await getOwnedChat(env, ownerUserId, chatId);
  if (!chat) throw new AppleIntelligenceChatError("NOT_FOUND");
  const result = await env.DB.prepare(
    `SELECT id, role, content, files_read_json, created_at
       FROM apple_intelligence_chat_messages
      WHERE chat_id = ?1 AND owner_user_id = ?2
      ORDER BY created_at ASC, rowid ASC`,
  ).bind(chatId, ownerUserId).all<MessageRow>();
  return {
    chat: {
      ...serializeChat(chat),
      messages: result.results.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        filesRead: parseJsonArray(message.files_read_json),
        createdAt: message.created_at,
      })),
    },
  };
}

export async function appendAppleIntelligenceMessage(request: Request, env: AppleIntelligenceChatEnv, ownerUserId: string, chatId: string) {
  const body: unknown = await request.json();
  if (!isRecord(body)) throw new AppleIntelligenceChatError("INVALID_INPUT");
  const role = body.role;
  if (role !== "user" && role !== "assistant") throw new AppleIntelligenceChatError("INVALID_INPUT");
  const content = parseText(body.content, 50_000);
  const filesRead = role === "assistant" ? parseFiles(body.filesRead) : [];
  const chat = await getOwnedChat(env, ownerUserId, chatId);
  if (!chat) throw new AppleIntelligenceChatError("NOT_FOUND");
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM apple_intelligence_chat_messages WHERE chat_id = ?1",
  ).bind(chatId).first<{ total: number }>();
  if (Number(count?.total ?? 0) >= maxMessagesPerChat) throw new AppleIntelligenceChatError("MESSAGE_LIMIT_REACHED");
  const id = crypto.randomUUID();
  const now = Date.now();
  const title = role === "user" ? content.replace(/\s+/gu, " ").slice(0, 60) : chat.title;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO apple_intelligence_chat_messages
         (id, chat_id, owner_user_id, role, content, files_read_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(id, chatId, ownerUserId, role, content, JSON.stringify(filesRead), now),
    env.DB.prepare(
      `UPDATE apple_intelligence_chats
          SET title = CASE WHEN title = '新しいチャット' AND ?1 = 'user' THEN ?2 ELSE title END,
              updated_at = ?3
        WHERE id = ?4 AND owner_user_id = ?5`,
    ).bind(role, title, now, chatId, ownerUserId),
  ]);
  return { message: { id, role, content, filesRead, createdAt: now }, title: chat.title === "新しいチャット" && role === "user" ? title : chat.title };
}
