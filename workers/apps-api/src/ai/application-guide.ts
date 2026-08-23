import creativeIAGuide from "../../../../ドキュメント/AI向け/Creative-IA_AI利用ガイド.md";

const maxSelectedSections = 5;
const maxContextLength = 12_000;

interface GuideSection {
  title: string;
  body: string;
  keywords: string[];
}

const sectionKeywords: Record<string, string[]> = {
  "Creative IAとは": ["creative ia", "creativeia", "何", "できる", "機能", "目的", "使い方"],
  "基本的な利用の流れ": ["使い方", "使用方法", "利用", "流れ", "手順", "始め", "どうやって"],
  "作成とChat": ["作成", "chat", "チャット", "会話", "質問", "相談", "記事", "新しいchat"],
  "記事案・制作メモ・適用ルール": ["記事案", "制作メモ", "メモ", "適用ルール", "修正", "反映"],
  下書き: ["下書き", "保存", "公開", "投稿", "wordpress"],
  参照データ: ["参照データ", "商品", "サービス", "会社", "店舗", "担当者", "aiで利用"],
  "WordPressとの接続": ["wordpress", "接続", "application password", "アプリケーションパスワード", "認証"],
  "表示とHundredへの移動": ["表示", "テーマ", "ライト", "ダーク", "hundred", "戻る"],
  "現在対応していないこと": ["できない", "未対応", "対応", "instagram", "画像", "seo", "複数"],
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function parseGuide(markdown: string): GuideSection[] {
  const sections: GuideSection[] = [];
  const matches = [...markdown.matchAll(/^## (.+)$/gmu)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const title = match[1]?.trim() ?? "";
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    const body = markdown.slice(start, end).trim();
    if (!title || !body) continue;
    sections.push({ title, body, keywords: sectionKeywords[title] ?? [] });
  }

  return sections;
}

const guideSections = parseGuide(creativeIAGuide);

/** Creative IA自身に関する質問へ、利用者向けガイドの関連章だけを返す。 */
export function resolveCreativeIAApplicationGuide(requestText: string): string {
  const normalized = normalize(requestText);
  const mentionsCreativeIA =
    normalized.includes("creative ia") || normalized.includes("creativeia");
  const appSpecificTerms = [
    "制作メモ",
    "適用ルール",
    "参照データ",
    "記事案を見る",
    "chat一覧",
    "hundredへ戻る",
  ];
  const asksAboutApp =
    mentionsCreativeIA ||
    appSpecificTerms.some((term) => normalized.includes(normalize(term)));

  if (!asksAboutApp) return "";

  const ranked = guideSections
    .map((section, index) => ({
      section,
      index,
      score:
        section.keywords.reduce(
          (score, keyword) =>
            score + (normalized.includes(normalize(keyword)) ? 1 : 0),
          0,
        ) + (section.title === "Creative IAとは" ? 0.25 : 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxSelectedSections);

  const selected = ranked.length > 0 ? ranked : guideSections.slice(0, 2);
  return selected
    .map(({ section }) => `## ${section.title}\n\n${section.body}`)
    .join("\n\n")
    .slice(0, maxContextLength);
}
