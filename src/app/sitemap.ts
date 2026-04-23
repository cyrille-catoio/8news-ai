import type { MetadataRoute } from "next";
import {
  getAllSummaryRoutes,
  getAllVideoPageRoutes,
  getAllVideoRoundupRoutes,
  getActiveTopicIds,
} from "@/lib/supabase";

const BASE = "https://8news.ai";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  entries.push({
    url: BASE,
    lastModified: new Date(),
    changeFrequency: "hourly",
    priority: 1,
  });

  // Public hub for video briefings — drives crawl into the /r/ pages.
  entries.push({
    url: `${BASE}/briefings`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.9,
  });

  // Four parallel queries: active topic ids (for /{topic} hubs), the
  // last 90 days of article daily summaries, the last 90 days of
  // per-video SSR pages, and the last 90 days of per-topic-day video
  // roundups. All summary sources are capped to ~9k URLs total to stay
  // under Google's 50k-per-file sitemap limit — older content is still
  // served and reachable via internal links.
  const [topicIds, summaryRoutes, videoRoutes, roundupRoutes] = await Promise.all([
    getActiveTopicIds(),
    getAllSummaryRoutes(),
    getAllVideoPageRoutes(),
    getAllVideoRoundupRoutes(),
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
      url: `${BASE}/${r.topic_id}/${r.summary_date}/${r.slug_keywords}`,
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

  return entries;
}
