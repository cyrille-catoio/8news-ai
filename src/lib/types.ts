export type Topic = "conflict" | "ai" | "crypto" | "robotics";

export interface RawArticle {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  source: string;
}

export interface ArticleSummary {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet: string;
}

export interface SummaryResponse {
  summary: string;
  articles: ArticleSummary[];
  allArticles: ArticleSummary[];
  period: {
    from: string;
    to: string;
  };
}

export interface AIAnalysis {
  relevant: Array<{ index: number; snippet: string; title?: string }>;
  globalSummary: string;
}
