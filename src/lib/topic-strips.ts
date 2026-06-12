import type { Lang } from "@/lib/i18n";
import type { TopicStripRow } from "@/lib/supabase/articles";

/**
 * Pure regrouping logic behind `GET /api/news/strips` (home « Vos
 * topics » section). The Supabase batch read
 * (`getScoredArticlesForTopics`) returns one flat list of scored
 * articles across every candidate topic, globally sorted by
 * relevance_score desc then recency; this helper splits it back into
 * per-topic strips capped at `perTopic` entries, with the title
 * localized from the scoring pipeline's AI translations
 * (`title_ai_fr` / `title_ai_en`, migration 019) and a fallback on the
 * raw feed title for legacy rows.
 *
 * The output shape matches the SPA's `MiniArticle` (YourTopicsSection)
 * so `selectTopicStrips()` consumes it unchanged.
 */

export interface StripArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  score: number | null;
}

export function groupArticlesByTopic(
  rows: TopicStripRow[],
  perTopic: number,
  lang: Lang,
): Record<string, StripArticle[]> {
  const out: Record<string, StripArticle[]> = {};
  for (const row of rows) {
    const strip = (out[row.topic] ??= []);
    if (strip.length >= perTopic) continue;
    const aiTitle = lang === "fr" ? row.title_ai_fr : row.title_ai_en;
    strip.push({
      title: (aiTitle && aiTitle.trim()) || row.title,
      link: row.link,
      source: row.source,
      pubDate: row.pub_date,
      score: row.relevance_score,
    });
  }
  return out;
}
