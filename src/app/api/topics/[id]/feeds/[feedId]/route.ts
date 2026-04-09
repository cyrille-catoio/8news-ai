import { NextRequest, NextResponse } from "next/server";
import { updateFeed, deleteFeed } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth-api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; feedId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();
  try {
    const { feedId } = await params;
    const fid = parseInt(feedId, 10);
    if (isNaN(fid)) {
      return NextResponse.json({ error: "Invalid feed ID" }, { status: 400 });
    }

    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.length > 100 || body.name.length === 0) {
        return NextResponse.json(
          { error: "name must be 1-100 characters" },
          { status: 400 },
        );
      }
      updateData.name = body.name;
    }

    if (body.url !== undefined) {
      if (typeof body.url !== "string" || !/^https?:\/\/.+/.test(body.url)) {
        return NextResponse.json(
          { error: "url must be a valid http(s):// URL" },
          { status: 400 },
        );
      }
      updateData.url = body.url;
    }

    if (body.isActive !== undefined) {
      updateData.is_active = body.isActive;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const row = await updateFeed(fid, updateData);

    if (!row) {
      return NextResponse.json(
        { error: "Feed not found or update failed" },
        { status: 404 },
      );
    }

    return NextResponse.json(row);
  } catch {
    return NextResponse.json(
      { error: "Failed to update feed" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; feedId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();
  try {
    const { feedId } = await params;
    const fid = parseInt(feedId, 10);
    if (isNaN(fid)) {
      return NextResponse.json({ error: "Invalid feed ID" }, { status: 400 });
    }

    const ok = await deleteFeed(fid);

    if (!ok) {
      return NextResponse.json(
        { error: "Feed not found or delete failed" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete feed" },
      { status: 500 },
    );
  }
}
