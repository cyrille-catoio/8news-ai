export interface ScoreResult {
  index: number;
  score: number;
  reason: string;
  summary_en?: string;
  summary_fr?: string;
  /**
   * Translated title — produced by the scoring prompt for articles scoring ≥ 5
   * alongside the bilingual summary, persisted to `articles.title_ai_en` /
   * `articles.title_ai_fr`. Consumed by the Top story hero on /app so the
   * headline reads in the user's selected language. Optional: legacy rows and
   * sub-5 articles fall back to the original feed `title`.
   */
  title_en?: string;
  title_fr?: string;
}

export interface ParsedArticle {
  topic: string;
  source: string;
  title: string;
  link: string;
  pub_date: string;
  content: string;
  snippet: string;
  fetched_at: string;
}

export interface ArticleSummary {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet: string;
  /**
   * AI relevance score (0-10). Set by the scorer cron and surfaced by
   * /api/news + persisted into daily_summaries.articles. Optional because
   * not every consumer carries it through (e.g. legacy summaries).
   */
  score?: number | null;
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
  globalSummary: string | Array<{ text: string; refs: number[]; entities?: string[] }>;
  seoKeywords?: string[];
  seoTitle?: string;
  seoDescription?: string;
}

// ── Topics & Feeds (DB-driven) ─────────────────────────────────────────

export interface TopicItem {
  id: string;
  labelEn: string;
  labelFr: string;
  feedCount: number;
  isActive: boolean;
  isDisplayed: boolean;
  sortOrder: number;
  categoryId: number | null;
  categoryLabel?: string;
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
  isDisplayed: boolean;
  sortOrder: number;
  categoryId: number | null;
  feeds: FeedItem[];
}

export interface CategoryItem {
  id: number;
  slug: string;
  labelEn: string;
  labelFr: string;
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
    delayP50Minutes?: number;
    delayP95Minutes?: number;
    slaUnder5mPct?: number;
    freshBacklog5m?: number;
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
  alerts?: string[];
}

// ── In-app UI rows (from API, used by page.tsx) ─────────────────────────

/** Topic id + display label for toggles and admin pages. */
export interface TopicLabel {
  id: string;
  label: string;
}

/** Row from GET /api/changelog. */
export interface ChangelogEntry {
  id: number;
  version: string;
  title_en: string;
  title_fr: string;
  body_en: string;
  body_fr: string;
  created_at: string;
}

/** Row from GET /api/feeds-admin. */
export interface FeedAdminRow {
  id: number;
  topicId: string;
  source: string;
  url: string;
  isActive: boolean;
  createdAt: string;
  totalArticles: number;
  scoredArticles: number;
  avgScore: number | null;
  hitRateGte7: number;
}
