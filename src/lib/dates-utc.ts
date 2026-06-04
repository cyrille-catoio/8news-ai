/** UTC calendar date `YYYY-MM-DD` (same key as `top_summaries.summary_date`). */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
