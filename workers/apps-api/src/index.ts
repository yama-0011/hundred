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
  generateAndPublishAnigramStory,
  runAnigramScheduledStoryDelivery,
  serveAnigramStoryImage,
  type AnigramStoryEnv,
} from "./instagram/anigram-stories";
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
import {
  AnigramAdminSettingsError,
  deleteAnigramInstagramSyncRuns,
  deleteAnigramSettingsHistory,
  getAnigramInstagramReactionSyncControl,
  getAnigramAdminSettings,
  isAnigramAdministrator,
  listAnigramInstagramSyncRuns,
  recordAnigramInstagramSyncResult,
  registerAnigramAdministrator,
  removeAnigramAdministrator,
  updateAnigramAdminSettings,
  updateAnigramInstagramDeliverySettings,
} from "./anigram/admin";
import { getAnigramHistory } from "./anigram/history";
import {
  AIDesktopContentError,
  createAIDesktopCatalog,
  createAIDesktopDocument,
  deleteAIDesktopImage,
  getAIDesktopContentDraft,
  getAIDesktopState,
  listAIDesktopCatalogs,
  listAIDesktopDocuments,
  deleteAIDesktopContentDraftHistory,
  getAIDesktopContentDraftHistory,
  listAIDesktopContentDraftHistory,
  listAIDesktopImages,
  saveAIDesktopCatalog,
  saveAIDesktopContentDraft,
  saveAIDesktopState,
  setAIDesktopCatalogPublication,
  serveAIDesktopImage,
  uploadAIDesktopImage,
} from "./ai-desktop";
import {
  AIDesktopProjectError,
  createAIDesktopProject,
  deleteAIDesktopProject,
  getAIDesktopProject,
  listAIDesktopProjects,
  saveAIDesktopUserProfile,
  searchAIDesktopUsers,
  updateAIDesktopProject,
} from "./ai-desktop-projects";
import {
  AIDesktopDesignDocumentError,
  createAIDesktopDesignDocument,
  deleteAIDesktopDesignDocument,
  getAIDesktopDesignDocument,
  listAIDesktopDesignDocuments,
  updateAIDesktopDesignDocument,
  uploadAIDesktopDesignDocumentFile,
  getAIDesktopDesignDocumentFile,
  markAIDesktopDesignDocumentEditing,
  clearAIDesktopDesignDocumentEditing,
} from "./ai-desktop-design-documents";
import {
  AIDesktopDesignDeliveryError,
  createAIDesktopDesignDelivery,
  deleteAIDesktopDesignDelivery,
  getAIDesktopDesignDelivery,
  listAIDesktopDesignDeliveries,
  updateAIDesktopDesignDelivery,
} from "./ai-desktop-design-deliveries";
import {
  AIDesktopDesignTemplateError,
  createAIDesktopDesignTemplate,
  deleteAIDesktopDesignTemplate,
  listAIDesktopDesignTemplates,
  updateAIDesktopDesignTemplate,
} from "./ai-desktop-design-templates";
import { listAIDesktopDesignMasterTemplates } from "./ai-desktop-design-master-templates";
import {
  AIDesktopDesignCategoryError,
  createAIDesktopDesignCategory,
  deleteAIDesktopDesignCategory,
  listAIDesktopDesignCategories,
  updateAIDesktopDesignCategory,
} from "./ai-desktop-design-categories";
import {
  appendAppleIntelligenceMessage,
  AppleIntelligenceChatError,
  createAppleIntelligenceChat,
  getAppleIntelligenceChat,
  listAppleIntelligenceChats,
} from "./apple-intelligence-chats";
import {
  AnigramStoryRendererError,
  serveAnigramStoryRender,
  type AnigramStoryRendererEnv,
} from "./anigram/story-renderer";

interface Env
  extends WordPressOAuthEnv,
    InstagramOAuthEnv,
    InstagramPublicationEnv,
    AnigramStoryEnv,
    AnigramStoryRendererEnv,
    InstagramInsightsEnv,
    GeminiEnv {
  COGNITO_USER_POOL_ID: string;
  COGNITO_USER_POOL_CLIENT_ID: string;
}

async function canManageAnigramValidation(
  env: Env,
  ownerUserId: string,
  username = ownerUserId,
) {
  return (
    (await isAnigramAdministrator(env, username)) ||
    (username !== ownerUserId &&
      (await isAnigramAdministrator(env, ownerUserId)))
  );
}

async function requireAnigramValidationAdmin(
  env: Env,
  ownerUserId: string,
  username = ownerUserId,
) {
  if (!(await canManageAnigramValidation(env, ownerUserId, username))) {
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
    controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): Promise<void> {
    context.waitUntil(
      (async () => {
        const syncEnabled = await getAnigramInstagramReactionSyncControl(env);
        if (!syncEnabled) {
          console.log("Instagram Story sync skipped: service paused");
          return;
        }
        const startedAt = Date.now();
        const summary = await syncAllInstagramStoryInsights(env);
        await recordAnigramInstagramSyncResult(
          env,
          summary,
          "cron",
          startedAt,
        );
        console.log("Instagram Story sync completed", summary);
      })(),
    );
    context.waitUntil(
      (async () => {
        const result = await runAnigramScheduledStoryDelivery(
          env,
          controller.scheduledTime,
        );
        if (result.status === "failed") {
          console.error("Anigram scheduled Story delivery failed", result);
          return;
        }
        if (result.status === "published") {
          console.log("Anigram scheduled Story delivery completed", result);
        }
      })(),
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

    if (url.pathname === "/api/ai-desktop/state" && request.method === "GET") {
      try {
        return json(request, env, await getAIDesktopState(env));
      } catch {
        return json(request, env, { error: "AI Desktopの共有設定を取得できませんでした" }, 500);
      }
    }

    if (url.pathname === "/api/ai-desktop/state" && request.method === "PUT") {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        return json(request, env, await saveAIDesktopState(request, env, identity.username));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopContentError || error instanceof SyntaxError) return json(request, env, { error: "共有設定が正しくありません" }, 400);
        return json(request, env, { error: "AI Desktopの共有設定を保存できませんでした" }, 500);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/ai-desktop/catalogs") {
      try {
        return json(request, env, await listAIDesktopCatalogs(env));
      } catch {
        return json(request, env, { error: "AI Desktopのコンテンツを取得できませんでした" }, 500);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/ai-desktop/catalogs/manage") {
      try {
        await verifyCognitoAccessToken(request, env);
        return json(request, env, await listAIDesktopCatalogs(env, true));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        console.error("Failed to list manageable AI Desktop catalogs", error);
        return json(request, env, { error: "管理用の資料を取得できませんでした" }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/ai-desktop/catalogs") {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        return json(request, env, await createAIDesktopCatalog(request, env, identity.username), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopContentError || error instanceof SyntaxError) return json(request, env, { error: "資料の入力内容が正しくありません" }, 400);
        console.error("Failed to create AI Desktop catalog", error);
        return json(request, env, { error: "資料を作成できませんでした" }, 500);
      }
    }

    const aiDesktopCatalogPublicationMatch = url.pathname.match(/^\/api\/ai-desktop\/catalogs\/([^/]+)\/publication$/u);
    if (request.method === "PUT" && aiDesktopCatalogPublicationMatch) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        return json(request, env, await setAIDesktopCatalogPublication(request, env, identity.username, decodeURIComponent(aiDesktopCatalogPublicationMatch[1])));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopContentError && error.code === "NOT_FOUND") return json(request, env, { error: "資料が見つかりません" }, 404);
        if (error instanceof AIDesktopContentError || error instanceof SyntaxError || error instanceof URIError) return json(request, env, { error: "公開設定が正しくありません" }, 400);
        console.error("Failed to update AI Desktop catalog publication", { path: url.pathname, error });
        return json(request, env, { error: "資料の公開設定を更新できませんでした" }, 500);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/ai-desktop/documents") {
      try {
        return json(request, env, await listAIDesktopDocuments(env));
      } catch (error) {
        console.error("Failed to list AI Desktop documents", error);
        return json(request, env, { error: "公開資料を取得できませんでした" }, 500);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/ai-desktop/documents/manage") {
      try {
        await verifyCognitoAccessToken(request, env);
        return json(request, env, await listAIDesktopDocuments(env, true));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        console.error("Failed to list manageable AI Desktop documents", error);
        return json(request, env, { error: "管理用の資料一覧を取得できませんでした" }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/ai-desktop/documents") {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        return json(request, env, await createAIDesktopDocument(request, env, identity.username), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopContentError && error.code === "NOT_FOUND") return json(request, env, { error: "保存先のカテゴリが見つかりません" }, 404);
        if (error instanceof AIDesktopContentError || error instanceof SyntaxError) return json(request, env, { error: "資料の入力内容が正しくありません" }, 400);
        console.error("Failed to create AI Desktop document", error);
        return json(request, env, { error: "資料を作成できませんでした" }, 500);
      }
    }

    if (request.method === "PUT" && url.pathname === "/api/ai-desktop/users/me") {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        return json(request, env, await saveAIDesktopUserProfile(request, env, identity));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopProjectError || error instanceof SyntaxError) return json(request, env, { error: "表示名が正しくありません" }, 400);
        console.error("Failed to save Hundred user profile", error);
        return json(request, env, { error: "表示名を保存できませんでした" }, 500);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/ai-desktop/users") {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        return json(request, env, await searchAIDesktopUsers(env, identity, url.searchParams.get("query") ?? ""));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopProjectError) return json(request, env, { error: "検索条件が正しくありません" }, 400);
        console.error("Failed to search Hundred users", error);
        return json(request, env, { error: "ユーザーを検索できませんでした" }, 500);
      }
    }

    if (url.pathname === "/api/ai-desktop/projects" && (request.method === "GET" || request.method === "POST")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        if (request.method === "GET") return json(request, env, await listAIDesktopProjects(env, identity));
        return json(request, env, await createAIDesktopProject(request, env, identity), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopProjectError || error instanceof SyntaxError) return json(request, env, { error: "プロジェクトの入力内容が正しくありません" }, 400);
        console.error("Failed to process AI Desktop project collection", error);
        return json(request, env, { error: "プロジェクトを処理できませんでした" }, 500);
      }
    }

    const aiDesktopProjectMatch = url.pathname.match(/^\/api\/ai-desktop\/projects\/([0-9a-f-]+)$/iu);
    if (aiDesktopProjectMatch && (request.method === "GET" || request.method === "PUT" || request.method === "DELETE")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        const projectId = aiDesktopProjectMatch[1];
        if (request.method === "GET") return json(request, env, await getAIDesktopProject(env, identity, projectId));
        if (request.method === "DELETE") return json(request, env, await deleteAIDesktopProject(env, identity, projectId));
        return json(request, env, await updateAIDesktopProject(request, env, identity, projectId));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopProjectError && error.code === "NOT_FOUND") return json(request, env, { error: "プロジェクトが見つかりません" }, 404);
        if (error instanceof AIDesktopProjectError && error.code === "FORBIDDEN") return json(request, env, { error: "このプロジェクトを編集する権限がありません" }, 403);
        if (error instanceof AIDesktopProjectError || error instanceof SyntaxError) return json(request, env, { error: "プロジェクトの入力内容が正しくありません" }, 400);
        console.error("Failed to process AI Desktop project", { projectId: aiDesktopProjectMatch[1], error });
        return json(request, env, { error: "プロジェクトを処理できませんでした" }, 500);
      }
    }

    if (url.pathname === "/api/ai-desktop/design-categories" && (request.method === "GET" || request.method === "POST")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        if (request.method === "GET") return json(request, env, await listAIDesktopDesignCategories(env, identity));
        return json(request, env, await createAIDesktopDesignCategory(request, env, identity), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignCategoryError && error.code === "FORBIDDEN") return json(request, env, { error: "このProjectでカテゴリを管理する権限がありません" }, 403);
        if (error instanceof AIDesktopDesignCategoryError && error.code === "NOT_FOUND") return json(request, env, { error: "Projectが見つかりません" }, 404);
        if (error instanceof AIDesktopDesignCategoryError && error.code === "CONFLICT") return json(request, env, { error: "同じカテゴリはすでに作成されています" }, 409);
        if (error instanceof AIDesktopDesignCategoryError || error instanceof SyntaxError) return json(request, env, { error: "カテゴリの入力内容が正しくありません" }, 400);
        console.error("Failed to process AI Desktop design category collection", error);
        return json(request, env, { error: "カテゴリを処理できませんでした" }, 500);
      }
    }

    const aiDesktopDesignCategoryMatch = url.pathname.match(/^\/api\/ai-desktop\/design-categories\/([0-9a-f-]+)$/iu);
    if (aiDesktopDesignCategoryMatch && (request.method === "PUT" || request.method === "DELETE")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        const categoryId = aiDesktopDesignCategoryMatch[1];
        if (request.method === "DELETE") return json(request, env, await deleteAIDesktopDesignCategory(env, identity, categoryId));
        return json(request, env, await updateAIDesktopDesignCategory(request, env, identity, categoryId));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignCategoryError && error.code === "NOT_FOUND") return json(request, env, { error: "カテゴリが見つかりません" }, 404);
        if (error instanceof AIDesktopDesignCategoryError && error.code === "FORBIDDEN") return json(request, env, { error: "このカテゴリを編集する権限がありません" }, 403);
        if (error instanceof AIDesktopDesignCategoryError && error.code === "CONFLICT") return json(request, env, { error: "同じ名前のカテゴリはすでに作成されています" }, 409);
        if (error instanceof AIDesktopDesignCategoryError || error instanceof SyntaxError) return json(request, env, { error: "カテゴリの入力内容が正しくありません" }, 400);
        console.error("Failed to process AI Desktop design category", { categoryId: aiDesktopDesignCategoryMatch[1], error });
        return json(request, env, { error: "カテゴリを処理できませんでした" }, 500);
      }
    }

    if (url.pathname === "/api/ai-desktop/design-documents/files" && request.method === "POST") {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        return json(request, env, await uploadAIDesktopDesignDocumentFile(request, env, identity), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "FORBIDDEN") return json(request, env, { error: "このプロジェクトでドキュメントを作成する権限がありません" }, 403);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "NOT_FOUND") return json(request, env, { error: "プロジェクトが見つかりません" }, 404);
        if (error instanceof AIDesktopDesignDocumentError || error instanceof TypeError) return json(request, env, { error: "PDF・Word・Excelのファイル（25MBまで）を選択してください" }, 400);
        console.error("Failed to upload AI Desktop design document file", error);
        return json(request, env, { error: "ファイルを取り込めませんでした" }, 500);
      }
    }

    const aiDesktopDesignDocumentFileMatch = url.pathname.match(/^\/api\/ai-desktop\/design-documents\/([0-9a-f-]+)\/file$/iu);
    if (aiDesktopDesignDocumentFileMatch && request.method === "GET") {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        const file = await getAIDesktopDesignDocumentFile(env, identity, aiDesktopDesignDocumentFileMatch[1]);
        return new Response(file.body, {
          headers: {
            "Content-Type": file.contentType,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
            "Cache-Control": "private, no-store",
            ...getCorsHeaders(request, env),
          },
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignDocumentError) return json(request, env, { error: "ファイルが見つかりません" }, 404);
        console.error("Failed to serve AI Desktop design document file", error);
        return json(request, env, { error: "ファイルを取得できませんでした" }, 500);
      }
    }

    const aiDesktopDesignDocumentEditingMatch = url.pathname.match(/^\/api\/ai-desktop\/design-documents\/([0-9a-f-]+)\/editing$/iu);
    if (aiDesktopDesignDocumentEditingMatch && (request.method === "PUT" || request.method === "DELETE")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        if (request.method === "DELETE") return json(request, env, await clearAIDesktopDesignDocumentEditing(env, identity, aiDesktopDesignDocumentEditingMatch[1]));
        return json(request, env, await markAIDesktopDesignDocumentEditing(request, env, identity, aiDesktopDesignDocumentEditingMatch[1]));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "LOCKED") return json(request, env, { error: `${error.lock?.name ?? "ほかのメンバー"}さんが編集中のため、変更できません`, code: "LOCKED", lockedBy: error.lock?.name ?? null, lastSeenAt: error.lock?.lastSeenAt ?? null, canTakeOver: error.lock?.canTakeOver ?? false }, 423);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "FORBIDDEN") return json(request, env, { error: "このドキュメントを編集する権限がありません" }, 403);
        if (error instanceof AIDesktopDesignDocumentError) return json(request, env, { error: "ドキュメントが見つかりません" }, 404);
        console.error("Failed to record AI Desktop design document editing", error);
        return json(request, env, { error: "編集中の状態を記録できませんでした" }, 500);
      }
    }

    if (url.pathname === "/api/ai-desktop/design-documents" && (request.method === "GET" || request.method === "POST")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        if (request.method === "GET") return json(request, env, await listAIDesktopDesignDocuments(env, identity));
        return json(request, env, await createAIDesktopDesignDocument(request, env, identity), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "FORBIDDEN") return json(request, env, { error: "このProjectで設計書を作成する権限がありません" }, 403);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "NOT_FOUND") return json(request, env, { error: "Projectが見つかりません" }, 404);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "CONFLICT") return json(request, env, { error: "同じ種類または同じ名前の設計書はすでに作成されています" }, 409);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "TOO_LARGE") return json(request, env, { error: "ドキュメントが大きすぎます（1.5MBまで）。ページを分けてください。" }, 413);
        if (error instanceof AIDesktopDesignDocumentError || error instanceof SyntaxError) return json(request, env, { error: "設計書の入力内容が正しくありません" }, 400);
        console.error("Failed to process AI Desktop design document collection", error);
        return json(request, env, { error: "設計書を処理できませんでした" }, 500);
      }
    }

    const aiDesktopDesignDocumentMatch = url.pathname.match(/^\/api\/ai-desktop\/design-documents\/([0-9a-f-]+)$/iu);
    if (aiDesktopDesignDocumentMatch && (request.method === "GET" || request.method === "PUT" || request.method === "DELETE")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        const designDocumentId = aiDesktopDesignDocumentMatch[1];
        if (request.method === "GET") return json(request, env, await getAIDesktopDesignDocument(env, identity, designDocumentId));
        if (request.method === "DELETE") return json(request, env, await deleteAIDesktopDesignDocument(env, identity, designDocumentId));
        return json(request, env, await updateAIDesktopDesignDocument(request, env, identity, designDocumentId));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "NOT_FOUND") return json(request, env, { error: "設計書が見つかりません" }, 404);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "FORBIDDEN") return json(request, env, { error: "この設計書を編集する権限がありません" }, 403);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "STALE") return json(request, env, { error: "編集中に、ほかの画面でこのドキュメントが更新されました", code: "STALE" }, 409);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "LOCKED") return json(request, env, { error: `${error.lock?.name ?? "ほかのメンバー"}さんが編集中のため、変更できません`, code: "LOCKED", lockedBy: error.lock?.name ?? null, lastSeenAt: error.lock?.lastSeenAt ?? null, canTakeOver: error.lock?.canTakeOver ?? false }, 423);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "CONFLICT") return json(request, env, { error: "同じ種類または同じ名前の設計書はすでに作成されています" }, 409);
        if (error instanceof AIDesktopDesignDocumentError && error.code === "TOO_LARGE") return json(request, env, { error: "ドキュメントが大きすぎます（1.5MBまで）。ページを分けてください。" }, 413);
        if (error instanceof AIDesktopDesignDocumentError || error instanceof SyntaxError) return json(request, env, { error: "設計書の入力内容が正しくありません" }, 400);
        console.error("Failed to process AI Desktop design document", { designDocumentId: aiDesktopDesignDocumentMatch[1], error });
        return json(request, env, { error: "設計書を処理できませんでした" }, 500);
      }
    }

    if (url.pathname === "/api/ai-desktop/design-deliveries" && (request.method === "GET" || request.method === "POST")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        if (request.method === "GET") return json(request, env, await listAIDesktopDesignDeliveries(env, identity));
        return json(request, env, await createAIDesktopDesignDelivery(request, env, identity), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignDeliveryError && error.code === "FORBIDDEN") return json(request, env, { error: "このProjectの成果物を管理する権限がありません" }, 403);
        if (error instanceof AIDesktopDesignDeliveryError && error.code === "NOT_FOUND") return json(request, env, { error: "Projectまたは設計書が見つかりません" }, 404);
        if (error instanceof AIDesktopDesignDeliveryError || error instanceof SyntaxError) return json(request, env, { error: "成果物の入力内容が正しくありません" }, 400);
        console.error("Failed to process AI Desktop design delivery collection", error);
        return json(request, env, { error: "成果物を処理できませんでした" }, 500);
      }
    }

    const aiDesktopDesignDeliveryMatch = url.pathname.match(/^\/api\/ai-desktop\/design-deliveries\/([0-9a-f-]+)$/iu);
    if (aiDesktopDesignDeliveryMatch && (request.method === "GET" || request.method === "PUT" || request.method === "DELETE")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        const deliveryId = aiDesktopDesignDeliveryMatch[1];
        if (request.method === "GET") return json(request, env, await getAIDesktopDesignDelivery(env, identity, deliveryId));
        if (request.method === "DELETE") return json(request, env, await deleteAIDesktopDesignDelivery(env, identity, deliveryId));
        return json(request, env, await updateAIDesktopDesignDelivery(request, env, identity, deliveryId));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignDeliveryError && error.code === "NOT_FOUND") return json(request, env, { error: "成果物が見つかりません" }, 404);
        if (error instanceof AIDesktopDesignDeliveryError && error.code === "FORBIDDEN") return json(request, env, { error: "この成果物を編集する権限がありません" }, 403);
        if (error instanceof AIDesktopDesignDeliveryError && error.code === "LOCKED") return json(request, env, { error: "提出処理を開始した成果物の設計書構成は変更できません" }, 409);
        if (error instanceof AIDesktopDesignDeliveryError || error instanceof SyntaxError) return json(request, env, { error: "成果物の入力内容が正しくありません" }, 400);
        console.error("Failed to process AI Desktop design delivery", { deliveryId: aiDesktopDesignDeliveryMatch[1], error });
        return json(request, env, { error: "成果物を処理できませんでした" }, 500);
      }
    }

    if (url.pathname === "/api/ai-desktop/design-master-templates" && request.method === "GET") {
      try {
        await verifyCognitoAccessToken(request, env);
        return json(request, env, await listAIDesktopDesignMasterTemplates(env));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        console.error("Failed to list AI Desktop design master templates", error);
        return json(request, env, { error: "マスタテンプレートを取得できませんでした" }, 500);
      }
    }

    if (url.pathname === "/api/ai-desktop/design-templates" && (request.method === "GET" || request.method === "POST")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        if (request.method === "GET") return json(request, env, await listAIDesktopDesignTemplates(env, identity));
        return json(request, env, await createAIDesktopDesignTemplate(request, env, identity), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignTemplateError && error.code === "FORBIDDEN") return json(request, env, { error: "このProjectのテンプレートを管理する権限がありません" }, 403);
        if (error instanceof AIDesktopDesignTemplateError && error.code === "CONFLICT") return json(request, env, { error: "この分類のProjectテンプレートはすでに作成されています" }, 409);
        if (error instanceof AIDesktopDesignTemplateError && error.code === "TOO_LARGE") return json(request, env, { error: "テンプレートが大きすぎます（1.5MBまで）。ページを分けてください。" }, 413);
        if (error instanceof AIDesktopDesignTemplateError || error instanceof SyntaxError) return json(request, env, { error: "テンプレートの入力内容が正しくありません" }, 400);
        console.error("Failed to process AI Desktop design template collection", error);
        return json(request, env, { error: "テンプレートを処理できませんでした" }, 500);
      }
    }

    const aiDesktopDesignTemplateMatch = url.pathname.match(/^\/api\/ai-desktop\/design-templates\/([0-9a-f-]+)$/iu);
    if (aiDesktopDesignTemplateMatch && (request.method === "PUT" || request.method === "DELETE")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        const templateId = aiDesktopDesignTemplateMatch[1];
        if (request.method === "DELETE") return json(request, env, await deleteAIDesktopDesignTemplate(env, identity, templateId));
        return json(request, env, await updateAIDesktopDesignTemplate(request, env, identity, templateId));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopDesignTemplateError && error.code === "NOT_FOUND") return json(request, env, { error: "テンプレートが見つかりません" }, 404);
        if (error instanceof AIDesktopDesignTemplateError && error.code === "FORBIDDEN") return json(request, env, { error: "このテンプレートを編集する権限がありません" }, 403);
        if (error instanceof AIDesktopDesignTemplateError && error.code === "CONFLICT") return json(request, env, { error: "この分類のProjectテンプレートはすでに作成されています" }, 409);
        if (error instanceof AIDesktopDesignTemplateError && error.code === "TOO_LARGE") return json(request, env, { error: "テンプレートが大きすぎます（1.5MBまで）。ページを分けてください。" }, 413);
        if (error instanceof AIDesktopDesignTemplateError || error instanceof SyntaxError) return json(request, env, { error: "テンプレートの入力内容が正しくありません" }, 400);
        console.error("Failed to process AI Desktop design template", { templateId: aiDesktopDesignTemplateMatch[1], error });
        return json(request, env, { error: "テンプレートを処理できませんでした" }, 500);
      }
    }

    if (url.pathname === "/api/apple-intelligence/chats" && (request.method === "GET" || request.method === "POST")) {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        if (request.method === "GET") return json(request, env, await listAppleIntelligenceChats(env, ownerUserId));
        return json(request, env, await createAppleIntelligenceChat(request, env, ownerUserId), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AppleIntelligenceChatError || error instanceof SyntaxError) {
          const status = error instanceof AppleIntelligenceChatError && error.code === "CHAT_LIMIT_REACHED" ? 409 : 400;
          return json(request, env, { error: status === 409 ? "保存できるチャットは100件までです" : "チャットの設定が正しくありません" }, status);
        }
        return json(request, env, { error: "チャット履歴を処理できませんでした" }, 500);
      }
    }

    const appleIntelligenceChatMatch = url.pathname.match(/^\/api\/apple-intelligence\/chats\/([0-9a-f-]+)$/iu);
    if (appleIntelligenceChatMatch && request.method === "GET") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await getAppleIntelligenceChat(env, ownerUserId, appleIntelligenceChatMatch[1]));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AppleIntelligenceChatError && error.code === "NOT_FOUND") return json(request, env, { error: "チャットが見つかりません" }, 404);
        return json(request, env, { error: "チャット履歴を取得できませんでした" }, 500);
      }
    }

    const appleIntelligenceMessageMatch = url.pathname.match(/^\/api\/apple-intelligence\/chats\/([0-9a-f-]+)\/messages$/iu);
    if (appleIntelligenceMessageMatch && request.method === "POST") {
      try {
        const { ownerUserId } = await verifyCognitoAccessToken(request, env);
        return json(request, env, await appendAppleIntelligenceMessage(request, env, ownerUserId, appleIntelligenceMessageMatch[1]), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AppleIntelligenceChatError) {
          const status = error.code === "NOT_FOUND" ? 404 : error.code === "MESSAGE_LIMIT_REACHED" ? 409 : 400;
          const message = error.code === "NOT_FOUND" ? "チャットが見つかりません" : error.code === "MESSAGE_LIMIT_REACHED" ? "このチャットのメッセージ上限に達しました" : "メッセージが正しくありません";
          return json(request, env, { error: message }, status);
        }
        return json(request, env, { error: "メッセージを保存できませんでした" }, 500);
      }
    }

    const aiDesktopDraftMatch = url.pathname.match(/^\/api\/ai-desktop\/drafts\/(category|content)\/([a-z0-9][a-z0-9-]{0,63})\/([^/]+)(?:\/([^/]+))?$/u);
    if (aiDesktopDraftMatch && (request.method === "GET" || request.method === "PUT")) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        const [, scope, serviceId, rawCategoryId, rawContentId] = aiDesktopDraftMatch;
        const categoryId = decodeURIComponent(rawCategoryId);
        const contentId = rawContentId ? decodeURIComponent(rawContentId) : undefined;
        if (request.method === "GET") return json(request, env, await getAIDesktopContentDraft(env, scope, serviceId, categoryId, contentId));
        return json(request, env, await saveAIDesktopContentDraft(request, env, identity.username, scope, serviceId, categoryId, contentId));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopContentError && error.code === "CONFLICT") return json(request, env, { error: "下書きが別の編集で更新されています。再読込してください" }, 409);
        if (error instanceof AIDesktopContentError || error instanceof SyntaxError || error instanceof URIError) return json(request, env, { error: "下書きの内容が正しくありません" }, 400);
        return json(request, env, { error: "AI編集用の下書きを処理できませんでした" }, 500);
      }
    }

    const aiDesktopDraftHistoryMatch = url.pathname.match(/^\/api\/ai-desktop\/drafts\/history\/([a-z0-9][a-z0-9-]{0,63})\/([^/]+)(?:\/(\d+))?$/u);
    if (aiDesktopDraftHistoryMatch && (request.method === "GET" || request.method === "DELETE")) {
      try {
        await verifyCognitoAccessToken(request, env);
        const serviceId = aiDesktopDraftHistoryMatch[1];
        const categoryId = decodeURIComponent(aiDesktopDraftHistoryMatch[2]);
        const historyId = aiDesktopDraftHistoryMatch[3];
        const contentId = url.searchParams.get("contentId") ?? "";
        if (request.method === "DELETE") {
          if (historyId) throw new AIDesktopContentError("INVALID_INPUT");
          return json(request, env, await deleteAIDesktopContentDraftHistory(env, serviceId, categoryId, contentId));
        }
        if (historyId) return json(request, env, await getAIDesktopContentDraftHistory(env, serviceId, categoryId, historyId));
        return json(request, env, await listAIDesktopContentDraftHistory(env, serviceId, categoryId, contentId));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopContentError && error.code === "NOT_FOUND") return json(request, env, { error: "下書き履歴が見つかりません" }, 404);
        if (error instanceof AIDesktopContentError || error instanceof URIError) return json(request, env, { error: "下書き履歴の対象が正しくありません" }, 400);
        return json(request, env, { error: "下書き履歴を処理できませんでした" }, 500);
      }
    }

    const aiDesktopCatalogMatch = url.pathname.match(
      /^\/api\/ai-desktop\/catalogs\/([a-z0-9][a-z0-9-]{0,63})$/u,
    );
    if (request.method === "PUT" && aiDesktopCatalogMatch) {
      try {
        const identity = await verifyCognitoAccessToken(request, env);
        return json(
          request,
          env,
          await saveAIDesktopCatalog(request, env, aiDesktopCatalogMatch[1], identity.username),
        );
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopContentError || error instanceof SyntaxError) {
          return json(request, env, { error: "保存内容が正しくありません" }, 400);
        }
        console.error("Failed to save AI Desktop catalog", { serviceId: aiDesktopCatalogMatch[1], error });
        return json(request, env, { error: "AI Desktopのコンテンツを保存できませんでした" }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/ai-desktop/images") {
      try {
        await verifyCognitoAccessToken(request, env);
        return json(request, env, await uploadAIDesktopImage(request, env), 201);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        if (error instanceof AIDesktopContentError) {
          return json(request, env, { error: "10MB以下のJPEG、PNG、WebP、GIF、AVIFを選択してください" }, 400);
        }
        return json(request, env, { error: "画像をアップロードできませんでした" }, 500);
      }
    }

    const aiDesktopImageMatch = url.pathname.match(
      /^\/api\/ai-desktop\/images\/([0-9a-f-]+\.(?:jpg|png|webp|gif|avif))$/u,
    );
    if (aiDesktopImageMatch && request.method === "GET") {
      // AI Desktopの画面が画像を取得してワークスペースへ書き出せるよう、許可済みの画面のアドレスにだけCORSを付ける。
      const response = await serveAIDesktopImage(env, aiDesktopImageMatch[1]);
      for (const [name, value] of Object.entries(getCorsHeaders(request, env))) response.headers.set(name, value);
      return response;
    }
    if (aiDesktopImageMatch && request.method === "DELETE") {
      try {
        await verifyCognitoAccessToken(request, env);
        await deleteAIDesktopImage(env, aiDesktopImageMatch[1]);
        return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        return json(request, env, { error: "画像を削除できませんでした" }, 500);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/ai-desktop/images") {
      try {
        await verifyCognitoAccessToken(request, env);
        return json(request, env, await listAIDesktopImages(request, env));
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) return json(request, env, { error: "認証が必要です" }, 401);
        return json(request, env, { error: "画像一覧を取得できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/anigram/pet"
    ) {
      try {
        let canManageValidation = false;
        if (request.headers.has("Authorization")) {
          try {
            const { ownerUserId, username } =
              await verifyCognitoAccessToken(request, env);
            canManageValidation = await canManageAnigramValidation(
              env,
              ownerUserId,
              username,
            );
          } catch (error) {
            if (!(error instanceof CognitoAuthenticationError)) throw error;
          }
        }
        return json(request, env, {
          pet: await getAnigramPetState(env),
          validation: {
            allowed: canManageValidation,
          },
        });
      } catch (error) {
        return json(request, env, { error: "動物の状態を取得できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/anigram/history"
    ) {
      try {
        const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
        return json(
          request,
          env,
          await getAnigramHistory(
            env,
            Number.isFinite(requestedLimit) ? requestedLimit : 50,
          ),
        );
      } catch (error) {
        return json(request, env, { error: "Anigramの履歴を取得できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/anigram/admin/settings"
    ) {
      try {
        return json(request, env, await getAnigramAdminSettings(env));
      } catch (error) {
        return json(request, env, { error: "Anigram設定を取得できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/anigram/admin/access"
    ) {
      try {
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        return json(request, env, {
          allowed: await canManageAnigramValidation(env, ownerUserId, username),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        return json(request, env, { error: "管理者権限を確認できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/anigram/admin/instagram/sync-runs"
    ) {
      try {
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
        return json(request, env, {
          runs: await listAnigramInstagramSyncRuns(
            env,
            Number.isFinite(requestedLimit) ? requestedLimit : 20,
          ),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        return json(request, env, { error: "同期履歴を取得できませんでした" }, 500);
      }
    }

    if (
      request.method === "DELETE" &&
      url.pathname === "/api/anigram/admin/instagram/sync-runs"
    ) {
      try {
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        return json(request, env, {
          result: await deleteAnigramInstagramSyncRuns(env, await request.json()),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        if (error instanceof AnigramAdminSettingsError) {
          return json(
            request,
            env,
            { error: error.code === "NOT_FOUND" ? "同期履歴が見つかりません" : "削除対象が正しくありません" },
            error.code === "NOT_FOUND" ? 404 : 400,
          );
        }
        return json(request, env, { error: "同期履歴を削除できませんでした" }, 500);
      }
    }

    if (
      request.method === "DELETE" &&
      url.pathname === "/api/anigram/admin/settings-history"
    ) {
      try {
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        return json(request, env, {
          result: await deleteAnigramSettingsHistory(env, await request.json()),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        if (error instanceof AnigramAdminSettingsError) {
          return json(
            request,
            env,
            { error: error.code === "NOT_FOUND" ? "設定変更履歴が見つかりません" : "削除対象が正しくありません" },
            error.code === "NOT_FOUND" ? 404 : 400,
          );
        }
        return json(request, env, { error: "設定変更履歴を削除できませんでした" }, 500);
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/anigram/admin/instagram/sync"
    ) {
      try {
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        if (!(await getAnigramInstagramReactionSyncControl(env))) {
          return json(request, env, { error: "Instagram反応同期は停止中です" }, 409);
        }
        const startedAt = Date.now();
        const summary = await syncAllInstagramStoryInsights(env);
        return json(request, env, {
          run: await recordAnigramInstagramSyncResult(
            env,
            summary,
            "manual",
            startedAt,
            ownerUserId,
          ),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        console.error(
          "Manual Instagram sync failed",
          error instanceof Error ? error.message : "unknown error",
        );
        return json(request, env, { error: "Instagram同期を実行できませんでした" }, 500);
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/anigram/admin/users"
    ) {
      try {
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        return json(
          request,
          env,
          {
            administrator: await registerAnigramAdministrator(
              env,
              ownerUserId,
              await request.json(),
            ),
          },
          201,
        );
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        if (
          error instanceof AnigramAdminSettingsError ||
          error instanceof SyntaxError
        ) {
          return json(request, env, { error: "ユーザーIDが正しくありません" }, 400);
        }
        return json(request, env, { error: "管理者を登録できませんでした" }, 500);
      }
    }

    if (
      request.method === "PUT" &&
      url.pathname === "/api/anigram/admin/instagram"
    ) {
      try {
        const { ownerUserId, username } =
          await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        return json(request, env, {
          instagramDelivery: await updateAnigramInstagramDeliverySettings(
            env,
            ownerUserId,
            await request.json(),
          ),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        if (
          error instanceof AnigramAdminSettingsError ||
          error instanceof SyntaxError
        ) {
          return json(
            request,
            env,
            { error: "Instagram配信設定が正しくありません" },
            400,
          );
        }
        return json(
          request,
          env,
          { error: "Instagram配信設定を更新できませんでした" },
          500,
        );
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/anigram/admin/instagram/story/generate-and-publish"
    ) {
      try {
        const { ownerUserId, username } =
          await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        return json(
          request,
          env,
          await generateAndPublishAnigramStory(
            request,
            env,
            ownerUserId,
            url.origin,
          ),
          201,
        );
      } catch (error) {
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        if (error instanceof AnigramStoryRendererError) {
          return json(
            request,
            env,
            {
              error: "Browser Runで配信用画像を生成できませんでした",
              providerStatus: error.providerStatus ?? null,
            },
            502,
          );
        }
        return handleInstagramPublicationError(request, env, error);
      }
    }

    if (
      request.method === "DELETE" &&
      url.pathname === "/api/anigram/admin/users"
    ) {
      try {
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        await removeAnigramAdministrator(env, await request.json());
        return new Response(null, {
          status: 204,
          headers: getCorsHeaders(request, env),
        });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        if (error instanceof AnigramAdminSettingsError) {
          return json(
            request,
            env,
            {
              error:
                error.code === "LAST_ADMIN"
                  ? "最後の管理者は削除できません"
                  : "対象の管理者が見つかりません",
            },
            error.code === "NOT_FOUND" ? 404 : 400,
          );
        }
        return json(request, env, { error: "管理者を削除できませんでした" }, 500);
      }
    }

    const anigramAdminSettingsMatch = url.pathname.match(
      /^\/api\/anigram\/admin\/settings\/([a-z][a-z0-9_]{0,39})$/u,
    );
    if (request.method === "PUT" && anigramAdminSettingsMatch) {
      try {
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        const settings = await updateAnigramAdminSettings(
          env,
          ownerUserId,
          anigramAdminSettingsMatch[1],
          await request.json(),
        );
        return json(request, env, { settings });
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        if (
          error instanceof AnigramAdminSettingsError ||
          error instanceof SyntaxError
        ) {
          return json(
            request,
            env,
            {
              error:
                error instanceof AnigramAdminSettingsError &&
                error.code === "NOT_FOUND"
                  ? "対象のペット設定がありません"
                  : "設定値が正しくありません",
            },
            error instanceof AnigramAdminSettingsError &&
              error.code === "NOT_FOUND"
              ? 404
              : 400,
          );
        }
        console.error(
          "Anigram settings update failed",
          error instanceof Error ? error.message : "unknown error",
        );
        return json(request, env, { error: "Anigram設定を更新できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/anigram/growth-events"
    ) {
      try {
        await verifyCognitoAccessToken(request, env);
        const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
        return json(request, env, {
          events: await listAnigramGrowthEvents(
            env,
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
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
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
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        return json(request, env, {
          pet: await resetAnigramPetForValidation(env),
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
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
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
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        await requireAnigramValidationAdmin(env, ownerUserId, username);
        const body = (await request.json()) as { action?: unknown };
        const action = body.action;
        if (action !== "prepare" && action !== "advance_hold") {
          throw new AnigramGameError("INVALID_INPUT");
        }
        return json(request, env, {
          pet: await runAnigramEvolutionValidation(
            env,
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

    const anigramStoryMediaMatch = url.pathname.match(
      /^\/api\/anigram\/instagram\/story\/media\/([0-9a-f-]+)$/iu,
    );
    if (anigramStoryMediaMatch && request.method === "GET") {
      return serveAnigramStoryImage(env, anigramStoryMediaMatch[1]);
    }

    const anigramStoryRenderMatch = url.pathname.match(
      /^\/api\/anigram\/instagram\/story\/render\/([0-9a-f-]+)$/iu,
    );
    if (anigramStoryRenderMatch && request.method === "GET") {
      return serveAnigramStoryRender(env, anigramStoryRenderMatch[1]);
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
      (url.pathname === "/api/instagram/status" ||
        url.pathname === "/api/creative-ia/instagram/status" ||
        url.pathname === "/api/anigram/admin/instagram/status")
    ) {
      try {
        if (url.pathname === "/api/anigram/admin/instagram/status") {
          const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
          await requireAnigramValidationAdmin(env, ownerUserId, username);
        }
        return await handleInstagramStatus(request, env);
      } catch (error) {
        if (error instanceof CognitoAuthenticationError) {
          return json(request, env, { error: "認証が必要です" }, 401);
        }
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
        }
        return json(request, env, { error: "接続状態を取得できませんでした" }, 500);
      }
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/api/instagram/stories" ||
        url.pathname === "/api/creative-ia/instagram/stories")
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
      (url.pathname === "/api/instagram/oauth/start" ||
        url.pathname === "/api/creative-ia/instagram/oauth/start" ||
        url.pathname === "/api/anigram/admin/instagram/oauth/start")
    ) {
      try {
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        if (url.pathname === "/api/anigram/admin/instagram/oauth/start") {
          await requireAnigramValidationAdmin(env, ownerUserId, username);
        }
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
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
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
      (url.pathname === "/api/instagram/connection" ||
        url.pathname === "/api/creative-ia/instagram/connection" ||
        url.pathname === "/api/anigram/admin/instagram/connection")
    ) {
      try {
        const { ownerUserId, username } = await verifyCognitoAccessToken(request, env);
        if (url.pathname === "/api/anigram/admin/instagram/connection") {
          await requireAnigramValidationAdmin(env, ownerUserId, username);
        }
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
        if (error instanceof AnigramGameError && error.code === "FORBIDDEN") {
          return json(request, env, { error: "管理者権限が必要です" }, 403);
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
