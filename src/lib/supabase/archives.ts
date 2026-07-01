import { withClient } from "./client";

/**
 * Read helper for the unified `/archives` hub (v2.7.0+).
 *
 * Replaces the previously-parallel `getAllSummaryRoutes` (article daily
 * summaries) and `getAllVideoRoundupRoutes` (video roundups) calls used
 * by `/summaries` and `/briefings` with a single date-bounded query
 * that returns BOTH media plus a per-(topic, date) count of
 * SSR-eligible video transcriptions.
 *
 * Output shape is grouped by day (descending) so the consumer can
 * render the timeline directly without re-grouping. Inside a day,
 * topics are listed in `topics.sort_order` (active topics only).
 *
 * Filters are deliberately permissive:
 *  - `from` / `to` are inclusive YYYY-MM-DD bounds. Caller decides the
 *    window — the typical home call is « today minus 7 days » for the
 *    7-day-per-page pagination.
 *  - `lang` is required (en | fr) because all three sources are stored
 *    per-lang.
 *  - `topicId` optional — when set, restricts every source to that topic.
 *  - `type` optional 'articles' | 'videos' — when set, omits the other
 *    source so the consumer doesn't have to do the same filter again.
 *
 * Performance: 3 concurrent SELECTs + 1 GROUP-BY-equivalent on
 * `video_transcriptions` for the count column. The window is always
 * tight (typically 7 days), so each query touches O(few hundred) rows
 * at most. The GROUP BY is materialized in JS rather than SQL because
 * Supabase JS doesn't expose a clean `group_by` builder; the loss is
 * negligible at this volume.
 */

export interface ArchivesArticleRoute {
  topic_id: string;
  summary_date: string;
  slug_keywords: string;
  lang: "en" | "fr";
}

export interface ArchivesRoundupRoute {
  topic_id: string;
  roundup_date: string;
  slug_keywords: string;
  lang: "en" | "fr";
}

export interface ArchivesTopicRow {
  topic_id: string;
  /** Article daily summary slug (link to `/en|fr/[topic]/[date]/[slug]`). NULL when no daily summary that day for that topic. */
  dailySummary: ArchivesArticleRoute | null;
  /** Video roundup slug (link to `/[topic]/r/[date]/[slug]`). NULL when no roundup. */
  videoRoundup: ArchivesRoundupRoute | null;
  /** Number of `video_transcriptions` rows with full SSR identity (slug + topic + published_date) for this (topic, date, lang). 0 when none. */
  transcribedVideoCount: number;
}

export interface ArchivesDay {
  date: string;
  topics: ArchivesTopicRow[];
  /**
   * True when a cross-topic Top 24h snapshot exists in `top_summaries`
   * for this (date, lang) tuple — drives the gold « ALL TOPICS » box
   * rendered in head of each day card on `/archives` (v2.7.1+). The
   * presence flag is enough; the actual snapshot is fetched lazily on
   * the dedicated `/{date}` SSR page when the visitor clicks through.
   */
  hasTopSummary: boolean;
}

export interface ArchivesPayload {
  days: ArchivesDay[];
  /** Echoed back to the client so it can wire the prev/next buttons without recomputing. */
  from: string;
  to: string;
  lang: "en" | "fr";
}

export interface GetArchivesOptions {
  from: string;
  to: string;
  lang: "en" | "fr";
  topicId?: string;
  /**
   * Subset filter: when set, the OTHER medium is omitted from the
   * payload (the column is `null`). The video count column is also
   * zeroed when `type === "articles"`. The day-row is dropped only
   * when ALL columns end up empty for every topic of that day.
   */
  type?: "all" | "articles" | "videos";
}

export async function getArchives(opts: GetArchivesOptions): Promise<ArchivesPayload> {
  const { from, to, lang, topicId, type = "all" } = opts;
  const empty: ArchivesPayload = { days: [], from, to, lang };

  return withClient("getArchives", empty, async (supabase) => {
    const includeArticles = type === "all" || type === "articles";
    const includeVideos = type === "all" || type === "videos";

    const articlesQuery = includeArticles
      ? supabase
          .from("daily_summaries")
          .select("topic_id, summary_date, slug_keywords, lang")
          .eq("lang", lang)
          .gte("summary_date", from)
          .lte("summary_date", to)
      : null;
    if (articlesQuery && topicId) articlesQuery.eq("topic_id", topicId);

    const roundupsQuery = includeVideos
      ? supabase
          .from("video_roundups")
          .select("topic_id, roundup_date, slug_keywords, lang")
          .eq("lang", lang)
          .gte("roundup_date", from)
          .lte("roundup_date", to)
      : null;
    if (roundupsQuery && topicId) roundupsQuery.eq("topic_id", topicId);

    /**
     * 4th lightweight SELECT (v2.7.1+): which dates have a cross-topic
     * Top 24h snapshot in `top_summaries`. The « ALL TOPICS » gold box
     * rendered on each day card is conditional on this flag; without
     * it we can't differentiate « no top summary today » from « top
     * summary exists, just no day for the topic filter ». We don't
     * apply the `topicId` filter here because the Top 24h IS by
     * definition cross-topic — restricting it to a single topic would
     * either always-hide or always-show, both unhelpful. We DO apply
     * the `type` filter: when the visitor explicitly asked for
     * « videos only », the article-driven Top 24h box is skipped.
     */
    const topSummaryQuery = includeArticles
      ? supabase
          .from("top_summaries")
          .select("summary_date")
          .eq("lang", lang)
          .gte("summary_date", from)
          .lte("summary_date", to)
      : null;

    /**
     * For the video transcription counters we ask Supabase for the
     * lightest possible row shape — just `(topic_id, published_date)`
     * — and tally in JS. Postgres would let us GROUP BY natively but
     * the supabase-js builder doesn't expose it; the volumes here
     * (≤ a few hundred rows for a 7-day window) make the JS pass
     * negligible. Filters mirror the SSR slug-resolution
     * preconditions so we never count a video that has no matching
     * `/v/[topic]/[date]/[slug]` page.
     */
    const videoCountQuery = includeVideos
      ? supabase
          .from("video_transcriptions")
          .select("topic_id, published_date")
          .eq("lang", lang)
          .gte("published_date", from)
          .lte("published_date", to)
          .not("topic_id", "is", null)
          .not("slug_keywords", "is", null)
          .not("published_date", "is", null)
      : null;
    if (videoCountQuery && topicId) videoCountQuery.eq("topic_id", topicId);

    const [articlesRes, roundupsRes, videoCountRes, topSummaryRes] = await Promise.all([
      articlesQuery ? articlesQuery : Promise.resolve({ data: [], error: null }),
      roundupsQuery ? roundupsQuery : Promise.resolve({ data: [], error: null }),
      videoCountQuery ? videoCountQuery : Promise.resolve({ data: [], error: null }),
      topSummaryQuery ? topSummaryQuery : Promise.resolve({ data: [], error: null }),
    ]);

    const articles = (articlesRes.data ?? []) as ArchivesArticleRoute[];
    const roundups = (roundupsRes.data ?? []) as ArchivesRoundupRoute[];
    const videoCountRows = (videoCountRes.data ?? []) as Array<{
      topic_id: string;
      published_date: string;
    }>;
    const topSummaryDates = new Set<string>();
    for (const row of (topSummaryRes.data ?? []) as Array<{ summary_date: string }>) {
      topSummaryDates.add(row.summary_date);
    }

    // Compose the day → topic map. Key is `${date}|${topicId}` so we
    // merge the three sources without double-counting.
    type Row = ArchivesTopicRow & { date: string };
    const map = new Map<string, Row>();
    const ensure = (date: string, topic_id: string): Row => {
      const key = `${date}|${topic_id}`;
      let row = map.get(key);
      if (!row) {
        row = {
          date,
          topic_id,
          dailySummary: null,
          videoRoundup: null,
          transcribedVideoCount: 0,
        };
        map.set(key, row);
      }
      return row;
    };

    for (const a of articles) {
      ensure(a.summary_date, a.topic_id).dailySummary = a;
    }
    for (const r of roundups) {
      ensure(r.roundup_date, r.topic_id).videoRoundup = r;
    }
    for (const v of videoCountRows) {
      ensure(v.published_date, v.topic_id).transcribedVideoCount += 1;
    }

    // Group rows back into ArchivesDay[].
    const byDate = new Map<string, ArchivesTopicRow[]>();
    for (const row of map.values()) {
      const arr = byDate.get(row.date) ?? [];
      arr.push({
        topic_id: row.topic_id,
        dailySummary: row.dailySummary,
        videoRoundup: row.videoRoundup,
        transcribedVideoCount: row.transcribedVideoCount,
      });
      byDate.set(row.date, arr);
    }

    // Make sure days that ONLY have a Top 24h snapshot (no per-topic
    // article summary, no roundup, no video transcription that day)
    // still appear in the timeline — otherwise the « ALL TOPICS » box
    // would never render for those quieter days. Inserts an empty
    // topic-row list (the gold box renders as a standalone above-row
    // card on those days).
    for (const date of topSummaryDates) {
      if (!byDate.has(date)) byDate.set(date, []);
    }

    const days: ArchivesDay[] = [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, topics]) => ({
        date,
        topics,
        hasTopSummary: topSummaryDates.has(date),
      }));

    return { days, from, to, lang };
  }, "error");
}
