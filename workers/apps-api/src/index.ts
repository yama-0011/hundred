import {
  CognitoAuthenticationError,
  verifyCognitoAccessToken,
} from "./auth/cognito";
import {
  ArticleGenerationError,
  generateArticle,
} from "./ai/generate";
import type { GeminiEnv } from "./ai/gemini";
import {
  createWordPressAuthorizationUrl,
  handleWordPressOAuthCallback,
  type WordPressOAuthEnv,
} from "./wordpress/oauth";
import {
  createWordPressDraft,
  WordPressPostError,
} from "./wordpress/posts";
import {
  connectWordPressWithApplicationPassword,
  WordPressApplicationPasswordError,
} from "./wordpress/application-password";

interface Env extends WordPressOAuthEnv, GeminiEnv {
  COGNITO_USER_POOL_ID: string;
  COGNITO_USER_POOL_CLIENT_ID: string;
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
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Idempotency-Key",
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
    `SELECT
       'wordpress_com' AS auth_type,
       selected_site_id,
       selected_site_url,
       selected_site_name,
       wordpress_username
     FROM wordpress_connections
     WHERE owner_user_id = ?1
     UNION ALL
     SELECT
       'application_password' AS auth_type,
       NULL AS selected_site_id,
       site_url AS selected_site_url,
       NULL AS selected_site_name,
       wordpress_username
     FROM wordpress_application_password_connections
     WHERE owner_user_id = ?1
     LIMIT 1`,
  )
    .bind(ownerUserId)
    .first<{
      selected_site_id: string | null;
      selected_site_url: string | null;
      selected_site_name: string | null;
      auth_type: "wordpress_com" | "application_password";
      wordpress_username: string | null;
    }>();

  return json(request, env, {
    connected: connection !== null,
    authType: connection?.auth_type ?? null,
    wordpressUsername: connection?.wordpress_username ?? null,
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
      request.method === "POST" &&
      url.pathname === "/api/creative-ia/wordpress/application-password"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        const result = await connectWordPressWithApplicationPassword(
          request,
          env,
          ownerUserId,
        );
        return json(request, env, result, 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        if (error instanceof WordPressApplicationPasswordError) {
          if (
            error.code === "INVALID_INPUT" ||
            error.code === "UNSAFE_SITE_URL"
          ) {
            return json(request, env, { error: "入力内容を確認してください" }, 400);
          }

          if (error.code === "AUTHENTICATION_FAILED") {
            return json(
              request,
              env,
              { error: "WordPressの認証情報を確認してください" },
              422,
            );
          }

          if (error.code === "INSUFFICIENT_PERMISSION") {
            return json(
              request,
              env,
              { error: "このWordPressユーザーには記事作成権限がありません" },
              403,
            );
          }
        }

        return json(
          request,
          env,
          { error: "WordPressへ接続できませんでした" },
          502,
        );
      }
    }

    if (
      request.method === "DELETE" &&
      url.pathname === "/api/creative-ia/wordpress/connection"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM wordpress_connections WHERE owner_user_id = ?1",
          ).bind(ownerUserId),
          env.DB.prepare(
            "DELETE FROM wordpress_application_password_connections WHERE owner_user_id = ?1",
          ).bind(ownerUserId),
        ]);
        return json(request, env, { disconnected: true });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        return json(request, env, { error: "接続を解除できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/creative-ia/wordpress/oauth/start"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        const authorizationUrl = await createWordPressAuthorizationUrl(
          env,
          ownerUserId,
          url.searchParams.get("returnTo"),
        );

        return json(request, env, { authorizationUrl });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        return json(
          request,
          env,
          { error: "WordPress.comとの接続を開始できませんでした" },
          500,
        );
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/creative-ia/wordpress/oauth/callback"
    ) {
      try {
        return await handleWordPressOAuthCallback(url, env);
      } catch {
        const redirectUrl = new URL(env.APP_ORIGIN);
        redirectUrl.searchParams.set("wordpress", "failed");
        return Response.redirect(redirectUrl.toString(), 303);
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/creative-ia/generate"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        const result = await generateArticle(request, env, ownerUserId);
        return json(request, env, result);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        if (error instanceof ArticleGenerationError) {
          if (error.code === "INVALID_INPUT") {
            return json(request, env, { error: "入力内容を確認してください" }, 400);
          }

          if (error.code === "RATE_LIMITED") {
            return json(
              request,
              env,
              { error: "生成回数の上限に達しました。時間をおいてお試しください" },
              429,
            );
          }

          if (error.code === "PROVIDER_BUSY") {
            return json(
              request,
              env,
              { error: "Geminiが混雑しています。時間をおいてお試しください" },
              503,
            );
          }
        }

        return json(request, env, { error: "記事案を生成できませんでした" }, 502);
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/creative-ia/wordpress/posts"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        const result = await createWordPressDraft(request, env, ownerUserId);
        return json(request, env, result, result.duplicate ? 200 : 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        if (error instanceof WordPressPostError) {
          if (error.code === "INVALID_INPUT") {
            return json(request, env, { error: "入力内容を確認してください" }, 400);
          }

          if (error.code === "WORDPRESS_NOT_CONNECTED") {
            return json(request, env, { error: "WordPressとの接続が必要です" }, 409);
          }

          if (
            error.code === "REQUEST_CONFLICT" ||
            error.code === "REQUEST_IN_PROGRESS"
          ) {
            return json(request, env, { error: "同じ保存操作を処理中です" }, 409);
          }
        }

        return json(
          request,
          env,
          { error: "WordPressへ下書きを保存できませんでした" },
          502,
        );
      }
    }

    return json(request, env, { error: "Not found" }, 404);
  },
};
