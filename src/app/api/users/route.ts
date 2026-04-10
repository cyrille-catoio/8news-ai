import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOwnerSession } from "@/lib/auth-api";

export async function GET() {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (data.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    firstName: u.user_metadata?.first_name ?? "",
    lastName: u.user_metadata?.last_name ?? "",
    userType: u.user_metadata?.user_type === "owner" ? "owner" : "member",
    createdAt: u.created_at,
  }));

  users.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
}
