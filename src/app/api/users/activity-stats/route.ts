import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth-api";
import { getActivityStats, type ActivityStats, type Period } from "@/lib/supabase";

/**
 * Owner-only behavioral analytics endpoint backing the
 * « User Activity » admin page. Aggregates rows from `user_event`
 * (append-only event log) + `user_activity` (state toggles) +
 * `auth.users` into the single payload consumed by
 * `<UserActivityStatsPage>`.
 *
 * Query params:
 *   - `period` ∈ `7d|30d|90d|all` (default `30d`)
 *
 * Auth: hard owner gate via `requireOwnerSession()` (mirror of
 * `/api/users/route.ts`). Anonymous + non-owner requests get 401/403.
 *
 * In-memory cache (60 s per period) so the dashboard refreshes
 * cheaply between visits. Reset on every cold start of the Netlify
 * function — acceptable since the data has at-most-30s of staleness
 * per the cache TTL anyway.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
} as const;

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  at: number;
  payload: ActivityStats;
}
const cache = new Map<Period, CacheEntry>();

function parsePeriod(raw: string | null): Period {
  if (raw === "7d" || raw === "90d" || raw === "all") return raw;
  return "30d";
}

export async function GET(req: NextRequest) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));

  const cached = cache.get(period);
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, { headers: NO_STORE_HEADERS });
  }

  const payload = await getActivityStats(period);
  cache.set(period, { at: now, payload });

  return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
}
