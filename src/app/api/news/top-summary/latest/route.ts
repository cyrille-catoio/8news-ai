import { NextRequest, NextResponse } from "next/server";
import {
  getArticleImageUrlsByLinks,
  getTopSummaryByOffset,
  getTopSummaryBulletsByDate,
  type TopSummaryArticle,
} from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";

/**
 * Read endpoint backing the new `/top-articles` UX. Returns the
 * latest available pre-computed Top articles snapshot for a given
 * lang (transparent fallback to the previous day if today's cron
 * hasn't run yet, no client-side coordination needed).
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

function parseLang(raw: string | null): Lang {
  return raw === "fr" ? "fr" : "en";
}

function parseOffset(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  const offset = parseOffset(request.nextUrl.searchParams.get("offset"));

  const { snapshot, hasOlder } = await getTopSummaryByOffset(lang, offset);
  if (!snapshot) {
    return NextResponse.json(
      { error: "No top summary available yet" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
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
    {
      headers: {
        // The cron writes once a day; a 60 s edge cache + 5 min CDN
        // cache is plenty and avoids hammering Supabase on bursty
        // traffic without ever serving stale-after-cron output for
        // more than 5 min.
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    },
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
