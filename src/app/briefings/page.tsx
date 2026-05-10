import { permanentRedirect } from "next/navigation";

/**
 * Legacy /briefings hub (video roundups) — superseded by the unified
 * /archives hub in v2.7.0.
 *
 * Permanent (308) redirect to /archives with `?type=videos` so the
 * default filter matches the visitor's intent (« I came here for
 * video roundups »). Preserves `lang` when present.
 *
 * Per-roundup SSR pages (`/[topic]/r/[date]/[slug]`) are untouched.
 */

export default async function LegacyBriefingsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const params = new URLSearchParams({ type: "videos" });
  if (lang) params.set("lang", lang);
  permanentRedirect(`/archives?${params.toString()}`);
}
