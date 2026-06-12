/**
 * Shared logging + wall-budget bookkeeping for the Netlify cron
 * background functions. Every cron used to re-declare the same four
 * lines (`TAG`, `log`, `elog`, `startedAt`) and the budget crons added
 * a `deadline`/`remaining()` pair on top — extracted here so the 8
 * crons share one implementation.
 *
 * Lines are emitted IMMEDIATELY (not buffered to the end of the run)
 * so partial progress survives a timeout / crash. Failures go through
 * `elog` (console.error) so Netlify surfaces them at error level.
 */
export interface CronRun {
  /** Epoch ms at cron start — feed `elapsedMs()` into the final `[run]` summary line. */
  startedAt: number;
  /** `console.log` prefixed with `[tag]`. */
  log: (s: string) => void;
  /** `console.error` prefixed with `[tag]`. */
  elog: (s: string) => void;
  /**
   * Every line passed to `elog` since the run started, in order.
   * Feed this into `sendCronAlert` at the end of the run so the alert
   * email carries the actual error detail, not just the summary line.
   */
  errorLines: () => readonly string[];
  /** Milliseconds since `startedAt`. */
  elapsedMs: () => number;
  /**
   * Milliseconds left before the wall budget passed to `startCronRun`.
   * `Infinity` when no budget was provided (cron without a hard loop).
   */
  remaining: () => number;
}

export function startCronRun(tag: string, budgetMs?: number): CronRun {
  const startedAt = Date.now();
  const deadline = budgetMs != null ? startedAt + budgetMs : null;
  const errors: string[] = [];
  return {
    startedAt,
    log: (s: string) => console.log(`[${tag}] ${s}`),
    elog: (s: string) => {
      errors.push(s);
      console.error(`[${tag}] ${s}`);
    },
    errorLines: () => errors,
    elapsedMs: () => Date.now() - startedAt,
    remaining: () => (deadline === null ? Number.POSITIVE_INFINITY : deadline - Date.now()),
  };
}
