import { decryptAccessToken } from "../security/crypto";

const graphApiOrigin = "https://graph.instagram.com";
const graphApiVersion = "v23.0";

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
  error?: { code?: unknown; type?: unknown };
}

interface InsightItem {
  name?: unknown;
  values?: unknown;
  total_value?: unknown;
}

interface InsightsResponse {
  data?: unknown;
  error?: { code?: unknown; type?: unknown };
}

export class InstagramInsightsError extends Error {
  constructor(
    readonly code:
      | "CONNECTION_REQUIRED"
      | "TOKEN_EXPIRED"
      | "PROVIDER_FAILED",
    readonly providerCode?: string,
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
): Promise<T> {
  const response = await fetch(`${graphApiOrigin}/${graphApiVersion}/${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = (await response.json()) as T;
  if (!response.ok) {
    throw new InstagramInsightsError("PROVIDER_FAILED", getProviderCode(body));
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

/** 接続中アカウントが公開しているStoryと、現在のいいね数を取得する。 */
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
  );
  const stories = Array.isArray(storiesResponse.data)
    ? storiesResponse.data.filter(
        (item): item is StoryItem =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as StoryItem).id === "string",
      )
    : [];

  return {
    stories: await Promise.all(
      stories.map(async (story) => {
        const storyId = String(story.id);
        const insightsResponse = await requestProvider<InsightsResponse>(
          `${encodeURIComponent(storyId)}/insights?metric=likes`,
          accessToken,
        );
        const metrics = Array.isArray(insightsResponse.data)
          ? (insightsResponse.data as InsightItem[])
          : [];
        const likesMetric = metrics.find((item) => item.name === "likes");
        return {
          id: storyId,
          mediaType:
            typeof story.media_type === "string" ? story.media_type : null,
          timestamp:
            typeof story.timestamp === "string" ? story.timestamp : null,
          likes: likesMetric ? readMetricValue(likesMetric) : null,
        };
      }),
    ),
  };
}
