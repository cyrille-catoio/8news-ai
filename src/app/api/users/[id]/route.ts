import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth-api";
import { getServerClient } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const supabaseP = getServerClient();
  if (!supabaseP) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }

  const { id } = await params;
  const body = await req.json();

  // Profile/preferences stay in client-writable user_metadata; roles are
  // service-role-only app_metadata so members cannot self-promote.
  const userPatch: Record<string, unknown> = {};
  const appPatch: Record<string, unknown> = {};
  if (typeof body.firstName === "string") userPatch.first_name = body.firstName.trim();
  if (typeof body.lastName === "string") userPatch.last_name = body.lastName.trim();
  if (body.userType === "owner" || body.userType === "member") {
    appPatch.user_type = body.userType;
  }
  if (typeof body.dailyNewsletter === "boolean") {
    userPatch.daily_newsletter = body.dailyNewsletter;
  }
  // Default UI language (v2.6.12+) — writes the same `preferred_lang`
  // key consumed by `resolveServerLang()` and the SPA's
  // session-arrival reconciliation, so an admin override takes effect
  // on the user's next page load. Always a concrete value; clearing
  // the field is intentionally not exposed here.
  if (body.preferredLang === "en" || body.preferredLang === "fr") {
    userPatch.preferred_lang = body.preferredLang;
  }

  if (Object.keys(userPatch).length === 0 && Object.keys(appPatch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = await supabaseP;

  const { data: existing, error: getErr } = await supabase.auth.admin.getUserById(id);
  if (getErr || !existing?.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const update: {
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  } = {};
  if (Object.keys(userPatch).length > 0) {
    update.user_metadata = { ...existing.user.user_metadata, ...userPatch };
  }
  if (Object.keys(appPatch).length > 0) {
    update.app_metadata = { ...existing.user.app_metadata, ...appPatch };
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(id, update);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
