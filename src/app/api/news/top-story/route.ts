import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  /** Whether an older entry exists for this filter at `offset + 1`. */
  hasOlder: boolean;
  /** Echoes back the `offset` actually served (clamped to ≥0). */
  offset: number;
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

function jsonResponse(
  payload: HeroPayload,
  bucket: number,
  now: number,
  options?: { liveCache?: boolean },
): NextResponse {
  const remainingMs = (bucket + 1) * ROTATION_BUCKET_MS - now;
  const remainingSec = Math.max(1, Math.floor(remainingMs / 1000));
  // History responses (offset > 0) only change when a new pick happens,
  // so we let the CDN cache them for a full bucket too — same TTL as
  // live responses keeps the headers consistent and easy to reason about.
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": `public, max-age=0, s-maxage=${remainingSec}, must-revalidate`,
      // Different threshold cookies → different edge cache entries.
      Vary: "Cookie",
      "X-Live": options?.liveCache ? "1" : "0",
    },
  });
}

interface QueueRow {
  ref_id: number;
}

async function hydrateArticle(
  db: SupabaseClient,
  refId: number,
  lang: Lang,
): Promise<HeroArticle | null> {
  const { data: articleRows, error } = await db
    .from("articles")
    .select(SELECT_COLS)
    .eq("id", refId)
    .limit(1);

  if (error || !articleRows || articleRows.length === 0) return null;

  const row = articleRows[0] as TopStoryRow;
  return {
    title: pickTitle(row, lang),
    snippet: pickSnippet(row, lang),
    link: row.link,
    source: row.source,
    topic: row.topic,
    pubDate: row.pub_date,
    score: row.relevance_score,
  };
}

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  const threshold = parseThreshold(
    request.cookies.get("homeMinScoreArticle")?.value,
    DEFAULT_MIN_SCORE,
  );
  // `offset=0` (or absent) → live mode: pick the next row + bump display_count.
  // `offset>0` → history mode: read-only SELECT, ordered by last_displayed_at DESC.
  // History never mutates the queue, so the user can scroll back through
  // earlier picks (the discreet ‹ chevron on the home hero card) without
  // disturbing the rotation.
  const offset = Math.max(
    0,
    Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0,
  );
  const now = Date.now();
  const bucket = Math.floor(now / ROTATION_BUCKET_MS);
  const cacheKey = `${lang}:${threshold}:${offset}`;
  const isLive = offset === 0;

  // ── Module cache (live mode only) ─────────────────────────
  // History requests skip the module cache because each (lang, threshold,
  // offset) combo is small and short-lived, but the CDN still caches by
  // URL via the Cache-Control header below.
  if (isLive) {
    const cached = heroCache.get(cacheKey);
    if (cached && cached.bucket === bucket) {
      return jsonResponse(cached.payload, bucket, now, { liveCache: true });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const empty: HeroPayload = { article: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now, { liveCache: false });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const hiddenTopics = await getHiddenTopicIds();

  if (isLive) {
    // Atomic SELECT + display_count++ via the SQL function from migration 022.
    const { data: pickRows, error: pickErr } = await db.rpc("pick_home_surface", {
      p_kind: "article",
      p_lang: lang,
      p_min_score: threshold,
      p_excluded_topics: hiddenTopics,
    });

    if (pickErr) {
      console.error(`[/api/news/top-story] pick_home_surface error: ${pickErr.message}`);
      const empty: HeroPayload = { article: null, hasOlder: false, offset };
      return jsonResponse(empty, bucket, now, { liveCache: false });
    }

    const picked = Array.isArray(pickRows) && pickRows.length > 0
      ? (pickRows[0] as { id: number; ref_id: number; score: number })
      : null;

    if (!picked) {
      const empty: HeroPayload = { article: null, hasOlder: false, offset };
      heroCache.set(cacheKey, { bucket, payload: empty });
      return jsonResponse(empty, bucket, now, { liveCache: true });
    }

    const article = await hydrateArticle(db, picked.ref_id, lang);
    if (!article) {
      const empty: HeroPayload = { article: null, hasOlder: false, offset };
      heroCache.set(cacheKey, { bucket, payload: empty });
      return jsonResponse(empty, bucket, now, { liveCache: true });
    }

    // Probe whether at least one previously-displayed row exists for the
    // same filter (i.e. would `offset = 1` return something). Cheap: head
    // count with a LIMIT/OFFSET pair that stops at the first match.
    const { count: olderCount } = await db
      .from("home_surface_queue")
      .select("id", { count: "exact", head: true })
      .eq("kind", "article")
      .eq("lang", lang)
      .gte("score", threshold)
      .not("last_displayed_at", "is", null)
      .neq("ref_id", picked.ref_id);
    const hasOlder = (olderCount ?? 0) > 0;

    const payload: HeroPayload = { article, hasOlder, offset };
    heroCache.set(cacheKey, { bucket, payload });
    return jsonResponse(payload, bucket, now, { liveCache: true });
  }

  // ── History mode (offset > 0) ──────────────────────────────
  // Read-only: pull two rows starting at the requested offset so we know
  // whether an even older one exists without a second round trip.
  let q = db
    .from("home_surface_queue")
    .select("ref_id")
    .eq("kind", "article")
    .eq("lang", lang)
    .gte("score", threshold)
    .not("last_displayed_at", "is", null)
    .order("last_displayed_at", { ascending: false })
    .order("inserted_at", { ascending: false })
    .range(offset, offset + 1);

  if (hiddenTopics.length > 0) {
    q = q.not("topic_id", "in", `(${hiddenTopics.map((id) => `"${id}"`).join(",")})`);
  }

  const { data: histRows, error: histErr } = await q;
  if (histErr) {
    console.error(`[/api/news/top-story] history SELECT error: ${histErr.message}`);
    const empty: HeroPayload = { article: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now, { liveCache: false });
  }
  const rows = (histRows ?? []) as QueueRow[];
  if (rows.length === 0) {
    const empty: HeroPayload = { article: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now, { liveCache: false });
  }

  const article = await hydrateArticle(db, rows[0].ref_id, lang);
  const hasOlder = rows.length > 1;
  const payload: HeroPayload = {
    article: article ?? null,
    hasOlder,
    offset,
  };
  return jsonResponse(payload, bucket, now, { liveCache: false });
}
