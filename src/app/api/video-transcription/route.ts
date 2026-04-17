import { NextRequest, NextResponse } from "next/server";
import { getVideoTranscriptionText } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  const lang = req.nextUrl.searchParams.get("lang") ?? "en";

  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  const safeLang = lang === "fr" ? "fr" : "en";
  const summaryMd = await getVideoTranscriptionText(videoId, safeLang);

  if (!summaryMd) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ summaryMd });
}
