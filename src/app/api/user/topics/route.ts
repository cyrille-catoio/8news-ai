import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-api";
import { getUserTopicPreferences, setUserTopicPreferences } from "@/lib/supabase";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const topicIds = await getUserTopicPreferences(auth.user.id);

  return NextResponse.json(
    { topicIds: topicIds ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let body: { topicIds: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { topicIds } = body;
  if (!Array.isArray(topicIds) || !topicIds.every((id) => typeof id === "string")) {
    return NextResponse.json(
      { error: "topicIds must be an array of strings" },
      { status: 400 },
    );
  }

  if (topicIds.length > 100) {
    return NextResponse.json({ error: "Too many topic IDs" }, { status: 400 });
  }

  const ok = await setUserTopicPreferences(auth.user.id, topicIds as string[]);
  if (!ok) {
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
