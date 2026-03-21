export type Topic = "conflict" | "ai" | "crypto" | "robotics" | "bitcoin" | "videogames" | "aiengineering";

export const VALID_TOPICS: Topic[] = ["conflict", "ai", "aiengineering", "robotics", "crypto", "bitcoin", "videogames"];

export interface ScoreResult {
  index: number;
  score: number;
  reason: string;
  summary_en?: string;
  summary_fr?: string;
}

export interface ParsedArticle {
  topic: string;
  source: string;
  title: string;
  link: string;
  pub_date: string;
  content: string;
  snippet: string;
}

export interface ArticleSummary {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet: string;
}

export interface SummaryBullet {
  text: string;
  refs: Array<{ title: string; link: string; source: string }>;
}

export interface SummaryResponse {
  summary: string;
  bullets: SummaryBullet[];
  articles: ArticleSummary[];
  allArticles: ArticleSummary[];
  period: {
    from: string;
    to: string;
  };
}

export interface AIAnalysis {
  relevant: Array<{ index: number; snippet: string; title?: string }>;
  globalSummary: string | Array<{ text: string; refs: number[] }>;
}
