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
  CreativeIAConversationError,
  respondToCreativeIAChat,
} from "./ai/conversation";
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
import {
  createInstagramAuthorizationUrl,
  handleInstagramOAuthCallback,
  type InstagramOAuthEnv,
} from "./instagram/oauth";
import {
  getInstagramPublication,
  InstagramPublicationError,
  publishInstagramFeed,
  serveInstagramPublicationImage,
  type InstagramPublicationEnv,
  uploadInstagramFeedImage,
} from "./instagram/publications";
import {
  InstagramInsightsError,
  listInstagramStoryInsights,
  syncAllInstagramStoryInsights,
  type InstagramInsightsEnv,
} from "./instagram/insights";
import {
  appendCreativeIAChatMessage,
  createCreativeIAChat,
  CreativeIAChatError,
  deleteCreativeIAChat,
  listCreativeIAChats,
  updateCreativeIAChat,
} from "./chat";
import {
  createCreativeIAReferenceProduct,
  CreativeIAReferenceProductError,
  deleteCreativeIAReferenceProduct,
  getCreativeIAReferenceProduct,
  listCreativeIAReferenceProducts,
  updateCreativeIAReferenceProduct,
} from "./reference-products";
import {
  createCreativeIAReferenceService,
  CreativeIAReferenceServiceError,
  deleteCreativeIAReferenceService,
  getCreativeIAReferenceService,
  listCreativeIAReferenceServices,
  updateCreativeIAReferenceService,
} from "./reference-services";
import {
  createCreativeIAReferenceContact,
  createCreativeIAReferenceOrganization,
  CreativeIAReferenceOrganizationError,
  deleteCreativeIAReferenceContact,
  deleteCreativeIAReferenceOrganization,
  getCreativeIAReferenceContact,
  getCreativeIAReferenceOrganization,
  listCreativeIAReferenceContacts,
  listCreativeIAReferenceOrganizations,
  updateCreativeIAReferenceContact,
  updateCreativeIAReferenceOrganization,
} from "./reference-organizations";
import {
  addAnigramGrowthEvent,
  AnigramGameError,
  getAnigramPetState,
  listAnigramGrowthEvents,
  resetAnigramPetForValidation,
  runAnigramEvolutionValidation,
  runAnigramStarvationValidation,
  type AnigramEvolutionValidationAction,
  type AnigramStarvationValidationAction,
} from "./anigram/game";

interface Env
  extends WordPressOAuthEnv,
    InstagramOAuthEnv,
    InstagramPublicationEnv,
    InstagramInsightsEnv,
    GeminiEnv {
  COGNITO_USER_POOL_ID: string;
  COGNITO_USER_POOL_CLIENT_ID: string;
  ANIGRAM_ADMIN_USER_IDS?: string;
}

function canManageAnigramValidation(
  env: Env,
  ownerUserId: string,
  groups: string[],
) {
  const allowedUserIds = (env.ANIGRAM_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    groups.some((group) => group.toLowerCase() === "admin") ||
    allowedUserIds.includes(ownerUserId)
  );
}

function requireAnigramValidationAdmin(
  env: Env,
  ownerUserId: string,
  groups: string[],
) {
  if (!canManageAnigramValidation(env, ownerUserId, groups)) {
    throw new AnigramGameError("FORBIDDEN");
  }
}

function handleInstagramPublicationError(
  request: Request,
  env: Env,
  error: unknown,
): Response {
  if (error instanceof CognitoAuthenticationError) {
    return json(request, env, { error: "認証が必要です" }, 401);
  }
  if (error instanceof InstagramPublicationError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "CONNECTION_REQUIRED" || error.code === "TOKEN_EXPIRED"
          ? 401
          : error.code === "UNSUPPORTED_DESTINATION" ||
              error.code === "MEDIA_REQUIRED" ||
              error.code === "ALREADY_PROCESSING"
            ? 409
            : error.code === "INVALID_INPUT"
              ? 400
              : 502;
    const messages = {
      INVALID_INPUT: "画像または投稿内容を確認してください",
      NOT_FOUND: "Instagram投稿案が見つかりません",
      UNSUPPORTED_DESTINATION: "InstagramフィードのChatを選択してください",
      CONNECTION_REQUIRED: "Instagramを接続してください",
      TOKEN_EXPIRED: "Instagramへ再接続してください",
      MEDIA_REQUIRED: "投稿する画像を選択してください",
      ALREADY_PROCESSING: "Instagramへの投稿処理中です",
      PROVIDER_FAILED: "Instagramへ投稿できませんでした",
    } as const;
    return json(
      request,
      env,
      {
        error: messages[error.code],
        providerCode: error.providerCode ?? null,
      },
      status,
    );
  }
  return json(request, env, { error: "Instagram投稿を処理できませんでした" }, 500);
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
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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

function handleReferenceProductError(
  request: Request,
  env: Env,
  error: unknown,
  fallbackMessage: string,
): Response {
  if (error instanceof CognitoAuthenticationError) {
    return json(request, env, { error: "認証が必要です" }, 401);
  }

  if (error instanceof CreativeIAReferenceProductError) {
    return json(
      request,
      env,
      {
        error:
          error.code === "NOT_FOUND"
            ? "商品が見つかりません"
            : "入力内容を確認してください",
      },
      error.code === "NOT_FOUND" ? 404 : 400,
    );
  }

  return json(request, env, { error: fallbackMessage }, 500);
}

function handleReferenceServiceError(
  request: Request,
  env: Env,
  error: unknown,
  fallbackMessage: string,
): Response {
  if (error instanceof CognitoAuthenticationError) {
    return json(request, env, { error: "認証が必要です" }, 401);
  }
  if (error instanceof CreativeIAReferenceServiceError) {
    return json(
      request,
      env,
      {
        error:
          error.code === "NOT_FOUND"
            ? "サービスが見つかりません"
            : "入力内容を確認してください",
      },
      error.code === "NOT_FOUND" ? 404 : 400,
    );
  }
  return json(request, env, { error: fallbackMessage }, 500);
}

function handleReferenceOrganizationError(
  request: Request, env: Env, error: unknown, fallbackMessage: string,
): Response {
  if (error instanceof CognitoAuthenticationError) {
    return json(request, env, { error: "認証が必要です" }, 401);
  }
  if (error instanceof CreativeIAReferenceOrganizationError) {
    const messages = {
      NOT_FOUND: "参照データが見つかりません",
      INVALID_INPUT: "入力内容を確認してください",
      HAS_RELATIONS: "紐づく店舗または担当者があるため削除できません",
    } as const;
    return json(request, env, { error: messages[error.code] },
      error.code === "NOT_FOUND" ? 404 : error.code === "HAS_RELATIONS" ? 409 : 400);
  }
  return json(request, env, { error: fallbackMessage }, 500);
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

async function handleInstagramStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const { ownerUserId } = await verifyCognitoAccessToken(request, env);
  const connection = await env.DB.prepare(
    `SELECT instagram_user_id, instagram_username, token_expires_at,
            connected_at, granted_scopes
       FROM instagram_connections
      WHERE owner_user_id = ?1`,
  )
    .bind(ownerUserId)
    .first<{
      instagram_user_id: string;
      instagram_username: string;
      token_expires_at: number | null;
      connected_at: number;
      granted_scopes: string;
    }>();
  const now = Math.floor(Date.now() / 1000);
  const tokenExpired =
    connection?.token_expires_at !== null &&
    connection?.token_expires_at !== undefined &&
    connection.token_expires_at <= now;

  return json(request, env, {
    connected: connection !== null && !tokenExpired,
    tokenExpired,
    account: connection
      ? {
          id: connection.instagram_user_id,
          username: connection.instagram_username,
        }
      : null,
    connectedAt: connection?.connected_at ?? null,
    tokenExpiresAt: connection?.token_expires_at ?? null,
    grantedScopes: connection?.granted_scopes.split(" ").filter(Boolean) ?? [],
  });
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): Promise<void> {
    context.waitUntil(
      syncAllInstagramStoryInsights(env).then((summary) => {
        console.log("Instagram Story sync completed", summary);
      }),
    );
  },
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
      url.pathname === "/api/anigram/pet"
    ) {
      try {
        const { ownerUserId, groups } = await verifyCognitoAccessToken(request, env);
        return json(request, env, {
          pet: await getAnigramPetState(env, ownerUserId),
          validation: {
            allowed: canManageAnigramValidation(env, ownerUserId, groups),
          },
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        return json(request, env, { error: "動物の状態を取得できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/anigram/growth-events"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
        return json(request, env, {
          events: await listAnigramGrowthEvents(
            env,
            ownerUserId,
            Number.isFinite(requestedLimit) ? requestedLimit : 20,
          ),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        return json(request, env, { error: "成長履歴を取得できませんでした" }, 500);
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/anigram/pet/growth-events/validation"
    ) {
      try {
        const { ownerUserId, groups } = await verifyCognitoAccessToken(request, env);
        requireAnigramValidationAdmin(env, ownerUserId, groups);
        return json(
          request,
          env,
          await addAnigramGrowthEvent(env, ownerUserId, {
            source: "hundred_validation",
            externalEventId: crypto.randomUUID(),
            reactionType: "manual_validation",
            points: 1,
          }),
        );
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError) {
          return json(
            request,
            env,
            {
              error:
                error.code === "FORBIDDEN"
                  ? "管理者権限が必要です"
                  : "成長イベントを反映できませんでした",
            },
            error.code === "FORBIDDEN" ? 403 : 400,
          );
        }
        return json(request, env, { error: "ごはんを反映できませんでした" }, 500);
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/anigram/pet/reset/validation"
    ) {
      try {
        const { ownerUserId, groups } = await verifyCognitoAccessToken(request, env);
        requireAnigramValidationAdmin(env, ownerUserId, groups);
        return json(request, env, {
          pet: await resetAnigramPetForValidation(env, ownerUserId),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        return json(request, env, { error: "育成状態を初期化できませんでした" }, 500);
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/anigram/pet/starvation/validation"
    ) {
      try {
        const { ownerUserId, groups } = await verifyCognitoAccessToken(request, env);
        requireAnigramValidationAdmin(env, ownerUserId, groups);
        const body = (await request.json()) as { action?: unknown };
        const action = body.action;
        if (
          action !== "prepare" &&
          action !== "advance_to_zero" &&
          action !== "advance_grace"
        ) {
          throw new AnigramGameError("INVALID_INPUT");
        }
        return json(request, env, {
          pet: await runAnigramStarvationValidation(
            env,
            ownerUserId,
            action as AnigramStarvationValidationAction,
          ),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError) {
          return json(
            request,
            env,
            {
              error:
                error.code === "FORBIDDEN"
                  ? "管理者権限が必要です"
                  : "現在の育成状態ではこの検証を実行できません",
            },
            error.code === "FORBIDDEN" ? 403 : 400,
          );
        }
        return json(request, env, { error: "死亡フローを検証できませんでした" }, 500);
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/anigram/pet/evolution/validation"
    ) {
      try {
        const { ownerUserId, groups } = await verifyCognitoAccessToken(request, env);
        requireAnigramValidationAdmin(env, ownerUserId, groups);
        const body = (await request.json()) as { action?: unknown };
        const action = body.action;
        if (action !== "prepare" && action !== "advance_hold") {
          throw new AnigramGameError("INVALID_INPUT");
        }
        return json(request, env, {
          pet: await runAnigramEvolutionValidation(
            env,
            ownerUserId,
            action as AnigramEvolutionValidationAction,
          ),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError) {
          return json(
            request,
            env,
            {
              error:
                error.code === "FORBIDDEN"
                  ? "管理者権限が必要です"
                  : "現在の育成状態ではこの検証を実行できません",
            },
            error.code === "FORBIDDEN" ? 403 : 400,
          );
        }
        return json(request, env, { error: "進化フローを検証できませんでした" }, 500);
      }
    }

    const instagramMediaMatch = url.pathname.match(
      /^\/api\/creative-ia\/instagram\/media\/([0-9a-f-]+)$/iu,
    );
    if (instagramMediaMatch && request.method === "GET") {
      return serveInstagramPublicationImage(env, instagramMediaMatch[1]);
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
      url.pathname === "/api/creative-ia/instagram/status"
    ) {
      try {
        return await handleInstagramStatus(request, env);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        return json(request, env, { error: "接続状態を取得できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/creative-ia/instagram/stories"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await listInstagramStoryInsights(env, ownerUserId),
        );
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof InstagramInsightsError) {
          const status =
            error.code === "CONNECTION_REQUIRED" ||
            error.code === "TOKEN_EXPIRED"
              ? 401
              : 502;
          return json(
            request,
            env,
            {
              error:
                error.code === "CONNECTION_REQUIRED"
                  ? "Instagramを接続してください"
                  : error.code === "TOKEN_EXPIRED"
                    ? "Instagramへ再接続してください"
                    : "InstagramのStory反応を取得できませんでした",
              providerCode: error.providerCode ?? null,
              providerStage: error.providerStage ?? null,
              providerMessage: error.providerMessage ?? null,
            },
            status,
          );
        }
        return json(
          request,
          env,
          { error: "Story反応を取得できませんでした" },
          500,
        );
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/creative-ia/chats"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await listCreativeIAChats(env, ownerUserId));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        return json(request, env, { error: "Chat一覧を取得できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/creative-ia/references/products"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await listCreativeIAReferenceProducts(env, ownerUserId),
        );
      } catch (error) {
        return handleReferenceProductError(
          request,
          env,
          error,
          "商品一覧を取得できませんでした",
        );
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/creative-ia/references/products"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await createCreativeIAReferenceProduct(request, env, ownerUserId),
          201,
        );
      } catch (error) {
        return handleReferenceProductError(
          request,
          env,
          error,
          "商品を登録できませんでした",
        );
      }
    }

    const productMatch = url.pathname.match(
      /^\/api\/creative-ia\/references\/products\/([0-9a-f-]+)$/iu,
    );
    if (productMatch && request.method === "GET") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await getCreativeIAReferenceProduct(
            env,
            ownerUserId,
            productMatch[1],
          ),
        );
      } catch (error) {
        return handleReferenceProductError(
          request,
          env,
          error,
          "商品を取得できませんでした",
        );
      }
    }

    if (productMatch && request.method === "PATCH") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await updateCreativeIAReferenceProduct(
            request,
            env,
            ownerUserId,
            productMatch[1],
          ),
        );
      } catch (error) {
        return handleReferenceProductError(
          request,
          env,
          error,
          "商品を更新できませんでした",
        );
      }
    }

    if (productMatch && request.method === "DELETE") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await deleteCreativeIAReferenceProduct(
            env,
            ownerUserId,
            productMatch[1],
          ),
        );
      } catch (error) {
        return handleReferenceProductError(
          request,
          env,
          error,
          "商品を削除できませんでした",
        );
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/creative-ia/references/services"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await listCreativeIAReferenceServices(env, ownerUserId));
      } catch (error) {
        return handleReferenceServiceError(request, env, error, "サービス一覧を取得できませんでした");
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/creative-ia/references/services"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await createCreativeIAReferenceService(request, env, ownerUserId), 201);
      } catch (error) {
        return handleReferenceServiceError(request, env, error, "サービスを登録できませんでした");
      }
    }

    const serviceMatch = url.pathname.match(
      /^\/api\/creative-ia\/references\/services\/([0-9a-f-]+)$/iu,
    );
    if (serviceMatch && request.method === "GET") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await getCreativeIAReferenceService(env, ownerUserId, serviceMatch[1]));
      } catch (error) {
        return handleReferenceServiceError(request, env, error, "サービスを取得できませんでした");
      }
    }
    if (serviceMatch && request.method === "PATCH") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await updateCreativeIAReferenceService(request, env, ownerUserId, serviceMatch[1]));
      } catch (error) {
        return handleReferenceServiceError(request, env, error, "サービスを更新できませんでした");
      }
    }
    if (serviceMatch && request.method === "DELETE") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await deleteCreativeIAReferenceService(env, ownerUserId, serviceMatch[1]));
      } catch (error) {
        return handleReferenceServiceError(request, env, error, "サービスを削除できませんでした");
      }
    }

    const organizationCollection = "/api/creative-ia/references/organizations";
    if (url.pathname === organizationCollection && request.method === "GET") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await listCreativeIAReferenceOrganizations(env, ownerUserId));
      } catch (error) { return handleReferenceOrganizationError(request, env, error, "会社・店舗一覧を取得できませんでした"); }
    }
    if (url.pathname === organizationCollection && request.method === "POST") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await createCreativeIAReferenceOrganization(request, env, ownerUserId), 201);
      } catch (error) { return handleReferenceOrganizationError(request, env, error, "会社・店舗を登録できませんでした"); }
    }
    const organizationMatch = url.pathname.match(/^\/api\/creative-ia\/references\/organizations\/([0-9a-f-]+)$/iu);
    if (organizationMatch && request.method === "GET") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await getCreativeIAReferenceOrganization(env, ownerUserId, organizationMatch[1]));
      } catch (error) { return handleReferenceOrganizationError(request, env, error, "会社・店舗を取得できませんでした"); }
    }
    if (organizationMatch && request.method === "PATCH") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await updateCreativeIAReferenceOrganization(request, env, ownerUserId, organizationMatch[1]));
      } catch (error) { return handleReferenceOrganizationError(request, env, error, "会社・店舗を更新できませんでした"); }
    }
    if (organizationMatch && request.method === "DELETE") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await deleteCreativeIAReferenceOrganization(env, ownerUserId, organizationMatch[1]));
      } catch (error) { return handleReferenceOrganizationError(request, env, error, "会社・店舗を削除できませんでした"); }
    }

    const contactCollection = "/api/creative-ia/references/contacts";
    if (url.pathname === contactCollection && request.method === "GET") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await listCreativeIAReferenceContacts(env, ownerUserId));
      } catch (error) { return handleReferenceOrganizationError(request, env, error, "担当者一覧を取得できませんでした"); }
    }
    if (url.pathname === contactCollection && request.method === "POST") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await createCreativeIAReferenceContact(request, env, ownerUserId), 201);
      } catch (error) { return handleReferenceOrganizationError(request, env, error, "担当者を登録できませんでした"); }
    }
    const contactMatch = url.pathname.match(/^\/api\/creative-ia\/references\/contacts\/([0-9a-f-]+)$/iu);
    if (contactMatch && request.method === "GET") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await getCreativeIAReferenceContact(env, ownerUserId, contactMatch[1]));
      } catch (error) { return handleReferenceOrganizationError(request, env, error, "担当者を取得できませんでした"); }
    }
    if (contactMatch && request.method === "PATCH") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await updateCreativeIAReferenceContact(request, env, ownerUserId, contactMatch[1]));
      } catch (error) { return handleReferenceOrganizationError(request, env, error, "担当者を更新できませんでした"); }
    }
    if (contactMatch && request.method === "DELETE") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await deleteCreativeIAReferenceContact(env, ownerUserId, contactMatch[1]));
      } catch (error) { return handleReferenceOrganizationError(request, env, error, "担当者を削除できませんでした"); }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/creative-ia/chats"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await createCreativeIAChat(env, ownerUserId),
          201,
        );
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        if (
          error instanceof CreativeIAChatError &&
          error.code === "CHAT_LIMIT_REACHED"
        ) {
          return json(
            request,
            env,
            { error: "Chatの上限は10件です" },
            409,
          );
        }

        return json(request, env, { error: "Chatを作成できませんでした" }, 500);
      }
    }

    const chatMatch = url.pathname.match(
      /^\/api\/creative-ia\/chats\/([0-9a-f-]+)$/iu,
    );
    if (chatMatch && request.method === "PATCH") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await updateCreativeIAChat(
            request,
            env,
            ownerUserId,
            chatMatch[1],
          ),
        );
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        if (error instanceof CreativeIAChatError) {
          return json(
            request,
            env,
            {
              error:
                error.code === "NOT_FOUND"
                  ? "Chatが見つかりません"
                  : "入力内容を確認してください",
            },
            error.code === "NOT_FOUND" ? 404 : 400,
          );
        }

        return json(request, env, { error: "Chatを保存できませんでした" }, 500);
      }
    }

    const chatMessageMatch = url.pathname.match(
      /^\/api\/creative-ia\/chats\/([0-9a-f-]+)\/messages$/iu,
    );
    if (chatMessageMatch && request.method === "POST") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await appendCreativeIAChatMessage(
            request,
            env,
            ownerUserId,
            chatMessageMatch[1],
          ),
          201,
        );
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        if (error instanceof CreativeIAChatError) {
          const status =
            error.code === "NOT_FOUND"
              ? 404
              : error.code === "MESSAGE_LIMIT_REACHED"
                ? 409
                : 400;
          return json(
            request,
            env,
            {
              error:
                error.code === "MESSAGE_LIMIT_REACHED"
                  ? "1つのChatに保存できる会話の上限に達しました"
                  : error.code === "NOT_FOUND"
                    ? "Chatが見つかりません"
                    : "入力内容を確認してください",
            },
            status,
          );
        }

        return json(request, env, { error: "会話を保存できませんでした" }, 500);
      }
    }

    const chatRespondMatch = url.pathname.match(
      /^\/api\/creative-ia\/chats\/([0-9a-f-]+)\/respond$/iu,
    );
    if (chatRespondMatch && request.method === "POST") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await respondToCreativeIAChat(env, ownerUserId, chatRespondMatch[1]),
        );
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        if (error instanceof CreativeIAConversationError) {
          const status =
            error.code === "NOT_FOUND"
              ? 404
              : error.code === "INVALID_INPUT"
                ? 400
                : error.code === "RATE_LIMITED"
                  ? 429
                  : error.code === "PROVIDER_BUSY"
                    ? 503
                    : 502;
          const messages = {
            NOT_FOUND: "Chatが見つかりません",
            INVALID_INPUT: "会話内容を確認してください",
            RATE_LIMITED:
              "AI利用回数の上限に達しました。時間をおいてお試しください",
            PROVIDER_BUSY:
              "Geminiが混雑しています。時間をおいてお試しください",
            GENERATION_FAILED: "AIの応答を取得できませんでした",
          } as const;
          return json(request, env, { error: messages[error.code] }, status);
        }

        return json(request, env, { error: "AIの応答を取得できませんでした" }, 502);
      }
    }

    const instagramPublicationMatch = url.pathname.match(
      /^\/api\/creative-ia\/chats\/([0-9a-f-]+)\/instagram\/publication$/iu,
    );
    if (instagramPublicationMatch && request.method === "GET") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await getInstagramPublication(
            env,
            ownerUserId,
            instagramPublicationMatch[1],
            url.origin,
          ),
        );
      } catch (error) {
        return handleInstagramPublicationError(request, env, error);
      }
    }
    if (instagramPublicationMatch && request.method === "PUT") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await uploadInstagramFeedImage(
            request,
            env,
            ownerUserId,
            instagramPublicationMatch[1],
            url.origin,
          ),
          201,
        );
      } catch (error) {
        return handleInstagramPublicationError(request, env, error);
      }
    }

    const instagramPublishMatch = url.pathname.match(
      /^\/api\/creative-ia\/chats\/([0-9a-f-]+)\/instagram\/publish$/iu,
    );
    if (instagramPublishMatch && request.method === "POST") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await publishInstagramFeed(
            request,
            env,
            ownerUserId,
            instagramPublishMatch[1],
            url.origin,
          ),
          201,
        );
      } catch (error) {
        return handleInstagramPublicationError(request, env, error);
      }
    }

    if (chatMatch && request.method === "DELETE") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await deleteCreativeIAChat(env, ownerUserId, chatMatch[1]),
        );
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }

        if (
          error instanceof CreativeIAChatError &&
          error.code === "NOT_FOUND"
        ) {
          return json(request, env, { error: "Chatが見つかりません" }, 404);
        }

        return json(request, env, { error: "Chatを削除できませんでした" }, 500);
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
      request.method === "GET" &&
      url.pathname === "/api/creative-ia/instagram/oauth/start"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        const authorizationUrl = await createInstagramAuthorizationUrl(
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
          { error: "Instagramとの接続を開始できませんでした" },
          500,
        );
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/creative-ia/instagram/oauth/callback"
    ) {
      try {
        return await handleInstagramOAuthCallback(url, env);
      } catch {
        const redirectUrl = new URL(
          "/creative-ia/settings/instagram",
          env.APP_ORIGIN,
        );
        redirectUrl.searchParams.set("instagram", "failed");
        return Response.redirect(redirectUrl.toString(), 303);
      }
    }

    if (
      request.method === "DELETE" &&
      url.pathname === "/api/creative-ia/instagram/connection"
    ) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        await env.DB.prepare(
          "DELETE FROM instagram_connections WHERE owner_user_id = ?1",
        )
          .bind(ownerUserId)
          .run();
        return json(request, env, { disconnected: true });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        return json(request, env, { error: "接続を解除できませんでした" }, 500);
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
