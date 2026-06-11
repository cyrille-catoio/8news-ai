import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";
import { NO_STORE_HEADERS } from "@/lib/api-helpers";

/**
 * GET /api/youtube-channels/list
 *
 * Public list of every registered (active) YouTube channel — powers the
 * « Chaînes YouTube » browse page in the SPA general menu. `youtube_channels`
 * is service-role only (RLS), so the read goes through the service key
 * here and exposes just the fields the browse UI needs (no internal ids).
 */

export const dynamic = "force-dynamic";

export interface ChannelListItem {
  channelId: string;
  handle: string | null;
  title: string;
  thumbnailUrl: string | null;
}

export async function GET() {
  const dbP = getServerClient();
  if (!dbP) {
    return NextResponse.json({ channels: [] }, { headers: NO_STORE_HEADERS });
  }

  const db = await dbP;
  const { data, error } = await db
    .from("youtube_channels")
    .select("channel_id, handle, title, thumbnail_url, is_active")
    .order("title", { ascending: true });

  if (error || !data) {
    return NextResponse.json({ channels: [] }, { headers: NO_STORE_HEADERS });
  }

  const channels: ChannelListItem[] = data
    .filter((c) => (c as { is_active?: boolean }).is_active !== false)
    .map((c) => ({
      channelId: c.channel_id as string,
      handle: (c.handle as string | null) ?? null,
      title: c.title as string,
      thumbnailUrl: (c.thumbnail_url as string | null) ?? null,
    }));

  return NextResponse.json({ channels }, { headers: NO_STORE_HEADERS });
}
