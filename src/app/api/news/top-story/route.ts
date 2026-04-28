import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";
import { getHiddenTopicIds } from "@/lib/supabase";
import { SNIPPET_MAX } from "@/lib/constants";

/**
 * GET /api/news/top-story?lang=fr
 *
 * Returns ONE article suitable for the Briefing's "Top story · maintenant"
 * hero card. The hero is **synchronized across all visitors** of the same
 * language: every user hitting the page within a given 10-minute
 * wall-clock bucket sees the exact same article (FR users see the FR
 * top story, EN users see the EN top story).
 *
 * Strategy
 * --------
 * 1. Pull a pool of up to {@link CANDIDATE_POOL} articles scoring ≥ 9
 *    whose publication date is in the last 24 h, ordered
 *    `relevance_score DESC, pub_date DESC`.
 *    Position 0 is therefore always the freshest score=10 if any exists,
 *    so the « freshly-fetched 10/10 wins » freshness guarantee is
 *    preserved automatically while giving the rotation real variety.
 *    If the pool is empty (rare quiet day), widen to score ≥ 7 / 24h
 *    so the hero never goes empty.
 * 2. Pick by 10-minute wall-clock bucket:
 *      idx = floor(now / 600_000) % candidates.length
 *    so every visitor lands on the same hero at any given minute.
 *
 * Caching layers
 * --------------
 * - **CDN** (`Cache-Control: public, s-maxage=<remaining>, max-age=0,
 *   must-revalidate`): the response is shared across all visitors of
 *   the same `?lang=` until the bucket flips. Browsers re-validate on
 *   every refresh (`max-age=0`) so they pick up the new bucket
 *   immediately, but the CDN serves the same payload to everyone in
 *   between, fully synchronizing the hero.
 * - **Module-level cache** (per warm Netlify Function instance): a
 *   tiny `Map<Lang, { bucket, payload }>` skips the Supabase round-trip
 *   when the same instance handles multiple cache-miss requests in the
 *   same bucket (e.g. the first hit of a new bucket from each lang).
 *
 * Excludes hidden topics so the hero matches the rest of the briefing.
 * Returns `{ article: null }` when nothing matches; the client falls
 * back to `topFeed[0]` from the existing useTopFeed hook.
 *
 * Response shape mirrors `TopFeedArticle` from src/hooks/useTopFeed.ts.
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

interface HeroArticle {
  title: string;
  snippet: string;
  link: string;
  source: string;
  topic: string;
  pubDate: string;
  score: number;
}

interface HeroPayload {
  article: HeroArticle | null;
}

interface CacheEntry {
  bucket: number;
  payload: HeroPayload;
}

// Module-level cache, keyed by lang. Lives as long as the Netlify
// Function instance stays warm (typically minutes). Two entries max
// (en + fr) so no GC needed — newer-bucket entries simply overwrite.
const heroCache = new Map<Lang, CacheEntry>();

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

/**
 * Build the JSON response, attaching CDN cache headers that align
 * exactly with the remaining lifetime of the current 10-min bucket
 * — that way Netlify's edge cache flips at the wall-clock boundary
 * just like the rotation logic above.
 */
function jsonResponse(payload: HeroPayload, bucket: number, now: number): NextResponse {
  const remainingMs = (bucket + 1) * ROTATION_BUCKET_MS - now;
  const remainingSec = Math.max(1, Math.floor(remainingMs / 1000));
  return NextResponse.json(payload, {
    headers: {
      // public  → cacheable by the CDN (Netlify edge).
      // max-age=0 + must-revalidate → browsers always check upstream
      //   (so a refresh picks up the new bucket immediately when the
      //   edge cache has flipped, instead of holding a stale copy).
      // s-maxage=<remaining> → CDN caches the response only until the
      //   bucket flips, then a single origin fetch repopulates it for
      //   the next bucket.
      "Cache-Control": `public, max-age=0, s-maxage=${remainingSec}, must-revalidate`,
    },
  });
}

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  const now = Date.now();
  const bucket = Math.floor(now / ROTATION_BUCKET_MS);

  // ── Cache hit ──────────────────────────────────────────────
  // Same instance, same lang, same bucket → identical payload to
  // anyone else hitting this instance in this window. Skips both
  // the Supabase query and the rotation math.
  const cached = heroCache.get(lang);
  if (cached && cached.bucket === bucket) {
    return jsonResponse(cached.payload, bucket, now);
  }

  // ── Cache miss: compute fresh ──────────────────────────────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const empty: HeroPayload = { article: null };
    return jsonResponse(empty, bucket, now);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const nowISO = new Date(now).toISOString();
  const oneDayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
  const hiddenIds = await getHiddenTopicIds();

  /**
   * Pull the top N articles scoring ≥ minScore whose publication date is
   * in the last 24h, ordered for our rotation: highest score first,
   * freshest published article within tie. We intentionally do NOT filter
   * by fetched_at here — a week-old article fetched five minutes ago is
   * not suitable for "Top story · now".
   */
  async function fetchPool(minScore: number): Promise<TopStoryRow[]> {
    let q = db
      .from("articles")
      .select(SELECT_COLS)
      .gte("pub_date", oneDayAgo)
      .lte("pub_date", nowISO)
      .gte("relevance_score", minScore)
      .order("relevance_score", { ascending: false })
      .order("pub_date", { ascending: false })
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
    const empty: HeroPayload = { article: null };
    heroCache.set(lang, { bucket, payload: empty });
    return jsonResponse(empty, bucket, now);
  }

  // Deterministic 10-minute rotation. Same bucket + same candidates
  // ⇒ same idx ⇒ same article for every Function instance, so the
  // module-level cache and CDN cache always converge on the same row
  // even when they're populated from different cold instances.
  const idx = ((bucket % candidates.length) + candidates.length) % candidates.length;
  const row = candidates[idx];

  const article: HeroArticle = {
    title: pickTitle(row, lang),
    snippet: pickSnippet(row, lang),
    link: row.link,
    source: row.source,
    topic: row.topic,
    pubDate: row.pub_date,
    score: row.relevance_score,
  };

  const payload: HeroPayload = { article };
  heroCache.set(lang, { bucket, payload });
  return jsonResponse(payload, bucket, now);
}
