import { NextResponse } from "next/server";
import {
  transcribeVideo,
  transcribeStatusToHttpCode,
  transcribeStatusToUserMessage,
} from "@/lib/transcribe-video";

/**
 * Synchronous wrapper around the shared {@link transcribeVideo} pipeline.
 * Same behaviour and HTTP status codes as before the v2.5 refactor — see
 * `src/lib/transcribe-video.ts` for the implementation. The cron at
 * `netlify/functions/cron-video-transcribe-background.ts` consumes the
 * same lib with a longer OpenAI timeout for very long podcasts.
 */
export async function POST(req: Request) {
  const { videoId, title, channelId, lang } = await req.json();
  if (!videoId || typeof videoId !== "string") {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }
  const safeLang: "en" | "fr" = lang === "fr" ? "fr" : "en";

  const result = await transcribeVideo(videoId, safeLang, { title, channelId });

  // Cache hit + fresh OK both return the summary on a 200.
  if (result.status === "ok" || result.status === "cached") {
    return NextResponse.json({
      summaryMd: result.summaryMd,
      cached: result.cached,
    });
  }

  // Errors: pick the friendly message + raw debug, map to the right HTTP code.
  const userMsg = transcribeStatusToUserMessage(result.status, safeLang, result.errorMessage);
  return NextResponse.json(
    { error: userMsg ?? result.errorMessage ?? "Transcription failed", raw: result.errorMessage },
    { status: transcribeStatusToHttpCode(result.status) },
  );
}
