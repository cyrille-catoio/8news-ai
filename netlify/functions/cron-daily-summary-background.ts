import { createClient } from "@supabase/supabase-js";

const WALL_MS = 840_000;
const BUDGET_MS = Number(process.env.DAILY_SUMMARY_BUDGET_MS ?? 810_000);
const SAFETY_MS = 15_000;

export default async () => {
  const startedAt = Date.now();
  const deadline = startedAt + Math.min(WALL_MS, BUDGET_MS);
  const remaining = () => deadline - Date.now();
  const lines: string[] = [];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: topics } = await supabase
    .from("topics")
    .select("id")
    .eq("is_active", true);

  if (!topics || topics.length === 0) {
    console.log("[cron-daily-summary] No active topics");
    return;
  }

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const t of topics) {
    if (remaining() <= SAFETY_MS) {
      lines.push(`[budget] stopping — remaining=${Math.max(0, remaining())}ms`);
      break;
    }

    for (const lang of ["en", "fr"] as const) {
      // Skip if already generated
      const { data: existing } = await supabase
        .from("daily_summaries")
        .select("id")
        .eq("topic_id", t.id)
        .eq("summary_date", yesterday)
        .eq("lang", lang)
        .single();

      if (existing) {
        skipped++;
        continue;
      }

      if (remaining() <= SAFETY_MS) break;

      try {
        // Dynamic import to use the lib that depends on @/lib paths
        const { generateDailySummary } = await import("../../src/lib/generate-daily-summary");
        const result = await generateDailySummary(t.id, yesterday, lang);
        if (result) {
          generated++;
          lines.push(`[ok] topic=${t.id} lang=${lang} slug=${result.slug} bullets=${result.bulletCount} articles=${result.articleCount}`);
        } else {
          lines.push(`[skip] topic=${t.id} lang=${lang} — no articles or generation failed`);
        }
      } catch (e) {
        errors++;
        lines.push(`[error] topic=${t.id} lang=${lang} — ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
  }

  lines.push(
    `[run] cron=daily-summary date=${yesterday} topics=${topics.length} generated=${generated} skipped=${skipped} errors=${errors} elapsed_ms=${Date.now() - startedAt}`,
  );
  console.log(lines.join("\n"));
};
