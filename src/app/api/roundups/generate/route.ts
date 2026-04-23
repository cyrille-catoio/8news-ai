import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth-api";
import { generateVideoRoundup } from "@/lib/generate-video-roundup";

/**
 * POST /api/roundups/generate
 * Body: { topicId: string; date: "YYYY-MM-DD"; lang: "en" | "fr" }
 *
 * Owner-only thin wrapper around `generateVideoRoundup`. The same helper
 * is called by `netlify/functions/cron-video-roundup-background.ts`,
 * which is why the heavy lifting lives in `src/lib/`.
 *
 * URL is intentionally `/api/roundups/...` (no "video") — see plan
 * "Décisions actées".
 */

interface GenerateBody {
  topicId?: unknown;
  date?: unknown;
  lang?: unknown;
}

function parseBody(body: GenerateBody): { topicId: string; date: string; lang: "en" | "fr" } | null {
  const topicId = typeof body.topicId === "string" ? body.topicId.trim() : "";
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const langRaw = typeof body.lang === "string" ? body.lang.trim() : "";
  if (!topicId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (langRaw !== "en" && langRaw !== "fr") return null;
  return { topicId, date, lang: langRaw };
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  let body: GenerateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Body must include topicId (string), date (YYYY-MM-DD), lang ('en' or 'fr')" },
      { status: 400 },
    );
  }

  const result = await generateVideoRoundup(parsed.topicId, parsed.date, parsed.lang);

  // Map the helper's status to a useful HTTP code so admin tooling (and
  // the cron) can branch without parsing strings.
  switch (result.status) {
    case "ok":
      return NextResponse.json({
        status: "ok",
        roundup: { id: result.roundupId, url: result.url, videoCount: result.videoCount },
      });
    case "no_videos":
      return NextResponse.json({
        status: "no_videos",
        videoCount: result.videoCount,
        message: "Need at least 2 videos to build a roundup.",
      });
    case "no_openai":
      return NextResponse.json({ error: result.errorMessage }, { status: 500 });
    case "ai_invalid_json":
    case "ai_error":
      return NextResponse.json({ error: result.errorMessage }, { status: 502 });
    case "db_error":
      return NextResponse.json({ error: result.errorMessage }, { status: 500 });
  }
}
