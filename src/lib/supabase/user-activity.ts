import { getServerClient } from "./client";

/**
 * Service-role helpers around the `user_activity` table (mig. 029+).
 *
 * Stores per-user UI interaction state — currently the home Top 24h
 * podcast « Lu / Read » checkbox, keyed by snapshot date. The schema is
 * intentionally generic (`activity_type` + `target_id` + `value` +
 * `last_action`) so future client-side toggles (e.g. « mark video as
 * watched », « hide topic from briefing ») can share the same table
 * without a migration.
 *
 * All reads/writes go through the service role (consistent with the
 * other per-user tables — RLS only allows service_role). Callers must
 * pre-resolve the user id from the session before invoking these
 * helpers; the route layer (`/api/user/activity`) handles auth.
 */

export interface UserActivityRow {
  target_id: string;
  value: number;
  last_action: string;
  last_clicked_at: string;
  created_at: string;
}

/** Lists every (target_id, value) tuple for a (user, activity_type)
 *  pair — sized for the home Top 24h use case where the result is at
 *  most a few hundred dates per user. Ordered by `last_clicked_at`
 *  desc so the most recently touched targets land first; not required
 *  for correctness, but it keeps debugging output sensible. */
export async function getUserActivity(
  userId: string,
  activityType: string,
): Promise<UserActivityRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("user_activity")
      .select("target_id, value, last_action, last_clicked_at, created_at")
      .eq("user_id", userId)
      .eq("activity_type", activityType)
      .order("last_clicked_at", { ascending: false });
    if (error || !data) return [];
    return data as UserActivityRow[];
  } catch {
    return [];
  }
}

/** Upserts the (user, activity_type, target_id) row. The unique
 *  constraint on that triple means subsequent toggles overwrite the
 *  same row instead of accumulating — the table stays bounded at one
 *  row per (user, target) pair per activity type.
 *
 *  `last_clicked_at` is bumped to now() on every call so a SELECT
 *  ordered by it surfaces the most recently interacted-with targets.
 *  `created_at` is left to its DEFAULT now() on first insert and
 *  preserved on update (the upsert does not touch it). */
export async function upsertUserActivity(params: {
  userId: string;
  activityType: string;
  targetId: string;
  value: 0 | 1;
  action: string;
}): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    const { error } = await supabase.from("user_activity").upsert(
      {
        user_id: params.userId,
        activity_type: params.activityType,
        target_id: params.targetId,
        value: params.value,
        last_action: params.action,
        last_clicked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,activity_type,target_id" },
    );
    return !error;
  } catch {
    return false;
  }
}
