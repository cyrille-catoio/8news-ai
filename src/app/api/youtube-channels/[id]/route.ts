import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth-api";
import { getServerClient } from "@/lib/supabase";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};

  if ("topic_id" in body) {
    patch.topic_id = body.topic_id || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const dbP = getServerClient();
  if (!dbP) return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  const db = await dbP;
  const { error } = await db.from("youtube_channels").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const dbP = getServerClient();
  if (!dbP) return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  const db = await dbP;
  const { error } = await db.from("youtube_channels").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
