import Parser from "rss-parser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeHtmlEntities } from "@/lib/html";
import type { ParsedArticle } from "@/lib/types";
import { SNIPPET_MAX } from "@/lib/constants";

type RssSourceField =
  | string
  | {
      _: string;
      $?: { url?: string };
    };

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  source?: RssSourceField;
}

const rssParser: Parser<Record<string, never>, RssItem> = new Parser({
  timeout: 5_000,
  customFields: {
    item: [["source", "source"]],
  },
});
const FETCH_TIMEOUT_MS = 5_000;
const GOOGLE_NEWS_BATCH_TIMEOUT_MS = 2_000;
const GOOGLE_NEWS_BATCH_ENDPOINT =
  "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je";

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

function extractSourceName(source: RssSourceField | undefined): string | null {
  if (!source) return null;
  if (typeof source === "string") return decodeHtmlEntities(source).trim() || null;
  return decodeHtmlEntities(source._ ?? "").trim() || null;
}

function extractSourceUrl(source: RssSourceField | undefined): string | null {
  if (!source || typeof source === "string") return null;
  const sourceUrl = source.$?.url?.trim();
  return sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null;
}

function hostLabel(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

function getGoogleNewsArticleId(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.hostname !== "news.google.com") return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const articleIndex = parts.lastIndexOf("articles");
    return articleIndex >= 0 ? parts[articleIndex + 1] ?? null : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function readVarint(bytes: Buffer, offset: number): { value: number; bytesRead: number } | null {
  let value = 0;
  let shift = 0;

  for (let i = offset; i < bytes.length; i++) {
    value |= (bytes[i] & 0x7f) << shift;
    if ((bytes[i] & 0x80) === 0) {
      return { value, bytesRead: i - offset + 1 };
    }
    shift += 7;
  }

  return null;
}

function decodeLegacyGoogleNewsUrl(articleId: string): string | null {
  const bytes = decodeBase64Url(articleId);
  const prefix = Buffer.from([0x08, 0x13, 0x22]);
  let offset = bytes.subarray(0, prefix.length).equals(prefix) ? prefix.length : 0;
  const length = readVarint(bytes, offset);
  if (!length) return null;

  offset += length.bytesRead;
  const end = offset + length.value;
  if (end > bytes.length) return null;

  const decoded = bytes.subarray(offset, end).toString("utf8");
  return /^https?:\/\//i.test(decoded) ? decoded : null;
}

async function fetchDecodedGoogleNewsUrl(articleId: string): Promise<string | null> {
  const requestPayload =
    '[[["Fbv4je","[\\"garturlreq\\",[[\\"en-US\\",\\"US\\",[\\"FINANCE_TOP_INDICES\\",\\"WEB_TEST_1_0_0\\"],null,null,1,1,\\"US:en\\",null,180,null,null,null,null,null,0,null,null,[1608992183,723341000]],\\"en-US\\",\\"US\\",1,[2,3,4,8],1,0,\\"655000234\\",0,0,null,0],\\"' +
    articleId +
    '\\"]",null,"generic"]]]';

  const response = await fetch(GOOGLE_NEWS_BATCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      Referer: "https://news.google.com/",
    },
    body: `f.req=${encodeURIComponent(requestPayload)}`,
    signal: AbortSignal.timeout(GOOGLE_NEWS_BATCH_TIMEOUT_MS),
  });
  const text = await response.text();
  const header = '[\\"garturlres\\",\\"';
  const start = text.indexOf(header);
  if (start < 0) return null;

  const rawUrlStart = start + header.length;
  const rawUrlEnd = text.indexOf('\\",', rawUrlStart);
  if (rawUrlEnd < 0) return null;

  const rawUrl = text.slice(rawUrlStart, rawUrlEnd);
  const decodedUrl = JSON.parse(`"${rawUrl}"`) as string;
  return /^https?:\/\//i.test(decodedUrl) ? decodedUrl : null;
}

async function resolveArticleLink(link: string): Promise<string> {
  const googleNewsArticleId = getGoogleNewsArticleId(link);
  if (!googleNewsArticleId) return link;

  const legacyUrl = decodeLegacyGoogleNewsUrl(googleNewsArticleId);
  if (legacyUrl) return legacyUrl;

  try {
    return (await fetchDecodedGoogleNewsUrl(googleNewsArticleId)) ?? link;
  } catch (error) {
    console.warn("[fetch-topic] Failed to decode Google News article URL:", error);
    return link;
  }
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

        const originalLink = item.link?.trim() ?? "";
        if (!originalLink) continue;
        const link = await resolveArticleLink(originalLink);
        const sourceUrl = extractSourceUrl(item.source);
        const sourceName = getGoogleNewsArticleId(originalLink)
          ? (extractSourceName(item.source) ?? (sourceUrl ? hostLabel(sourceUrl) : null) ?? feed.name)
          : feed.name;
        const rawContent = decodeHtmlEntities(item.content ?? "");
        const rawSnippet = decodeHtmlEntities(item.contentSnippet ?? "");

        articles.push({
          topic: topicId,
          source: sourceName,
          title: decodeHtmlEntities(item.title ?? ""),
          link,
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
