import {
  InstagramPublicationError,
  publishInstagramImage,
  type InstagramPublisherEnv,
} from "./publisher";

const maxImageBytes = 8 * 1024 * 1024;

export interface AnigramStoryEnv extends InstagramPublisherEnv {
  MEDIA: R2Bucket;
}

interface StoryPublicationRow {
  id: string;
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
    `SELECT id, image_key, image_content_type, status, container_id,
            instagram_media_id, provider_error_code, created_at, updated_at,
            published_at
       FROM anigram_instagram_story_publications
      WHERE id = ?1`,
  )
    .bind(id)
    .first<StoryPublicationRow>();
}

/** 管理者が明示確認したJPEGを、接続中アカウントのストーリーズへテスト公開する。 */
export async function publishAnigramTestStory(
  request: Request,
  env: AnigramStoryEnv,
  ownerUserId: string,
  requestOrigin: string,
) {
  if (new URL(request.url).searchParams.get("confirmed") !== "true") {
    throw new InstagramPublicationError("INVALID_INPUT");
  }
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0];
  if (contentType !== "image/jpeg") {
    throw new InstagramPublicationError("INVALID_INPUT");
  }
  const image = await request.arrayBuffer();
  if (image.byteLength === 0 || image.byteLength > maxImageBytes) {
    throw new InstagramPublicationError("INVALID_INPUT");
  }

  const id = crypto.randomUUID();
  const imageKey = `anigram/story-tests/${id}.jpg`;
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
         (id, owner_user_id, image_key, image_content_type, status,
          created_at, updated_at)
       VALUES (?1, ?2, ?3, 'image/jpeg', 'processing', ?4, ?4)`,
    )
      .bind(id, ownerUserId, imageKey, now)
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
    await env.MEDIA.put(imageKey, image, {
      httpMetadata: { contentType: "image/jpeg" },
      customMetadata: { publicationId: id, purpose: "anigram-story-test" },
    });
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
