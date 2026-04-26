import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";
import { getHiddenTopicIds } from "@/lib/supabase";
import { SNIPPET_MAX } from "@/lib/constants";

/**
 * GET /api/news/top-story?lang=fr
 *
 * Returns ONE article suitable for the Briefing's "Top story · maintenant"
 * hero card: ideally a freshly fetched 10/10 article from the last hour.
 *
 * Search ladder (first match wins):
 *   1. score = 10  in the last 1 hour
 *   2. score ≥ 9   in the last 1 hour
 *   3. score = 10  in the last 24 hours
 *   4. score ≥ 9   in the last 24 hours
 *
 * Within the first non-empty ladder step we keep up to {@link CANDIDATE_POOL}
 * articles and pick one **deterministically by 10-minute bucket** —
 * `Math.floor(now / 600_000) % candidates.length`. This means every user
 * lands on the same hero at any given minute, but the hero rotates to a
 * different article every 10 minutes (the BriefingPage refreshes itself
 * on the same cadence client-side).
 *
 * Excludes hidden topics so the hero matches the rest of the briefing.
 * If everything misses, returns `{ article: null }` and the client can
 * fall back to `topFeed[0]` from the existing useTopFeed hook.
 *
 * Response shape mirrors `TopFeedArticle` from src/hooks/useTopFeed.ts so
 * the BriefingPage can drop it straight into the existing HeroStory.
 */

const CANDIDATE_POOL = 10;
const ROTATION_BUCKET_MS = 10 * 60 * 1000;

interface TopStoryRow {
  title: string;
  link: string;
  source: string;
  topic: string;
  pub_date: string;
  fetched_at: string;
  relevance_score: number;
  snippet: string | null;
  content: string | null;
  snippet_ai_en: string | null;
  snippet_ai_fr: string | null;
  title_ai_en: string | null;
  title_ai_fr: string | null;
}

function parseLang(raw: string | null): Lang {
  return raw === "fr" ? "fr" : "en";
}

function pickSnippet(r: TopStoryRow, lang: Lang): string {
  const aiSnippet = lang === "fr" ? r.snippet_ai_fr : r.snippet_ai_en;
  const base = (aiSnippet || r.snippet || r.content || "").trim();
  return base.slice(0, SNIPPET_MAX);
}

/**
 * Prefer the AI-translated title in the user's selected language. Falls back
 * to the raw feed `title` for legacy rows scored before migration 019 (where
 * `title_ai_*` is still null). Trim defensively — the scorer caps the field
 * at 300 chars but old rows or future widening shouldn't surface as a
 * runaway hero headline on the home page.
 */
function pickTitle(r: TopStoryRow, lang: Lang): string {
  const ai = lang === "fr" ? r.title_ai_fr : r.title_ai_en;
  return (ai || r.title || "").trim();
}

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ article: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const oneHourAgo = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Hidden topics are excluded so the hero stays in sync with the rest
  // of the product (Top 50, daily summaries, etc.).
  const hiddenIds = await getHiddenTopicIds();

  /**
   * Run the configured query (a Postgres select, with the right score
   * filter and time window) and return up to {@link CANDIDATE_POOL}
   * matching rows ordered most-recent-first. Caller will pick one of
   * them via the 10-minute rotation bucket.
   */
  async function tryFetch(score: { eq?: number; gte?: number }, since: string): Promise<TopStoryRow[]> {
    let q = db
      .from("articles")
      .select(
        "title, link, source, topic, pub_date, fetched_at, relevance_score, snippet, content, snippet_ai_en, snippet_ai_fr, title_ai_en, title_ai_fr",
      )
      .gte("fetched_at", since)
      .order("fetched_at", { ascending: false })
      .limit(CANDIDATE_POOL);

    if (score.eq != null) q = q.eq("relevance_score", score.eq);
    if (score.gte != null) q = q.gte("relevance_score", score.gte);

    if (hiddenIds.length > 0) q = q.not("topic", "in", `(${hiddenIds.map((id) => `"${id}"`).join(",")})`);

    const { data, error } = await q;
    if (error || !data || data.length === 0) return [];
    return data as TopStoryRow[];
  }

  // Search ladder. Order matters — first non-empty step wins, and we
  // stay inside that step's pool for the rotation (mixing candidates
  // across windows would dilute the freshness guarantee of step 1).
  const ladder: Array<{ score: { eq?: number; gte?: number }; since: string }> = [
    { score: { eq: 10 }, since: oneHourAgo },
    { score: { gte: 9 }, since: oneHourAgo },
    { score: { eq: 10 }, since: oneDayAgo },
    { score: { gte: 9 }, since: oneDayAgo },
  ];

  let candidates: TopStoryRow[] = [];
  for (const step of ladder) {
    candidates = await tryFetch(step.score, step.since);
    if (candidates.length > 0) break;
  }

  if (candidates.length === 0) {
    return NextResponse.json({ article: null }, { headers: { "Cache-Control": "no-store" } });
  }

  // Deterministic 10-minute rotation. Same bucket = same article for
  // every user; bucket flips on the wall-clock 10-minute boundary so
  // the BriefingPage's setInterval refresh lands on a new hero.
  const bucket = Math.floor(Date.now() / ROTATION_BUCKET_MS);
  const row = candidates[bucket % candidates.length];

  const article = {
    title: pickTitle(row, lang),
    snippet: pickSnippet(row, lang),
    link: row.link,
    source: row.source,
    topic: row.topic,
    pubDate: row.pub_date,
    score: row.relevance_score,
  };

  return NextResponse.json({ article }, { headers: { "Cache-Control": "no-store" } });
}
