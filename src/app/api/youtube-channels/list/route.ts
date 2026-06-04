import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/youtube-channels/list
 *
 * Public list of every registered (active) YouTube channel — powers the
 * « Chaînes YouTube » browse page in the SPA general menu. `youtube_channels`
 * is service-role only (RLS), so the read goes through the service key
 * here and exposes just the fields the browse UI needs (no internal ids).
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
} as const;

export interface ChannelListItem {
  channelId: string;
  handle: string | null;
  title: string;
  thumbnailUrl: string | null;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ channels: [] }, { headers: NO_STORE_HEADERS });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
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
