import { NextRequest, NextResponse } from "next/server";

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
  try {
    const { text, lang, speed, voice } = (await request.json()) as {
      text?: string;
      lang?: string;
      speed?: number;
      voice?: string;
    };

    if (!text || text.trim().length === 0) {
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
          text: text.slice(0, 5000),
          model_id: MODEL_ID,
          language_code: languageCode,
          voice_settings: {
            stability: 0.7,
            similarity_boost: 0.85,
            speed: ttsSpeed,
          },
        }),
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
    const message = err instanceof Error ? err.message : "TTS error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
