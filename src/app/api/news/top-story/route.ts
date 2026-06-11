import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";
import { SNIPPET_MAX } from "@/lib/constants";
import { getHiddenTopicIds, getServerClient } from "@/lib/supabase";
import { parseLang } from "@/lib/api-helpers";

/**
 * GET /api/news/top-story?lang=fr
 *
 * Returns ONE article suitable for the Briefing's "Top story · maintenant"
 * hero card. Backed by `home_surface_queue` (migration 022): every
 * article scored ≥ 7 is inserted into the queue at scoring time. The
 * route scans queue candidates in round-robin order, hydrates the
 * backing article, keeps only publications from the last 24h, then
 * bumps `display_count` on the selected fresh row.
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
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const QUEUE_SCAN_BATCH_SIZE = 100;
const QUEUE_SCAN_MAX_ROWS = 1000;
const DEFAULT_MIN_SCORE = 9;
const SELECT_COLS =
  "id, title, link, source, topic, pub_date, fetched_at, relevance_score, snippet, content, snippet_ai_en, snippet_ai_fr, title_ai_en, title_ai_fr";

interface TopStoryRow {
  id: number;
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
  _bucket: number,
  _now: number,
): NextResponse {
  // Explicit no-store across all caching layers. Netlify's edge cache for
  // Next.js Route Handlers turned out to key on **path only** (ignoring
  // `?offset=` query strings), which made every `?offset=N` hit return
  // the cached `?offset=0` payload — that's why « previous » chevrons
  // appeared to do nothing in production. We rely on the module-level
  // cache inside the Function for the live-mode bucket dedup instead.
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Netlify-CDN-Cache-Control": "no-store",
      Vary: "Cookie",
    },
  });
}

interface QueueRow {
  id: number;
  ref_id: number;
  display_count: number | null;
}

interface FreshArticleCandidate {
  queue: QueueRow;
  article: HeroArticle;
}

function isFreshPublication(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const publishedAt = new Date(iso).getTime();
  if (!Number.isFinite(publishedAt)) return false;
  return publishedAt <= now && now - publishedAt < FRESH_WINDOW_MS;
}

function toHeroArticle(row: TopStoryRow, lang: Lang): HeroArticle {
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

async function getFreshArticleCandidates(
  db: SupabaseClient,
  {
    lang,
    threshold,
    hiddenTopics,
    now,
    mode,
    offset,
  }: {
    lang: Lang;
    threshold: number;
    hiddenTopics: string[];
    now: number;
    mode: "live" | "history";
    offset: number;
  },
): Promise<FreshArticleCandidate[]> {
  const cutoffIso = new Date(now - FRESH_WINDOW_MS).toISOString();
  const nowIso = new Date(now).toISOString();
  const fresh: FreshArticleCandidate[] = [];
  let scanned = 0;

  while (scanned < QUEUE_SCAN_MAX_ROWS && fresh.length < offset + 2) {
    const from = scanned;
    const to = Math.min(scanned + QUEUE_SCAN_BATCH_SIZE, QUEUE_SCAN_MAX_ROWS) - 1;
    let q = db
      .from("home_surface_queue")
      .select("id, ref_id, display_count")
      .eq("kind", "article")
      .eq("lang", lang)
      .gte("score", threshold);

    if (mode === "live") {
      q = q
        .order("display_count", { ascending: true })
        .order("last_displayed_at", { ascending: true, nullsFirst: true })
        .order("inserted_at", { ascending: false });
    } else {
      q = q
        .order("last_displayed_at", { ascending: false, nullsFirst: false })
        .order("inserted_at", { ascending: false });
    }

    if (hiddenTopics.length > 0) {
      q = q.not("topic_id", "in", `(${hiddenTopics.map((id) => `"${id}"`).join(",")})`);
    }

    const { data: queueData, error: queueErr } = await q.range(from, to);
    if (queueErr) {
      console.error(`[/api/news/top-story] queue SELECT error: ${queueErr.message}`);
      return [];
    }

    const queueRows = (queueData ?? []) as QueueRow[];
    if (queueRows.length === 0) break;

    const refIds = queueRows.map((row) => row.ref_id);
    const { data: articleData, error: articleErr } = await db
      .from("articles")
      .select(SELECT_COLS)
      .in("id", refIds)
      .gte("pub_date", cutoffIso)
      .lte("pub_date", nowIso);

    if (articleErr) {
      console.error(`[/api/news/top-story] fresh article SELECT error: ${articleErr.message}`);
      return [];
    }

    const articleById = new Map<number, TopStoryRow>();
    for (const row of (articleData ?? []) as TopStoryRow[]) {
      articleById.set(row.id, row);
    }

    for (const queueRow of queueRows) {
      const article = articleById.get(queueRow.ref_id);
      if (!article) continue;
      fresh.push({ queue: queueRow, article: toHeroArticle(article, lang) });
      if (fresh.length >= offset + 2) break;
    }

    if (queueRows.length < QUEUE_SCAN_BATCH_SIZE) break;
    scanned += queueRows.length;
  }

  return fresh.slice(offset, offset + 2);
}

async function markArticleDisplayed(db: SupabaseClient, queue: QueueRow, now: number): Promise<void> {
  const { error } = await db
    .from("home_surface_queue")
    .update({
      display_count: (queue.display_count ?? 0) + 1,
      last_displayed_at: new Date(now).toISOString(),
    })
    .eq("id", queue.id);

  if (error) {
    console.error(`[/api/news/top-story] display_count update error: ${error.message}`);
  }
}

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  const threshold = parseThreshold(
    request.cookies.get("homeMinScoreArticle")?.value,
    DEFAULT_MIN_SCORE,
  );
  // `offset=0` (or absent) → live mode: pick the next fresh row + bump display_count.
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
  // offset) combo is small and short-lived.
  if (isLive) {
    const cached = heroCache.get(cacheKey);
    if (
      cached
      && cached.bucket === bucket
      && isFreshPublication(cached.payload.article?.pubDate, now)
    ) {
      return jsonResponse(cached.payload, bucket, now);
    }
  }

  const dbP = getServerClient();
  if (!dbP) {
    const empty: HeroPayload = { article: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now);
  }

  const db = await dbP;
  const hiddenTopics = await getHiddenTopicIds();

  if (isLive) {
    const candidates = await getFreshArticleCandidates(db, {
      lang,
      threshold,
      hiddenTopics,
      now,
      mode: "live",
      offset: 0,
    });
    const picked = candidates[0];
    if (!picked) {
      const empty: HeroPayload = { article: null, hasOlder: false, offset };
      return jsonResponse(empty, bucket, now);
    }

    await markArticleDisplayed(db, picked.queue, now);

    const payload: HeroPayload = {
      article: picked.article,
      hasOlder: candidates.length > 1,
      offset,
    };
    heroCache.set(cacheKey, { bucket, payload });
    return jsonResponse(payload, bucket, now);
  }

  // ── History mode (offset > 0) ──────────────────────────────
  // Read-only: pull two fresh rows starting at the requested fresh offset
  // so we know whether an even older one exists without a second round trip.
  // Order: most-recently-displayed first (the previous bucket's pick),
  // then never-displayed rows by insertion freshness. NULLS LAST keeps
  // unshown candidates available when the live rotation hasn't yet
  // walked through the entire queue.
  const candidates = await getFreshArticleCandidates(db, {
    lang,
    threshold,
    hiddenTopics,
    now,
    mode: "history",
    offset,
  });

  if (candidates.length === 0) {
    const empty: HeroPayload = { article: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now);
  }

  const payload: HeroPayload = {
    article: candidates[0].article,
    hasOlder: candidates.length > 1,
    offset,
  };
  return jsonResponse(payload, bucket, now);
}
