import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth-api";
import { resolveChannel, getChannelLatest } from "@/lib/transcript-api";
import { getServerClient } from "@/lib/supabase";

/**
 * Try multiple inputs to get channel metadata from the RSS endpoint.
 * The /channel/latest API can timeout (408) for some channels —
 * retrying with @handle often works when the UC… ID fails.
 */
async function fetchChannelMeta(
  channelId: string,
  handle: string | null,
): Promise<{ title: string | null; thumbnail: string | null }> {
  const attempts = [channelId];
  if (handle) attempts.push(handle);

  for (const input of attempts) {
    for (let retry = 0; retry < 2; retry++) {
      try {
        const latest = await getChannelLatest(input);
        return {
          title: latest.channel?.title ?? null,
          thumbnail: latest.results[0]?.thumbnail?.url ?? null,
        };
      } catch {
        if (retry === 0) await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  return { title: null, thumbnail: null };
}

export async function GET() {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const dbP = getServerClient();
  if (!dbP) return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  const db = await dbP;
  const { data, error } = await db
    .from("youtube_channels")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const { handle } = await req.json();
  if (!handle || typeof handle !== "string") {
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  }

  try {
    const resolved = await resolveChannel(handle.trim());
    const channelId = resolved.channel_id;

    const meta = await fetchChannelMeta(channelId, handle.trim());
    const title = meta.title || handle.trim();
    const thumbnailUrl = meta.thumbnail;

    const dbP = getServerClient();
    if (!dbP) return NextResponse.json({ error: "DB not configured" }, { status: 500 });
    const db = await dbP;
    const { data, error } = await db
      .from("youtube_channels")
      .insert({
        channel_id: channelId,
        handle: handle.trim(),
        title,
        thumbnail_url: thumbnailUrl,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Channel already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/** Refresh title + thumbnail for all channels from TranscriptAPI RSS. */
export async function PATCH() {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const dbP = getServerClient();
  if (!dbP) return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  const db = await dbP;
  const { data: channels, error } = await db
    .from("youtube_channels")
    .select("id, channel_id, handle, title, thumbnail_url");

  if (error || !channels) return NextResponse.json({ error: "DB error" }, { status: 500 });

  let updated = 0;
  await Promise.allSettled(
    channels.map(async (ch) => {
      const meta = await fetchChannelMeta(ch.channel_id, ch.handle);

      const patch: Record<string, string> = {};
      if (meta.title && meta.title !== ch.title) patch.title = meta.title;
      if (meta.thumbnail && meta.thumbnail !== ch.thumbnail_url) patch.thumbnail_url = meta.thumbnail;

      if (Object.keys(patch).length > 0) {
        await db.from("youtube_channels").update(patch).eq("id", ch.id);
        updated++;
      }
    }),
  );

  return NextResponse.json({ refreshed: channels.length, updated });
}
