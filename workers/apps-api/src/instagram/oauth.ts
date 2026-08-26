import {
  createOAuthState,
  encryptAccessToken,
  hashOAuthState,
} from "../security/crypto";

const authorizationEndpoint = "https://www.instagram.com/oauth/authorize";
const tokenEndpoint = "https://api.instagram.com/oauth/access_token";
const longLivedTokenEndpoint = "https://graph.instagram.com/access_token";
const profileEndpoint = "https://graph.instagram.com/v23.0/me";
const stateLifetimeSeconds = 10 * 60;
const requestedScopes = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
] as const;

export interface InstagramOAuthEnv {
  APP_ORIGIN: string;
  INSTAGRAM_CLIENT_ID: string;
  INSTAGRAM_CLIENT_SECRET: string;
  INSTAGRAM_REDIRECT_URI: string;
  OAUTH_STATE_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  DB: D1Database;
}

interface OAuthStateRow {
  owner_user_id: string;
  return_to: string;
  expires_at: number;
}

interface InstagramTokenResponse {
  access_token?: unknown;
}

interface InstagramLongLivedTokenResponse {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
}

interface InstagramProfileResponse {
  id?: unknown;
  username?: unknown;
}

interface InstagramErrorResponse {
  error?: {
    code?: unknown;
    type?: unknown;
  };
}

class InstagramOAuthError extends Error {
  constructor(
    readonly code: string,
    readonly providerStatus?: number,
    readonly providerCode?: string,
  ) {
    super(code);
    this.name = "InstagramOAuthError";
  }
}

function getOAuthErrorLog(error: unknown): Record<string, unknown> {
  if (error instanceof InstagramOAuthError) {
    return {
      code: error.code,
      providerStatus: error.providerStatus,
      providerCode: error.providerCode,
    };
  }

  return { code: "UNEXPECTED_OAUTH_ERROR" };
}

function normalizeReturnTo(value: string | null): string {
  if (!value) return "/creative-ia/settings/instagram";

  try {
    const baseUrl = new URL("https://hundred.invalid");
    const returnUrl = new URL(value, baseUrl);

    if (returnUrl.origin !== baseUrl.origin || !value.startsWith("/")) {
      return "/creative-ia/settings/instagram";
    }

    return `${returnUrl.pathname}${returnUrl.search}`;
  } catch {
    return "/creative-ia/settings/instagram";
  }
}

function createFrontendRedirect(
  env: InstagramOAuthEnv,
  returnTo: string,
  status: "connected" | "denied" | "failed",
): Response {
  const redirectUrl = new URL(returnTo, env.APP_ORIGIN);
  redirectUrl.searchParams.set("instagram", status);
  return Response.redirect(redirectUrl.toString(), 303);
}

async function readProviderError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as InstagramErrorResponse;
    const code = body.error?.code;
    const type = body.error?.type;
    if (typeof code === "number" || typeof code === "string") return String(code);
    if (typeof type === "string") return type;
  } catch {
    // Providerのレスポンス本文やSecretはログへ残さない。
  }
  return undefined;
}

/** 認証済みHundredユーザー用のInstagram Business Login URLを発行する。 */
export async function createInstagramAuthorizationUrl(
  env: InstagramOAuthEnv,
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
    env.DB.prepare(
      "DELETE FROM instagram_oauth_states WHERE expires_at < unixepoch()",
    ),
    env.DB.prepare(
      `INSERT INTO instagram_oauth_states
         (state_hash, owner_user_id, return_to, expires_at)
       VALUES (?1, ?2, ?3, ?4)`,
    ).bind(stateHash, ownerUserId, returnTo, expiresAt),
  ]);

  const authorizationUrl = new URL(authorizationEndpoint);
  authorizationUrl.searchParams.set("client_id", env.INSTAGRAM_CLIENT_ID);
  authorizationUrl.searchParams.set("redirect_uri", env.INSTAGRAM_REDIRECT_URI);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", requestedScopes.join(","));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("enable_fb_login", "0");
  authorizationUrl.searchParams.set("force_authentication", "1");
  return authorizationUrl.toString();
}

async function consumeOAuthState(
  env: InstagramOAuthEnv,
  state: string,
): Promise<OAuthStateRow | null> {
  const stateHash = await hashOAuthState(state, env.OAUTH_STATE_SECRET);
  const stateRow = await env.DB.prepare(
    `SELECT owner_user_id, return_to, expires_at
       FROM instagram_oauth_states
      WHERE state_hash = ?1`,
  )
    .bind(stateHash)
    .first<OAuthStateRow>();

  if (!stateRow) return null;

  const deleted = await env.DB.prepare(
    "DELETE FROM instagram_oauth_states WHERE state_hash = ?1",
  )
    .bind(stateHash)
    .run();

  if (deleted.meta.changes !== 1) return null;
  if (stateRow.expires_at < Math.floor(Date.now() / 1000)) return null;
  return stateRow;
}

async function exchangeAuthorizationCode(
  env: InstagramOAuthEnv,
  code: string,
): Promise<string> {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env.INSTAGRAM_CLIENT_ID,
      client_secret: env.INSTAGRAM_CLIENT_SECRET,
      grant_type: "authorization_code",
      redirect_uri: env.INSTAGRAM_REDIRECT_URI,
      code,
    }),
  });

  if (!response.ok) {
    throw new InstagramOAuthError(
      "INSTAGRAM_TOKEN_EXCHANGE_FAILED",
      response.status,
      await readProviderError(response),
    );
  }

  const token = (await response.json()) as InstagramTokenResponse;
  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new InstagramOAuthError("INSTAGRAM_TOKEN_RESPONSE_INVALID");
  }

  return token.access_token;
}

async function exchangeLongLivedToken(
  env: InstagramOAuthEnv,
  shortLivedAccessToken: string,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const url = new URL(longLivedTokenEndpoint);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", env.INSTAGRAM_CLIENT_SECRET);
  url.searchParams.set("access_token", shortLivedAccessToken);
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new InstagramOAuthError(
      "INSTAGRAM_LONG_LIVED_TOKEN_EXCHANGE_FAILED",
      response.status,
      await readProviderError(response),
    );
  }

  const token = (await response.json()) as InstagramLongLivedTokenResponse;
  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new InstagramOAuthError("INSTAGRAM_LONG_LIVED_TOKEN_INVALID");
  }

  return {
    accessToken: token.access_token,
    expiresIn:
      typeof token.expires_in === "number" && Number.isFinite(token.expires_in)
        ? Math.max(0, Math.floor(token.expires_in))
        : null,
  };
}

async function getInstagramProfile(
  accessToken: string,
): Promise<{ id: string; username: string }> {
  const url = new URL(profileEndpoint);
  url.searchParams.set("fields", "id,username");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new InstagramOAuthError(
      "INSTAGRAM_PROFILE_FAILED",
      response.status,
      await readProviderError(response),
    );
  }

  const profile = (await response.json()) as InstagramProfileResponse;
  if (
    (typeof profile.id !== "string" && typeof profile.id !== "number") ||
    typeof profile.username !== "string" ||
    !profile.username
  ) {
    throw new InstagramOAuthError("INSTAGRAM_PROFILE_INVALID");
  }

  return { id: String(profile.id), username: profile.username };
}

/** Instagramから戻った認可コードを長期トークンへ交換し、暗号化してD1へ保存する。 */
export async function handleInstagramOAuthCallback(
  requestUrl: URL,
  env: InstagramOAuthEnv,
): Promise<Response> {
  const state = requestUrl.searchParams.get("state");
  if (!state) return createFrontendRedirect(env, "/", "failed");

  const stateRow = await consumeOAuthState(env, state);
  if (!stateRow) return createFrontendRedirect(env, "/", "failed");
  if (requestUrl.searchParams.has("error")) {
    return createFrontendRedirect(env, stateRow.return_to, "denied");
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) return createFrontendRedirect(env, stateRow.return_to, "failed");

  try {
    const shortLivedAccessToken = await exchangeAuthorizationCode(env, code);
    const longLivedToken = await exchangeLongLivedToken(
      env,
      shortLivedAccessToken,
    );
    const profile = await getInstagramProfile(longLivedToken.accessToken);

    const encryptedToken = await encryptAccessToken(
      longLivedToken.accessToken,
      env.TOKEN_ENCRYPTION_KEY,
    );
    const expiresAt = longLivedToken.expiresIn
      ? Math.floor(Date.now() / 1000) + longLivedToken.expiresIn
      : null;

    await env.DB.prepare(
      `INSERT INTO instagram_connections (
         owner_user_id,
         instagram_user_id,
         instagram_username,
         access_token_ciphertext,
         access_token_iv,
         token_key_version,
         token_expires_at,
         granted_scopes
       ) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)
       ON CONFLICT(owner_user_id) DO UPDATE SET
         instagram_user_id = excluded.instagram_user_id,
         instagram_username = excluded.instagram_username,
         access_token_ciphertext = excluded.access_token_ciphertext,
         access_token_iv = excluded.access_token_iv,
         token_key_version = excluded.token_key_version,
         token_expires_at = excluded.token_expires_at,
         granted_scopes = excluded.granted_scopes,
         connected_at = unixepoch(),
         updated_at = unixepoch()`,
    )
      .bind(
        stateRow.owner_user_id,
        profile.id,
        profile.username,
        encryptedToken.ciphertext,
        encryptedToken.iv,
        expiresAt,
        requestedScopes.join(" "),
      )
      .run();

    return createFrontendRedirect(env, stateRow.return_to, "connected");
  } catch (error) {
    console.error("INSTAGRAM_OAUTH_CALLBACK_FAILED", getOAuthErrorLog(error));
    return createFrontendRedirect(env, stateRow.return_to, "failed");
  }
}
