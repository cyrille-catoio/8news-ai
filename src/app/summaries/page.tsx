import { permanentRedirect } from "next/navigation";

/**
 * Legacy /summaries hub — superseded by /archives in v2.7.0.
 *
 * Permanent (308) redirect to the unified hub. Preserves the `lang`
 * query param so a deep link like `/summaries?lang=fr` lands on
 * `/archives?lang=fr` instead of the default. SEO authority transfers
 * with the 308 status and Google consolidates onto /archives.
 *
 * Per-item article SSR pages (`/en|fr/[topic]/[date]/[slug]`) are
 * untouched — only the hub itself moved.
 */

export default async function LegacySummariesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const target = lang ? `/archives?lang=${lang}` : "/archives";
  permanentRedirect(target);
}
