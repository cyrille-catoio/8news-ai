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
  /** RSS enclosure / media thumbnail / first <img> in item body (mig. 027+). */
  image_url?: string | null;
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
  /**
   * Optional short journalistic title (3-8 words) above the bullet
   * body. Currently produced only by the Top articles pipeline
   * (`POST /api/news/top-summary`); other callers leave it undefined
   * and the renderer falls back to the previous bullet-only layout.
   */
  title?: string | null;
  /**
   * Editorial importance score 1-10 for the GROUP this bullet belongs
   * to (Top 24h pipeline only, since v2.6.9). When the LLM returns the
   * grouped shape with an `importance` field, the flatten step below
   * propagates the value to every sub-bullet of the group, mirroring
   * the existing propagation of `title`. UI then reads it from the
   * first bullet of each rendered group. NULL on legacy rows and on
   * non-grouped callers.
   */
  importance?: number | null;
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
  /**
   * The LLM may return either of two shapes — the parser in
   * `src/lib/ai-analyze.ts` accepts both:
   *  - **Flat** (legacy + simple callers): every entry is a single
   *    bullet, optional `title`, no nested `bullets`.
   *  - **Grouped** (Top articles since v2.6.6): every entry is a
   *    thematic group with one shared `title` and a nested `bullets`
   *    array of 1-3 sub-bullets that get flattened at parse time.
   */
  globalSummary:
    | string
    | Array<{
        text?: string;
        refs?: number[];
        entities?: string[];
        title?: string;
        bullets?: Array<{ text: string; refs?: number[] }>;
      }>;
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
    /** v2.6.14+ 4-bucket score distribution aligned with `ScoreMeter`'s
     *  color tiers (green ≥ 8, gold ≥ 5, orange ≥ 3, red < 3). Replaces
     *  the prior 5-bucket ladder (9-10 / 7-8 / 5-6 / 3-4 / 1-2). */
    pct8_10: number;
    pct5_7: number;
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
  generatedAt: string;
  global: {
    backlog: number;
    fetched24h: number;
    scored24h: number;
    coverage24h: number;
    avgDelayMinutes: number;
    delayP50Minutes?: number;
    delayP95Minutes?: number;
    slaUnder15mPct?: number;
    freshBacklog15m?: number;
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
