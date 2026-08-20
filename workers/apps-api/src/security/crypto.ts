const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64ToBytes(value: string): Uint8Array {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("INVALID_SECRET_FORMAT");
  }
}

/** OAuth stateとしてブラウザへ渡す、推測困難なランダム値を生成する。 */
export function createOAuthState(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** 生のstateをD1へ保存せず、Secret付きHMACへ変換する。 */
export async function hashOAuthState(
  state: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(state),
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

/** WordPress.com Access TokenをAES-256-GCMで暗号化する。 */
export async function encryptAccessToken(
  accessToken: string,
  base64Key: string,
): Promise<{ ciphertext: string; iv: string }> {
  const keyBytes = base64ToBytes(base64Key);

  if (keyBytes.byteLength !== 32) {
    throw new Error("INVALID_ENCRYPTION_KEY_LENGTH");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(accessToken),
  );

  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  };
}
