import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared service-role Supabase client for every helper under
 * `src/lib/supabase/*.ts`. Lazy-initialized on first call and cached
 * for the lifetime of the Lambda — `_clientPromise` is kept across
 * requests so we don't pay the dynamic-import cost more than once
 * per cold start.
 *
 * Returns `null` (not throws) when env vars are missing — every
 * caller handles the null path with a no-op default so the SPA stays
 * usable in environments where Supabase isn't configured (preview
 * builds, local dev without `.env`).
 *
 * Re-exported from `src/lib/supabase.ts` (cleanup pass) so API routes
 * that need raw table/auth-admin access share this single cached
 * client instead of creating one inline per request.
 */

let _clientPromise: Promise<SupabaseClient> | null = null;

export function getServerClient(): Promise<SupabaseClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  if (!_clientPromise) {
    _clientPromise = import("@supabase/supabase-js").then((mod) =>
      mod.createClient(url, key, { auth: { persistSession: false } }),
    );
  }
  return _clientPromise;
}

/**
 * Boilerplate wrapper for the ~80 helpers in `src/lib/supabase/*.ts` that
 * all repeat the same shape: grab the shared client, bail to a safe
 * default when Supabase isn't configured, run the query(ies) inside a
 * try/catch, and log + fall back on an unexpected throw.
 *
 *   - `label`    prefixes the catch log (`[label]`).
 *   - `fallback` is returned both when the client is null AND on a throw.
 *   - `level`    picks the console channel: reads log at `warn`, writes at
 *                `error` (Netlify surfaces `error` at error level for
 *                alerting) — matching the prior hand-written convention.
 *
 * Only the OUTER try/catch is wrapped. Per-query `error` checks that
 * return a partial/typed result stay inside `fn` unchanged.
 */
export async function withClient<T>(
  label: string,
  fallback: T,
  fn: (supabase: SupabaseClient) => Promise<T>,
  level: "warn" | "error" = "warn",
): Promise<T> {
  const clientP = getServerClient();
  if (!clientP) return fallback;
  try {
    return await fn(await clientP);
  } catch (err) {
    console[level](`[${label}]`, err);
    return fallback;
  }
}

/**
 * Days kept in the sitemap. Older URLs are still served and crawlable
 * via internal links, just no longer advertised explicitly to keep
 * the sitemap under Google's 50K-URL/file ceiling. Shared by the
 * three `getAll*Routes` helpers (daily-summaries, video-pages,
 * video-roundups) so the sitemap window stays consistent across the
 * three SSR surfaces.
 */
export const SITEMAP_RECENT_DAYS = 90;
