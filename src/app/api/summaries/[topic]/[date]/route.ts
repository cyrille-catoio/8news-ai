import { NextRequest, NextResponse } from "next/server";
import { getDailySummary } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ topic: string; date: string }> },
) {
  const { topic, date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const lang = req.nextUrl.searchParams.get("lang") === "fr" ? "fr" : "en";

  const summary = await getDailySummary(topic, date, lang);
  if (!summary) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: summary.id,
    topicId: summary.topic_id,
    date: summary.summary_date,
    lang: summary.lang,
    slug: summary.slug_keywords,
    bullets: summary.bullets,
    articles: summary.articles,
    meta: summary.meta,
    seoTitle: summary.seo_title,
    seoDescription: summary.seo_description,
    seoH1: summary.seo_h1,
    periodFrom: summary.period_from,
    periodTo: summary.period_to,
  }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
