import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth-api";
import { createClient } from "@supabase/supabase-js";

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const { error } = await db.from("youtube_channels").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
