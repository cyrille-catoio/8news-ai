import { NextRequest, NextResponse } from "next/server";
import { getArchives } from "@/lib/supabase";
import { parseLang } from "@/lib/api-helpers";
import { toUtcDateString } from "@/lib/dates-utc";

/**
 * GET /api/archives?lang=fr&from=YYYY-MM-DD&to=YYYY-MM-DD&topic=&type=all|articles|videos
 *
 * Unified archives feed (v2.7.0+) — drives the `/archives` SSR page and
 * its `/app/archives` SPA mirror. Returns a day-grouped payload that
 * folds together:
 *   - Article daily summaries (`daily_summaries`),
 *   - Video roundups (`video_roundups`),
 *   - A per-(topic, date) count of SSR-eligible video transcriptions
 *     (`video_transcriptions`).
 *
 * Replaces the side-by-side `/api/summaries/routes` (article-only) and
 * the implicit fetch on `/briefings` (video-roundup-only) with a single
 * round-trip; keeps the legacy `getAllSummaryRoutes` helper alive only
 * for the sitemap.
 *
 * Caching: `s-maxage=300` because the underlying tables update at most
 * twice a day (article summary cron + video roundup cron). Browsers
 * keep `max-age=60` so the visitor's filter changes feel instant
 * without re-pinging the edge for every range tweak.
 */

function parseDate(raw: string | null, fallback: Date): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return toUtcDateString(fallback);
}

function parseType(raw: string | null): "all" | "articles" | "videos" {
  return raw === "articles" || raw === "videos" ? raw : "all";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lang = parseLang(params.get("lang"));

  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 6 * 86_400_000);

  const to = parseDate(params.get("to"), today);
  const from = parseDate(params.get("from"), sevenDaysAgo);

  const topic = params.get("topic") || undefined;
  const type = parseType(params.get("type"));

  const payload = await getArchives({ from, to, lang, topicId: topic, type });

  return NextResponse.json(payload, {
    headers: {
      // Edge cache for 5 min, browser cache for 60 s. Same cadence as
      // /api/news/top-summary/latest — both surfaces serve content
      // that updates at most a couple of times per day.
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}
