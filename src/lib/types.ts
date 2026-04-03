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
  meta?: {
    totalArticles: number;
    scoredArticles: number;
    analyzedArticles: number;
  };
}

export interface AIAnalysis {
  relevant: Array<{ index: number; snippet: string; title?: string }>;
  globalSummary: string | Array<{ text: string; refs: number[] }>;
}

// ── Topics & Feeds (DB-driven) ─────────────────────────────────────────

export interface TopicItem {
  id: string;
  labelEn: string;
  labelFr: string;
  feedCount: number;
  isActive: boolean;
  sortOrder: number;
}

export interface TopicDetail {
  id: string;
  labelEn: string;
  labelFr: string;
  scoringDomain: string;
  scoringTier1: string;
  scoringTier2: string;
  scoringTier3: string;
  scoringTier4: string;
  scoringTier5: string;
  promptEn: string;
  promptFr: string;
  isActive: boolean;
  sortOrder: number;
  feeds: FeedItem[];
}

export interface FeedItem {
  id: number;
  name: string;
  url: string;
  isActive: boolean;
}

// ── Stats ───────────────────────────────────────────────────────────────

export interface StatsResponse {
  global: {
    totalArticles: number;
    scoredArticles: number;
    pctScored: number;
    avgScore: number;
    hitRate: number;
    new24h: number;
    new7d: number;
    scored24h: number;
  };
  scoreDistribution: Array<{
    tier: string;
    count: number;
    pct: number;
  }>;
  feedRanking: Array<{
    source: string;
    topic: string;
    sourceUrl?: string;
    total: number;
    scored: number;
    avgScore: number;
    hitRate: number;
    pct9_10: number;
    pct7_8: number;
    pct5_6: number;
    pct3_4: number;
    pct1_2: number;
  }>;
  topArticles: Array<{
    title: string;
    link: string;
    source: string;
    topic: string;
    pubDate: string;
    score: number;
    reason: string;
  }>;
  topicComparison: Array<{
    topic: string;
    total: number;
    scored: number;
    pctScored: number;
    avgScore: number;
    hitRate: number;
    activeSources: number;
    totalFeeds: number;
  }>;
}

// ── Cron Monitor ─────────────────────────────────────────────────────

export interface CronStatsResponse {
  global: {
    backlog: number;
    fetched24h: number;
    scored24h: number;
    coverage24h: number;
    avgDelayMinutes: number;
  };
  topics: Array<{
    id: string;
    label: string;
    lastFetchedAt: string | null;
    lastScoredAt: string | null;
    backlog: number;
    status: "ok" | "slow" | "high";
    statusReason?: string;
  }>;
  timeline: Array<{
    hour: string;
    fetched: number;
    scored: number;
  }>;
}
