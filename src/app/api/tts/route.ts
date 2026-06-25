import { NextRequest, NextResponse } from "next/server";
import { TTS_TEXT_MAX_CHARS } from "@/lib/tts";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Per-IP token bucket — same in-memory pattern as `/api/share` and
 * `/api/user/event` (resets on Lambda cold start, acceptable).
 *
 * NOT gated behind a session on purpose: the audio players live on the
 * PUBLIC SSR pages (daily summaries, video pages, video roundups) where
 * anonymous visitors must be able to listen. So instead of auth we cap
 * ElevenLabs spend per IP.
 *
 * 20 generations / 10 min is generous for a human — the player caches
 * each clip and replays it without re-hitting this route, and a single
 * full-length reading (up to TTS_TEXT_MAX_CHARS ≈ 12 min of audio) is
 * one request — yet it stops a script from burning the TTS quota.
 */
const RATE_LIMIT_WINDOW_MS = 600_000;
const RATE_LIMIT_MAX_HITS = 20;
const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (ipHits.get(ip) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= RATE_LIMIT_MAX_HITS) {
    ipHits.set(ip, arr);
    return true;
  }
  arr.push(now);
  ipHits.set(ip, arr);
  if (ipHits.size > 1024) {
    for (const [k, v] of ipHits) {
      if (v.length === 0 || (v[v.length - 1] ?? 0) < cutoff) ipHits.delete(k);
    }
  }
  return false;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

// Upper bound on the ElevenLabs call so a hung connection can't pin the
// function open. Sized just under `maxDuration` so a legitimate
// full-length (~12 min) generation is never cut short — its only job is
// to kill a request that has genuinely stalled.
const ELEVENLABS_TIMEOUT_MS = 55_000;

const VALID_VOICES: Record<string, string> = {
  sarah:     "Xb7hH8MSUJpSbSDYk0k2",
  alice:     "NDTYOmYEjbDIVCKB35i3",
  rachel:    "21m00Tcm4TlvDq8ikWAM",
  daniel:    "dtSEyYGNJqjrtBArPCVZ",
  drew:      "29vD33N1CtxCmqQRPOHJ",
  josh:      "TxGEqnHWrfWFTfGW9XjX",
  charlotte: "XB0fDUnXU5powFXDhCwa",
  lily:      "pFZP5JQG7iQjIQuC4Bku",
  nicole:    "piTKgcLEGmPE4e6mEKli",
  thomas:    "GBv7mTt0atIp3Br8iCZE",
  george:    "AmMsHJaCw4BtwV3KoUXF",
  callum:    "N2lVS1w4EtoT3dr4eOWO",
};
const DEFAULT_VOICE = "sarah";
const MODEL_ID = "eleven_flash_v2_5";
const OUTPUT_FORMAT = "mp3_44100_128";

export async function POST(request: NextRequest) {
  if (isRateLimited(clientIp(request))) {
    return NextResponse.json(
      { error: "Rate limited", reason: "rate_limited" },
      { status: 429 },
    );
  }

  try {
    const { text, lang, speed, voice } = (await request.json()) as {
      text?: string;
      lang?: string;
      speed?: number;
      voice?: string;
    };

    if (typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });
    }

    const voiceId = VALID_VOICES[voice ?? ""] ?? VALID_VOICES[DEFAULT_VOICE];
    const languageCode = lang === "fr" ? "fr" : "en";
    const ttsSpeed = Math.min(1.2, Math.max(0.7, speed ?? 1.05));

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          // Belt-and-braces server-side clamp — every client component
          // already trims to `TTS_TEXT_MAX_CHARS`, but if a caller forgets
          // we don't want to forward an oversized prompt to ElevenLabs.
          text: text.slice(0, TTS_TEXT_MAX_CHARS),
          model_id: MODEL_ID,
          language_code: languageCode,
          voice_settings: {
            stability: 0.7,
            similarity_boost: 0.85,
            speed: ttsSpeed,
          },
        }),
        signal: AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS),
      },
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `ElevenLabs error ${res.status}: ${errBody.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    // AbortSignal.timeout rejects with a TimeoutError — surface it as a
    // gateway timeout rather than a generic 500 so the client can tell a
    // stalled upstream from a real server fault.
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: "ElevenLabs timed out", reason: "upstream_timeout" },
        { status: 504 },
      );
    }
    const message = err instanceof Error ? err.message : "TTS error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
