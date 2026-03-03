export interface RawArticle {
  title: string;
  link: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  source: string;
}

export interface FilteredArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet: string;
  relevant: boolean;
}

export interface SummaryResponse {
  summary: string;
  articles: Array<{
    title: string;
    link: string;
    source: string;
    pubDate: string;
    snippet: string;
  }>;
  period: { from: string; to: string };
}
