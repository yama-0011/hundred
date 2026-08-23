import {
  createGeminiArticleGenerator,
  GeminiGenerationError,
  type GeminiEnv,
} from "./gemini";
import type { ArticleGenerationInput, GeneratedArticle } from "./provider";
import { resolveProductReferenceContext } from "./reference-context";

const maxTopicLength = 200;
const maxKeyPointsLength = 2_000;
const maxAudienceLength = 200;
const maxReferenceIds = 20;
const minuteLimit = 3;
const dailyLimit = 20;

interface GenerationEnv extends GeminiEnv {
  DB: D1Database;
}

export class ArticleGenerationError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "RATE_LIMITED"
      | "PROVIDER_BUSY"
      | "GENERATION_FAILED",
  ) {
    super(code);
    this.name = "ArticleGenerationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInput(value: unknown): {
  input: Omit<ArticleGenerationInput, "referenceContext">;
  referenceIds: string[];
} {
  if (!isRecord(value)) throw new ArticleGenerationError("INVALID_INPUT");

  const topic = typeof value.topic === "string" ? value.topic.trim() : "";
  const keyPoints =
    typeof value.keyPoints === "string" ? value.keyPoints.trim() : "";
  const audience =
    typeof value.audience === "string" ? value.audience.trim() : "";
  const tone = value.tone ?? "friendly";
  const referenceIds = Array.isArray(value.referenceIds)
    ? value.referenceIds.filter(
        (item): item is string => typeof item === "string" && item.length <= 100,
      )
    : [];

  if (
    !topic ||
    topic.length > maxTopicLength ||
    keyPoints.length > maxKeyPointsLength ||
    audience.length > maxAudienceLength ||
    referenceIds.length > maxReferenceIds ||
    (tone !== "friendly" && tone !== "professional" && tone !== "casual")
  ) {
    throw new ArticleGenerationError("INVALID_INPUT");
  }

  return { input: { topic, keyPoints, audience, tone }, referenceIds };
}

async function enforceRateLimit(env: GenerationEnv, ownerUserId: string) {
  const now = Math.floor(Date.now() / 1_000);
  const today = new Date();
  const startOfUtcDay = Math.floor(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    ) / 1_000,
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
    throw new ArticleGenerationError("RATE_LIMITED");
  }
}

/** 入力本文を保存せず、認証利用者ごとの利用回数だけをD1へ記録して記事案を生成する。 */
export async function generateArticle(
  request: Request,
  env: GenerationEnv,
  ownerUserId: string,
): Promise<GeneratedArticle> {
  let parsedInput: ReturnType<typeof parseInput>;

  try {
    parsedInput = parseInput(await request.json());
  } catch (error) {
    if (error instanceof ArticleGenerationError) throw error;
    throw new ArticleGenerationError("INVALID_INPUT");
  }

  await env.DB.prepare(
    `INSERT INTO users (owner_user_id)
     VALUES (?1)
     ON CONFLICT(owner_user_id)
     DO UPDATE SET updated_at = unixepoch()`,
  )
    .bind(ownerUserId)
    .run();

  await enforceRateLimit(env, ownerUserId);

  const resolvedReferences = await resolveProductReferenceContext(
    env.DB,
    ownerUserId,
    [parsedInput.input.topic, parsedInput.input.keyPoints]
      .filter(Boolean)
      .join("\n"),
    parsedInput.referenceIds,
  );
  const input: ArticleGenerationInput = {
    ...parsedInput.input,
    referenceContext: resolvedReferences.context,
  };

  const model = env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  const requestId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO generation_requests (id, owner_user_id, model, status)
     VALUES (?1, ?2, ?3, 'started')`,
  )
    .bind(requestId, ownerUserId, model)
    .run();

  try {
    const result = await createGeminiArticleGenerator(env).generate(input);
    await env.DB.prepare(
      `UPDATE generation_requests
          SET status = 'succeeded', completed_at = unixepoch()
        WHERE id = ?1`,
    )
      .bind(requestId)
      .run();
    return { ...result, usedReferences: resolvedReferences.references };
  } catch (error) {
    await env.DB.prepare(
      `UPDATE generation_requests
          SET status = 'failed', completed_at = unixepoch()
        WHERE id = ?1`,
    )
      .bind(requestId)
      .run();
    throw new ArticleGenerationError(
      error instanceof GeminiGenerationError && error.code === "PROVIDER_BUSY"
        ? "PROVIDER_BUSY"
        : "GENERATION_FAILED",
    );
  }
}
