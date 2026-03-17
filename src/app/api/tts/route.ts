import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(request: NextRequest) {
  try {
    const { text, voice } = (await request.json()) as {
      text?: string;
      voice?: string;
    };

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim() === "" || apiKey === "sk-your-key-here") {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    const ttsVoice = (["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const).includes(
      voice as never,
    )
      ? (voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer")
      : "nova";

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: ttsVoice,
      input: text.slice(0, 4096),
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

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
