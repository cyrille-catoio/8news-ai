import type { MiniArticle } from "./YourTopicsSection";

/**
 * Selection logic for the « Vos topics · 24 dernières heures » strips.
 *
 * The naive version (first 4 preferred topics, hide empty blocks) made
 * the section shrink to 2-3 blocks whenever a preferred topic had no
 * article ≥ min-score in the last 24 h, or lost all its articles to the
 * cross-topic dedup. The owner wants a stable 4 blocks, picked
 * intelligently rather than dropped:
 *
 *  1. Preferred topics are considered in the user's priority order —
 *     ALL of them, not just the first 4 — and claim slots first.
 *  2. If fewer than `maxStrips` blocks survive, fill candidates (the
 *     site's other topics) take the remaining slots, ranked by the
 *     quality of their content: best article score desc, then most
 *     recent top article.
 *  3. Cross-topic dedup by `link` is first-selected-wins, same
 *     rationale as before: an article that scores on several topics
 *     stays in the topic the user prioritized highest.
 *
 * Pure function — covered by vitest in `__tests__/select-topic-strips.test.ts`.
 */

export const MAX_TOPIC_STRIPS = 4;
export const ARTICLES_PER_STRIP = 3;

/** Best article score of a strip candidate (null scores sink to 0). */
function bestScore(articles: MiniArticle[]): number {
  return articles.reduce((m, a) => Math.max(m, a.score ?? 0), 0);
}

/** Most recent pubDate (ms) of a strip candidate, for tie-breaks. */
function mostRecent(articles: MiniArticle[]): number {
  return articles.reduce((m, a) => {
    const ts = new Date(a.pubDate).getTime();
    return Number.isFinite(ts) ? Math.max(m, ts) : m;
  }, 0);
}

export function selectTopicStrips({
  preferredIds,
  fillIds = [],
  articlesByTopic,
  maxStrips = MAX_TOPIC_STRIPS,
  perStrip = ARTICLES_PER_STRIP,
}: {
  /** User's preferred topic ids, in their priority order. */
  preferredIds: string[];
  /** Non-preferred candidate ids used to fill remaining slots. */
  fillIds?: string[];
  /** Fetched articles per topic id (each already capped server-side). */
  articlesByTopic: Record<string, MiniArticle[]>;
  maxStrips?: number;
  perStrip?: number;
}): Record<string, MiniArticle[]> {
  const preferredSet = new Set(preferredIds);
  const sortedFill = fillIds
    .filter((id) => !preferredSet.has(id))
    .sort((a, b) => {
      const A = articlesByTopic[a] ?? [];
      const B = articlesByTopic[b] ?? [];
      return bestScore(B) - bestScore(A) || mostRecent(B) - mostRecent(A);
    });

  const candidateOrder = [...new Set([...preferredIds, ...sortedFill])];

  const seen = new Set<string>();
  const out: Record<string, MiniArticle[]> = {};
  for (const id of candidateOrder) {
    if (Object.keys(out).length >= maxStrips) break;
    const unique = (articlesByTopic[id] ?? []).filter((a) => {
      if (!a.link || seen.has(a.link)) return false;
      return true;
    });
    if (unique.length === 0) continue;
    const kept = unique.slice(0, perStrip);
    // Claim links only for articles actually rendered, so an article
    // truncated out of one strip stays available to a later topic.
    for (const a of kept) seen.add(a.link);
    out[id] = kept;
  }
  return out;
}
