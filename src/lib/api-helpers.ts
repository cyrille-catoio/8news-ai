import type { Lang } from "@/lib/i18n";

/**
 * Shared helpers for the Next.js API routes — single source of truth
 * for the no-store header set and the common query-string parsers that
 * used to be copy-pasted per route.
 */

/**
 * Full belt-and-suspenders no-store header set. Netlify production has
 * shown path-level CDN reuse on dynamic routes when `s-maxage` was set
 * (the cache key ignored the query string), so dynamic per-user /
 * per-query routes send the explicit trio of Cache-Control headers.
 * Pair with `export const dynamic = "force-dynamic"` in the route.
 */
export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
} as const;

/** `?lang=fr` → "fr", anything else → "en" (the historical default). */
export function parseLang(raw: string | null | undefined): Lang {
  return raw === "fr" ? "fr" : "en";
}

/** Strictly positive integer, else `fallback` (page numbers, page sizes). */
export function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Non-negative integer clamped to [0, 366] (snapshot history offsets). */
export function parseOffset(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(366, Math.floor(n));
}
