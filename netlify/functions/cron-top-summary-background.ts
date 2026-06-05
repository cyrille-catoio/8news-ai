import {
  generateTopSummary,
  TOP_SUMMARY_MODEL,
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

  // Emit each line IMMEDIATELY (not buffered to the end) so partial
  // progress survives a timeout / crash — the previous single end-of-run
  // `console.log` left zero trace when the function died mid-way, which is
  // exactly when we most need the logs. Failures go to `console.error` so
  // Netlify surfaces them at error level and they're easy to filter.
  const TAG = "[cron-top-summary]";
  const log = (s: string) => console.log(`${TAG} ${s}`);
  const elog = (s: string) => console.error(`${TAG} ${s}`);

  let generated = 0;
  let noArticles = 0;
  let errors = 0;

  log(
    `[start] date=${summaryDate} langs=${LANGS.join(",")} model=${TOP_SUMMARY_MODEL}` +
      (process.env.TOP_SUMMARY_DATE ? " (date overridden via TOP_SUMMARY_DATE)" : ""),
  );

  // Statuses a retry could actually change. "ok"/"no_articles" are
  // terminal; "no_openai" means the key is missing, so retrying is
  // pointless. Everything else (ai_error, db_error, a thrown error) is
  // treated as transient and retried once.
  const RETRYABLE = new Set<GenerateTopSummaryStatus>(["ai_error", "db_error"]);

  try {
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
      log(`[lang-start] lang=${lang} date=${summaryDate}`);
      let result: GenerateTopSummaryResult | null = null;
      let lastErr = "";

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          result = await generateTopSummary(summaryDate, lang);
          lastErr = "";
        } catch (err) {
          result = null;
          lastErr = err instanceof Error ? (err.stack ?? err.message) : "unknown";
        }
        const retryable = result === null || RETRYABLE.has(result.status);
        if (!retryable || attempt === 2) break;
        const why =
          result === null ? `throw (${lastErr})` : `${result.status} (${result.errorMessage ?? ""})`;
        elog(
          `[retry] lang=${lang} date=${summaryDate} attempt=${attempt} after=${why}`,
        );
        await new Promise((r) => setTimeout(r, 3000));
      }

      const elapsed = Date.now() - langStart;

      if (result === null) {
        errors += 1;
        elog(
          `[error] lang=${lang} date=${summaryDate} status=throw — ${lastErr} elapsed_ms=${elapsed}`,
        );
        continue;
      }

      switch (result.status) {
        case "ok":
          generated += 1;
          log(
            `[ok] lang=${lang} date=${summaryDate} articles=${result.articleCount} bullets=${result.bulletCount} elapsed_ms=${elapsed}`,
          );
          break;
        case "no_articles":
          noArticles += 1;
          elog(
            `[no_articles] lang=${lang} date=${summaryDate} elapsed_ms=${elapsed} — no scored articles in the last 24h window`,
          );
          break;
        case "no_openai":
          errors += 1;
          elog(
            `[error] lang=${lang} date=${summaryDate} status=no_openai — ${result.errorMessage ?? ""}`,
          );
          break;
        case "ai_error":
          errors += 1;
          elog(
            `[error] lang=${lang} date=${summaryDate} status=ai_error articles=${result.articleCount} — ${result.errorMessage ?? ""} elapsed_ms=${elapsed}`,
          );
          break;
        case "db_error":
          errors += 1;
          elog(
            `[error] lang=${lang} date=${summaryDate} status=db_error articles=${result.articleCount} bullets=${result.bulletCount} — ${result.errorMessage ?? ""} elapsed_ms=${elapsed}`,
          );
          break;
      }
    }
  } catch (fatal) {
    // Catch-all so an unexpected throw still leaves a trace (and the run
    // summary below) instead of an opaque function failure.
    errors += 1;
    const msg = fatal instanceof Error ? (fatal.stack ?? fatal.message) : String(fatal);
    elog(`[fatal] date=${summaryDate} — ${msg} elapsed_ms=${Date.now() - startedAt}`);
  }

  const summary = `[run] cron=top-summary date=${summaryDate} langs=${LANGS.length} generated=${generated} no_articles=${noArticles} errors=${errors} elapsed_ms=${Date.now() - startedAt}`;
  if (errors > 0) elog(summary);
  else log(summary);
};
