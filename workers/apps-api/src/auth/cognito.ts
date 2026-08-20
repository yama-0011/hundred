import { CognitoJwtVerifier } from "aws-jwt-verify";

interface CognitoEnv {
  COGNITO_USER_POOL_ID: string;
  COGNITO_USER_POOL_CLIENT_ID: string;
}

type CognitoVerifier = ReturnType<typeof CognitoJwtVerifier.create>;

let verifier: CognitoVerifier | undefined;
let verifierConfigKey: string | undefined;

export class CognitoAuthenticationError extends Error {
  constructor() {
    super("UNAUTHORIZED");
    this.name = "CognitoAuthenticationError";
  }
}

function getVerifier(env: CognitoEnv): CognitoVerifier {
  const configKey = `${env.COGNITO_USER_POOL_ID}:${env.COGNITO_USER_POOL_CLIENT_ID}`;

  if (!verifier || verifierConfigKey !== configKey) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: env.COGNITO_USER_POOL_ID,
      tokenUse: "access",
      clientId: env.COGNITO_USER_POOL_CLIENT_ID,
    });
    verifierConfigKey = configKey;
  }

  return verifier;
}

function getBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return undefined;
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1];
}

/** Cognito Access Tokenを検証し、信頼できる所有者IDを返す。 */
export async function verifyCognitoAccessToken(
  request: Request,
  env: CognitoEnv,
): Promise<{ ownerUserId: string }> {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    throw new CognitoAuthenticationError();
  }

  try {
    const payload = await getVerifier(env).verify(accessToken);

    if (!payload.sub) {
      throw new Error("TOKEN_SUB_MISSING");
    }

    return { ownerUserId: payload.sub };
  } catch {
    // JWTや検証エラーの詳細、およびトークン本体をログへ出力しない。
    throw new CognitoAuthenticationError();
  }
}
