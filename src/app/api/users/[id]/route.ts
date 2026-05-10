import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOwnerSession } from "@/lib/auth-api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }

  const { id } = await params;
  const body = await req.json();

  // `user_metadata` is `Record<string, unknown>` in Supabase Auth, so
  // the patch accumulator is the same — `first_name` / `last_name` /
  // `user_type` / `preferred_lang` are strings, `daily_newsletter`
  // (v2.6.12+) is a boolean. Keeping the merge generic prevents
  // future scalar flags from forcing another type widening.
  const patch: Record<string, unknown> = {};
  if (typeof body.firstName === "string") patch.first_name = body.firstName.trim();
  if (typeof body.lastName === "string") patch.last_name = body.lastName.trim();
  if (body.userType === "owner" || body.userType === "member") {
    patch.user_type = body.userType;
  }
  if (typeof body.dailyNewsletter === "boolean") {
    patch.daily_newsletter = body.dailyNewsletter;
  }
  // Default UI language (v2.6.12+) — writes the same `preferred_lang`
  // key consumed by `resolveServerLang()` and the SPA's
  // session-arrival reconciliation, so an admin override takes effect
  // on the user's next page load. Always a concrete value; clearing
  // the field is intentionally not exposed here.
  if (body.preferredLang === "en" || body.preferredLang === "fr") {
    patch.preferred_lang = body.preferredLang;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing, error: getErr } = await supabase.auth.admin.getUserById(id);
  if (getErr || !existing?.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const merged = { ...existing.user.user_metadata, ...patch };

  const { error: updateErr } = await supabase.auth.admin.updateUserById(id, {
    user_metadata: merged,
  });

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
