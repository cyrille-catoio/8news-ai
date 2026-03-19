import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import { getFeedsForTopic } from "../../../src/lib/rss-feeds";
import { decodeHtmlEntities } from "../../../src/lib/html";
import type { Topic } from "../../../src/lib/types";

const rssParser = new Parser({ timeout: 5_000 });
const FETCH_TIMEOUT_MS = 5_000;
const SNIPPET_MAX = 600;

interface ParsedArticle {
  topic: string;
  source: string;
  title: string;
  link: string;
  pub_date: string;
  content: string;
  snippet: string;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function fetchAndStoreTopic(topic: Topic): Promise<string> {
  const feeds = getFeedsForTopic(topic);
  const articles: ParsedArticle[] = [];
  let feedsOk = 0;
  let feedsFailed = 0;

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const xml = await fetch(feed.url, {
        headers: { "User-Agent": "8news-cron/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).then((r) => r.text());

      const parsed = await rssParser.parseString(xml);

      for (const item of parsed.items ?? []) {
        const pubDate = item.pubDate ?? item.isoDate ?? "";
        if (!pubDate) continue;
        const ms = new Date(pubDate).getTime();
        if (Number.isNaN(ms)) continue;

        const rawContent = decodeHtmlEntities(item.content ?? "");
        const rawSnippet = decodeHtmlEntities(item.contentSnippet ?? "");

        articles.push({
          topic,
          source: feed.name,
          title: decodeHtmlEntities(item.title ?? ""),
          link: item.link ?? "",
          pub_date: new Date(ms).toISOString(),
          content: rawContent.slice(0, SNIPPET_MAX),
          snippet: rawSnippet.slice(0, SNIPPET_MAX),
        });
      }
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") feedsOk++;
    else feedsFailed++;
  }

  if (articles.length === 0) {
    return `[${topic}] No articles found. Feeds OK: ${feedsOk}, failed: ${feedsFailed}`;
  }

  const supabase = getSupabase();

  const BATCH_SIZE = 100;
  let inserted = 0;
  let duplicates = 0;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("articles")
      .upsert(batch, { onConflict: "link", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error(`[${topic}] Supabase batch error:`, error.message);
      continue;
    }
    inserted += data?.length ?? 0;
  }

  duplicates = articles.length - inserted;

  const summary = `[${topic}] Done. Feeds OK: ${feedsOk}, failed: ${feedsFailed}. Articles: ${articles.length} parsed, ${inserted} inserted, ${duplicates} duplicates skipped.`;
  console.log(summary);
  return summary;
}
