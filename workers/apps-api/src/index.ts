interface Env {
  APP_ORIGIN: string;
  WORDPRESS_CLIENT_ID: string;
}

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/") {
      return json({
        service: "hundred-apps-api",
        status: "ok",
      });
    }

    if (url.pathname === "/health") {
      return json({ status: "ok" });
    }

    if (
      url.pathname ===
      "/api/creative-ia/wordpress/oauth/callback"
    ) {
      const oauthError = url.searchParams.get("error");
      const authorizationCode = url.searchParams.get("code");

      if (oauthError) {
        return json(
          {
            error: "WordPress.com authorization was not completed",
          },
          400,
        );
      }

      if (!authorizationCode) {
        return json(
          {
            status: "ready",
            message: "OAuth callback endpoint is ready",
          },
          200,
        );
      }

      // Phase 1でstate検証と認可コードのトークン交換を追加する。
      // 認可コードはログやレスポンスへ出力しない。
      return json(
        {
          error: "OAuth token exchange is not configured yet",
        },
        501,
      );
    }

    return json({ error: "Not found" }, 404);
  },
};
