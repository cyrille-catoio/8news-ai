import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";
import { SNIPPET_MAX } from "@/lib/constants";
import { getHiddenTopicIds } from "@/lib/supabase";

/**
 * GET /api/news/top-story?lang=fr
 *
 * Returns ONE article suitable for the Briefing's "Top story · maintenant"
 * hero card. Backed by `home_surface_queue` (migration 022): every
 * article scored ≥ 7 is inserted into the queue at scoring time, the
 * pick is the row with the lowest `display_count` matching the
 * visitor's threshold, and `display_count` is bumped atomically by the
 * `pick_home_surface()` Postgres function.
 *
 * Per-user thresholds
 * -------------------
 * The visitor's `homeMinScoreArticle` cookie (default **9**, clamp 1..10)
 * filters which queue rows can be picked. Authenticated users have the
 * value mirrored into `auth.users.user_metadata.home_min_score_article`,
 * but the API never reads metadata directly — the cookie is the source
 * of truth on each request.
 *
 * Caching layers (preserved)
 * --------------------------
 * - Module-level cache `Map<key, { bucket, payload }>` keyed by
 *   `${lang}:${threshold}` so anonymous visitors (default threshold)
 *   share a hot entry while custom thresholds get their own slot.
 * - CDN: `Cache-Control: public, max-age=0, s-maxage=<remaining>,
 *   must-revalidate` aligned to the bucket flip, with `Vary: Cookie`
 *   so different threshold cookies get distinct edge cache entries.
 *
 * Returns `{ article: null }` when the queue is empty for the active
 * filter; the client falls back to whatever it has on screen and the
 * hero never goes blank during transient empties.
 *
 * Response shape mirrors `TopFeedArticle` from src/hooks/useTopFeed.ts.
 */

const ROTATION_BUCKET_MS = 10 * 60 * 1000;
const DEFAULT_MIN_SCORE = 9;
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

// Module-level cache, keyed by `${lang}:${threshold}`. Lives as long as
// the Netlify Function instance stays warm. Entries are tiny so we let
// it grow naturally; the keyspace is bounded by the (lang × 10 score
// values) product ≈ 20 entries max.
const heroCache = new Map<string, CacheEntry>();

function parseLang(raw: string | null): Lang {
  return raw === "fr" ? "fr" : "en";
}

function parseThreshold(raw: string | null | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, n));
}

function pickSnippet(r: TopStoryRow, lang: Lang): string {
  const aiSnippet = lang === "fr" ? r.snippet_ai_fr : r.snippet_ai_en;
  const base = (aiSnippet || r.snippet || r.content || "").trim();
  return base.slice(0, SNIPPET_MAX);
}

/** Prefer the AI-translated title in the user's selected language. */
function pickTitle(r: TopStoryRow, lang: Lang): string {
  const ai = lang === "fr" ? r.title_ai_fr : r.title_ai_en;
  return (ai || r.title || "").trim();
}

function jsonResponse(payload: HeroPayload, bucket: number, now: number): NextResponse {
  const remainingMs = (bucket + 1) * ROTATION_BUCKET_MS - now;
  const remainingSec = Math.max(1, Math.floor(remainingMs / 1000));
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": `public, max-age=0, s-maxage=${remainingSec}, must-revalidate`,
      // Different threshold cookies → different edge cache entries.
      Vary: "Cookie",
    },
  });
}

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  const threshold = parseThreshold(
    request.cookies.get("homeMinScoreArticle")?.value,
    DEFAULT_MIN_SCORE,
  );
  const now = Date.now();
  const bucket = Math.floor(now / ROTATION_BUCKET_MS);
  const cacheKey = `${lang}:${threshold}`;

  // ── Cache hit ──────────────────────────────────────────────
  // Same instance, same (lang, threshold), same bucket → identical
  // payload to anyone else hitting this instance in this window. Skips
  // both the RPC and the article hydration.
  const cached = heroCache.get(cacheKey);
  if (cached && cached.bucket === bucket) {
    return jsonResponse(cached.payload, bucket, now);
  }

  // ── Cache miss: pick + hydrate ─────────────────────────────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const empty: HeroPayload = { article: null };
    return jsonResponse(empty, bucket, now);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const hiddenTopics = await getHiddenTopicIds();

  // Atomic SELECT + display_count++ via the SQL function from migration 022.
  // `p_excluded_topics` mirrors the operator-level hidden-topics list so a
  // freshly-hidden topic never surfaces in the hero, even if its rows are
  // already in the queue from earlier scoring runs.
  const { data: pickRows, error: pickErr } = await db.rpc("pick_home_surface", {
    p_kind: "article",
    p_lang: lang,
    p_min_score: threshold,
    p_excluded_topics: hiddenTopics,
  });

  if (pickErr) {
    // Don't poison the module cache on transient DB errors — let the
    // next request retry. Send `null` so the client keeps its current
    // hero on screen.
    console.error(`[/api/news/top-story] pick_home_surface error: ${pickErr.message}`);
    const empty: HeroPayload = { article: null };
    return jsonResponse(empty, bucket, now);
  }

  const picked = Array.isArray(pickRows) && pickRows.length > 0
    ? (pickRows[0] as { id: number; ref_id: number; score: number })
    : null;

  if (!picked) {
    const empty: HeroPayload = { article: null };
    heroCache.set(cacheKey, { bucket, payload: empty });
    return jsonResponse(empty, bucket, now);
  }

  // Hydrate from articles by id.
  const { data: articleRows, error: articleErr } = await db
    .from("articles")
    .select(SELECT_COLS)
    .eq("id", picked.ref_id)
    .limit(1);

  if (articleErr || !articleRows || articleRows.length === 0) {
    // Queue row points to a missing article (deleted? table truncated?).
    // We've already incremented display_count, so the bad row will rotate
    // out of the way; just return null this bucket.
    const empty: HeroPayload = { article: null };
    heroCache.set(cacheKey, { bucket, payload: empty });
    return jsonResponse(empty, bucket, now);
  }

  const row = articleRows[0] as TopStoryRow;
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
  heroCache.set(cacheKey, { bucket, payload });
  return jsonResponse(payload, bucket, now);
}
