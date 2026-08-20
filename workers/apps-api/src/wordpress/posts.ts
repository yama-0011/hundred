import { decryptAccessToken } from "../security/crypto";
import type { WordPressOAuthEnv } from "./oauth";

const wordpressApiOrigin = "https://public-api.wordpress.com";
const requestTimeoutMilliseconds = 15_000;
const maxTitleLength = 200;
const maxContentLength = 20_000;
const idempotencyKeyPattern = /^[A-Za-z0-9_-]{16,100}$/u;

interface WordPressConnectionRow {
  access_token_ciphertext: string;
  access_token_iv: string;
  selected_site_id: string | null;
}

interface WordPressPostResponse {
  id?: unknown;
  link?: unknown;
  status?: unknown;
}

interface StoredPostRequest {
  request_hash: string;
  status: string;
  wordpress_post_id: string | null;
  wordpress_post_url: string | null;
}

export class WordPressPostError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "WORDPRESS_NOT_CONNECTED"
      | "REQUEST_CONFLICT"
      | "REQUEST_IN_PROGRESS"
      | "WORDPRESS_REQUEST_FAILED",
  ) {
    super(code);
    this.name = "WordPressPostError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePostInput(value: unknown): { title: string; content: string } {
  if (!isRecord(value)) {
    throw new WordPressPostError("INVALID_INPUT");
  }

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const content =
    typeof value.content === "string" ? value.content.trim() : "";

  if (
    !title ||
    title.length > maxTitleLength ||
    !content ||
    content.length > maxContentLength
  ) {
    throw new WordPressPostError("INVALID_INPUT");
  }

  return { title, content };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextToHtml(value: string): string {
  return value
    .split(/\n{2,}/u)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

async function hashPostInput(title: string, content: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({ title, content })),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function getStoredRequest(
  env: WordPressOAuthEnv,
  ownerUserId: string,
  requestKey: string,
): Promise<StoredPostRequest | null> {
  return env.DB.prepare(
    `SELECT request_hash, status, wordpress_post_id, wordpress_post_url
       FROM wordpress_post_requests
      WHERE owner_user_id = ?1 AND request_key = ?2`,
  )
    .bind(ownerUserId, requestKey)
    .first<StoredPostRequest>();
}

/** 認証済み利用者の接続先へ、必ずdraftとして新規投稿する。 */
export async function createWordPressDraft(
  request: Request,
  env: WordPressOAuthEnv,
  ownerUserId: string,
): Promise<{
  postId: string;
  postUrl: string | null;
  status: "draft";
  duplicate: boolean;
}> {
  const requestKey = request.headers.get("Idempotency-Key")?.trim() ?? "";

  if (!idempotencyKeyPattern.test(requestKey)) {
    throw new WordPressPostError("INVALID_INPUT");
  }

  let input: { title: string; content: string };

  try {
    input = parsePostInput(await request.json());
  } catch (error) {
    if (error instanceof WordPressPostError) throw error;
    throw new WordPressPostError("INVALID_INPUT");
  }

  const connection = await env.DB.prepare(
    `SELECT access_token_ciphertext, access_token_iv, selected_site_id
       FROM wordpress_connections
      WHERE owner_user_id = ?1`,
  )
    .bind(ownerUserId)
    .first<WordPressConnectionRow>();

  if (!connection?.selected_site_id) {
    throw new WordPressPostError("WORDPRESS_NOT_CONNECTED");
  }

  const requestHash = await hashPostInput(input.title, input.content);
  const insertResult = await env.DB.prepare(
    `INSERT INTO wordpress_post_requests (
       owner_user_id, request_key, request_hash, status, wordpress_site_id
     ) VALUES (?1, ?2, ?3, 'pending', ?4)
     ON CONFLICT(owner_user_id, request_key) DO NOTHING`,
  )
    .bind(ownerUserId, requestKey, requestHash, connection.selected_site_id)
    .run();

  if (insertResult.meta.changes !== 1) {
    const storedRequest = await getStoredRequest(env, ownerUserId, requestKey);

    if (!storedRequest || storedRequest.request_hash !== requestHash) {
      throw new WordPressPostError("REQUEST_CONFLICT");
    }

    if (storedRequest.status === "succeeded" && storedRequest.wordpress_post_id) {
      return {
        postId: storedRequest.wordpress_post_id,
        postUrl: storedRequest.wordpress_post_url,
        status: "draft",
        duplicate: true,
      };
    }

    if (storedRequest.status === "failed") {
      const retryResult = await env.DB.prepare(
        `UPDATE wordpress_post_requests
            SET status = 'pending', updated_at = unixepoch()
          WHERE owner_user_id = ?1
            AND request_key = ?2
            AND request_hash = ?3
            AND status = 'failed'`,
      )
        .bind(ownerUserId, requestKey, requestHash)
        .run();

      if (retryResult.meta.changes === 1) {
        // このリクエストが再試行の実行権を取得したため、下の投稿処理へ進む。
      } else {
        throw new WordPressPostError("REQUEST_IN_PROGRESS");
      }
    } else {
      throw new WordPressPostError("REQUEST_IN_PROGRESS");
    }
  }

  try {
    const accessToken = await decryptAccessToken(
      connection.access_token_ciphertext,
      connection.access_token_iv,
      env.TOKEN_ENCRYPTION_KEY,
    );
    const endpoint = new URL(
      `/wp/v2/sites/${encodeURIComponent(connection.selected_site_id)}/posts`,
      wordpressApiOrigin,
    );
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        content: plainTextToHtml(input.content),
        status: "draft",
      }),
      signal: AbortSignal.timeout(requestTimeoutMilliseconds),
    });

    if (!response.ok) {
      console.error("WORDPRESS_DRAFT_REQUEST_FAILED", {
        providerStatus: response.status,
      });
      throw new WordPressPostError("WORDPRESS_REQUEST_FAILED");
    }

    const post = (await response.json()) as WordPressPostResponse;

    if (
      (typeof post.id !== "string" && typeof post.id !== "number") ||
      post.status !== "draft"
    ) {
      throw new WordPressPostError("WORDPRESS_REQUEST_FAILED");
    }

    const postId = String(post.id);
    const postUrl = typeof post.link === "string" ? post.link : null;

    await env.DB.prepare(
      `UPDATE wordpress_post_requests
          SET status = 'succeeded',
              wordpress_post_id = ?3,
              wordpress_post_url = ?4,
              updated_at = unixepoch()
        WHERE owner_user_id = ?1 AND request_key = ?2`,
    )
      .bind(ownerUserId, requestKey, postId, postUrl)
      .run();

    return { postId, postUrl, status: "draft", duplicate: false };
  } catch (error) {
    await env.DB.prepare(
      `UPDATE wordpress_post_requests
          SET status = 'failed', updated_at = unixepoch()
        WHERE owner_user_id = ?1 AND request_key = ?2`,
    )
      .bind(ownerUserId, requestKey)
      .run();

    if (error instanceof WordPressPostError) throw error;
    console.error("WORDPRESS_DRAFT_REQUEST_FAILED", {
      code: "UNEXPECTED_WORDPRESS_ERROR",
    });
    throw new WordPressPostError("WORDPRESS_REQUEST_FAILED");
  }
}
