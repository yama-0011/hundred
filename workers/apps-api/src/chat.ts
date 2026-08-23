import type { UsedReference } from "./ai/provider";

const maxChatsPerUser = 10;
const maxMessagesPerChat = 1_000;
const welcomeMessage =
  "今日は何を作りますか？ 作りたい内容をそのまま話してください。";

export interface CreativeIAChatEnv {
  DB: D1Database;
}

type ChatRole = "assistant" | "user";

interface ChatRow {
  id: string;
  title: string;
  article_title: string;
  article_content: string;
  article_excerpt: string;
  article_warnings_json: string;
  article_references_json: string;
  article_model: string | null;
  production_memos_json: string;
  applied_rule_ids_json: string;
  saved_draft_json: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  chat_id: string;
  role: ChatRole;
  content: string;
  created_at: number;
}

interface ProductionMemo {
  id: string;
  label: string;
  value: string;
}

interface SavedDraft {
  postId: string;
  postUrl: string | null;
  status: "draft";
  duplicate: boolean;
}

export class CreativeIAChatError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "CHAT_LIMIT_REACHED"
      | "MESSAGE_LIMIT_REACHED"
      | "NOT_FOUND",
  ) {
    super(code);
    this.name = "CreativeIAChatError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseString(
  value: unknown,
  maxLength: number,
  options: { allowEmpty?: boolean } = {},
): string {
  if (typeof value !== "string") {
    throw new CreativeIAChatError("INVALID_INPUT");
  }

  const normalized = value.trim();
  if ((!options.allowEmpty && !normalized) || normalized.length > maxLength) {
    throw new CreativeIAChatError("INVALID_INPUT");
  }

  return normalized;
}

function parseProductionMemos(value: unknown): ProductionMemo[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw new CreativeIAChatError("INVALID_INPUT");
  }

  return value.map((memo) => {
    if (!isRecord(memo)) throw new CreativeIAChatError("INVALID_INPUT");

    return {
      id: parseString(memo.id, 100),
      label: parseString(memo.label, 80, { allowEmpty: true }),
      value: parseString(memo.value, 2_000, { allowEmpty: true }),
    };
  });
}

function parseStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new CreativeIAChatError("INVALID_INPUT");
  }

  return value.map((item) => parseString(item, 100));
}

function parseWarnings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new CreativeIAChatError("INVALID_INPUT");
  }

  return value.map((item) => parseString(item, 1_000));
}

function parseUsedReferences(value: unknown): UsedReference[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new CreativeIAChatError("INVALID_INPUT");
  }

  return value.map((reference) => {
    if (
      !isRecord(reference) ||
      !["product", "service", "organization", "contact"].includes(
        String(reference.category),
      )
    ) {
      throw new CreativeIAChatError("INVALID_INPUT");
    }

    const updatedAt = reference.updatedAt;
    if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) {
      throw new CreativeIAChatError("INVALID_INPUT");
    }

    return {
      id: parseString(reference.id, 100),
      category: reference.category as UsedReference["category"],
      name: parseString(reference.name, 200),
      updatedAt,
    };
  });
}

function parseSavedDraft(value: unknown): SavedDraft | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new CreativeIAChatError("INVALID_INPUT");

  const postUrl = value.postUrl;
  if (postUrl !== null && typeof postUrl !== "string") {
    throw new CreativeIAChatError("INVALID_INPUT");
  }

  return {
    postId: parseString(value.postId, 200),
    postUrl: postUrl?.slice(0, 2_000) ?? null,
    status: "draft",
    duplicate: value.duplicate === true,
  };
}

function serializeChat(row: ChatRow, messages: MessageRow[]) {
  const hasArticle = Boolean(row.article_title || row.article_content);

  return {
    id: row.id,
    title: row.title,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.content,
      createdAt: message.created_at,
    })),
    article: hasArticle
      ? {
          title: row.article_title,
          content: row.article_content,
          excerpt: row.article_excerpt,
          warnings: parseJson<string[]>(row.article_warnings_json, []),
          model: row.article_model ?? "",
          usedReferences: parseJson<UsedReference[]>(
            row.article_references_json,
            [],
          ),
        }
      : null,
    draftTitle: row.article_title,
    draftContent: row.article_content,
    savedDraft: parseJson<SavedDraft | null>(row.saved_draft_json, null),
    productionMemos: parseJson<ProductionMemo[]>(row.production_memos_json, []),
    appliedRuleIds: parseJson<string[]>(row.applied_rule_ids_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureUser(env: CreativeIAChatEnv, ownerUserId: string) {
  await env.DB.prepare(
    `INSERT INTO users (owner_user_id)
     VALUES (?1)
     ON CONFLICT(owner_user_id)
     DO UPDATE SET updated_at = unixepoch()`,
  )
    .bind(ownerUserId)
    .run();
}

async function getOwnedChat(
  env: CreativeIAChatEnv,
  ownerUserId: string,
  chatId: string,
) {
  return env.DB.prepare(
    `SELECT *
       FROM creative_ia_chats
      WHERE id = ?1 AND owner_user_id = ?2`,
  )
    .bind(chatId, ownerUserId)
    .first<ChatRow>();
}

/** 認証利用者が所有するChatと会話を更新順で取得する。 */
export async function listCreativeIAChats(
  env: CreativeIAChatEnv,
  ownerUserId: string,
) {
  await ensureUser(env, ownerUserId);
  const chats = await env.DB.prepare(
    `SELECT *
       FROM creative_ia_chats
      WHERE owner_user_id = ?1
      ORDER BY updated_at DESC
      LIMIT ?2`,
  )
    .bind(ownerUserId, maxChatsPerUser)
    .all<ChatRow>();
  const messages = await env.DB.prepare(
    `SELECT id, chat_id, role, content, created_at
       FROM creative_ia_chat_messages
      WHERE owner_user_id = ?1
      ORDER BY created_at ASC`,
  )
    .bind(ownerUserId)
    .all<MessageRow>();
  const messagesByChat = new Map<string, MessageRow[]>();

  for (const message of messages.results) {
    const current = messagesByChat.get(message.chat_id) ?? [];
    current.push(message);
    messagesByChat.set(message.chat_id, current);
  }

  return {
    chats: chats.results.map((chat) =>
      serializeChat(chat, messagesByChat.get(chat.id) ?? []),
    ),
    limit: maxChatsPerUser,
  };
}

/** 最大10件の作成中Chatを、1ステートメントで制限して作成する。 */
export async function createCreativeIAChat(
  env: CreativeIAChatEnv,
  ownerUserId: string,
) {
  await ensureUser(env, ownerUserId);
  const chatId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const now = Date.now();
  const insert = await env.DB.prepare(
    `INSERT INTO creative_ia_chats
       (id, owner_user_id, title, created_at, updated_at)
     SELECT ?1, ?2, '新しいChat', ?3, ?3
      WHERE (
        SELECT COUNT(*)
          FROM creative_ia_chats
         WHERE owner_user_id = ?2
      ) < ?4`,
  )
    .bind(chatId, ownerUserId, now, maxChatsPerUser)
    .run();

  if (Number(insert.meta.changes ?? 0) !== 1) {
    throw new CreativeIAChatError("CHAT_LIMIT_REACHED");
  }

  await env.DB.prepare(
    `INSERT INTO creative_ia_chat_messages
       (id, chat_id, owner_user_id, role, content, created_at)
     VALUES (?1, ?2, ?3, 'assistant', ?4, ?5)`,
  )
    .bind(messageId, chatId, ownerUserId, welcomeMessage, now)
    .run();

  const row = await getOwnedChat(env, ownerUserId, chatId);
  if (!row) throw new CreativeIAChatError("NOT_FOUND");

  return serializeChat(row, [
    {
      id: messageId,
      chat_id: chatId,
      role: "assistant",
      content: welcomeMessage,
      created_at: now,
    },
  ]);
}

/** 記事、制作メモ、適用ルール、WordPress保存状態を更新する。 */
export async function updateCreativeIAChat(
  request: Request,
  env: CreativeIAChatEnv,
  ownerUserId: string,
  chatId: string,
) {
  const value: unknown = await request.json();
  if (!isRecord(value)) throw new CreativeIAChatError("INVALID_INPUT");

  const title = parseString(value.title, 200);
  const article = value.article;
  let articleTitle = "";
  let articleContent = "";
  let articleExcerpt = "";
  let articleWarnings: string[] = [];
  let articleReferences: UsedReference[] = [];
  let articleModel: string | null = null;

  if (article !== null) {
    if (!isRecord(article)) throw new CreativeIAChatError("INVALID_INPUT");
    articleTitle = parseString(article.title, 200, { allowEmpty: true });
    articleContent = parseString(article.content, 100_000, { allowEmpty: true });
    articleExcerpt = parseString(article.excerpt, 2_000, { allowEmpty: true });
    articleWarnings = parseWarnings(article.warnings);
    articleReferences = parseUsedReferences(article.usedReferences ?? []);
    articleModel = parseString(article.model, 200, { allowEmpty: true }) || null;
  }

  const productionMemos = parseProductionMemos(value.productionMemos);
  const appliedRuleIds = parseStringArray(value.appliedRuleIds, 100);
  const savedDraft = parseSavedDraft(value.savedDraft);
  const result = await env.DB.prepare(
    `UPDATE creative_ia_chats
        SET title = ?1,
            article_title = ?2,
            article_content = ?3,
            article_excerpt = ?4,
            article_warnings_json = ?5,
            article_references_json = ?6,
            article_model = ?7,
            production_memos_json = ?8,
            applied_rule_ids_json = ?9,
            saved_draft_json = ?10,
            updated_at = ?11
      WHERE id = ?12 AND owner_user_id = ?13`,
  )
    .bind(
      title,
      articleTitle,
      articleContent,
      articleExcerpt,
      JSON.stringify(articleWarnings),
      JSON.stringify(articleReferences),
      articleModel,
      JSON.stringify(productionMemos),
      JSON.stringify(appliedRuleIds),
      savedDraft ? JSON.stringify(savedDraft) : null,
      Date.now(),
      chatId,
      ownerUserId,
    )
    .run();

  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new CreativeIAChatError("NOT_FOUND");
  }

  return { updated: true };
}

/** 会話を追記し、Chatの更新時刻も進める。 */
export async function appendCreativeIAChatMessage(
  request: Request,
  env: CreativeIAChatEnv,
  ownerUserId: string,
  chatId: string,
) {
  const value: unknown = await request.json();
  if (!isRecord(value)) throw new CreativeIAChatError("INVALID_INPUT");
  const id = parseString(value.id, 100);
  const role = value.role;
  const content = parseString(value.text, 20_000);

  if (role !== "assistant" && role !== "user") {
    throw new CreativeIAChatError("INVALID_INPUT");
  }

  const now = Date.now();
  const result = await env.DB.prepare(
    `INSERT INTO creative_ia_chat_messages
       (id, chat_id, owner_user_id, role, content, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6
      WHERE EXISTS (
        SELECT 1 FROM creative_ia_chats
         WHERE id = ?2 AND owner_user_id = ?3
      )
        AND (
          SELECT COUNT(*) FROM creative_ia_chat_messages
           WHERE chat_id = ?2
        ) < ?7`,
  )
    .bind(id, chatId, ownerUserId, role, content, now, maxMessagesPerChat)
    .run();

  if (Number(result.meta.changes ?? 0) !== 1) {
    const chat = await getOwnedChat(env, ownerUserId, chatId);
    if (!chat) throw new CreativeIAChatError("NOT_FOUND");
    throw new CreativeIAChatError("MESSAGE_LIMIT_REACHED");
  }

  await env.DB.prepare(
    `UPDATE creative_ia_chats
        SET updated_at = ?1
      WHERE id = ?2 AND owner_user_id = ?3`,
  )
    .bind(now, chatId, ownerUserId)
    .run();

  return { created: true, createdAt: now };
}

/** 利用者が所有するChatと子メッセージを削除する。 */
export async function deleteCreativeIAChat(
  env: CreativeIAChatEnv,
  ownerUserId: string,
  chatId: string,
) {
  const result = await env.DB.prepare(
    "DELETE FROM creative_ia_chats WHERE id = ?1 AND owner_user_id = ?2",
  )
    .bind(chatId, ownerUserId)
    .run();

  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new CreativeIAChatError("NOT_FOUND");
  }

  return { deleted: true };
}
