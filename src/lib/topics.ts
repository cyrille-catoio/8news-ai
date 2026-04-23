/**
 * Topic-related helpers that don't belong to the Supabase data layer.
 *
 * Currently: a single guard that prevents the creation of a topic whose
 * slug would collide with a fixed segment of the Next.js routing tree.
 * Without this guard, a future topic named "v" or "briefings" would
 * shadow the per-video SSR routes (`/{topic}/v/{date}/{slug}`) or the
 * /briefings hub.
 */

/**
 * Slugs that the Next.js routing tree owns. A topic with one of these
 * IDs would either shadow a real route or break the per-video / per-
 * roundup URL resolution.
 */
const RESERVED_TOPIC_SLUGS = new Set([
  // Per-video and per-roundup route prefixes (Phase 1 + 2 of the SSR
  // video work). Critical: these must never be a topic ID.
  "v",
  "r",
  // Public hubs and SPA roots that already serve content under their
  // own paths and would 404 (or worse, render the hub) if a topic with
  // the same id existed.
  "briefings",
  "summaries",
  "app",
  "api",
  "videos",
  "top-articles",
  "favorites",
]);

/**
 * Return true if `id` is reserved by the routing tree and must not be
 * used as a topic slug.
 *
 * Called by:
 *  - `POST /api/topics` (creation)
 *  - `PATCH /api/topics/[id]` (rename, if ever supported)
 *
 * The check is case-insensitive on the input as a defensive measure; the
 * topic id schema enforces lowercase already, but a future relaxation
 * shouldn't expose us to a `V` bypass.
 */
export function isReservedTopicSlug(id: string): boolean {
  if (!id) return false;
  return RESERVED_TOPIC_SLUGS.has(id.toLowerCase());
}
