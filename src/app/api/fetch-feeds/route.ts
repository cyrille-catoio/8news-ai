import { NextRequest, NextResponse } from "next/server";
import { fetchAndStoreTopicDynamic } from "@/lib/fetch-topic-dynamic";
import { getServerClient } from "@/lib/supabase";

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

  const supabaseP = getServerClient();
  if (!supabaseP) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const supabase = await supabaseP;

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
