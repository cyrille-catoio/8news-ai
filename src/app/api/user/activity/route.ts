import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-api";
import { getUserActivity, upsertUserActivity } from "@/lib/supabase";
import { NO_STORE_HEADERS } from "@/lib/api-helpers";

/**
 * Generic per-user UI activity log. Past consumers: the home « new
 * since your last visit » cutoff (`home_visit`, removed with the Top 5
 * section in v2.20.6) and the podcast « Lu / Read » checkbox
 * (v2.8.2 → v2.20). Kept generic for future client-side toggles.
 *
 * GET  /api/user/activity?type=home_visit
 *   → { entries: [{ target_id, value, last_action, last_clicked_at, created_at }, …] }
 *
 * POST /api/user/activity
 *   body: { activity_type, target_id, action, value }
 *   → { ok: true }
 *
 * Both endpoints require an authenticated session — anonymous visitors
 * fall back to client-side storage. The route always returns `no-store`
 * headers to keep the per-user payload off any CDN.
 */

const MAX_ACTIVITY_TYPE_LEN = 64;
const MAX_TARGET_ID_LEN = 256;
const MAX_ACTION_LEN = 64;

function isSafeShortString(value: unknown, maxLen: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLen;
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const type = req.nextUrl.searchParams.get("type");
  if (!isSafeShortString(type, MAX_ACTIVITY_TYPE_LEN)) {
    return NextResponse.json(
      { error: "type query parameter is required" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const entries = await getUserActivity(auth.user.id, type);
  return NextResponse.json({ entries }, { headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let body: {
    activity_type?: unknown;
    target_id?: unknown;
    action?: unknown;
    value?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const { activity_type, target_id, action, value } = body;
  if (!isSafeShortString(activity_type, MAX_ACTIVITY_TYPE_LEN)) {
    return NextResponse.json(
      { error: "activity_type is required" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!isSafeShortString(target_id, MAX_TARGET_ID_LEN)) {
    return NextResponse.json(
      { error: "target_id is required" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!isSafeShortString(action, MAX_ACTION_LEN)) {
    return NextResponse.json(
      { error: "action is required" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (value !== 0 && value !== 1) {
    return NextResponse.json(
      { error: "value must be 0 or 1" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const ok = await upsertUserActivity({
    userId: auth.user.id,
    activityType: activity_type,
    targetId: target_id,
    value: value as 0 | 1,
    action,
  });

  if (!ok) {
    return NextResponse.json(
      { error: "Failed to record activity" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
