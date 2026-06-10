import { NextRequest, NextResponse } from "next/server";
import {
  getArticleImageUrlsByLinks,
  getTopSummaryByOffset,
  getTopSummaryLiveLatest,
  getTopSummaryBulletsByDate,
  type TopSummaryArticle,
} from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";

/**
 * Read endpoint backing the new `/top-articles` UX. Returns the
 * pre-computed Top articles snapshot for a given lang. `offset=0`
 * prefers today's UTC row via `getTopSummaryLiveLatest`, then falls
 * back to the newest row when today's cron hasn't run yet.
 *
 * Shape is intentionally close to the legacy POST route's
 * `SummaryResponse` so the existing `<SummaryBox>` component can
 * render it directly. Two extra fields surface the snapshot identity:
 *  - `summaryDate`: the YYYY-MM-DD key the cron used.
 *  - `generatedAt`: ISO timestamp of the row write — drives the
 *    « Generated on … » sub-label in the UI.
 *
 * 404 when the table has no row yet (first deploy before any cron
 * tick). The page renders an empty state in that case.
 */

// v2.8.1+ — Force dynamic execution and no-store CDN headers. Netlify
// production has shown path-level CDN reuse on this route when
// `s-maxage` was set: requests for `?offset=1` returned the same
// payload as `?offset=0` (cache key ignored the query string), which
// broke the « previous podcast » arrows on the home Top 24h hero —
// the user could click `›` but always landed back on today's snapshot.
// Same fix pattern already documented in
// `/api/video-pages/recent/route.ts`. Per-request DB cost is tiny
// (single indexed `.range(0,1)` query) so caching is not worth the
// production breakage.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function parseLang(raw: string | null): Lang {
  return raw === "fr" ? "fr" : "en";
}

function parseOffset(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(366, Math.floor(n));
}

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  const offset = parseOffset(request.nextUrl.searchParams.get("offset"));

  const { snapshot, hasOlder } =
    offset === 0
      ? await getTopSummaryLiveLatest(lang)
      : await getTopSummaryByOffset(lang, offset);
  if (!snapshot) {
    return NextResponse.json(
      { error: "No top summary available yet" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const bulletRows = await getTopSummaryBulletsByDate(lang, snapshot.summary_date);
  // Strip the **Title** prefix re-injected at write time so the
  // `bullet.text` matches the raw LLM body. SummaryBox renders the
  // title separately from a dedicated `bullet.title` prop.
  // `importanceScore` (mig. 026+) is propagated as-is — same value
  // across every bullet of a same-`title` run, so the renderer can
  // read it from the first bullet of each rendered group.
  const bullets = bulletRows.map((b) => {
    // Permissive trailing-whitespace match so we catch both the
    // canonical `**Title**\n\nbody` separator the cron writes and
    // any space-only variant. Prior regex required at least one `\n`,
    // which silently failed when an LLM emitted `**Title** body` on
    // a single line (the bolded prefix then leaked into the rendered
    // body alongside the dedicated title heading above it).
    const text = b.title
      ? b.text.replace(new RegExp(`^\\*\\*${escapeRegExp(b.title)}\\*\\*[\\s\\n]*`), "").trim()
      : b.text.trim();
    return {
      text,
      title: b.title,
      refs: b.refs ?? [],
      importanceScore: b.importance_score,
      // « Top videos of yesterday » bullets pinned at the head of the
      // Daily Podcast — the UI hoists these groups first and renders a
      // VIDEO badge; their single ref deep-links to the SSR video page.
      isVideo: b.video_transcription_id !== null,
    };
  });

  const rawArticles = (snapshot.articles ?? []) as TopSummaryArticle[];
  const linksNeedingImage = rawArticles
    .filter((a) => !a.imageUrl)
    .map((a) => a.link);
  const imageByLink =
    linksNeedingImage.length > 0
      ? await getArticleImageUrlsByLinks(linksNeedingImage)
      : new Map<string, string>();

  const articles = rawArticles.map((a) => ({
    title: a.title,
    link: a.link,
    source: a.source,
    pubDate: a.pubDate,
    snippet: a.snippet,
    topic: a.topic,
    score: a.score ?? null,
    imageUrl: a.imageUrl ?? imageByLink.get(a.link) ?? null,
  }));

  return NextResponse.json(
    {
      summary: snapshot.summary_md,
      bullets,
      articles,
      allArticles: [],
      period: { from: snapshot.generated_at, to: snapshot.generated_at },
      meta: {
        totalArticles: articles.length,
        scoredArticles: articles.length,
        analyzedArticles: articles.length,
      },
      summaryDate: snapshot.summary_date,
      generatedAt: snapshot.generated_at,
      model: snapshot.model,
      offset,
      hasOlder,
    },
    { headers: NO_STORE_HEADERS },
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
