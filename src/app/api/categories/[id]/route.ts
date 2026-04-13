import { NextRequest, NextResponse } from "next/server";
import { updateCategory, deleteCategory } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/auth-api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = await req.json();
    const updateData: Record<string, unknown> = {};
    if (body.slug !== undefined) updateData.slug = String(body.slug).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 30);
    if (body.labelEn !== undefined) updateData.label_en = String(body.labelEn).slice(0, 50);
    if (body.labelFr !== undefined) updateData.label_fr = String(body.labelFr).slice(0, 50);
    if (body.sortOrder !== undefined) updateData.sort_order = Number(body.sortOrder);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }
    const row = await updateCategory(Number(id), updateData);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const ok = await deleteCategory(Number(id));
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
