/** UTC calendar date `YYYY-MM-DD` (same key as `top_summaries.summary_date`). */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** UTC calendar date `YYYY-MM-DD` of a Date or epoch-ms timestamp. */
export function toUtcDateString(input: Date | number): string {
  return new Date(input).toISOString().slice(0, 10);
}

/** UTC calendar date `YYYY-MM-DD` of the day before `dateISO` (default: yesterday). */
export function previousUtcDay(dateISO: string = todayUtc()): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return toUtcDateString(d);
}
