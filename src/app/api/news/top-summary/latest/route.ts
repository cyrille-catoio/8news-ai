import { NextRequest, NextResponse } from "next/server";
import {
  getLatestTopSummary,
  getTopSummaryBulletsByDate,
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

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));

  const snapshot = await getLatestTopSummary(lang);
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
  const bullets = bulletRows.map((b) => {
    const text = b.title
      ? b.text.replace(new RegExp(`^\\*\\*${escapeRegExp(b.title)}\\*\\*\\s*\\n+`), "").trim()
      : b.text.trim();
    return {
      text,
      title: b.title,
      refs: b.refs ?? [],
    };
  });

  const articles = (snapshot.articles ?? []).map((a) => ({
    title: a.title,
    link: a.link,
    source: a.source,
    pubDate: a.pubDate,
    snippet: a.snippet,
    topic: a.topic,
    score: a.score ?? null,
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
