export interface ArticleGenerationInput {
  topic: string;
  keyPoints: string;
  audience: string;
  tone: "friendly" | "professional" | "casual";
  referenceContext: string;
}

export interface GeneratedArticleContent {
  title: string;
  content: string;
  excerpt: string;
  warnings: string[];
  model: string;
}

export interface UsedReference {
  id: string;
  category: "product" | "service";
  name: string;
  updatedAt: number;
}

export interface GeneratedArticle extends GeneratedArticleContent {
  usedReferences: UsedReference[];
}

export interface ArticleGenerator {
  generate(input: ArticleGenerationInput): Promise<GeneratedArticleContent>;
}
