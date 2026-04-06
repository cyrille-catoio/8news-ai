import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import { decodeHtmlEntities } from "@/lib/html";
import type { ParsedArticle } from "@/lib/types";

export const maxDuration = 60;
const rssParser = new Parser({ timeout: 5_000 });
const FETCH_TIMEOUT_MS = 5_000;
const SNIPPET_MAX = 600;

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

  const { data: dbFeeds, error: feedError } = await supabase
    .from("feeds")
    .select("name, url")
    .eq("topic_id", topicParam)
    .eq("is_active", true);

  if (feedError || !dbFeeds || dbFeeds.length === 0) {
    return NextResponse.json({ error: "Invalid topic or no active feeds" }, { status: 400 });
  }

  const feeds = dbFeeds as { name: string; url: string }[];

  const articles: ParsedArticle[] = [];
  let feedsOk = 0;
  let feedsFailed = 0;

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const xml = await fetch(feed.url, {
        headers: { "User-Agent": "8news-test/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).then((r) => r.text());

      const parsed = await rssParser.parseString(xml);

      for (const item of parsed.items ?? []) {
        const pubDate = item.pubDate ?? item.isoDate ?? "";
        if (!pubDate) continue;
        const ms = new Date(pubDate).getTime();
        if (Number.isNaN(ms)) continue;

        articles.push({
          topic: topicParam,
          source: feed.name,
          title: decodeHtmlEntities(item.title ?? ""),
          link: item.link ?? "",
          pub_date: new Date(ms).toISOString(),
          content: decodeHtmlEntities(item.content ?? "").slice(0, SNIPPET_MAX),
          snippet: decodeHtmlEntities(item.contentSnippet ?? "").slice(0, SNIPPET_MAX),
          fetched_at: new Date().toISOString(),
        });
      }
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") feedsOk++;
    else feedsFailed++;
  }

  if (articles.length === 0) {
    return NextResponse.json({
      status: "empty",
      feedsOk,
      feedsFailed,
      message: "No articles found",
    });
  }

  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("articles")
      .upsert(batch, { onConflict: "link", ignoreDuplicates: true })
      .select("id");

    if (error) {
      return NextResponse.json({ error: `Supabase error: ${error.message}` }, { status: 500 });
    }
    inserted += data?.length ?? 0;
  }

  return NextResponse.json({
    status: "ok",
    topic: topicParam,
    feedsOk,
    feedsFailed,
    totalParsed: articles.length,
    inserted,
    duplicatesSkipped: articles.length - inserted,
  });
}
