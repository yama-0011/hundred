import { encryptCredential } from "../security/crypto";
import type { WordPressOAuthEnv } from "./oauth";

const requestTimeoutMilliseconds = 15_000;
const maxSiteUrlLength = 500;
const maxUsernameLength = 100;
const maxApplicationPasswordLength = 255;

interface WordPressUserResponse {
  id?: unknown;
  name?: unknown;
  username?: unknown;
  capabilities?: unknown;
}

export class WordPressApplicationPasswordError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "UNSAFE_SITE_URL"
      | "AUTHENTICATION_FAILED"
      | "INSUFFICIENT_PERMISSION"
      | "WORDPRESS_REQUEST_FAILED",
  ) {
    super(code);
    this.name = "WordPressApplicationPasswordError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnsafeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  const blockedSuffixes = [
    ".localhost",
    ".local",
    ".internal",
    ".test",
    ".invalid",
  ];

  return (
    normalized === "localhost" ||
    normalized === "metadata.google.internal" ||
    !normalized.includes(".") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(normalized) ||
    normalized.includes(":") ||
    blockedSuffixes.some((suffix) => normalized.endsWith(suffix))
  );
}

function normalizeSiteUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > maxSiteUrlLength) {
    throw new WordPressApplicationPasswordError("INVALID_INPUT");
  }

  try {
    const url = new URL(value.trim());

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      isUnsafeHostname(url.hostname) ||
      /\/wp-json(?:\/|$)/iu.test(url.pathname)
    ) {
      throw new WordPressApplicationPasswordError("UNSAFE_SITE_URL");
    }

    url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString().replace(/\/$/u, "");
  } catch (error) {
    if (error instanceof WordPressApplicationPasswordError) throw error;
    throw new WordPressApplicationPasswordError("INVALID_INPUT");
  }
}

function normalizeApplicationPassword(value: unknown): string {
  if (typeof value !== "string" || value.length > maxApplicationPasswordLength) {
    throw new WordPressApplicationPasswordError("INVALID_INPUT");
  }

  const password = value.replace(/\s+/gu, "");

  if (password.length < 16) {
    throw new WordPressApplicationPasswordError("INVALID_INPUT");
  }

  return password;
}

function parseConnectionInput(value: unknown): {
  siteUrl: string;
  username: string;
  applicationPassword: string;
} {
  if (!isRecord(value)) {
    throw new WordPressApplicationPasswordError("INVALID_INPUT");
  }

  const username =
    typeof value.username === "string" ? value.username.trim() : "";

  if (!username || username.length > maxUsernameLength || username.includes(":")) {
    throw new WordPressApplicationPasswordError("INVALID_INPUT");
  }

  return {
    siteUrl: normalizeSiteUrl(value.siteUrl),
    username,
    applicationPassword: normalizeApplicationPassword(
      value.applicationPassword,
    ),
  };
}

/** UTF-8のユーザー名とApplication PasswordからBasic認証ヘッダーを作成する。 */
export function createWordPressBasicAuthorization(
  username: string,
  applicationPassword: string,
): string {
  const bytes = new TextEncoder().encode(`${username}:${applicationPassword}`);
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

/** 認証確認後、Application Passwordを暗号化して利用者単位で保存する。 */
export async function connectWordPressWithApplicationPassword(
  request: Request,
  env: WordPressOAuthEnv,
  ownerUserId: string,
): Promise<{
  connected: true;
  authType: "application_password";
  selectedSite: { id: null; url: string; name: string | null };
  wordpressUsername: string;
}> {
  let input: ReturnType<typeof parseConnectionInput>;

  try {
    input = parseConnectionInput(await request.json());
  } catch (error) {
    if (error instanceof WordPressApplicationPasswordError) throw error;
    throw new WordPressApplicationPasswordError("INVALID_INPUT");
  }

  const sitePath = new URL(input.siteUrl).pathname.replace(/\/$/u, "");
  const authorization = createWordPressBasicAuthorization(
    input.username,
    input.applicationPassword,
  );
  const introspectionEndpoint = new URL(
    `${sitePath}/wp-json/wp/v2/users/me/application-passwords/introspect`,
    input.siteUrl,
  );
  const introspectionResponse = await fetch(introspectionEndpoint, {
    method: "GET",
    headers: {
      Authorization: authorization,
      Accept: "application/json",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(requestTimeoutMilliseconds),
  });

  if (!introspectionResponse.ok) {
    throw new WordPressApplicationPasswordError("AUTHENTICATION_FAILED");
  }

  const endpoint = new URL(
    `${sitePath}/wp-json/wp/v2/users/me`,
    input.siteUrl,
  );
  endpoint.searchParams.set("context", "edit");
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: authorization,
      Accept: "application/json",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(requestTimeoutMilliseconds),
  });

  if (response.status === 401 || response.status === 403) {
    throw new WordPressApplicationPasswordError("AUTHENTICATION_FAILED");
  }

  if (!response.ok) {
    console.error("WORDPRESS_APPLICATION_PASSWORD_CHECK_FAILED", {
      providerStatus: response.status,
    });
    throw new WordPressApplicationPasswordError("WORDPRESS_REQUEST_FAILED");
  }

  let user: WordPressUserResponse;

  try {
    user = (await response.json()) as WordPressUserResponse;
  } catch {
    throw new WordPressApplicationPasswordError("WORDPRESS_REQUEST_FAILED");
  }

  if (typeof user.id !== "number" && typeof user.id !== "string") {
    throw new WordPressApplicationPasswordError("WORDPRESS_REQUEST_FAILED");
  }

  if (
    !isRecord(user.capabilities) ||
    user.capabilities.edit_posts !== true
  ) {
    throw new WordPressApplicationPasswordError("INSUFFICIENT_PERMISSION");
  }

  const encryptedPassword = await encryptCredential(
    input.applicationPassword,
    env.TOKEN_ENCRYPTION_KEY,
  );
  const displayName = typeof user.name === "string" ? user.name : null;
  const verifiedUsername =
    typeof user.username === "string" ? user.username : input.username;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (owner_user_id)
       VALUES (?1)
       ON CONFLICT(owner_user_id)
       DO UPDATE SET updated_at = unixepoch()`,
    ).bind(ownerUserId),
    env.DB.prepare(
      "DELETE FROM wordpress_connections WHERE owner_user_id = ?1",
    ).bind(ownerUserId),
    env.DB.prepare(
      `INSERT INTO wordpress_application_password_connections (
         owner_user_id,
         site_url,
         wordpress_user_id,
         wordpress_username,
         wordpress_display_name,
         application_password_ciphertext,
         application_password_iv,
         credential_key_version
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)
       ON CONFLICT(owner_user_id) DO UPDATE SET
         site_url = excluded.site_url,
         wordpress_user_id = excluded.wordpress_user_id,
         wordpress_username = excluded.wordpress_username,
         wordpress_display_name = excluded.wordpress_display_name,
         application_password_ciphertext = excluded.application_password_ciphertext,
         application_password_iv = excluded.application_password_iv,
         credential_key_version = excluded.credential_key_version,
         connected_at = unixepoch(),
         updated_at = unixepoch()`,
    ).bind(
      ownerUserId,
      input.siteUrl,
      String(user.id),
      verifiedUsername,
      displayName,
      encryptedPassword.ciphertext,
      encryptedPassword.iv,
    ),
  ]);

  return {
    connected: true,
    authType: "application_password",
    selectedSite: { id: null, url: input.siteUrl, name: null },
    wordpressUsername: verifiedUsername,
  };
}
