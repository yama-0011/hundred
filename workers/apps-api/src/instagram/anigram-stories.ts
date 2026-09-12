import {
  InstagramPublicationError,
  publishInstagramImage,
  type InstagramPublisherEnv,
} from "./publisher";
import {
  renderAnigramStoryAsset,
  type AnigramStoryRendererEnv,
} from "../anigram/story-renderer";

const maxImageBytes = 8 * 1024 * 1024;

export interface AnigramStoryEnv
  extends InstagramPublisherEnv, AnigramStoryRendererEnv {}

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
    prepareImage?: (publicationId: string) => Promise<void>;
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
    await input.prepareImage?.(id);
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

  const imageKey = `anigram/story-tests/${crypto.randomUUID()}.jpg`;
  return publishStoryAsset(env, ownerUserId, requestOrigin, {
    imageKey,
    prepareImage: async (publicationId) => {
      await env.MEDIA.put(imageKey, image, {
        httpMetadata: { contentType: "image/jpeg" },
        customMetadata: {
          publicationId,
          purpose: "anigram-story-test",
        },
      });
    },
  });
}

/** 現在のペット状態をBrowser Runで生成し、その画像をInstagram Storiesへ公開する。 */
export async function generateAndPublishAnigramStory(
  request: Request,
  env: AnigramStoryEnv,
  ownerUserId: string,
  requestOrigin: string,
) {
  if (new URL(request.url).searchParams.get("confirmed") !== "true") {
    throw new InstagramPublicationError("INVALID_INPUT");
  }
  const asset = await renderAnigramStoryAsset(env, ownerUserId, requestOrigin);
  const publication = await publishStoryAsset(
    env,
    ownerUserId,
    requestOrigin,
    { imageKey: asset.imageKey, renderId: asset.render.id },
  );
  return { ...publication, render: asset.render };
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
