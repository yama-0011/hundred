import {
  InstagramPublicationError,
  publishInstagramImage,
  type InstagramPublisherEnv,
} from "./publisher";

const maxImageBytes = 8 * 1024 * 1024;

export { InstagramPublicationError } from "./publisher";

export interface InstagramPublicationEnv extends InstagramPublisherEnv {
  MEDIA: R2Bucket;
}

type PublicationStatus = "draft" | "processing" | "published" | "failed";

interface PublicationRow {
  id: string;
  image_key: string;
  image_content_type: string;
  status: PublicationStatus;
  instagram_media_id: string | null;
  provider_error_code: string | null;
  updated_at: number;
  published_at: number | null;
}

function serializePublication(row: PublicationRow, requestOrigin: string) {
  return {
    id: row.id,
    imageUrl: `${requestOrigin}/api/creative-ia/instagram/media/${encodeURIComponent(row.id)}`,
    imageContentType: row.image_content_type,
    status: row.status,
    instagramMediaId: row.instagram_media_id,
    providerErrorCode: row.provider_error_code,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

async function getOwnedFeedChat(
  env: InstagramPublicationEnv,
  ownerUserId: string,
  chatId: string,
) {
  const chat = await env.DB.prepare(
    `SELECT article_content
       FROM creative_ia_chats
      WHERE id = ?1
        AND owner_user_id = ?2
        AND production_destination = 'instagram'
        AND production_destination_confirmed = 1
        AND instagram_content_type = 'feed'`,
  )
    .bind(chatId, ownerUserId)
    .first<{ article_content: string }>();
  if (!chat) throw new InstagramPublicationError("UNSUPPORTED_DESTINATION");
  return chat;
}

async function getOwnedPublication(
  env: InstagramPublicationEnv,
  ownerUserId: string,
  chatId: string,
) {
  return env.DB.prepare(
    `SELECT id, image_key, image_content_type, status, instagram_media_id,
            provider_error_code, updated_at, published_at
       FROM creative_ia_instagram_publications
      WHERE chat_id = ?1 AND owner_user_id = ?2`,
  )
    .bind(chatId, ownerUserId)
    .first<PublicationRow>();
}

export async function getInstagramPublication(
  env: InstagramPublicationEnv,
  ownerUserId: string,
  chatId: string,
  requestOrigin: string,
) {
  await getOwnedFeedChat(env, ownerUserId, chatId);
  const row = await getOwnedPublication(env, ownerUserId, chatId);
  return { publication: row ? serializePublication(row, requestOrigin) : null };
}

/** JPEGをR2へ保存し、Chat単位のInstagram投稿下書きを作成する。 */
export async function uploadInstagramFeedImage(
  request: Request,
  env: InstagramPublicationEnv,
  ownerUserId: string,
  chatId: string,
  requestOrigin: string,
) {
  await getOwnedFeedChat(env, ownerUserId, chatId);
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0];
  if (contentType !== "image/jpeg") {
    throw new InstagramPublicationError("INVALID_INPUT");
  }
  const image = await request.arrayBuffer();
  if (image.byteLength === 0 || image.byteLength > maxImageBytes) {
    throw new InstagramPublicationError("INVALID_INPUT");
  }

  const existing = await getOwnedPublication(env, ownerUserId, chatId);
  if (existing?.status === "processing") {
    throw new InstagramPublicationError("ALREADY_PROCESSING");
  }
  const publicationId = existing?.id ?? crypto.randomUUID();
  const imageKey = `instagram/${chatId}/${crypto.randomUUID()}.jpg`;
  await env.MEDIA.put(imageKey, image, {
    httpMetadata: { contentType: "image/jpeg" },
    customMetadata: { chatId, publicationId },
  });

  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO creative_ia_instagram_publications
         (id, owner_user_id, chat_id, image_key, image_content_type, status,
          created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'image/jpeg', 'draft', ?5, ?5)
       ON CONFLICT(chat_id) DO UPDATE SET
         image_key = excluded.image_key,
         image_content_type = excluded.image_content_type,
         status = 'draft',
         container_id = NULL,
         instagram_media_id = NULL,
         provider_error_code = NULL,
         updated_at = excluded.updated_at,
         published_at = NULL`,
    )
      .bind(publicationId, ownerUserId, chatId, imageKey, now)
      .run();
  } catch (error) {
    await env.MEDIA.delete(imageKey);
    throw error;
  }
  if (existing?.image_key && existing.image_key !== imageKey) {
    await env.MEDIA.delete(existing.image_key);
  }
  const row = await getOwnedPublication(env, ownerUserId, chatId);
  if (!row) throw new InstagramPublicationError("NOT_FOUND");
  return serializePublication(row, requestOrigin);
}

/** Instagramが取得するための推測困難なURLから、R2上の投稿画像を返す。 */
export async function serveInstagramPublicationImage(
  env: InstagramPublicationEnv,
  publicationId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT image_key, image_content_type
       FROM creative_ia_instagram_publications
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

/** 明示確認済みのフィード投稿だけをInstagramへ公開する。 */
export async function publishInstagramFeed(
  request: Request,
  env: InstagramPublicationEnv,
  ownerUserId: string,
  chatId: string,
  requestOrigin: string,
) {
  const value = (await request.json()) as { confirmed?: unknown };
  if (value?.confirmed !== true) {
    throw new InstagramPublicationError("INVALID_INPUT");
  }
  const chat = await getOwnedFeedChat(env, ownerUserId, chatId);
  if (!chat.article_content.trim()) {
    throw new InstagramPublicationError("INVALID_INPUT");
  }
  const publication = await getOwnedPublication(env, ownerUserId, chatId);
  if (!publication) throw new InstagramPublicationError("MEDIA_REQUIRED");
  if (publication.status === "published") {
    return { ...serializePublication(publication, requestOrigin), duplicate: true };
  }
  if (publication.status === "processing") {
    throw new InstagramPublicationError("ALREADY_PROCESSING");
  }

  try {
    const imageUrl = `${requestOrigin}/api/creative-ia/instagram/media/${encodeURIComponent(publication.id)}`;
    const published = await publishInstagramImage(env, ownerUserId, {
      imageUrl,
      mediaType: "IMAGE",
      caption: chat.article_content,
      onConnectionReady: async () => {
        await env.DB.prepare(
          `UPDATE creative_ia_instagram_publications
              SET status = 'processing', provider_error_code = NULL,
                  updated_at = ?1
            WHERE id = ?2`,
        )
          .bind(Date.now(), publication.id)
          .run();
      },
      onContainerCreated: async (containerId) => {
        await env.DB.prepare(
          `UPDATE creative_ia_instagram_publications
              SET container_id = ?1, updated_at = ?2
            WHERE id = ?3`,
        )
          .bind(containerId, Date.now(), publication.id)
          .run();
      },
    });
    const now = Date.now();
    await env.DB.prepare(
      `UPDATE creative_ia_instagram_publications
          SET status = 'published', instagram_media_id = ?1,
              provider_error_code = NULL, updated_at = ?2, published_at = ?2
        WHERE id = ?3`,
    )
      .bind(published.mediaId, now, publication.id)
      .run();
    const row = await getOwnedPublication(env, ownerUserId, chatId);
    if (!row) throw new InstagramPublicationError("NOT_FOUND");
    return {
      ...serializePublication(row, requestOrigin),
      duplicate: false,
      accountUrl: `https://www.instagram.com/${encodeURIComponent(published.accountUsername)}/`,
    };
  } catch (error) {
    if (
      error instanceof InstagramPublicationError &&
      (error.code === "CONNECTION_REQUIRED" || error.code === "TOKEN_EXPIRED")
    ) {
      throw error;
    }
    const providerCode =
      error instanceof InstagramPublicationError ? error.providerCode : undefined;
    await env.DB.prepare(
      `UPDATE creative_ia_instagram_publications
          SET status = 'failed', provider_error_code = ?1, updated_at = ?2
        WHERE id = ?3`,
    )
      .bind(providerCode ?? "UNEXPECTED", Date.now(), publication.id)
      .run();
    throw error instanceof InstagramPublicationError
      ? error
      : new InstagramPublicationError("PROVIDER_FAILED");
  }
}
