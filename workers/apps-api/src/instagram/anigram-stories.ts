import {
  InstagramPublicationError,
  publishInstagramImage,
  type InstagramPublisherEnv,
} from "./publisher";
import {
  AnigramStoryRendererError,
  renderAnigramStoryAsset,
  type AnigramStoryRendererEnv,
} from "../anigram/story-renderer";

export interface AnigramStoryEnv
  extends InstagramPublisherEnv, AnigramStoryRendererEnv {
  PUBLIC_API_ORIGIN: string;
}

interface ScheduledDeliverySettingsRow {
  enabled: number;
  delivery_time: string;
  timezone: string;
  publisher_user_id: string | null;
}

interface StoryPublicationRow {
  id: string;
  render_id: string | null;
  image_key: string;
  image_content_type: string;
  status: "processing" | "published" | "failed";
  container_id: string | null;
  instagram_media_id: string | null;
  provider_error_code: string | null;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

function serializeStory(row: StoryPublicationRow) {
  return {
    id: row.id,
    renderId: row.render_id,
    status: row.status,
    containerId: row.container_id,
    instagramMediaId: row.instagram_media_id,
    providerErrorCode: row.provider_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

async function getStory(env: AnigramStoryEnv, id: string) {
  return env.DB.prepare(
    `SELECT id, render_id, image_key, image_content_type, status, container_id,
            instagram_media_id, provider_error_code, created_at, updated_at,
            published_at
       FROM anigram_instagram_story_publications
      WHERE id = ?1`,
  )
    .bind(id)
    .first<StoryPublicationRow>();
}

async function publishStoryAsset(
  env: AnigramStoryEnv,
  ownerUserId: string,
  requestOrigin: string,
  input: {
    imageKey: string;
    renderId?: string;
  },
) {
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await env.DB.prepare(
      `UPDATE anigram_instagram_story_publications
          SET status = 'failed', provider_error_code = 'PROCESSING_TIMEOUT',
              updated_at = ?1
        WHERE owner_user_id = ?2
          AND status = 'processing'
          AND updated_at < ?3`,
    )
      .bind(now, ownerUserId, now - 5 * 60 * 1_000)
      .run();
    await env.DB.prepare(
      `INSERT INTO anigram_instagram_story_publications
         (id, owner_user_id, render_id, image_key, image_content_type, status,
          created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'image/jpeg', 'processing', ?5, ?5)`,
    )
      .bind(id, ownerUserId, input.renderId ?? null, input.imageKey, now)
      .run();
  } catch (error) {
    const active = await env.DB.prepare(
      `SELECT id
         FROM anigram_instagram_story_publications
        WHERE owner_user_id = ?1 AND status = 'processing'
        LIMIT 1`,
    )
      .bind(ownerUserId)
      .first<{ id: string }>();
    if (active) throw new InstagramPublicationError("ALREADY_PROCESSING");
    throw error;
  }

  try {
    const result = await publishInstagramImage(env, ownerUserId, {
      imageUrl: `${requestOrigin}/api/anigram/instagram/story/media/${encodeURIComponent(id)}`,
      mediaType: "STORIES",
      onContainerCreated: async (containerId) => {
        await env.DB.prepare(
          `UPDATE anigram_instagram_story_publications
              SET container_id = ?1, updated_at = ?2
            WHERE id = ?3`,
        )
          .bind(containerId, Date.now(), id)
          .run();
      },
    });
    const publishedAt = Date.now();
    await env.DB.prepare(
      `UPDATE anigram_instagram_story_publications
          SET status = 'published', instagram_media_id = ?1,
              provider_error_code = NULL, updated_at = ?2, published_at = ?2
        WHERE id = ?3`,
    )
      .bind(result.mediaId, publishedAt, id)
      .run();
    const row = await getStory(env, id);
    if (!row) throw new InstagramPublicationError("NOT_FOUND");
    return {
      story: serializeStory(row),
      accountUsername: result.accountUsername,
      accountUrl: `https://www.instagram.com/${encodeURIComponent(result.accountUsername)}/`,
    };
  } catch (error) {
    const providerCode =
      error instanceof InstagramPublicationError ? error.providerCode : undefined;
    await env.DB.prepare(
      `UPDATE anigram_instagram_story_publications
          SET status = 'failed', provider_error_code = ?1, updated_at = ?2
        WHERE id = ?3`,
    )
      .bind(providerCode ?? "UNEXPECTED", Date.now(), id)
      .run();
    throw error instanceof InstagramPublicationError
      ? error
      : new InstagramPublicationError("PROVIDER_FAILED");
  }
}

/** 現在のペット状態をBrowser Runで生成し、その画像をInstagram Storiesへ公開する。 */
async function generateAndPublishAnigramStoryCore(
  env: AnigramStoryEnv,
  ownerUserId: string,
  requestOrigin: string,
) {
  const asset = await renderAnigramStoryAsset(env, ownerUserId, requestOrigin);
  const publication = await publishStoryAsset(
    env,
    ownerUserId,
    requestOrigin,
    { imageKey: asset.imageKey, renderId: asset.render.id },
  );
  return { ...publication, render: asset.render };
}

export async function generateAndPublishAnigramStory(
  request: Request,
  env: AnigramStoryEnv,
  ownerUserId: string,
  requestOrigin: string,
) {
  if (new URL(request.url).searchParams.get("confirmed") !== "true") {
    throw new InstagramPublicationError("INVALID_INPUT");
  }
  return generateAndPublishAnigramStoryCore(
    env,
    ownerUserId,
    requestOrigin,
  );
}

function resolveDeliverySlot(scheduledAt: number, deliveryTime: string) {
  const [hour, minute] = deliveryTime.split(":").map(Number);
  const jstDate = new Date(scheduledAt + 9 * 60 * 60 * 1_000);
  let target = Date.UTC(
    jstDate.getUTCFullYear(),
    jstDate.getUTCMonth(),
    jstDate.getUTCDate(),
    hour - 9,
    minute,
  );
  if (target > scheduledAt) target -= 24 * 60 * 60 * 1_000;
  const elapsed = scheduledAt - target;
  if (elapsed < 0 || elapsed >= 5 * 60 * 1_000) return null;
  const slotDate = new Date(target + 9 * 60 * 60 * 1_000);
  return {
    scheduledFor: target,
    slot: `${slotDate.toISOString().slice(0, 16)}+09:00`,
  };
}

function deliveryErrorCode(error: unknown) {
  if (error instanceof InstagramPublicationError) {
    return error.providerCode
      ? `${error.code}:${error.providerCode}`
      : error.code;
  }
  if (error instanceof AnigramStoryRendererError) {
    return error.providerStatus === undefined
      ? error.code
      : `${error.code}:${error.providerStatus}`;
  }
  return "UNEXPECTED";
}

/** 5分Cronから呼び出し、設定時刻の一度だけ自動生成・公開する。 */
export async function runAnigramScheduledStoryDelivery(
  env: AnigramStoryEnv,
  scheduledAt: number,
) {
  const settings = await env.DB.prepare(
    `SELECT enabled, delivery_time, timezone, publisher_user_id
       FROM anigram_instagram_delivery_settings
      WHERE id = 1`,
  ).first<ScheduledDeliverySettingsRow>();
  if (!settings || settings.enabled !== 1) {
    return { status: "skipped", reason: "disabled" } as const;
  }
  if (settings.timezone !== "Asia/Tokyo") {
    return { status: "skipped", reason: "unsupported_timezone" } as const;
  }
  const deliverySlot = resolveDeliverySlot(scheduledAt, settings.delivery_time);
  if (!deliverySlot) {
    return { status: "skipped", reason: "not_due" } as const;
  }

  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  const claimed = await env.DB.prepare(
    `INSERT OR IGNORE INTO anigram_instagram_delivery_runs
       (id, delivery_slot, publisher_user_id, status, scheduled_for, started_at)
     VALUES (?1, ?2, ?3, 'processing', ?4, ?5)`,
  )
    .bind(
      runId,
      deliverySlot.slot,
      settings.publisher_user_id,
      deliverySlot.scheduledFor,
      startedAt,
    )
    .run();
  if ((claimed.meta.changes ?? 0) === 0) {
    return { status: "skipped", reason: "already_processed" } as const;
  }

  try {
    if (!settings.publisher_user_id) {
      throw new InstagramPublicationError("CONNECTION_REQUIRED", "PUBLISHER_NOT_CONFIGURED");
    }
    const result = await generateAndPublishAnigramStoryCore(
      env,
      settings.publisher_user_id,
      env.PUBLIC_API_ORIGIN,
    );
    const completedAt = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE anigram_instagram_delivery_runs
            SET status = 'published', publication_id = ?1,
                error_code = NULL, completed_at = ?2
          WHERE id = ?3`,
      ).bind(result.story.id, completedAt, runId),
      env.DB.prepare(
        `UPDATE anigram_instagram_delivery_settings
            SET last_delivery_at = ?1, last_delivery_status = 'published',
                last_delivery_error_code = NULL
          WHERE id = 1`,
      ).bind(completedAt),
    ]);
    return { status: "published", runId, story: result.story } as const;
  } catch (error) {
    const errorCode = deliveryErrorCode(error);
    const completedAt = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE anigram_instagram_delivery_runs
            SET status = 'failed', error_code = ?1, completed_at = ?2
          WHERE id = ?3`,
      ).bind(errorCode, completedAt, runId),
      env.DB.prepare(
        `UPDATE anigram_instagram_delivery_settings
            SET last_delivery_at = ?1, last_delivery_status = 'failed',
                last_delivery_error_code = ?2
          WHERE id = 1`,
      ).bind(completedAt, errorCode),
    ]);
    return { status: "failed", runId, errorCode } as const;
  }
}

/** Metaがコンテナ作成時に取得する、推測困難な公開画像URL。 */
export async function serveAnigramStoryImage(
  env: AnigramStoryEnv,
  publicationId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT image_key, image_content_type
       FROM anigram_instagram_story_publications
      WHERE id = ?1`,
  )
    .bind(publicationId)
    .first<{ image_key: string; image_content_type: string }>();
  if (!row) return new Response(null, { status: 404 });
  const object = await env.MEDIA.get(row.image_key);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": row.image_content_type,
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
