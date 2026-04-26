import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";
import { getHiddenTopicIds } from "@/lib/supabase";
import { SNIPPET_MAX } from "@/lib/constants";

/**
 * GET /api/news/top-story?lang=fr&exclude=<currentLink>
 *
 * Returns ONE article suitable for the Briefing's "Top story · maintenant"
 * hero card.
 *
 * Strategy
 * --------
 * 1. Build a single pool of up to {@link CANDIDATE_POOL} articles scoring
 *    ≥ 9 in the last 24h, ordered by `relevance_score DESC, fetched_at DESC`.
 *    Position 0 is therefore always the freshest score=10 if any exists,
 *    so the freshness guarantee of the previous ladder is preserved
 *    automatically while giving the rotation real variety.
 * 2. If the pool is empty (rare but possible), widen to score ≥ 7 / 24h.
 * 3. Pick by 10-minute wall-clock bucket:
 *      idx = floor(now / 600_000) % candidates.length
 *    so every visitor lands on the same hero at any given minute.
 * 4. If the client passes `?exclude=<link>` (the article currently shown
 *    in their browser) and the bucket pick happens to be the same link,
 *    advance one position in the pool — that way a refresh always
 *    returns a *different* article when the pool has more than 1 entry.
 *    This is what fixes the "I refreshed and saw the same article" UX
 *    when the bucket is unchanged or the pool is small.
 *
 * Excludes hidden topics so the hero matches the rest of the briefing.
 * If everything misses, returns `{ article: null }` and the client can
 * fall back to `topFeed[0]` from the existing useTopFeed hook.
 *
 * Response shape mirrors `TopFeedArticle` from src/hooks/useTopFeed.ts so
 * the BriefingPage can drop it straight into the existing HeroStory.
 */

const CANDIDATE_POOL = 15;
const ROTATION_BUCKET_MS = 10 * 60 * 1000;
const FALLBACK_MIN_SCORE = 7;
const SELECT_COLS =
  "title, link, source, topic, pub_date, fetched_at, relevance_score, snippet, content, snippet_ai_en, snippet_ai_fr, title_ai_en, title_ai_fr";

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
  const exclude = (request.nextUrl.searchParams.get("exclude") || "").trim() || null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ article: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Hidden topics are excluded so the hero stays in sync with the rest
  // of the product (Top 50, daily summaries, etc.).
  const hiddenIds = await getHiddenTopicIds();

  /**
   * Pull the top N articles scoring ≥ minScore in the last 24h, ordered
   * for our rotation: highest score first, freshest within tie. Position
   * 0 is therefore always the best-and-freshest article — preserving the
   * "freshly-fetched 10/10 wins" guarantee of the original ladder.
   */
  async function fetchPool(minScore: number): Promise<TopStoryRow[]> {
    let q = db
      .from("articles")
      .select(SELECT_COLS)
      .gte("fetched_at", oneDayAgo)
      .gte("relevance_score", minScore)
      .order("relevance_score", { ascending: false })
      .order("fetched_at", { ascending: false })
      .limit(CANDIDATE_POOL);

    if (hiddenIds.length > 0) {
      q = q.not("topic", "in", `(${hiddenIds.map((id) => `"${id}"`).join(",")})`);
    }

    const { data, error } = await q;
    if (error || !data || data.length === 0) return [];
    return data as TopStoryRow[];
  }

  let candidates = await fetchPool(9);
  if (candidates.length === 0) {
    // Quiet day on the score ladder — widen so the hero never goes empty.
    candidates = await fetchPool(FALLBACK_MIN_SCORE);
  }

  if (candidates.length === 0) {
    return NextResponse.json({ article: null }, { headers: { "Cache-Control": "no-store" } });
  }

  // Deterministic 10-minute rotation. Same bucket = same hero pick for
  // every user at the same wall-clock minute.
  const bucket = Math.floor(Date.now() / ROTATION_BUCKET_MS);
  let idx = ((bucket % candidates.length) + candidates.length) % candidates.length;

  // If the client tells us which article they currently see, never serve
  // the same one back. We just advance one position — cheaper than a
  // second DB roundtrip and good enough since the pool is shuffled by
  // (score, fetched_at). Only meaningful when the pool has > 1 entry.
  if (exclude && candidates.length > 1 && candidates[idx].link === exclude) {
    idx = (idx + 1) % candidates.length;
  }

  const row = candidates[idx];

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
