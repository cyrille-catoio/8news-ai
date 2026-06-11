import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";

/**
 * GET /api/youtube-channels/transcript?videoId=...
 *
 * Returns the raw transcript stored in `video_transcriptions.transcript` as
 * `text/plain` with a `Content-Disposition: attachment` header so browsers
 * download it as a `.txt` file. The transcript text is language-agnostic
 * (same source language regardless of the AI summary `lang`), so we look up
 * by `video_id` only and use whichever row exists. A small header (title,
 * channel, published date, link) is prepended for context.
 */
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  const dbP = getServerClient();
  if (!dbP) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }
  const db = await dbP;

  const { data: trow, error: terr } = await db
    .from("video_transcriptions")
    .select("transcript, title")
    .eq("video_id", videoId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (terr) {
    return NextResponse.json({ error: terr.message }, { status: 500 });
  }
  if (!trow || !(trow as { transcript: string }).transcript) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const transcript = (trow as { transcript: string }).transcript;
  const fallbackTitle = (trow as { title: string }).title || videoId;

  const { data: vrow } = await db
    .from("youtube_videos")
    .select("title, channel_title, published, link")
    .eq("video_id", videoId)
    .maybeSingle();

  const meta = (vrow as {
    title?: string;
    channel_title?: string;
    published?: string;
    link?: string;
  } | null) ?? {};

  const title = meta.title || fallbackTitle;
  const headerLines: string[] = [title];
  if (meta.channel_title) headerLines.push(meta.channel_title);
  if (meta.published) headerLines.push(meta.published);
  if (meta.link) headerLines.push(meta.link);
  headerLines.push("");
  headerLines.push("---");
  headerLines.push("");

  const body = `${headerLines.join("\n")}${transcript}\n`;

  const filename = `${slugify(title) || videoId}.txt`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
}
