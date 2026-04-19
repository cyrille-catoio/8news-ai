import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getVideoTranscript } from "@/lib/transcript-api";
import {
  getVideoTranscription,
  insertVideoTranscription,
  insertVideoBullets,
} from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { normalizeSummaryHeadings } from "@/lib/summary-headings";

const AI_MODEL = "gpt-4.1-mini";

function targetWords(wordCount: number): string {
  if (wordCount < 500) return "200-300";
  if (wordCount <= 2000) return "500-700";
  return "700-1000";
}

function buildSummaryPrompt(lang: string, targetRange: string): string {
  if (lang === "fr") {
    return `Tu rédiges un article de presse à partir du contenu fourni. Le texte source est une transcription, mais tu écris comme si tu traitais l'actualité directement.

Règles :
- Réponds UNIQUEMENT en Markdown, en français.
- Écris à la troisième personne, ton journalistique, factuel et concret.
- Ne mentionne JAMAIS la vidéo, la transcription, le contenu source, l'auteur, l'animateur, le présentateur, l'invité, l'épisode, le podcast, la chaîne, les spectateurs ou les abonnés.
- N'utilise pas de formules méta du type « la vidéo aborde », « le speaker explique », « il est dit que », « selon l'auteur ». Présente directement les faits et les analyses.
- Aucune référence entre parenthèses.
- Mets en **gras** les chiffres clés, noms propres et termes importants.
- Structure obligatoire :

## INTRO
Une phrase de synthèse, factuelle, sans mention de la source.

## Points clés
- **Point 1**

  2-4 phrases détaillées avec chiffres, noms, faits marquants, écrites comme un paragraphe d'article.

- **Point 2**

  …

(entre 5 et 15 bullet points selon la longueur ; pour chaque point : titre en **gras** seul sur sa ligne, ligne vide, puis le paragraphe indenté de deux espaces)

- Longueur cible : ${targetRange} mots.
- Sois factuel et informatif, avec anecdotes ou détails surprenants quand ils sont présents.`;
  }

  return `You are writing a news article from the provided material. The source is a transcript, but write as if reporting on the topic directly.

Rules:
- Respond ONLY in Markdown, in English.
- Use third person, neutral journalistic tone, factual and concrete.
- NEVER mention the video, the transcript, the source, the author, the host, the speaker, the guest, the episode, the podcast, the channel, viewers or subscribers.
- Avoid meta phrasing like "the video introduces", "the speaker explains", "it is said that", "according to the author". Present the facts and analysis directly.
- No parenthetical references.
- Use **bold** for key figures, proper nouns, and important terms.
- Mandatory structure:

## TL;DR
One factual summary sentence, with no mention of the source.

## Key Points
- **Point 1**

  2-4 detailed sentences with figures, names, key facts, written as an article paragraph.

- **Point 2**

  …

(between 5 and 15 bullet points depending on length; for each point: bold title alone on its line, blank line, then the paragraph indented by two spaces)

- Target length: ${targetRange} words.
- Be factual and informative; include surprising anecdotes or details when they appear in the material.`;
}

function buildTranslatePrompt(targetLang: string): string {
  if (targetLang === "fr") {
    return `Tu es un traducteur expert. Traduis le résumé Markdown suivant en français.

Règles :
- Conserve exactement la même structure Markdown (## INTRO, ## Points clés, bullet points).
- Conserve le **gras** sur les mêmes termes.
- Traduis "## Key Points" en "## Points clés" et remplace "## TL;DR" par "## INTRO".
- Pour chaque point : titre en **gras** seul sur sa ligne, ligne vide, puis le paragraphe indenté de deux espaces (préserve ce format si l'original l'utilise, et applique-le si l'original a le titre et le paragraphe sur la même ligne).
- Ne résume pas davantage, traduis fidèlement.`;
  }

  return `You are an expert translator. Translate the following Markdown summary into English.

Rules:
- Keep the exact same Markdown structure (## TL;DR, ## Key Points, bullet points).
- Keep **bold** on the same terms.
- Translate "## Points clés" to "## Key Points" and replace "## INTRO" with "## TL;DR".
- For each point: bold title alone on its line, blank line, then the paragraph indented by two spaces (preserve this format if the source uses it, and apply it if the source has the title and paragraph on the same line).
- Do not further summarize, translate faithfully.`;
}

function extractBulletsFromMarkdown(md: string): string[] {
  const lines = md.split("\n");
  let inBullets = false;
  const bullets: string[] = [];
  let current = "";

  for (const line of lines) {
    if (/^##\s+Points\s+cl/i.test(line) || /^##\s+Key\s+points/i.test(line)) {
      inBullets = true;
      continue;
    }
    if (inBullets && /^##\s/.test(line)) break;
    if (!inBullets) continue;

    if (/^\s*[-*]\s/.test(line)) {
      if (current) bullets.push(current.trim());
      current = line.replace(/^\s*[-*]\s+/, "").trim();
    } else if (current && line.trim()) {
      current += " " + line.trim();
    }
  }
  if (current) bullets.push(current.trim());

  return bullets;
}

export async function POST(req: Request) {
  const { videoId, title, channelId, lang } = await req.json();
  if (!videoId || typeof videoId !== "string") {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }
  const safeLang = lang === "fr" ? "fr" : "en";

  const cached = await getVideoTranscription(videoId, safeLang);
  if (cached) {
    return NextResponse.json({
      summaryMd: normalizeSummaryHeadings(cached.summary_md ?? "", safeLang),
      cached: true,
    });
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

    // Fetch topic_id from the cached video row
    let topicId: string | null = null;
    try {
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      const { data: vid } = await db
        .from("youtube_videos")
        .select("topic_id")
        .eq("video_id", videoId)
        .single();
      if (vid?.topic_id) topicId = vid.topic_id;
    } catch { /* non-critical */ }

    const transcriptionId = await insertVideoTranscription({
      video_id: videoId,
      channel_id: channelId ?? "",
      title: title ?? "Untitled",
      lang: safeLang,
      topic_id: topicId,
      transcript: transcriptText,
      summary_md: summaryMd,
      word_count: wordCount,
    });

    if (transcriptionId) {
      const bullets = extractBulletsFromMarkdown(summaryMd);
      const today = new Date().toISOString().slice(0, 10);
      const bulletRows = bullets.map((text, i) => ({
        video_transcription_id: transcriptionId,
        topic_id: topicId,
        lang: safeLang,
        summary_date: today,
        bullet_index: i,
        text: text.replace(/\*\*/g, "").trim(),
        refs: [] as unknown[],
        source_type: "video",
        entities: [] as string[],
      }));
      await insertVideoBullets(bulletRows);
    }

    return NextResponse.json({
      summaryMd: normalizeSummaryHeadings(summaryMd, safeLang),
      cached: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
