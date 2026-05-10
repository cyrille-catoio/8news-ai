import type { MetadataRoute } from "next";
import {
  getAllSummaryRoutes,
  getAllTopSummaryRoutes,
  getAllVideoPageRoutes,
  getAllVideoRoundupRoutes,
  getActiveTopicIds,
} from "@/lib/supabase";
import { summaryAbsoluteUrl } from "@/lib/summary-routes";

const BASE = "https://8news.ai";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  entries.push({
    url: BASE,
    lastModified: new Date(),
    changeFrequency: "hourly",
    priority: 1,
  });

  // Unified archives hub (v2.7.0+) — supersedes the previously parallel
  // /summaries and /briefings hubs. Crawlers reach /archives, follow
  // links to per-topic per-day article summaries (`/en|fr/[topic]/[date]/[slug]`),
  // video roundups (`/[topic]/r/[date]/[slug]`), and per-day video
  // listings (`/[topic]/videos/[date]`). The two legacy hubs 308-redirect
  // here, so we don't list them in the sitemap to avoid Google
  // showing the redirected page.
  entries.push({
    url: `${BASE}/archives`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.9,
  });

  // Five parallel queries: active topic ids (for /{topic} hubs), the
  // last 90 days of article daily summaries, the last 90 days of
  // per-video SSR pages, the last 90 days of per-topic-day video
  // roundups, and (v2.7.1+) the last 90 days of cross-topic Top 24h
  // snapshots that mount at `/{YYYY-MM-DD}`. All summary sources are
  // capped by the SITEMAP_RECENT_DAYS window in supabase to stay
  // under Google's 50k-per-file sitemap limit — older content is
  // still served and reachable via internal links.
  const [topicIds, summaryRoutes, videoRoutes, roundupRoutes, topDayRoutes] =
    await Promise.all([
      getActiveTopicIds(),
      getAllSummaryRoutes(),
      getAllVideoPageRoutes(),
      getAllVideoRoundupRoutes(),
      getAllTopSummaryRoutes(),
    ]);

  for (const id of topicIds) {
    entries.push({
      url: `${BASE}/${id}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    });
  }

  for (const r of summaryRoutes) {
    entries.push({
      url: summaryAbsoluteUrl(r),
      lastModified: new Date(r.summary_date),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  for (const r of videoRoutes) {
    entries.push({
      url: `${BASE}/${r.topic_id}/v/${r.published_date}/${r.slug_keywords}`,
      lastModified: new Date(r.published_date),
      // Video pages don't change after creation — the embed still plays
      // the same YT video and the AI summary stays as written.
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  for (const r of roundupRoutes) {
    entries.push({
      url: `${BASE}/${r.topic_id}/r/${r.roundup_date}/${r.slug_keywords}`,
      lastModified: new Date(r.roundup_date),
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  // Cross-topic Top 24h archive at `/{YYYY-MM-DD}`. One entry per
  // (date, lang) — the same date in EN and FR has different content
  // so they're separate canonical URLs.
  for (const r of topDayRoutes) {
    entries.push({
      url: `${BASE}/${r.summary_date}?lang=${r.lang}`,
      lastModified: new Date(r.summary_date),
      // Snapshots are immutable once the cron has written them — the
      // articles, bullets and md are all frozen.
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  return entries;
}
