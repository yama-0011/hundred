import { getAnigramPetState, type AnigramEnv } from "./game";

const storyWidth = 1080;
const storyHeight = 1920;
const maxRenderedImageBytes = 8 * 1024 * 1024;

export interface AnigramStoryRendererEnv extends AnigramEnv {
  BROWSER: BrowserRun;
  MEDIA: R2Bucket;
}

interface StoryRenderRow {
  id: string;
  image_key: string;
  image_content_type: string;
  width: number;
  height: number;
  snapshot_json: string;
  browser_ms_used: number | null;
  created_at: number;
}

export class AnigramStoryRendererError extends Error {
  constructor(
    readonly code: "BROWSER_FAILED" | "INVALID_IMAGE" | "NOT_FOUND",
    readonly providerStatus?: number,
  ) {
    super(code);
    this.name = "AnigramStoryRendererError";
  }
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createStoryHtml(
  pet: Awaited<ReturnType<typeof getAnigramPetState>>,
  generatedAt: number,
) {
  const isEgg = pet.lifeStage === "egg" || pet.lifeStage === "hatching";
  const progress = isEgg
    ? (pet.hatchProgressPercent ?? 0)
    : (pet.fullnessPercent ?? 0);
  const statusTitle =
    pet.status === "dead"
      ? "ハリネズミは眠っています"
      : isEgg
        ? "卵を温めています"
        : pet.lifeStage === "adult"
          ? "ハリネズミは成長しました"
          : "ハリネズミを育てています";
  const progressLabel = isEgg ? "孵化進捗" : "満腹度";
  const callToAction = isEgg
    ? "あなたの反応が、誕生への一歩になります。"
    : "ストーリーへの反応が、ハリネズミのごはんになります。";
  const generatedLabel = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(generatedAt));

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${storyWidth}, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  html, body { width: ${storyWidth}px; height: ${storyHeight}px; margin: 0; overflow: hidden; }
  body {
    color: #eef4f1;
    font-family: "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", sans-serif;
    background:
      radial-gradient(circle at 50% 45%, rgba(116, 222, 193, .24), transparent 34%),
      radial-gradient(circle at 82% 15%, rgba(58, 132, 113, .22), transparent 30%),
      linear-gradient(155deg, #06100d 0%, #0a201a 55%, #173c31 100%);
  }
  .story { position: relative; width: 100%; height: 100%; padding: 96px 84px 82px; }
  .brand { color: #75d9c1; font-size: 34px; font-weight: 800; letter-spacing: .28em; }
  h1 { max-width: 900px; margin: 34px 0 12px; font-size: 76px; line-height: 1.16; letter-spacing: -.045em; }
  .snapshot { color: #9eb0aa; font-size: 28px; }
  .visual { position: absolute; top: 500px; left: 50%; width: 700px; height: 720px; transform: translateX(-50%); }
  .halo { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, rgba(119, 229, 199, .18), transparent 62%); }
  .platform { position: absolute; left: 50%; bottom: 88px; width: 610px; height: 160px; transform: translateX(-50%); border-radius: 50%; background: linear-gradient(#2e4942, #1a2f2a); box-shadow: 0 48px 90px rgba(0,0,0,.42); }
  .egg { position: absolute; left: 50%; bottom: 174px; width: 365px; height: 500px; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle at 35% 25%, #f5fff8 0, #c1f2c8 28%, #8fc99d 62%, #4d7560 100%); box-shadow: inset -32px -38px 60px rgba(5,23,17,.25), 0 34px 54px rgba(0,0,0,.34); }
  .pet { position: absolute; left: 50%; bottom: 174px; width: 470px; height: 420px; transform: translateX(-50%); border-radius: 48% 48% 42% 42%; background: radial-gradient(circle at 50% 40%, #dfc9a4 0 28%, #8f664d 29% 46%, #553b32 47% 100%); box-shadow: 0 34px 54px rgba(0,0,0,.34); }
  .pet::before, .pet::after { content: ""; position: absolute; top: 176px; width: 28px; height: 34px; border-radius: 50%; background: #171d1a; }
  .pet::before { left: 170px; } .pet::after { right: 170px; }
  .content { position: absolute; left: 84px; right: 84px; bottom: 190px; }
  .content h2 { margin: 0; font-size: 56px; line-height: 1.25; letter-spacing: -.03em; }
  .progress-head { display: flex; justify-content: space-between; align-items: end; margin-top: 44px; color: #b7c6c1; font-size: 27px; }
  .progress-head strong { color: #82ddc6; font-size: 58px; font-weight: 600; }
  .track { height: 16px; margin-top: 15px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.16); }
  .track span { display: block; width: ${Math.max(0, Math.min(progress, 100))}%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #66cdb4, #9cf2dc); }
  .cta { margin: 38px 0 0; color: #cbd7d3; font-size: 30px; line-height: 1.65; }
  .footer { display: flex; justify-content: space-between; margin-top: 48px; padding-top: 30px; border-top: 1px solid rgba(255,255,255,.15); color: #7f928c; font-size: 22px; }
</style>
</head>
<body>
  <main class="story">
    <div class="brand">ANIGRAM</div>
    <h1>${escapeHtml(statusTitle)}</h1>
    <div class="snapshot">${escapeHtml(generatedLabel)} 時点の状態</div>
    <div class="visual" aria-hidden="true">
      <div class="halo"></div><div class="platform"></div>
      <div class="${isEgg ? "egg" : "pet"}"></div>
    </div>
    <section class="content">
      <h2>${escapeHtml(pet.displayName)}をみんなで育てよう。</h2>
      <div class="progress-head"><span>${escapeHtml(progressLabel)}</span><strong>${escapeHtml(progress)}%</strong></div>
      <div class="track"><span></span></div>
      <p class="cta">${escapeHtml(callToAction)}</p>
      <footer class="footer"><span>yamahit.com/anigram</span><span>${escapeHtml(pet.lifeStage)} / ${escapeHtml(pet.evolutionStage)}</span></footer>
    </section>
  </main>
</body>
</html>`;
}

function serializeRender(row: StoryRenderRow, requestOrigin: string) {
  return {
    id: row.id,
    imageUrl: `${requestOrigin}/api/anigram/instagram/story/render/${encodeURIComponent(row.id)}`,
    imageContentType: row.image_content_type,
    width: row.width,
    height: row.height,
    snapshot: JSON.parse(row.snapshot_json) as unknown,
    browserMsUsed: row.browser_ms_used,
    createdAt: row.created_at,
  };
}

/** 現在の共有ペット状態をHTML/CSSへ反映し、Browser RunでStory画像を生成する。 */
export async function renderAnigramStoryPreview(
  env: AnigramStoryRendererEnv,
  ownerUserId: string,
  requestOrigin: string,
) {
  const pet = await getAnigramPetState(env);
  const createdAt = Date.now();
  const snapshot = {
    capturedAt: createdAt,
    species: pet.species,
    displayName: pet.displayName,
    status: pet.status,
    lifeStage: pet.lifeStage,
    evolutionStage: pet.evolutionStage,
    hatchProgressPercent: pet.hatchProgressPercent,
    fullnessPercent: pet.fullnessPercent,
  };
  const response = await env.BROWSER.quickAction("screenshot", {
    html: createStoryHtml(pet, createdAt),
    viewport: { width: storyWidth, height: storyHeight, deviceScaleFactor: 1 },
    screenshotOptions: {
      type: "jpeg",
      quality: 92,
      fullPage: false,
      captureBeyondViewport: false,
    },
    cacheTTL: 0,
  });
  if (!response.ok) {
    throw new AnigramStoryRendererError("BROWSER_FAILED", response.status);
  }
  const contentType = response.headers.get("Content-Type")?.split(";", 1)[0];
  const image = await response.arrayBuffer();
  if (
    contentType !== "image/jpeg" ||
    image.byteLength === 0 ||
    image.byteLength > maxRenderedImageBytes
  ) {
    throw new AnigramStoryRendererError("INVALID_IMAGE");
  }

  const id = crypto.randomUUID();
  const imageKey = `anigram/story-renders/${id}.jpg`;
  const browserMsUsedHeader = response.headers.get("X-Browser-Ms-Used");
  const parsedBrowserMsUsed = browserMsUsedHeader === null
    ? null
    : Number(browserMsUsedHeader);
  const browserMsUsed = parsedBrowserMsUsed !== null && Number.isFinite(parsedBrowserMsUsed)
    ? Math.max(0, Math.round(parsedBrowserMsUsed))
    : null;

  await env.MEDIA.put(imageKey, image, {
    httpMetadata: { contentType: "image/jpeg" },
    customMetadata: { renderId: id, purpose: "anigram-story-render" },
  });
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (owner_user_id)
         VALUES (?1)
         ON CONFLICT(owner_user_id)
         DO UPDATE SET updated_at = unixepoch()`,
      ).bind(ownerUserId),
      env.DB.prepare(
        `INSERT INTO anigram_story_renders
           (id, owner_user_id, image_key, image_content_type, width, height,
            snapshot_json, browser_ms_used, created_at)
         VALUES (?1, ?2, ?3, 'image/jpeg', ?4, ?5, ?6, ?7, ?8)`,
      ).bind(
        id,
        ownerUserId,
        imageKey,
        storyWidth,
        storyHeight,
        JSON.stringify(snapshot),
        browserMsUsed,
        createdAt,
      ),
    ]);
  } catch (error) {
    await env.MEDIA.delete(imageKey);
    throw error;
  }
  const row = await env.DB.prepare(
    `SELECT id, image_key, image_content_type, width, height, snapshot_json,
            browser_ms_used, created_at
       FROM anigram_story_renders
      WHERE id = ?1`,
  )
    .bind(id)
    .first<StoryRenderRow>();
  if (!row) throw new AnigramStoryRendererError("NOT_FOUND");
  return { render: serializeRender(row, requestOrigin) };
}

/** 管理画面プレビューおよび将来のMeta取得に使う推測困難な画像URL。 */
export async function serveAnigramStoryRender(
  env: AnigramStoryRendererEnv,
  renderId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT image_key, image_content_type
       FROM anigram_story_renders
      WHERE id = ?1`,
  )
    .bind(renderId)
    .first<{ image_key: string; image_content_type: string }>();
  if (!row) return new Response(null, { status: 404 });
  const object = await env.MEDIA.get(row.image_key);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": row.image_content_type,
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
