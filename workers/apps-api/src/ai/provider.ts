export interface ArticleGenerationInput {
  topic: string;
  keyPoints: string;
  audience: string;
  tone: "friendly" | "professional" | "casual";
}

export interface GeneratedArticle {
  title: string;
  content: string;
  excerpt: string;
  warnings: string[];
  model: string;
}

export interface ArticleGenerator {
  generate(input: ArticleGenerationInput): Promise<GeneratedArticle>;
}
