import {
  CreativeIAChatError,
  getCreativeIAConversationContext,
} from "../chat";
import {
  createGeminiConversationResponder,
  GeminiGenerationError,
  type GeminiEnv,
} from "./gemini";
import type { GeneratedArticle } from "./provider";
import { resolveReferenceContext } from "./reference-context";
import { resolveCreativeIAApplicationGuide } from "./application-guide";

const minuteLimit = 10;
const dailyLimit = 200;

interface ConversationEnv extends GeminiEnv {
  DB: D1Database;
}

export interface CreativeIAConversationResponse {
  action: "chat" | "clarify" | "update_article";
  message: string;
  article: GeneratedArticle | null;
  productionDestination: "wordpress" | "instagram" | null;
  instagramContentType: "feed" | "stories" | "reels";
}

export class CreativeIAConversationError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "INVALID_INPUT"
      | "RATE_LIMITED"
      | "PROVIDER_BUSY"
      | "GENERATION_FAILED",
  ) {
    super(code);
    this.name = "CreativeIAConversationError";
  }
}

async function enforceRateLimit(env: ConversationEnv, ownerUserId: string) {
  const now = Math.floor(Date.now() / 1_000);
  const today = new Date();
  const startOfUtcDay = Math.floor(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) /
      1_000,
  );
  const usage = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) AS minute_count,
       SUM(CASE WHEN created_at >= ?3 THEN 1 ELSE 0 END) AS daily_count
     FROM generation_requests
     WHERE owner_user_id = ?1`,
  )
    .bind(ownerUserId, now - 60, startOfUtcDay)
    .first<{ minute_count: number | null; daily_count: number | null }>();

  if (
    Number(usage?.minute_count ?? 0) >= minuteLimit ||
    Number(usage?.daily_count ?? 0) >= dailyLimit
  ) {
    throw new CreativeIAConversationError("RATE_LIMITED");
  }
}

function resolveProductionDestinationAnswer(
  messages: Array<{ role: "assistant" | "user"; text: string }>,
): {
  productionDestination: "wordpress" | "instagram";
  instagramContentType: "feed" | "stories" | "reels";
} | null {
  const latestUserMessage = messages.at(-1);
  const previousAssistantMessage = messages.at(-2);
  if (
    latestUserMessage?.role !== "user" ||
    previousAssistantMessage?.role !== "assistant" ||
    latestUserMessage.text.length > 100 ||
    !/制作先|WordPress|Instagram/iu.test(previousAssistantMessage.text)
  ) {
    return null;
  }

  const answer = latestUserMessage.text;
  if (/WordPress|ワードプレス/iu.test(answer)) {
    return {
      productionDestination: "wordpress",
      instagramContentType: "feed",
    };
  }
  if (/ストーリーズ?|ストーリー/iu.test(answer)) {
    return {
      productionDestination: "instagram",
      instagramContentType: "stories",
    };
  }
  if (/Reels?|リール/iu.test(answer)) {
    return {
      productionDestination: "instagram",
      instagramContentType: "reels",
    };
  }
  if (/フィード/iu.test(answer)) {
    return {
      productionDestination: "instagram",
      instagramContentType: "feed",
    };
  }
  return null;
}

/** 保存済みChatを正としてGeminiへ渡し、通常会話または記事更新を返す。 */
export async function respondToCreativeIAChat(
  env: ConversationEnv,
  ownerUserId: string,
  chatId: string,
): Promise<CreativeIAConversationResponse> {
  let context: Awaited<ReturnType<typeof getCreativeIAConversationContext>>;
  try {
    context = await getCreativeIAConversationContext(env, ownerUserId, chatId);
  } catch (error) {
    if (error instanceof CreativeIAChatError && error.code === "NOT_FOUND") {
      throw new CreativeIAConversationError("NOT_FOUND");
    }
    throw error;
  }

  const latestUserMessage = [...context.messages]
    .reverse()
    .find((message) => message.role === "user")?.text;
  if (!latestUserMessage) {
    throw new CreativeIAConversationError("INVALID_INPUT");
  }

  if (context.productionDestination === null) {
    const resolvedDestination = resolveProductionDestinationAnswer(
      context.messages,
    );
    if (resolvedDestination) {
      await env.DB.prepare(
        `UPDATE creative_ia_chats
            SET production_destination = ?1,
                instagram_content_type = ?2,
                production_destination_confirmed = 1,
                updated_at = ?3
          WHERE id = ?4 AND owner_user_id = ?5`,
      )
        .bind(
          resolvedDestination.productionDestination,
          resolvedDestination.instagramContentType,
          Date.now(),
          chatId,
          ownerUserId,
        )
        .run();
      context.productionDestination = resolvedDestination.productionDestination;
      context.instagramContentType = resolvedDestination.instagramContentType;
    }
  }

  await enforceRateLimit(env, ownerUserId);
  const resolvedReferences = await resolveReferenceContext(
    env.DB,
    ownerUserId,
    latestUserMessage,
    context.article?.usedReferences.map((reference) => reference.id) ?? [],
  );
  const productionMemoContext = context.productionMemos
    .filter((memo) => memo.label.trim() || memo.value.trim())
    .map((memo) => `${memo.label.trim() || "項目"}: ${memo.value.trim()}`)
    .join("\n");
  const applicationGuideContext =
    resolveCreativeIAApplicationGuide(latestUserMessage);
  const model = env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  const requestId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO generation_requests (id, owner_user_id, model, status)
     VALUES (?1, ?2, ?3, 'started')`,
  )
    .bind(requestId, ownerUserId, model)
    .run();

  try {
    const result = await createGeminiConversationResponder(env).respond({
      messages: context.messages,
      currentArticle: context.article
        ? {
            title: context.article.title,
            content: context.article.content,
            excerpt: context.article.excerpt,
          }
        : null,
      productionMemoContext,
      referenceContext: resolvedReferences.context,
      applicationGuideContext,
      productionDestination: context.productionDestination,
      instagramContentType: context.instagramContentType,
    });
    await env.DB.prepare(
      `UPDATE generation_requests
          SET status = 'succeeded', completed_at = unixepoch()
        WHERE id = ?1`,
    )
      .bind(requestId)
      .run();

    return {
      action: result.action,
      message: result.message,
      productionDestination: context.productionDestination,
      instagramContentType: context.instagramContentType,
      article: result.article
        ? {
            ...result.article,
            usedReferences: resolvedReferences.references,
          }
        : null,
    };
  } catch (error) {
    await env.DB.prepare(
      `UPDATE generation_requests
          SET status = 'failed', completed_at = unixepoch()
        WHERE id = ?1`,
    )
      .bind(requestId)
      .run();
    throw new CreativeIAConversationError(
      error instanceof GeminiGenerationError && error.code === "PROVIDER_BUSY"
        ? "PROVIDER_BUSY"
        : "GENERATION_FAILED",
    );
  }
}
