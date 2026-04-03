import { NextRequest, NextResponse } from "next/server";
import { getTopArticlesForStats } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, parseInt(params.get("limit") ?? "20", 10) || 20));
  const days = Math.max(0, parseFloat(params.get("days") ?? "1") || 1);

  const rows = await getTopArticlesForStats(null, days, limit);

  const articles = rows.map((r) => ({
    title: r.title,
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
