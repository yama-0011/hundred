import { decryptAccessToken } from "../security/crypto";

const graphApiOrigin = "https://graph.instagram.com";
const graphApiVersion = "v23.0";
const maxImageBytes = 8 * 1024 * 1024;
const processingPollDelays = [350, 600, 900, 1_200, 1_500];

export interface InstagramPublicationEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
  TOKEN_ENCRYPTION_KEY: string;
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

interface InstagramConnectionRow {
  instagram_user_id: string;
  instagram_username: string;
  access_token_ciphertext: string;
  access_token_iv: string;
  token_expires_at: number | null;
}

interface ProviderResponse {
  id?: unknown;
  status_code?: unknown;
  status?: unknown;
  error?: { code?: unknown; type?: unknown };
}

export class InstagramPublicationError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "UNSUPPORTED_DESTINATION"
      | "CONNECTION_REQUIRED"
      | "TOKEN_EXPIRED"
      | "MEDIA_REQUIRED"
      | "ALREADY_PROCESSING"
      | "PROVIDER_FAILED",
    readonly providerCode?: string,
  ) {
    super(code);
    this.name = "InstagramPublicationError";
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

async function requestProvider(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<ProviderResponse> {
  const response = await fetch(`${graphApiOrigin}/${graphApiVersion}/${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });
  const body = (await response.json()) as ProviderResponse;
  if (!response.ok) {
    const providerCode = body.error?.code ?? body.error?.type;
    throw new InstagramPublicationError(
      "PROVIDER_FAILED",
      providerCode === undefined ? undefined : String(providerCode),
    );
  }
  return body;
}

async function waitForContainer(containerId: string, accessToken: string) {
  for (const delay of processingPollDelays) {
    const status = await requestProvider(
      `${encodeURIComponent(containerId)}?fields=status_code,status`,
      accessToken,
    );
    if (status.status_code === "FINISHED" || status.status === "FINISHED") return;
    if (
      status.status_code === "ERROR" ||
      status.status_code === "EXPIRED" ||
      status.status === "ERROR" ||
      status.status === "EXPIRED"
    ) {
      throw new InstagramPublicationError("PROVIDER_FAILED", "CONTAINER_FAILED");
    }
    await wait(delay);
  }
  throw new InstagramPublicationError("PROVIDER_FAILED", "CONTAINER_TIMEOUT");
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

  const connection = await env.DB.prepare(
    `SELECT instagram_user_id, instagram_username, access_token_ciphertext,
            access_token_iv, token_expires_at
       FROM instagram_connections
      WHERE owner_user_id = ?1`,
  )
    .bind(ownerUserId)
    .first<InstagramConnectionRow>();
  if (!connection) throw new InstagramPublicationError("CONNECTION_REQUIRED");
  if (
    connection.token_expires_at !== null &&
    connection.token_expires_at <= Math.floor(Date.now() / 1000)
  ) {
    throw new InstagramPublicationError("TOKEN_EXPIRED");
  }

  await env.DB.prepare(
    `UPDATE creative_ia_instagram_publications
        SET status = 'processing', provider_error_code = NULL, updated_at = ?1
      WHERE id = ?2`,
  )
    .bind(Date.now(), publication.id)
    .run();

  try {
    const accessToken = await decryptAccessToken(
      connection.access_token_ciphertext,
      connection.access_token_iv,
      env.TOKEN_ENCRYPTION_KEY,
    );
    const imageUrl = `${requestOrigin}/api/creative-ia/instagram/media/${encodeURIComponent(publication.id)}`;
    const container = await requestProvider(
      `${encodeURIComponent(connection.instagram_user_id)}/media`,
      accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ image_url: imageUrl, caption: chat.article_content }),
      },
    );
    if (typeof container.id !== "string" || !container.id) {
      throw new InstagramPublicationError("PROVIDER_FAILED", "INVALID_CONTAINER");
    }
    await env.DB.prepare(
      `UPDATE creative_ia_instagram_publications
          SET container_id = ?1, updated_at = ?2
        WHERE id = ?3`,
    )
      .bind(container.id, Date.now(), publication.id)
      .run();
    await waitForContainer(container.id, accessToken);
    const published = await requestProvider(
      `${encodeURIComponent(connection.instagram_user_id)}/media_publish`,
      accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: container.id }),
      },
    );
    if (typeof published.id !== "string" || !published.id) {
      throw new InstagramPublicationError("PROVIDER_FAILED", "INVALID_MEDIA_ID");
    }
    const now = Date.now();
    await env.DB.prepare(
      `UPDATE creative_ia_instagram_publications
          SET status = 'published', instagram_media_id = ?1,
              provider_error_code = NULL, updated_at = ?2, published_at = ?2
        WHERE id = ?3`,
    )
      .bind(published.id, now, publication.id)
      .run();
    const row = await getOwnedPublication(env, ownerUserId, chatId);
    if (!row) throw new InstagramPublicationError("NOT_FOUND");
    return {
      ...serializePublication(row, requestOrigin),
      duplicate: false,
      accountUrl: `https://www.instagram.com/${encodeURIComponent(connection.instagram_username)}/`,
    };
  } catch (error) {
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
