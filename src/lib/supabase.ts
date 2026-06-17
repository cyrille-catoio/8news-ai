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
 * `getServerClient()` is re-exported (cleanup pass) so API routes that
 * need raw table access share the single cached service-role client
 * instead of each calling `createClient()` inline. `SITEMAP_RECENT_DAYS`
 * stays intra-module-private.
 */

export { getServerClient } from "./supabase/client";
export * from "./supabase/cache";
export * from "./supabase/stats";
export * from "./supabase/topics";
export * from "./supabase/articles";
export * from "./supabase/summaries";
export * from "./supabase/videos";
export * from "./supabase/bullets";
export * from "./supabase/top-summaries";
export * from "./supabase/podcast-chat";
export * from "./supabase/user-chat";
export * from "./supabase/archives";
export * from "./supabase/user-activity";
export * from "./supabase/user-event";
