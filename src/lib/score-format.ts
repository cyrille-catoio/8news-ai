/**
 * Shared helpers for the AI video recap quality score (1-10).
 *
 * Since migration 034 the score is stored as NUMERIC(3,1): integers in
 * the 1-8 band and one decimal in the 9-10 band (e.g. 9.1, 9.7). These
 * helpers normalize DB reads (a numeric column can come back as a number
 * OR a string depending on the driver) and format the value for display
 * (show the decimal only when there is one).
 */

/** Coerce a raw DB value to a valid 1-10 score number, or null. Accepts
 *  number or numeric-as-string; rounds defensively to one decimal. */
export function normalizeVideoScore(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  return Math.round(n * 10) / 10;
}

/** Display string for a score: integer values render without a decimal
 *  (« 8 »), fractional ones with one decimal (« 9.1 »). */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
