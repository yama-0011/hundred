import {
  createOAuthState,
  encryptAccessToken,
  hashOAuthState,
} from "../security/crypto";

const authorizationEndpoint =
  "https://public-api.wordpress.com/oauth2/authorize";
const tokenEndpoint = "https://public-api.wordpress.com/oauth2/token";
const stateLifetimeSeconds = 10 * 60;

export interface WordPressOAuthEnv {
  APP_ORIGIN: string;
  WORDPRESS_CLIENT_ID: string;
  WORDPRESS_CLIENT_SECRET: string;
  WORDPRESS_REDIRECT_URI: string;
  OAUTH_STATE_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  DB: D1Database;
}

interface OAuthStateRow {
  owner_user_id: string;
  return_to: string;
  expires_at: number;
}

interface WordPressTokenResponse {
  access_token?: unknown;
  blog_id?: unknown;
  blog_url?: unknown;
  token_type?: unknown;
}

interface WordPressErrorResponse {
  error?: unknown;
}

class WordPressOAuthError extends Error {
  constructor(
    readonly code: string,
    readonly providerStatus?: number,
    readonly providerError?: string,
  ) {
    super(code);
    this.name = "WordPressOAuthError";
  }
}

function getOAuthErrorLog(error: unknown): Record<string, unknown> {
  if (error instanceof WordPressOAuthError) {
    return {
      code: error.code,
      providerStatus: error.providerStatus,
      providerError: error.providerError,
    };
  }

  return { code: "UNEXPECTED_OAUTH_ERROR" };
}

function normalizeReturnTo(value: string | null): string {
  if (!value) {
    return "/";
  }

  try {
    const baseUrl = new URL("https://hundred.invalid");
    const returnUrl = new URL(value, baseUrl);

    if (returnUrl.origin !== baseUrl.origin || !value.startsWith("/")) {
      return "/";
    }

    return `${returnUrl.pathname}${returnUrl.search}`;
  } catch {
    return "/";
  }
}

function createFrontendRedirect(
  env: WordPressOAuthEnv,
  returnTo: string,
  status: "connected" | "denied" | "failed",
): Response {
  const redirectUrl = new URL(returnTo, env.APP_ORIGIN);
  redirectUrl.searchParams.set("wordpress", status);

  return Response.redirect(redirectUrl.toString(), 303);
}

/** 認証済みHundredユーザー用のWordPress.com認可URLを発行する。 */
export async function createWordPressAuthorizationUrl(
  env: WordPressOAuthEnv,
  ownerUserId: string,
  requestedReturnTo: string | null,
): Promise<string> {
  const state = createOAuthState();
  const stateHash = await hashOAuthState(state, env.OAUTH_STATE_SECRET);
  const returnTo = normalizeReturnTo(requestedReturnTo);
  const expiresAt = Math.floor(Date.now() / 1000) + stateLifetimeSeconds;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (owner_user_id)
       VALUES (?1)
       ON CONFLICT(owner_user_id)
       DO UPDATE SET updated_at = unixepoch()`,
    ).bind(ownerUserId),
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < unixepoch()"),
    env.DB.prepare(
      `INSERT INTO oauth_states
         (state_hash, owner_user_id, return_to, expires_at)
       VALUES (?1, ?2, ?3, ?4)`,
    ).bind(stateHash, ownerUserId, returnTo, expiresAt),
  ]);

  const authorizationUrl = new URL(authorizationEndpoint);
  authorizationUrl.searchParams.set("client_id", env.WORDPRESS_CLIENT_ID);
  authorizationUrl.searchParams.set("redirect_uri", env.WORDPRESS_REDIRECT_URI);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "posts taxonomy");
  authorizationUrl.searchParams.set("state", state);

  return authorizationUrl.toString();
}

async function consumeOAuthState(
  env: WordPressOAuthEnv,
  state: string,
): Promise<OAuthStateRow | null> {
  const stateHash = await hashOAuthState(state, env.OAUTH_STATE_SECRET);
  const stateRow = await env.DB.prepare(
    `SELECT owner_user_id, return_to, expires_at
       FROM oauth_states
      WHERE state_hash = ?1`,
  )
    .bind(stateHash)
    .first<OAuthStateRow>();

  if (!stateRow) {
    return null;
  }

  const deleteResult = await env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ?1",
  )
    .bind(stateHash)
    .run();

  if (deleteResult.meta.changes !== 1) {
    return null;
  }

  if (stateRow.expires_at < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return stateRow;
}

async function exchangeAuthorizationCode(
  env: WordPressOAuthEnv,
  code: string,
): Promise<{
  accessToken: string;
  blogId: string | null;
  blogUrl: string | null;
}> {
  const requestBody = new URLSearchParams({
    client_id: env.WORDPRESS_CLIENT_ID,
    client_secret: env.WORDPRESS_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: env.WORDPRESS_REDIRECT_URI,
  });
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: requestBody,
  });

  if (!response.ok) {
    let providerError: string | undefined;

    try {
      const errorResponse = (await response.json()) as WordPressErrorResponse;
      providerError =
        typeof errorResponse.error === "string"
          ? errorResponse.error
          : undefined;
    } catch {
      // 外部レスポンス本文は記録せず、HTTPステータスだけを診断に使用する。
    }

    throw new WordPressOAuthError(
      "WORDPRESS_TOKEN_EXCHANGE_FAILED",
      response.status,
      providerError,
    );
  }

  const tokenResponse = (await response.json()) as WordPressTokenResponse;

  if (
    typeof tokenResponse.access_token !== "string" ||
    tokenResponse.access_token.length === 0 ||
    (typeof tokenResponse.token_type === "string" &&
      tokenResponse.token_type.toLowerCase() !== "bearer")
  ) {
    throw new WordPressOAuthError("WORDPRESS_TOKEN_RESPONSE_INVALID");
  }

  return {
    accessToken: tokenResponse.access_token,
    blogId:
      typeof tokenResponse.blog_id === "string" ||
      typeof tokenResponse.blog_id === "number"
        ? String(tokenResponse.blog_id)
        : null,
    blogUrl:
      typeof tokenResponse.blog_url === "string"
        ? tokenResponse.blog_url
        : null,
  };
}

/** WordPress.comから戻った認可コードを交換し、暗号化してD1へ保存する。 */
export async function handleWordPressOAuthCallback(
  requestUrl: URL,
  env: WordPressOAuthEnv,
): Promise<Response> {
  const state = requestUrl.searchParams.get("state");

  if (!state) {
    return createFrontendRedirect(env, "/", "failed");
  }

  const stateRow = await consumeOAuthState(env, state);

  if (!stateRow) {
    return createFrontendRedirect(env, "/", "failed");
  }

  if (requestUrl.searchParams.has("error")) {
    return createFrontendRedirect(env, stateRow.return_to, "denied");
  }

  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return createFrontendRedirect(env, stateRow.return_to, "failed");
  }

  try {
    const token = await exchangeAuthorizationCode(env, code);
    const encryptedToken = await encryptAccessToken(
      token.accessToken,
      env.TOKEN_ENCRYPTION_KEY,
    );

    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM wordpress_application_password_connections WHERE owner_user_id = ?1",
      ).bind(stateRow.owner_user_id),
      env.DB.prepare(
        `INSERT INTO wordpress_connections (
         owner_user_id,
         access_token_ciphertext,
         access_token_iv,
         token_key_version,
         selected_site_id,
         selected_site_url
       ) VALUES (?1, ?2, ?3, 1, ?4, ?5)
       ON CONFLICT(owner_user_id) DO UPDATE SET
         access_token_ciphertext = excluded.access_token_ciphertext,
         access_token_iv = excluded.access_token_iv,
         token_key_version = excluded.token_key_version,
         selected_site_id = excluded.selected_site_id,
         selected_site_url = excluded.selected_site_url,
         selected_site_name = NULL,
         connected_at = unixepoch(),
         updated_at = unixepoch()`,
      ).bind(
        stateRow.owner_user_id,
        encryptedToken.ciphertext,
        encryptedToken.iv,
        token.blogId,
        token.blogUrl,
      ),
    ]);

    return createFrontendRedirect(env, stateRow.return_to, "connected");
  } catch (error) {
    // 認可コード、Access Token、Secret、外部APIの本文は記録しない。
    console.error("WORDPRESS_OAUTH_CALLBACK_FAILED", getOAuthErrorLog(error));
    return createFrontendRedirect(env, stateRow.return_to, "failed");
  }
}
