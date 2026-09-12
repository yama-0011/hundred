import { decryptAccessToken } from "../security/crypto";

const graphApiOrigin = "https://graph.instagram.com";
const graphApiVersion = "v23.0";
const processingPollDelays = [350, 600, 900, 1_200, 1_500];

export interface InstagramPublisherEnv {
  DB: D1Database;
  TOKEN_ENCRYPTION_KEY: string;
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

/** Instagramへの画像公開に共通する接続確認・コンテナ作成・公開処理。 */
export async function publishInstagramImage(
  env: InstagramPublisherEnv,
  ownerUserId: string,
  input: {
    imageUrl: string;
    mediaType: "IMAGE" | "STORIES";
    caption?: string;
    onConnectionReady?: () => Promise<void>;
    onContainerCreated?: (containerId: string) => Promise<void>;
  },
) {
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

  await input.onConnectionReady?.();
  const accessToken = await decryptAccessToken(
    connection.access_token_ciphertext,
    connection.access_token_iv,
    env.TOKEN_ENCRYPTION_KEY,
  );
  const createParams = new URLSearchParams({ image_url: input.imageUrl });
  if (input.mediaType === "STORIES") {
    createParams.set("media_type", "STORIES");
  } else if (input.caption) {
    createParams.set("caption", input.caption);
  }
  const container = await requestProvider(
    `${encodeURIComponent(connection.instagram_user_id)}/media`,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createParams,
    },
  );
  if (typeof container.id !== "string" || !container.id) {
    throw new InstagramPublicationError("PROVIDER_FAILED", "INVALID_CONTAINER");
  }
  await input.onContainerCreated?.(container.id);
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
  return {
    containerId: container.id,
    mediaId: published.id,
    accountUsername: connection.instagram_username,
  };
}
