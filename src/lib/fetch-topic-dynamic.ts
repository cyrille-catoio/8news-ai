import Parser from "rss-parser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeHtmlEntities } from "@/lib/html";
import type { ParsedArticle } from "@/lib/types";

const rssParser = new Parser({ timeout: 5_000 });
const FETCH_TIMEOUT_MS = 5_000;
const SNIPPET_MAX = 600;

export interface FetchResult {
  summary: string;
  inserted: number;
  feedsOk: number;
  feedsFailed: number;
  totalParsed: number;
  duplicatesSkipped: number;
}

export type FetchTopicOptions = {
  /** RSS fetch User-Agent (default matches cron). */
  userAgent?: string;
};

function emptyMetrics(
  summary: string,
  partial?: Pick<FetchResult, "feedsOk" | "feedsFailed">,
): FetchResult {
  return {
    summary,
    inserted: 0,
    feedsOk: partial?.feedsOk ?? 0,
    feedsFailed: partial?.feedsFailed ?? 0,
    totalParsed: 0,
    duplicatesSkipped: 0,
  };
}

async function fetchFeedsAndStore(
  topicId: string,
  feeds: { name: string; url: string }[],
  supabase: SupabaseClient,
  userAgent: string,
): Promise<FetchResult> {
  const articles: ParsedArticle[] = [];
  let feedsOk = 0;
  let feedsFailed = 0;

  const fetchedAt = new Date().toISOString();

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const xml = await fetch(feed.url, {
        headers: { "User-Agent": userAgent },
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
          topic: topicId,
          source: feed.name,
          title: decodeHtmlEntities(item.title ?? ""),
          link: item.link ?? "",
          pub_date: new Date(ms).toISOString(),
          content: rawContent.slice(0, SNIPPET_MAX),
          snippet: rawSnippet.slice(0, SNIPPET_MAX),
          fetched_at: fetchedAt,
        });
      }
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") feedsOk++;
    else feedsFailed++;
  }

  if (articles.length === 0) {
    return {
      summary: `[${topicId}] No articles found. Feeds OK: ${feedsOk}, failed: ${feedsFailed}`,
      inserted: 0,
      feedsOk,
      feedsFailed,
      totalParsed: 0,
      duplicatesSkipped: 0,
    };
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
      console.error(`[${topicId}] Supabase batch error:`, error.message);
      continue;
    }
    inserted += data?.length ?? 0;
  }

  const duplicatesSkipped = articles.length - inserted;

  const summary = `[${topicId}] Done. Feeds OK: ${feedsOk}, failed: ${feedsFailed}. Articles: ${articles.length} parsed, ${inserted} inserted, ${duplicatesSkipped} duplicates skipped.`;
  console.log(summary);
  return {
    summary,
    inserted,
    feedsOk,
    feedsFailed,
    totalParsed: articles.length,
    duplicatesSkipped,
  };
}

/**
 * Reads active feeds from DB for the topic, fetches RSS, upserts articles.
 * Used by Netlify cron and GET /api/fetch-feeds.
 */
export async function fetchAndStoreTopicDynamic(
  topicId: string,
  supabase: SupabaseClient,
  options?: FetchTopicOptions,
): Promise<FetchResult> {
  const userAgent = options?.userAgent ?? "8news-cron/1.0";

  const { data: feeds, error } = await supabase
    .from("feeds")
    .select("name, url")
    .eq("topic_id", topicId)
    .eq("is_active", true);

  if (error) {
    console.error(`[${topicId}] Failed to load feeds:`, error.message);
    return emptyMetrics(`[${topicId}] Failed to load feeds: ${error.message}`);
  }

  if (!feeds || feeds.length === 0) {
    return emptyMetrics(`[${topicId}] No active feeds`);
  }

  return fetchFeedsAndStore(topicId, feeds, supabase, userAgent);
}
