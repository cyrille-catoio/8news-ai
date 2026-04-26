/**
 * Re-export hub for the service-role Supabase helpers. Every existing
 * import `from "@/lib/supabase"` in the codebase resolves through this
 * file, so the v2.5.10 split into `src/lib/supabase/*.ts` doesn't
 * require touching any caller.
 *
 * If you're adding a new helper, put it in the most appropriate
 * domain module (cache / stats / topics / articles / summaries /
 * videos / bullets) and add it to the matching `export *` below.
 *
 * The shared `getServerClient()` and `SITEMAP_RECENT_DAYS` live in
 * `./supabase/client.ts` and are NOT re-exported here on purpose —
 * they're intra-module-private (sibling modules import them
 * directly), keeping the public surface focused on the domain
 * helpers.
 */

export * from "./supabase/cache";
export * from "./supabase/stats";
export * from "./supabase/topics";
export * from "./supabase/articles";
export * from "./supabase/summaries";
export * from "./supabase/videos";
export * from "./supabase/bullets";
