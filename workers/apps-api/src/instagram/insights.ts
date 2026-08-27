import { decryptAccessToken } from "../security/crypto";
import { addAnigramGrowthEvent } from "../anigram/game";

const graphApiOrigin = "https://graph.instagram.com";
const graphApiVersion = "v23.0";
const storyFoodLimit = 20;

export interface InstagramInsightsEnv {
  DB: D1Database;
  TOKEN_ENCRYPTION_KEY: string;
}

interface InstagramConnectionRow {
  instagram_user_id: string;
  access_token_ciphertext: string;
  access_token_iv: string;
  token_expires_at: number | null;
}

interface StoryItem {
  id?: unknown;
  media_type?: unknown;
  timestamp?: unknown;
}

interface StoriesResponse {
  data?: unknown;
  error?: { code?: unknown; type?: unknown; message?: unknown };
}

interface InsightItem {
  name?: unknown;
  values?: unknown;
  total_value?: unknown;
}

interface InsightsResponse {
  data?: unknown;
  error?: { code?: unknown; type?: unknown; message?: unknown };
}

export class InstagramInsightsError extends Error {
  constructor(
    readonly code:
      | "CONNECTION_REQUIRED"
      | "TOKEN_EXPIRED"
      | "PROVIDER_FAILED",
    readonly providerCode?: string,
    readonly providerStage?: "stories" | "interactions",
    readonly providerMessage?: string,
  ) {
    super(code);
    this.name = "InstagramInsightsError";
  }
}

function getProviderCode(body: StoriesResponse | InsightsResponse) {
  const value = body.error?.code ?? body.error?.type;
  return value === undefined ? undefined : String(value);
}

async function requestProvider<T extends StoriesResponse | InsightsResponse>(
  path: string,
  accessToken: string,
  stage: "stories" | "interactions",
): Promise<T> {
  const response = await fetch(`${graphApiOrigin}/${graphApiVersion}/${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = (await response.json()) as T;
  if (!response.ok) {
    throw new InstagramInsightsError(
      "PROVIDER_FAILED",
      getProviderCode(body),
      stage,
      typeof body.error?.message === "string"
        ? body.error.message.slice(0, 300)
        : undefined,
    );
  }
  return body;
}

function readMetricValue(item: InsightItem): number | null {
  if (
    item.total_value &&
    typeof item.total_value === "object" &&
    "value" in item.total_value &&
    typeof item.total_value.value === "number"
  ) {
    return item.total_value.value;
  }
  if (Array.isArray(item.values)) {
    for (const value of item.values.toReversed()) {
      if (
        value &&
        typeof value === "object" &&
        "value" in value &&
        typeof value.value === "number"
      ) {
        return value.value;
      }
    }
  }
  return null;
}

function parseStoryTimestamp(timestamp: unknown): number | null {
  if (typeof timestamp !== "string") return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

async function recordStoryInteractions(
  env: InstagramInsightsEnv,
  ownerUserId: string,
  instagramUserId: string,
  story: StoryItem,
  interactions: number,
) {
  const storyId = String(story.id);
  const now = Date.now();
  const normalizedInteractions = Math.max(0, Math.floor(interactions));
  const previous = await env.DB.prepare(
    `SELECT max_total_interactions, total_food_awarded
       FROM instagram_story_snapshots
      WHERE owner_user_id = ?1 AND story_id = ?2`,
  )
    .bind(ownerUserId, storyId)
    .first<{
      max_total_interactions: number;
      total_food_awarded: number;
    }>();
  const previousMaximum = previous?.max_total_interactions ?? 0;
  const previousAwarded = previous?.total_food_awarded ?? 0;
  const interactionDelta = Math.max(
    0,
    normalizedInteractions - previousMaximum,
  );
  const foodAwarded = Math.max(
    0,
    Math.min(normalizedInteractions, storyFoodLimit) -
      Math.min(previousMaximum, storyFoodLimit),
  );

  const statements = [
    env.DB.prepare(
      `INSERT INTO instagram_story_snapshots
         (owner_user_id, instagram_user_id, story_id, media_type,
          story_published_at, current_total_interactions,
          max_total_interactions, total_food_awarded, first_seen_at,
          last_checked_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?8, ?8)
       ON CONFLICT(owner_user_id, story_id) DO UPDATE SET
         instagram_user_id = excluded.instagram_user_id,
         media_type = excluded.media_type,
         story_published_at = excluded.story_published_at,
         current_total_interactions = excluded.current_total_interactions,
         max_total_interactions = MAX(
           instagram_story_snapshots.max_total_interactions,
           excluded.max_total_interactions
         ),
         last_checked_at = excluded.last_checked_at`,
    )
      .bind(
        ownerUserId,
        instagramUserId,
        storyId,
        typeof story.media_type === "string" ? story.media_type : null,
        parseStoryTimestamp(story.timestamp),
        normalizedInteractions,
        0,
        now,
      ),
  ];

  if (interactionDelta > 0 && foodAwarded > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO instagram_food_events
           (id, owner_user_id, instagram_user_id, story_id,
            observed_total_interactions, interaction_delta, food_amount,
            created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
        .bind(
          crypto.randomUUID(),
          ownerUserId,
          instagramUserId,
          storyId,
          normalizedInteractions,
          interactionDelta,
          foodAwarded,
          now,
        ),
    );
    statements.push(
      env.DB.prepare(
        `UPDATE instagram_story_snapshots
            SET total_food_awarded = COALESCE(
              (SELECT SUM(food_amount)
                 FROM instagram_food_events
                WHERE owner_user_id = ?1 AND story_id = ?2),
              0
            )
          WHERE owner_user_id = ?1 AND story_id = ?2`,
      ).bind(ownerUserId, storyId),
    );
  }
  const results = await env.DB.batch(statements);
  const insertedFoodEvent = (results[1]?.meta.changes ?? 0) > 0;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO hundred_pet_states
         (owner_user_id, species, life_status, fullness, created_at, updated_at)
       VALUES (?1, 'hedgehog', 'alive', 0, ?2, ?2)
       ON CONFLICT(owner_user_id) DO NOTHING`,
    ).bind(ownerUserId, now),
    env.DB.prepare(
      `UPDATE hundred_pet_states
          SET fullness = MIN(
                100,
                fullness + COALESCE(
                  (SELECT SUM(food_amount)
                     FROM instagram_food_events
                    WHERE owner_user_id = ?1 AND applied_at IS NULL),
                  0
                )
              ),
              last_fed_at = CASE
                WHEN EXISTS (
                  SELECT 1
                    FROM instagram_food_events
                   WHERE owner_user_id = ?1 AND applied_at IS NULL
                ) THEN ?2
                ELSE last_fed_at
              END,
              updated_at = ?2
        WHERE owner_user_id = ?1`,
    ).bind(ownerUserId, now),
    env.DB.prepare(
      `UPDATE instagram_food_events
          SET applied_at = ?2
        WHERE owner_user_id = ?1 AND applied_at IS NULL`,
    ).bind(ownerUserId, now),
  ]);

  // Instagram側の観測履歴とゲーム本体の成長イベントを分離する。
  // 技術検証用の1 Story 20ポイント上限はAnigramには適用しない。
  if (interactionDelta > 0) {
    await addAnigramGrowthEvent(env, ownerUserId, {
      source: "instagram_story",
      externalEventId: `${instagramUserId}:${storyId}:${normalizedInteractions}`,
      reactionType: "total_interactions",
      points: interactionDelta,
      occurredAt: now,
    });
  }

  const snapshot = await env.DB.prepare(
    `SELECT max_total_interactions, total_food_awarded
       FROM instagram_story_snapshots
      WHERE owner_user_id = ?1 AND story_id = ?2`,
  )
    .bind(ownerUserId, storyId)
    .first<{
      max_total_interactions: number;
      total_food_awarded: number;
    }>();

  return {
    foodAwarded: insertedFoodEvent ? foodAwarded : 0,
    totalFoodAwarded: snapshot?.total_food_awarded ?? previousAwarded,
    maxInteractions: snapshot?.max_total_interactions ?? previousMaximum,
    foodLimit: storyFoodLimit,
  };
}

/** 接続中アカウントが公開しているStoryと、現在の総反応数を取得する。 */
export async function listInstagramStoryInsights(
  env: InstagramInsightsEnv,
  ownerUserId: string,
) {
  const connection = await env.DB.prepare(
    `SELECT instagram_user_id, access_token_ciphertext, access_token_iv,
            token_expires_at
       FROM instagram_connections
      WHERE owner_user_id = ?1`,
  )
    .bind(ownerUserId)
    .first<InstagramConnectionRow>();
  if (!connection) throw new InstagramInsightsError("CONNECTION_REQUIRED");
  if (
    connection.token_expires_at !== null &&
    connection.token_expires_at <= Math.floor(Date.now() / 1000)
  ) {
    throw new InstagramInsightsError("TOKEN_EXPIRED");
  }

  const accessToken = await decryptAccessToken(
    connection.access_token_ciphertext,
    connection.access_token_iv,
    env.TOKEN_ENCRYPTION_KEY,
  );
  const storiesResponse = await requestProvider<StoriesResponse>(
    `${encodeURIComponent(connection.instagram_user_id)}/stories?fields=id,media_type,timestamp`,
    accessToken,
    "stories",
  );
  const stories = Array.isArray(storiesResponse.data)
    ? storiesResponse.data.filter(
        (item): item is StoryItem =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as StoryItem).id === "string",
      )
    : [];

  const serializedStories = [];
  for (const story of stories) {
    const storyId = String(story.id);
    const insightsResponse = await requestProvider<InsightsResponse>(
      `${encodeURIComponent(storyId)}/insights?metric=total_interactions`,
      accessToken,
      "interactions",
    );
    const metrics = Array.isArray(insightsResponse.data)
      ? (insightsResponse.data as InsightItem[])
      : [];
    const interactionsMetric = metrics.find(
      (item) => item.name === "total_interactions",
    );
    const interactions = interactionsMetric
      ? readMetricValue(interactionsMetric)
      : null;
    const food =
      interactions === null
        ? {
            foodAwarded: 0,
            totalFoodAwarded: 0,
            maxInteractions: 0,
            foodLimit: storyFoodLimit,
          }
        : await recordStoryInteractions(
            env,
            ownerUserId,
            connection.instagram_user_id,
            story,
            interactions,
          );
    serializedStories.push({
      id: storyId,
      mediaType:
        typeof story.media_type === "string" ? story.media_type : null,
      timestamp: typeof story.timestamp === "string" ? story.timestamp : null,
      interactions,
      ...food,
    });
  }
  const pet = await env.DB.prepare(
    `SELECT species, life_status, fullness, last_fed_at
       FROM hundred_pet_states
      WHERE owner_user_id = ?1`,
  )
    .bind(ownerUserId)
    .first<{
      species: string;
      life_status: string;
      fullness: number;
      last_fed_at: number | null;
    }>();
  return {
    stories: serializedStories,
    pet: pet
      ? {
          species: pet.species,
          status: pet.life_status,
          fullness: pet.fullness,
          lastFedAt: pet.last_fed_at,
        }
      : null,
  };
}

/** 接続中アカウントのStory反応を定期同期する。個別失敗で全体を止めない。 */
export async function syncAllInstagramStoryInsights(
  env: InstagramInsightsEnv,
) {
  const result = await env.DB.prepare(
    `SELECT owner_user_id
       FROM instagram_connections
      WHERE token_expires_at IS NULL OR token_expires_at > ?1
      ORDER BY updated_at ASC
      LIMIT 100`,
  )
    .bind(Math.floor(Date.now() / 1000))
    .all<{ owner_user_id: string }>();
  let succeeded = 0;
  let failed = 0;
  for (const connection of result.results) {
    try {
      await listInstagramStoryInsights(env, connection.owner_user_id);
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed: result.results.length, succeeded, failed };
}
