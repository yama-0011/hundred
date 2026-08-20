import type {
  ArticleGenerationInput,
  ArticleGenerator,
  GeneratedArticle,
} from "./provider";

const geminiApiOrigin = "https://generativelanguage.googleapis.com";
const requestTimeoutMilliseconds = 30_000;
const modelPattern = /^[a-z0-9._-]+$/u;
const retryableStatuses = new Set([429, 500, 502, 503, 504]);
const retryDelaysMilliseconds = [600, 1_500];

export interface GeminiEnv {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown }> };
    finishReason?: unknown;
  }>;
}

export class GeminiGenerationError extends Error {
  constructor(readonly code: "PROVIDER_BUSY" | "PROVIDER_FAILED") {
    super(code);
    this.name = "GeminiGenerationError";
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGeneratedArticle(value: unknown, model: string): GeneratedArticle {
  if (!isRecord(value)) throw new Error("INVALID_PROVIDER_RESPONSE");

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const content = typeof value.content === "string" ? value.content.trim() : "";
  const excerpt = typeof value.excerpt === "string" ? value.excerpt.trim() : "";
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((item): item is string => typeof item === "string")
    : [];

  if (
    !title ||
    title.length > 200 ||
    !content ||
    content.length > 20_000 ||
    excerpt.length > 300 ||
    warnings.length > 10
  ) {
    throw new Error("INVALID_PROVIDER_RESPONSE");
  }

  return { title, content, excerpt, warnings, model };
}

function buildPrompt(input: ArticleGenerationInput): string {
  const toneLabels = {
    friendly: "親しみやすく、読み手に寄り添う",
    professional: "簡潔で信頼感のある",
    casual: "自然で軽やかな",
  } as const;

  return [
    "あなたは日本語ブログ記事の編集アシスタントです。",
    "次の情報だけを根拠として、日本語の記事案を作成してください。",
    "確認できない事実、数値、固有名詞は作らず、必要ならwarningsに注意点を入れてください。",
    "contentはHTMLやMarkdownを使わないプレーンテキストにし、段落は空行で区切ってください。",
    `テーマ: ${input.topic}`,
    `要点: ${input.keyPoints || "指定なし"}`,
    `想定読者: ${input.audience || "一般の読者"}`,
    `文体: ${toneLabels[input.tone]}`,
  ].join("\n");
}

export function createGeminiArticleGenerator(env: GeminiEnv): ArticleGenerator {
  const model = env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";

  if (!env.GEMINI_API_KEY || !modelPattern.test(model)) {
    throw new Error("GEMINI_CONFIGURATION_INVALID");
  }

  return {
    async generate(input) {
      const endpoint = new URL(
        `/v1beta/models/${model}:generateContent`,
        geminiApiOrigin,
      );
      const requestBody = JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(input) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 3_000,
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              content: { type: "STRING" },
              excerpt: { type: "STRING" },
              warnings: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["title", "content", "excerpt", "warnings"],
          },
        },
      });
      let response: Response | null = null;

      for (
        let attempt = 0;
        attempt <= retryDelaysMilliseconds.length;
        attempt += 1
      ) {
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY,
            },
            body: requestBody,
            signal: AbortSignal.timeout(requestTimeoutMilliseconds),
          });
        } catch {
          response = null;
        }

        if (response?.ok) break;

        const shouldRetry =
          response === null || retryableStatuses.has(response.status);
        const retryDelay = retryDelaysMilliseconds[attempt];

        if (!shouldRetry || retryDelay === undefined) break;
        await wait(retryDelay);
      }

      if (!response?.ok) {
        const providerStatus = response?.status ?? 0;
        console.error("GEMINI_GENERATION_FAILED", {
          providerStatus,
          model,
        });
        throw new GeminiGenerationError(
          providerStatus === 0 || retryableStatuses.has(providerStatus)
            ? "PROVIDER_BUSY"
            : "PROVIDER_FAILED",
        );
      }

      const body = (await response.json()) as GeminiResponse;
      const text = body.candidates?.[0]?.content?.parts?.find(
        (part) => typeof part.text === "string",
      )?.text;

      if (typeof text !== "string") {
        throw new Error("INVALID_PROVIDER_RESPONSE");
      }

      try {
        return parseGeneratedArticle(JSON.parse(text), model);
      } catch {
        throw new Error("INVALID_PROVIDER_RESPONSE");
      }
    },
  };
}
