import { NextRequest, NextResponse } from "next/server";
import { deleteArticlesByTopicAndSource, getFeedById } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth-api";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; feedId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();
  try {
    const { id: topicId, feedId } = await params;
    const fid = parseInt(feedId, 10);
    if (isNaN(fid)) {
      return NextResponse.json({ error: "Invalid feed ID" }, { status: 400 });
    }

    const feed = await getFeedById(fid);
    if (!feed || feed.topic_id !== topicId) {
      return NextResponse.json(
        { error: "Feed not found for this topic" },
        { status: 404 },
      );
    }

    const { ok, deleted } = await deleteArticlesByTopicAndSource(
      feed.topic_id,
      feed.name,
    );

    if (!ok) {
      return NextResponse.json(
        { error: "Failed to delete articles" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, deleted });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete articles" },
      { status: 500 },
    );
  }
}
