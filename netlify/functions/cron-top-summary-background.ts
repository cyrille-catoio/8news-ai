import {
  generateTopSummary,
  type GenerateTopSummaryResult,
  type GenerateTopSummaryStatus,
} from "../../src/lib/generate-top-summary";
import type { Lang } from "../../src/lib/i18n";

/**
 * Daily background function — pre-computes the editorial Top articles
 * AI summary for both langs and persists a frozen snapshot in
 * `top_summaries` (article list + rendered markdown), with the
 * per-bullet detail mirrored into `summary_bullets`.
 *
 * Why a cron instead of on-demand: the previous /top-articles flow
 * spent OpenAI tokens on every visitor click that triggered a fresh
 * top-50 hash (the cache hit-rate was poor because the top-50 ordering
 * shifts as new articles arrive throughout the day). Pre-computing
 * once a day flattens the OpenAI cost to two calls and lets the page
 * render instantly from the DB.
 *
 * Schedule: hit this URL once a day from cron-job.org. Suggested
 * `0 2 * * *` UTC so the run lands after the day boundary on which
 * the snapshot is keyed and after the scoring cron has had time to
 * label the previous-day articles.
 *
 * Manual bootstrap: after the first deploy, before the next cron tick
 * lands, run a one-shot `curl -X GET https://<host>/.netlify/functions/cron-top-summary-background`
 * so the page has at least one row to render. Without this the GET
 * read path returns 404 and the UI shows the empty state until the
 * scheduled tick.
 *
 * Date override: `TOP_SUMMARY_DATE=YYYY-MM-DD` env var lets the
 * operator replay a past date (useful for backfilling after a failed
 * tick). Default is today in UTC.
 */

const LANGS: readonly Lang[] = ["en", "fr"] as const;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async () => {
  const startedAt = Date.now();
  const summaryDate = process.env.TOP_SUMMARY_DATE?.trim() || todayUtc();
  const lines: string[] = [];

  let generated = 0;
  let noArticles = 0;
  let errors = 0;

  // Statuses a retry could actually change. "ok"/"no_articles" are
  // terminal; "no_openai" means the key is missing, so retrying is
  // pointless. Everything else (ai_error, db_error, a thrown error) is
  // treated as transient and retried once.
  const RETRYABLE = new Set<GenerateTopSummaryStatus>(["ai_error", "db_error"]);

  // Self-healing per-lang retry. The daily tick has intermittently
  // failed for a single language — in practice the FIRST one generated
  // (EN), which then stays stuck on the previous edition while the
  // second (FR) is fine. The most likely cause is a cold-start transient
  // on the first OpenAI/DB call of the run. One retry after a short
  // backoff makes the tick self-healing so we never ship a day with one
  // language a full edition behind. `generateTopSummary` itself never
  // throws on an LLM/JSON hiccup (it degrades to a fallback that still
  // persists a row), so an ABSENT row only happens on a thrown/transient
  // error — exactly what this retry covers.
  for (const lang of LANGS) {
    const langStart = Date.now();
    let result: GenerateTopSummaryResult | null = null;
    let lastErr = "";

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await generateTopSummary(summaryDate, lang);
        lastErr = "";
      } catch (err) {
        result = null;
        lastErr = err instanceof Error ? err.message : "unknown";
      }
      const retryable = result === null || RETRYABLE.has(result.status);
      if (!retryable || attempt === 2) break;
      lines.push(
        `[retry] lang=${lang} date=${summaryDate} after=${result?.status ?? "throw"} attempt=${attempt}`,
      );
      await new Promise((r) => setTimeout(r, 3000));
    }

    const elapsed = Date.now() - langStart;

    if (result === null) {
      errors += 1;
      lines.push(
        `[error] lang=${lang} date=${summaryDate} status=throw — ${lastErr} elapsed_ms=${elapsed}`,
      );
      continue;
    }

    switch (result.status) {
      case "ok":
        generated += 1;
        lines.push(
          `[ok] lang=${lang} date=${summaryDate} articles=${result.articleCount} bullets=${result.bulletCount} elapsed_ms=${elapsed}`,
        );
        break;
      case "no_articles":
        noArticles += 1;
        lines.push(
          `[no_articles] lang=${lang} date=${summaryDate} elapsed_ms=${elapsed}`,
        );
        break;
      case "no_openai":
        errors += 1;
        lines.push(
          `[error] lang=${lang} date=${summaryDate} status=no_openai — ${result.errorMessage ?? ""}`,
        );
        break;
      case "ai_error":
        errors += 1;
        lines.push(
          `[error] lang=${lang} date=${summaryDate} status=ai_error articles=${result.articleCount} — ${result.errorMessage ?? ""} elapsed_ms=${elapsed}`,
        );
        break;
      case "db_error":
        errors += 1;
        lines.push(
          `[error] lang=${lang} date=${summaryDate} status=db_error articles=${result.articleCount} bullets=${result.bulletCount} — ${result.errorMessage ?? ""} elapsed_ms=${elapsed}`,
        );
        break;
    }
  }

  lines.push(
    `[run] cron=top-summary date=${summaryDate} langs=${LANGS.length} generated=${generated} no_articles=${noArticles} errors=${errors} elapsed_ms=${Date.now() - startedAt}`,
  );
  console.log(lines.join("\n"));
};
