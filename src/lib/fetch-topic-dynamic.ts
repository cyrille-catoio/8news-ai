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

/** Shape of a Media RSS attribute-bearing tag (`<media:thumbnail url=… />`,
 *  `<media:content url=… type=… medium=…>`, etc.) once `rss-parser` has
 *  parsed it. The attribute bag sits under `$`; the optional text body
 *  (rare for media tags) lands in `_`. */
interface RssMediaTag {
  $?: { url?: string; type?: string; medium?: string; width?: string; height?: string };
  _?: string;
}

interface RssItunesImage {
  $?: { href?: string };
}

interface RssMediaGroup {
  "media:content"?: RssMediaTag | RssMediaTag[];
  "media:thumbnail"?: RssMediaTag | RssMediaTag[];
}

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  source?: RssSourceField;
  enclosure?: { url?: string; type?: string };
  /** v2.6.15+ — Media RSS + iTunes namespaces, wired through the parser
   *  below as custom fields. Each is optional and may be absent on
   *  feeds that only ship one of the legacy patterns (`enclosure` or
   *  HTML `<img>`). */
  mediaThumbnail?: RssMediaTag | RssMediaTag[];
  mediaContent?: RssMediaTag | RssMediaTag[];
  mediaGroup?: RssMediaGroup;
  itunesImage?: RssItunesImage | string;
  /** `<content:encoded>` exposed as its own field so we can fall back
   *  on it independently of the `content` field, which `rss-parser`
   *  sometimes populates with the shorter `<description>` instead. */
  contentEncoded?: string;
}

const rssParser: Parser<Record<string, never>, RssItem> = new Parser({
  timeout: 5_000,
  customFields: {
    item: [
      ["source", "source"],
      // `keepArray: true` is critical for media:thumbnail / media:content
      // because mainstream feeds (Reuters, BBC, NYT, Engadget) ship
      // multiple resolutions per item — the default would silently drop
      // every variant except the last one.
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:group", "mediaGroup"],
      ["itunes:image", "itunesImage"],
      // `<content:encoded>` is the long-form CDATA HTML body. We keep
      // it as a separate field (rather than relying on rss-parser's
      // default merge into `content`) because some feeds put a short
      // text-only `<description>` in `content` and the richer body
      // — the one with `<img>` tags — only in `<content:encoded>`.
      ["content:encoded", "contentEncoded"],
    ],
  },
});
const FETCH_TIMEOUT_MS = 5_000;
const GOOGLE_NEWS_BATCH_TIMEOUT_MS = 2_000;
const GOOGLE_NEWS_BATCH_ENDPOINT =
  "https://news.google.com/_/DotsSplashUi/data/batchexecute";

interface GoogleNewsDecodeParams {
  signature: string;
  timestamp: string;
}

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

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Accept `https?://` and protocol-relative `//host/path` (rewrite to
 *  https). Reject `data:`, `blob:`, relative paths and empty strings. */
function normalizeImageUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const url = raw.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return null;
}

/** Best-effort RSS artwork extraction. Tries every common pattern in
 *  preference order so we don't have to second-guess each publisher's
 *  feed format:
 *
 *   1. `<media:content medium="image" url="…">` — Media RSS, the
 *      modern standard. Preferred because the publisher explicitly
 *      tags it as the article hero.
 *   2. `<media:thumbnail url="…">` — same namespace, often used by
 *      Yahoo / BBC / NYT / Reuters / Engadget alongside or instead
 *      of media:content.
 *   3. `<media:group>` wrapper containing the above (Google News).
 *   4. `<enclosure url="…" type="image/…">` — RSS 2.0 legacy. Many
 *      WordPress feeds still rely exclusively on this.
 *   5. `<itunes:image href="…">` — podcast namespace but sometimes
 *      crossed over on cross-posted content.
 *   6. First `<img src="…">` inside `<content:encoded>` (CDATA body).
 *   7. First `<img src="…">` inside `<description>` (`content` field).
 *
 *  Returns `null` when none of the patterns yields a parseable URL —
 *  consumers should fall back to the generic source / favicon they
 *  already use today. */
function extractRssImageUrl(item: RssItem): string | null {
  // 1. media:content — pick the first explicitly-image one. We also
  //    accept untagged entries (`!medium && !type`) because some
  //    publishers ship raw media:content without any classifier.
  for (const mc of ensureArray(item.mediaContent)) {
    const url = normalizeImageUrl(mc?.$?.url);
    if (!url) continue;
    const medium = (mc?.$?.medium ?? "").toLowerCase();
    const type = (mc?.$?.type ?? "").toLowerCase();
    if (medium === "image" || type.startsWith("image/") || (!medium && !type)) {
      return url;
    }
  }

  // 2. media:thumbnail — pure preview tag, always implicitly an image.
  for (const mt of ensureArray(item.mediaThumbnail)) {
    const url = normalizeImageUrl(mt?.$?.url);
    if (url) return url;
  }

  // 3. media:group — Google News and a handful of others wrap their
  //    media:thumbnail / media:content inside a group element.
  const group = item.mediaGroup;
  if (group) {
    for (const mc of ensureArray(group["media:content"])) {
      const url = normalizeImageUrl(mc?.$?.url);
      if (!url) continue;
      const medium = (mc?.$?.medium ?? "").toLowerCase();
      const type = (mc?.$?.type ?? "").toLowerCase();
      if (medium === "image" || type.startsWith("image/") || (!medium && !type)) {
        return url;
      }
    }
    for (const mt of ensureArray(group["media:thumbnail"])) {
      const url = normalizeImageUrl(mt?.$?.url);
      if (url) return url;
    }
  }

  // 4. enclosure — accept when the type is image/* or completely absent
  //    (WordPress and similar drop the type attribute frequently).
  const enclosureUrl = normalizeImageUrl(item.enclosure?.url);
  if (enclosureUrl) {
    const type = (item.enclosure?.type ?? "").toLowerCase();
    if (!type || type.startsWith("image/")) return enclosureUrl;
  }

  // 5. itunes:image — `<itunes:image href="…">` for attribute form,
  //    plain string when the feed inlines the URL as element text.
  const itunes = item.itunesImage;
  if (itunes) {
    const url = typeof itunes === "string"
      ? normalizeImageUrl(itunes)
      : normalizeImageUrl(itunes.$?.href);
    if (url) return url;
  }

  // 6-7. HTML body fallback — try the long-form `content:encoded`
  //      first (richest), then the shorter `content` field.
  for (const html of [item.contentEncoded, item.content]) {
    if (!html) continue;
    const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
    const url = normalizeImageUrl(match?.[1]);
    if (url) return url;
  }

  return null;
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

function getHtmlAttribute(tag: string, attribute: string): string | null {
  const pattern = new RegExp(`${attribute}="([^"]+)"`);
  return tag.match(pattern)?.[1] ?? null;
}

async function fetchGoogleNewsDecodeParams(articleId: string): Promise<GoogleNewsDecodeParams | null> {
  for (const prefix of ["https://news.google.com/articles/", "https://news.google.com/rss/articles/"]) {
    const response = await fetch(`${prefix}${articleId}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(GOOGLE_NEWS_BATCH_TIMEOUT_MS),
    });
    const html = await response.text();
    const dataTag = html.match(/<div[^>]+jscontroller="[^"]+"[^>]*data-n-a-sg="[^"]+"[^>]*>/)?.[0];
    if (!dataTag) continue;

    const signature = getHtmlAttribute(dataTag, "data-n-a-sg");
    const timestamp = getHtmlAttribute(dataTag, "data-n-a-ts");
    if (signature && timestamp) return { signature, timestamp };
  }

  return null;
}

async function fetchDecodedGoogleNewsUrl(articleId: string): Promise<string | null> {
  const params = await fetchGoogleNewsDecodeParams(articleId);
  if (!params) return null;

  const rpcPayload = [
    "Fbv4je",
    JSON.stringify([
      "garturlreq",
      [
        ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
        "X",
        "X",
        1,
        [1, 1, 1],
        1,
        1,
        null,
        0,
        0,
        null,
        0,
      ],
      articleId,
      Number(params.timestamp),
      params.signature,
    ]),
  ];

  const response = await fetch(GOOGLE_NEWS_BATCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Mozilla/5.0",
    },
    body: `f.req=${encodeURIComponent(JSON.stringify([[rpcPayload]]))}`,
    signal: AbortSignal.timeout(GOOGLE_NEWS_BATCH_TIMEOUT_MS),
  });
  const text = await response.text();
  const payloadText = text.split("\n\n", 2)[1];
  if (!payloadText) return null;

  const parsed = JSON.parse(payloadText) as unknown[];
  const responsePayload = Array.isArray(parsed[0]) ? parsed[0][2] : null;
  if (typeof responsePayload !== "string") return null;

  const decodedPayload = JSON.parse(responsePayload) as unknown[];
  const decodedUrl = typeof decodedPayload[1] === "string" ? decodedPayload[1] : null;
  return decodedUrl && /^https?:\/\//i.test(decodedUrl) ? decodedUrl : null;
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
        const imageUrl = extractRssImageUrl(item);

        articles.push({
          topic: topicId,
          source: sourceName,
          title: decodeHtmlEntities(item.title ?? ""),
          link,
          pub_date: new Date(ms).toISOString(),
          content: rawContent.slice(0, SNIPPET_MAX),
          snippet: rawSnippet.slice(0, SNIPPET_MAX),
          fetched_at: fetchedAt,
          image_url: imageUrl,
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
