import { NextRequest, NextResponse } from "next/server";
import { getAllArticlesFromDb } from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";
import type { ArticleSummary } from "@/lib/types";

const MAX_ALL_ARTICLES = 1000;

function toArticleSummary(
  r: { title: string; link: string; source: string; pub_date: string; snippet: string | null; content: string | null; snippet_ai_en?: string | null; snippet_ai_fr?: string | null; relevance_score?: number | null },
  lang: Lang,
): ArticleSummary & { score: number | null } {
  const aiSnippet = lang === "fr" ? r.snippet_ai_fr : r.snippet_ai_en;
  return {
    title: r.title,
    link: r.link,
    source: r.source,
    pubDate: r.pub_date,
    snippet: aiSnippet || (r.snippet || r.content || "").slice(0, 300),
    score: r.relevance_score ?? null,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const topic = params.get("topic");
  const since = params.get("since");
  const lang: Lang = params.get("lang") === "fr" ? "fr" : "en";

  if (!topic || !since) {
    return NextResponse.json({ error: "Missing topic or since" }, { status: 400 });
  }

  const rows = await getAllArticlesFromDb(topic, since, MAX_ALL_ARTICLES);

  const articles = rows.map((r) => toArticleSummary(r, lang));

  return NextResponse.json({ articles, total: articles.length }, {
    headers: { "Cache-Control": "no-store" },
  });
}
