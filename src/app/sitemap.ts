import type { MetadataRoute } from "next";
import { getAllSummaryRoutes, getActiveTopicIds } from "@/lib/supabase";

const BASE = "https://8news.ai";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  entries.push({
    url: BASE,
    lastModified: new Date(),
    changeFrequency: "hourly",
    priority: 1,
  });

  const [topicIds, routes] = await Promise.all([
    getActiveTopicIds(),
    getAllSummaryRoutes(),
  ]);

  for (const id of topicIds) {
    entries.push({
      url: `${BASE}/${id}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    });
  }

  for (const r of routes) {
    entries.push({
      url: `${BASE}/${r.topic_id}/${r.summary_date}/${r.slug_keywords}`,
      lastModified: new Date(r.summary_date),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return entries;
}
