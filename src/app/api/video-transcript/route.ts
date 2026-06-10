import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/client";

const NOINDEX_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow, nosnippet",
  "Cache-Control": "private, no-store",
} as const;

/**
 * GET /api/video-transcript?videoId=...
 *
 * Returns the raw transcript for client-side display on SSR video pages.
 * Not meant for search indexing — response carries `X-Robots-Tag: noindex`.
 */
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json(
      { error: "videoId is required" },
      { status: 400, headers: NOINDEX_HEADERS },
    );
  }

  const clientP = getServerClient();
  if (!clientP) {
    return NextResponse.json(
      { error: "DB not configured" },
      { status: 500, headers: NOINDEX_HEADERS },
    );
  }

  const supabase = await clientP;
  const { data, error } = await supabase
    .from("video_transcriptions")
    .select("transcript")
    .eq("video_id", videoId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NOINDEX_HEADERS },
    );
  }

  const transcript = ((data as { transcript?: string } | null)?.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: NOINDEX_HEADERS },
    );
  }

  return NextResponse.json(
    { transcript },
    { headers: NOINDEX_HEADERS },
  );
}
