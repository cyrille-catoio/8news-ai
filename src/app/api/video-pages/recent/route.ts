import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/video-pages/recent?days=7&lang=fr
 *
 * Returns every transcribed video that has a slug + topic_id (i.e. an
 * SSR page at `/{topic_id}/v/{published_date}/{slug_keywords}`)
 * published in the last `days` days, in the requested `lang`. Ordered
 * published_date DESC, created_at DESC.
 *
 * Powers the "Toutes les vidéos transcrites · 7 derniers jours" block
 * at the bottom of the SPA Briefing homepage. Caps at 100 rows so the
 * payload stays small even on a busy week.
 */

interface VideoPageItem {
  videoId: string;
  title: string;
  topicId: string;
  publishedDate: string;
  slug: string;
  lang: string;
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  const daysParam = parseInt(req.nextUrl.searchParams.get("days") ?? "7", 10);
  const days = Math.min(30, Math.max(1, isNaN(daysParam) ? 7 : daysParam));
  const langParam = req.nextUrl.searchParams.get("lang");
  const lang = langParam === "fr" ? "fr" : "en";

  const sinceISO = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db
    .from("video_transcriptions")
    .select("video_id, title, topic_id, published_date, slug_keywords, lang, created_at")
    .eq("lang", lang)
    .gte("published_date", sinceISO)
    .not("topic_id", "is", null)
    .not("slug_keywords", "is", null)
    .order("published_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  const items: VideoPageItem[] = (data ?? []).map((r) => {
    const row = r as {
      video_id: string;
      title: string;
      topic_id: string;
      published_date: string;
      slug_keywords: string;
      lang: string;
    };
    return {
      videoId: row.video_id,
      title: row.title,
      topicId: row.topic_id,
      publishedDate: row.published_date,
      slug: row.slug_keywords,
      lang: row.lang,
    };
  });

  return NextResponse.json(items, {
    // Short edge cache: list refreshes whenever a new transcription
    // lands, but at most once a minute.
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
