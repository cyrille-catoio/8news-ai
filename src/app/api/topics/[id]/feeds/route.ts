import { NextRequest, NextResponse } from "next/server";
import { createFeed, getTopicWithFeeds } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/auth-api";

const URL_RE = /^https?:\/\/.+/;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;

    const topic = await getTopicWithFeeds(id);
    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, url } = body;

    if (!name || typeof name !== "string" || name.length > 100) {
      return NextResponse.json(
        { error: "name must be 1-100 characters" },
        { status: 400 },
      );
    }

    if (!url || typeof url !== "string" || !URL_RE.test(url)) {
      return NextResponse.json(
        { error: "url must be a valid http(s):// URL" },
        { status: 400 },
      );
    }

    const existing = topic.feeds.find((f) => f.url === url);
    if (existing) {
      return NextResponse.json(
        { error: "This feed URL already exists for this topic" },
        { status: 409 },
      );
    }

    const row = await createFeed(id, name, url);

    if (!row) {
      return NextResponse.json(
        { error: "Failed to create feed" },
        { status: 500 },
      );
    }

    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create feed" },
      { status: 500 },
    );
  }
}
