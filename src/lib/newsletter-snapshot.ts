import {
  getTopSummaryByDate,
  getTopSummaryBulletsByDate,
  type TopSummaryRow,
  type TopSummaryBulletRow,
} from "@/lib/supabase/top-summaries";
import type { Lang } from "@/lib/i18n";
import { todayUtc } from "@/lib/dates-utc";

export { todayUtc };

export type NewsletterSnapshotBundle = {
  snapshot: TopSummaryRow;
  bullets: TopSummaryBulletRow[];
};

/**
 * Snapshot used for the daily newsletter. Unlike the website read path
 * (`getLatestTopSummary`), we never fall back to an older edition: that
 * would re-send yesterday's brief to subscribers who already received it.
 */
export async function getNewsletterSnapshotForLang(
  lang: Lang,
  summaryDate: string = todayUtc(),
): Promise<NewsletterSnapshotBundle | null> {
  const snapshot = await getTopSummaryByDate(lang, summaryDate);
  if (!snapshot) return null;
  const bullets = await getTopSummaryBulletsByDate(lang, summaryDate);
  if (bullets.length === 0) return null;
  return { snapshot, bullets };
}
