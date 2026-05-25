import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * GET /api/topics/trending?since=24h&lang=fr&limit=10&topics=ai,crypto
 *
 * Returns topics ranked by article count in the recent window (default
 * 24 h), ordered by count desc. Optional `topics` restricts the count
 * to the caller's preferred topic ids (logged-in personalization).
 * Powers the « Tendances · 24h » strip on the Briefing homepage.
 *
 * Counts use `pub_date` (publication time), aligned with Top 50 /
 * stats — not `fetched_at`, which under-counts when RSS re-sees an
 * existing link (`ignoreDuplicates` upserts do not refresh fetched_at).
 * Per-topic `{ count: "exact" }` queries avoid the PostgREST row cap
 * (~1k rows) that truncated the previous single-scan approach.
 *
 * Response: [{ id, label, count }]
 */
// Force per-request execution: this endpoint varies by `topics`, `lang`,
// `since`, and `limit`, and Netlify production has previously reused cached
// API bodies by path while ignoring query strings.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export async function GET(req: NextRequest) {
  const sinceParam = req.nextUrl.searchParams.get("since") ?? "24h";
  const langParam = req.nextUrl.searchParams.get("lang") ?? "en";
  const lang = langParam === "fr" ? "fr" : "en";

  const topicsParam = req.nextUrl.searchParams.get("topics");
  const topicFilter = topicsParam
    ? topicsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10);
  const limit = Math.min(20, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 10));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json([], { headers: NO_STORE_HEADERS });
  }

  const sinceMs = parseSinceWindow(sinceParam);
  const sinceISO = new Date(Date.now() - sinceMs).toISOString();

  const db = createClient(url, key, { auth: { persistSession: false } });

  const topicIds =
    topicFilter && topicFilter.length > 0
      ? topicFilter
      : await fetchDisplayedTopicIds(db);

  if (topicIds.length === 0) {
    return NextResponse.json([], { headers: NO_STORE_HEADERS });
  }

  const counts = await countArticlesByTopicSince(db, sinceISO, topicIds);

  if (counts.size === 0) {
    return NextResponse.json([], { headers: NO_STORE_HEADERS });
  }

  const idsToLabel = Array.from(counts.keys());

  const { data: topicRows } = await db
    .from("topics")
    .select("id, label_en, label_fr, is_active, is_displayed")
    .in("id", idsToLabel);

  const labelById = new Map<string, string>();
  for (const t of (topicRows ?? []) as Array<{
    id: string;
    label_en: string;
    label_fr: string;
    is_active: boolean;
    is_displayed: boolean;
  }>) {
    if (!t.is_active || !t.is_displayed) continue;
    labelById.set(t.id, lang === "fr" ? t.label_fr : t.label_en);
  }

  const ranked = Array.from(counts.entries())
    .filter(([id]) => labelById.has(id))
    .map(([id, count]) => ({ id, label: labelById.get(id)!, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return NextResponse.json(ranked, {
    headers: NO_STORE_HEADERS,
  });
}

async function fetchDisplayedTopicIds(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from("topics")
    .select("id")
    .eq("is_active", true)
    .eq("is_displayed", true);

  if (error || !data) return [];
  return (data as Array<{ id: string }>).map((r) => r.id);
}

/** Exact per-topic counts for articles published since `sinceISO`. */
async function countArticlesByTopicSince(
  db: SupabaseClient,
  sinceISO: string,
  topicIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const BATCH = 25;

  for (let i = 0; i < topicIds.length; i += BATCH) {
    const slice = topicIds.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (topicId) => {
        const { count, error } = await db
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("topic", topicId)
          .gte("pub_date", sinceISO);

        if (!error && count != null && count > 0) {
          counts.set(topicId, count);
        }
      }),
    );
  }

  return counts;
}

/**
 * Parse "6h", "24h", "30m" etc. into milliseconds. Defaults to 24h on any
 * unparseable input. Caps at 7d to avoid huge windows.
 */
function parseSinceWindow(s: string): number {
  const m = s.trim().match(/^(\d+)\s*([mhd])$/i);
  if (!m) return 24 * 3_600_000;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const ms =
    unit === "m" ? n * 60_000
      : unit === "h" ? n * 3_600_000
      : n * 86_400_000;
  return Math.min(ms, 7 * 86_400_000);
}
