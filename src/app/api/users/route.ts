import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth-api";
import { getServerClient } from "@/lib/supabase";

export async function GET() {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const supabaseP = getServerClient();
  if (!supabaseP) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }

  const supabase = await supabaseP;

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (data.users ?? []).map((u) => {
    // `preferred_lang` is shared with the SPA + SSR `resolveServerLang()`
    // pipeline (v2.5.3+). Return `null` when missing so the admin row
    // can render an explicit « not set » marker rather than implying
    // the user picked « en ». PATCH always writes a concrete value
    // (en|fr) — clearing the field is intentionally not exposed.
    const rawLang = u.user_metadata?.preferred_lang;
    const preferredLang: "en" | "fr" | null =
      rawLang === "fr" ? "fr" : rawLang === "en" ? "en" : null;
    return {
      id: u.id,
      email: u.email ?? "",
      firstName: u.user_metadata?.first_name ?? "",
      lastName: u.user_metadata?.last_name ?? "",
      userType: u.app_metadata?.user_type === "owner" ? "owner" : "member",
      preferredLang,
      // Daily Newsletter opt-in (v2.6.12+). NULL / missing → false so a
      // legacy user without the flag defaults to NOT subscribed; the
      // admin needs to explicitly tick the box.
      dailyNewsletter: u.user_metadata?.daily_newsletter === true,
      createdAt: u.created_at,
    };
  });

  users.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
}
