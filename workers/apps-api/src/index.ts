import {
  CognitoAuthenticationError,
  verifyCognitoAccessToken,
} from "./auth/cognito";

interface Env {
  APP_ORIGIN: string;
  WORDPRESS_CLIENT_ID: string;
  COGNITO_USER_POOL_ID: string;
  COGNITO_USER_POOL_CLIENT_ID: string;
  DB: D1Database;
}

const localOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin");

  if (!origin || (origin !== env.APP_ORIGIN && !localOrigins.has(origin))) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

function json(
  request: Request,
  env: Env,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...getCorsHeaders(request, env),
    },
  });
}

function handleOptions(request: Request, env: Env): Response {
  const origin = request.headers.get("Origin");

  if (!origin || (origin !== env.APP_ORIGIN && !localOrigins.has(origin))) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env),
  });
}

async function handleWordPressStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const { ownerUserId } = await verifyCognitoAccessToken(request, env);

  await env.DB.prepare(
    `INSERT INTO users (owner_user_id)
     VALUES (?1)
     ON CONFLICT(owner_user_id)
     DO UPDATE SET updated_at = unixepoch()`,
  )
    .bind(ownerUserId)
    .run();

  const connection = await env.DB.prepare(
    `SELECT selected_site_id, selected_site_url, selected_site_name
       FROM wordpress_connections
      WHERE owner_user_id = ?1`,
  )
    .bind(ownerUserId)
    .first<{
      selected_site_id: string | null;
      selected_site_url: string | null;
      selected_site_name: string | null;
    }>();

  return json(request, env, {
    connected: connection !== null,
    selectedSite: connection
      ? {
          id: connection.selected_site_id,
          url: connection.selected_site_url,
          name: connection.selected_site_name,
        }
      : null,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json(request, env, {
        service: "hundred-apps-api",
        status: "ok",
      });
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/health" ||
        url.pathname === "/api/creative-ia/health")
    ) {
      return json(request, env, { status: "ok" });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/creative-ia/wordpress/status"
    ) {
      try {
        return await handleWordPressStatus(request, env);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        return json(
          request,
          env,
          { error: "接続状態を取得できませんでした" },
          500,
        );
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/creative-ia/wordpress/oauth/callback"
    ) {
      const oauthError = url.searchParams.get("error");
      const authorizationCode = url.searchParams.get("code");

      if (oauthError) {
        return json(
          request,
          env,
          { error: "WordPress.comの認証が完了しませんでした" },
          400,
        );
      }

      if (!authorizationCode) {
        return json(request, env, {
          status: "ready",
          message: "OAuth callback endpoint is ready",
        });
      }

      // 次工程でstate検証と認可コードのトークン交換を追加する。
      // 認可コードはログやレスポンスへ出力しない。
      return json(
        request,
        env,
        { error: "OAuth token exchange is not configured yet" },
        501,
      );
    }

    return json(request, env, { error: "Not found" }, 404);
  },
};
