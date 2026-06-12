import {
  generateTopSummary,
  parseTopSummaryLangsParam,
  TOP_SUMMARY_MODEL,
  type GenerateTopSummaryResult,
  type GenerateTopSummaryStatus,
} from "../../src/lib/generate-top-summary";
import { todayUtc } from "../../src/lib/dates-utc";
import { startCronRun } from "./shared/cron-log";
import { sendCronAlert } from "./shared/cron-alert";
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
 *
 * Lang filter: `?langs=en` (or `fr`, or `en,fr`) regenerates only the
 * given lang(s). Used by `cron-watchdog`'s self-heal re-trigger when a
 * single lang is missing for today, so the healthy lang's edition is
 * neither replaced nor re-billed. No param = both langs (daily tick).
 */

export default async (req: Request) => {
  const { log, elog, errorLines, elapsedMs } = startCronRun("cron-top-summary");
  const summaryDate = process.env.TOP_SUMMARY_DATE?.trim() || todayUtc();
  const langs: readonly Lang[] = parseTopSummaryLangsParam(
    new URL(req.url).searchParams.get("langs"),
  );

  let generated = 0;
  let noArticles = 0;
  let errors = 0;

  log(
    `[start] date=${summaryDate} langs=${langs.join(",")} model=${TOP_SUMMARY_MODEL}` +
      (process.env.TOP_SUMMARY_DATE ? " (date overridden via TOP_SUMMARY_DATE)" : ""),
  );

  // Statuses a retry could actually change. "ok" is terminal and
  // "no_openai" means the key is missing, so retrying is pointless.
  // "no_articles" IS retryable: the Supabase read helpers
  // (`getTopArticlesForStats`, `getHiddenTopicIds`) swallow transient
  // DB errors into an empty array, so on the cold-started 02:00 UTC
  // tick the FIRST lang (EN) can see a spurious "no articles" while FR
  // succeeds minutes later on the warm client — that misclassification
  // is exactly how prod shipped days with the EN podcast missing. A
  // genuine empty day re-resolves to no_articles cheaply (one DB query,
  // zero OpenAI tokens). Everything else (ai_error, db_error, a thrown
  // error) is transient and retried too.
  const RETRYABLE = new Set<GenerateTopSummaryStatus>([
    "ai_error",
    "db_error",
    "no_articles",
  ]);

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
    for (const lang of langs) {
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
    elog(`[fatal] date=${summaryDate} — ${msg} elapsed_ms=${elapsedMs()}`);
  }

  const summary = `[run] cron=top-summary date=${summaryDate} langs=${langs.join(",")} generated=${generated} no_articles=${noArticles} errors=${errors} elapsed_ms=${elapsedMs()}`;
  if (errors > 0) {
    elog(summary);
    // The Top 24h snapshot feeds the home hero, the audio player, the
    // archives AND the newsletter — a failed lang is a user-visible
    // outage, so it warrants an operator email, not just a log line.
    await sendCronAlert("top-summary", summary, errorLines());
  } else {
    log(summary);
  }
};
