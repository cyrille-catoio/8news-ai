import { NextRequest, NextResponse } from "next/server";
import { getTopArticlesForStats, getHiddenTopicIds, getTopArticlesForTopics, type TopArticleRow } from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";

const SNIPPET_MAX = 600;

function parseLang(raw: string | null): Lang {
  return raw === "fr" ? "fr" : "en";
}

function topArticleSnippet(r: TopArticleRow, lang: Lang): string {
  const aiSnippet = lang === "fr" ? r.snippet_ai_fr : r.snippet_ai_en;
  const base = (aiSnippet || r.snippet || r.content || "").trim();
  return base.slice(0, SNIPPET_MAX);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, parseInt(params.get("limit") ?? "50", 10) || 50));
  const days = Math.max(0, parseFloat(params.get("days") ?? "1") || 1);
  const lang = parseLang(params.get("lang"));

  // Optional: comma-separated topic IDs from user's personalized list.
  // If present and non-empty, fetch only those topics (no exclusion list needed).
  const topicsParam = params.get("topics");
  const includeTopics = topicsParam
    ? topicsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  let rows: TopArticleRow[];
  if (includeTopics && includeTopics.length > 0) {
    rows = await getTopArticlesForTopics(includeTopics, days, limit);
  } else {
    const hiddenIds = await getHiddenTopicIds();
    rows = await getTopArticlesForStats(null, days, limit, hiddenIds.length > 0 ? hiddenIds : undefined);
  }

  const articles = rows.map((r) => ({
    title: r.title,
    snippet: topArticleSnippet(r, lang),
    link: r.link,
    source: r.source,
    topic: r.topic,
    pubDate: r.pub_date,
    score: r.relevance_score,
  }));

  return NextResponse.json({ articles }, {
    headers: { "Cache-Control": "no-store" },
  });
}
