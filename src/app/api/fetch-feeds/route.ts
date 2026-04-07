import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchAndStoreTopicDynamic } from "@/lib/fetch-topic-dynamic";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const secret = params.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const topicParam = params.get("topic");
  if (!topicParam) {
    return NextResponse.json({ error: "Missing topic parameter" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const result = await fetchAndStoreTopicDynamic(topicParam, supabase, {
    userAgent: "8news-test/1.0",
  });

  if (result.summary.includes("Failed to load feeds") || result.summary.includes("No active feeds")) {
    return NextResponse.json({ error: "Invalid topic or no active feeds" }, { status: 400 });
  }

  if (result.totalParsed === 0) {
    return NextResponse.json({
      status: "empty",
      topic: topicParam,
      feedsOk: result.feedsOk,
      feedsFailed: result.feedsFailed,
      message: "No articles found",
    });
  }

  return NextResponse.json({
    status: "ok",
    topic: topicParam,
    feedsOk: result.feedsOk,
    feedsFailed: result.feedsFailed,
    totalParsed: result.totalParsed,
    inserted: result.inserted,
    duplicatesSkipped: result.duplicatesSkipped,
  });
}
