import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireSession } from "@/lib/auth-api";
import { getVideoTranscript } from "@/lib/transcript-api";
import {
  getVideoTranscription,
  insertVideoTranscription,
  insertVideoBullets,
} from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

const AI_MODEL = "gpt-4.1-mini";

function targetWords(wordCount: number): string {
  if (wordCount < 500) return "200-300";
  if (wordCount <= 2000) return "500-700";
  return "700-1000";
}

function buildSummaryPrompt(lang: string, targetRange: string): string {
  if (lang === "fr") {
    return `Tu es un analyste expert. Résume la transcription suivante d'une vidéo YouTube.

Règles :
- Réponds UNIQUEMENT en Markdown, en français.
- Structure obligatoire :

## TL;DR
Une phrase de synthèse.

## Points clés
- **Point 1** : 2-4 phrases détaillées avec chiffres, noms, faits marquants.
- **Point 2** : …
(entre 5 et 15 bullet points selon la longueur)

- Longueur cible : ${targetRange} mots.
- Mets en **gras** les chiffres clés, noms propres et termes importants.
- Pas de références entre parenthèses.
- Sois factuel et informatif, avec des anecdotes ou détails surprenants si disponibles.`;
  }

  return `You are an expert analyst. Summarize the following YouTube video transcript.

Rules:
- Respond ONLY in Markdown, in English.
- Mandatory structure:

## TL;DR
One summary sentence.

## Key Points
- **Point 1**: 2-4 detailed sentences with figures, names, key facts.
- **Point 2**: …
(between 5 and 15 bullet points depending on length)

- Target length: ${targetRange} words.
- Use **bold** for key figures, proper nouns, and important terms.
- No parenthetical references.
- Be factual and informative, include surprising anecdotes or details when available.`;
}

function buildTranslatePrompt(targetLang: string): string {
  if (targetLang === "fr") {
    return `Tu es un traducteur expert. Traduis le résumé Markdown suivant en français.

Règles :
- Conserve exactement la même structure Markdown (## TL;DR, ## Points clés, bullet points).
- Conserve le **gras** sur les mêmes termes.
- Traduis "## Key Points" en "## Points clés" et "## TL;DR" reste "## TL;DR".
- Ne résume pas davantage, traduis fidèlement.`;
  }

  return `You are an expert translator. Translate the following Markdown summary into English.

Rules:
- Keep the exact same Markdown structure (## TL;DR, ## Key Points, bullet points).
- Keep **bold** on the same terms.
- Translate "## Points clés" to "## Key Points" and "## TL;DR" stays "## TL;DR".
- Do not further summarize, translate faithfully.`;
}

function extractBulletsFromMarkdown(md: string): string[] {
  const lines = md.split("\n");
  let inBullets = false;
  const bullets: string[] = [];
  for (const line of lines) {
    if (/^##\s+Points\s+cl/i.test(line) || /^##\s+Key\s+points/i.test(line)) {
      inBullets = true;
      continue;
    }
    if (inBullets && /^##\s/.test(line)) break;
    if (inBullets && /^\s*[-*]\s/.test(line)) {
      bullets.push(line.replace(/^\s*[-*]\s+/, "").trim());
    }
  }
  return bullets;
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { videoId, title, channelId, lang } = await req.json();
  if (!videoId || typeof videoId !== "string") {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }
  const safeLang = lang === "fr" ? "fr" : "en";

  const cached = await getVideoTranscription(videoId, safeLang);
  if (cached) {
    return NextResponse.json({ summaryMd: cached.summary_md, cached: true });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const otherLang = safeLang === "fr" ? "en" : "fr";
    const otherCached = await getVideoTranscription(videoId, otherLang);

    let summaryMd: string;
    let transcriptText: string;
    let wordCount: number;
    let durationSec = 0;

    if (otherCached && otherCached.summary_md) {
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: "system", content: buildTranslatePrompt(safeLang) },
          { role: "user", content: otherCached.summary_md },
        ],
      });
      summaryMd = completion.choices[0]?.message?.content ?? "";
      transcriptText = otherCached.transcript;
      wordCount = otherCached.word_count ?? 0;
    } else {
      const transcript = await getVideoTranscript(videoId);
      const target = targetWords(transcript.wordCount);
      durationSec = transcript.durationSec;

      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: "system", content: buildSummaryPrompt(safeLang, target) },
          { role: "user", content: transcript.text },
        ],
      });
      summaryMd = completion.choices[0]?.message?.content ?? "";
      transcriptText = transcript.text;
      wordCount = transcript.wordCount;

      // Store duration on the cached video row
      if (durationSec > 0) {
        try {
          const db = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } },
          );
          await db.from("youtube_videos").update({ duration_sec: durationSec }).eq("video_id", videoId);
        } catch { /* non-critical */ }
      }
    }

    const transcriptionId = await insertVideoTranscription({
      video_id: videoId,
      channel_id: channelId ?? "",
      title: title ?? "Untitled",
      lang: safeLang,
      transcript: transcriptText,
      summary_md: summaryMd,
      word_count: wordCount,
    });

    if (transcriptionId) {
      const bullets = extractBulletsFromMarkdown(summaryMd);
      const today = new Date().toISOString().slice(0, 10);
      const bulletRows = bullets.map((text, i) => ({
        video_transcription_id: transcriptionId,
        lang: safeLang,
        summary_date: today,
        bullet_index: i,
        text: text.replace(/\*\*/g, "").trim(),
        source_type: "video",
        entities: [] as string[],
      }));
      await insertVideoBullets(bulletRows);
    }

    return NextResponse.json({ summaryMd, cached: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
