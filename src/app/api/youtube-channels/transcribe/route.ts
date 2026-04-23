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
import { slugifyVideoTitle, uniquifyVideoSlug } from "@/lib/slug";

const AI_MODEL = "gpt-4.1-mini";

/** Hard cap on the produced Markdown summary length, in characters. */
const SUMMARY_MAX_CHARS = 5000;

/**
 * Netlify Functions cap synchronous routes around 30s. Budget targets:
 *   - TranscriptAPI fetch: ≤ 8s
 *   - OpenAI call:         ≤ {@link OPENAI_TIMEOUT_MS} (passed as SDK option)
 *   - DB writes + margin:  ≤ 4s
 * Anything above is killed by the upstream proxy and surfaces as 502.
 */
const OPENAI_TIMEOUT_MS = 20_000;

/**
 * Long podcasts can produce 200K+ char transcripts; sending all of that to
 * the model both inflates latency past our 30s budget and risks hitting
 * context-window or rate-limit issues. We sample the head and the tail
 * (intro + conclusion are usually the most signal-rich parts) and elide
 * the middle. Threshold and sample sizes are picked so a typical 30 min
 * video keeps its full transcript and only 1h+ ones get cropped.
 */
const TRANSCRIPT_MAX_CHARS = 50_000;
const TRANSCRIPT_HEAD_CHARS = 32_000;
const TRANSCRIPT_TAIL_CHARS = 14_000;

function maybeTruncateTranscript(text: string): string {
  if (text.length <= TRANSCRIPT_MAX_CHARS) return text;
  const head = text.slice(0, TRANSCRIPT_HEAD_CHARS).trimEnd();
  const tail = text.slice(-TRANSCRIPT_TAIL_CHARS).trimStart();
  return `${head}\n\n[…]\n\n${tail}`;
}

/**
 * Word ranges are kept comfortably under the {@link SUMMARY_MAX_CHARS} hard
 * cap (≈ 6 chars/word in French including spaces and Markdown markup, so
 * 5000 chars ≈ 800 words at the very top end). The character cap always
 * wins if there is any conflict — see prompt rules below.
 */
function targetWords(wordCount: number): string {
  if (wordCount < 500) return "200-300";
  if (wordCount <= 2000) return "450-650";
  return "650-800";
}

function buildSummaryPrompt(lang: string, targetRange: string): string {
  if (lang === "fr") {
    return `Tu rédiges un article de presse à partir du contenu fourni. Le texte source est une transcription, mais tu écris comme si tu traitais l'actualité directement.

CONTRAINTE ABSOLUE — LIMITE STRICTE DE LONGUEUR :
- La réponse Markdown finale doit faire AU MAXIMUM ${SUMMARY_MAX_CHARS} caractères, espaces et ponctuation compris.
- Cette limite est une contrainte technique non négociable. Une réponse de plus de ${SUMMARY_MAX_CHARS} caractères est INVALIDE.
- Vise plutôt 4500-4800 caractères pour garder une marge de sécurité, et COMPTE mentalement les caractères avant d'envoyer.
- Pour respecter la limite : prévois la longueur dès le début, réduis le nombre de bullets, condense les paragraphes, supprime les détails accessoires. La concision prime sur l'exhaustivité.
- Cette limite de ${SUMMARY_MAX_CHARS} caractères PRIME toujours sur la longueur cible en mots indiquée plus bas.
- Termine TOUJOURS par une phrase complète et un point final. N'utilise JAMAIS de points de suspension « … » ni « ... » ni aucun marqueur de troncature : il vaut mieux un résumé plus court mais complet qu'un résumé coupé.

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

- Longueur cible indicative : ${targetRange} mots, MAIS sans jamais dépasser ${SUMMARY_MAX_CHARS} caractères au total.
- Sois factuel et informatif, avec anecdotes ou détails surprenants quand ils sont présents.

RAPPEL FINAL : la sortie Markdown complète DOIT faire au plus ${SUMMARY_MAX_CHARS} caractères et se terminer par une phrase complète, jamais par « … » ou « ... ». Si tu risques de dépasser, écris moins de bullets ou des paragraphes plus courts dès le début, ne tronque pas la fin.`;
  }

  return `You are writing a news article from the provided material. The source is a transcript, but write as if reporting on the topic directly.

ABSOLUTE CONSTRAINT — STRICT LENGTH LIMIT:
- The final Markdown response must be AT MOST ${SUMMARY_MAX_CHARS} characters, including spaces and punctuation.
- This is a non-negotiable technical limit. A response longer than ${SUMMARY_MAX_CHARS} characters is INVALID.
- Aim for 4500-4800 characters to keep a safety margin, and COUNT the characters mentally before sending.
- To stay within the limit: plan the length from the start, reduce the number of bullet points, condense paragraphs, drop secondary details. Conciseness wins over completeness.
- This ${SUMMARY_MAX_CHARS}-character cap ALWAYS overrides the word target listed below.
- ALWAYS finish on a complete sentence ending with a full stop. NEVER use ellipsis "…" or "..." or any other truncation marker: a shorter complete summary is always better than a truncated one.

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

- Indicative target length: ${targetRange} words, but NEVER exceed ${SUMMARY_MAX_CHARS} characters total.
- Be factual and informative; include surprising anecdotes or details when they appear in the material.

FINAL REMINDER: the full Markdown output MUST be at most ${SUMMARY_MAX_CHARS} characters and end with a complete sentence, never with "…" or "...". If you risk going over, write fewer bullets or shorter paragraphs from the start instead of truncating the ending.`;
}

function buildTranslatePrompt(targetLang: string): string {
  if (targetLang === "fr") {
    return `Tu es un traducteur expert. Traduis le résumé Markdown suivant en français.

Règles :
- Conserve exactement la même structure Markdown (## INTRO, ## Points clés, bullet points).
- Conserve le **gras** sur les mêmes termes.
- Traduis "## Key Points" en "## Points clés" et remplace "## TL;DR" par "## INTRO".
- Pour chaque point : titre en **gras** seul sur sa ligne, ligne vide, puis le paragraphe indenté de deux espaces (préserve ce format si l'original l'utilise, et applique-le si l'original a le titre et le paragraphe sur la même ligne).
- Ne résume pas davantage, traduis fidèlement.
- LIMITE STRICTE : la traduction Markdown doit faire au maximum ${SUMMARY_MAX_CHARS} caractères. La traduction française est en général plus longue que l'anglais ; si la traduction fidèle dépasse cette limite, raccourcis légèrement les paragraphes pour rester sous ${SUMMARY_MAX_CHARS} caractères tout en gardant les chiffres, noms propres et faits clés.`;
  }

  return `You are an expert translator. Translate the following Markdown summary into English.

Rules:
- Keep the exact same Markdown structure (## TL;DR, ## Key Points, bullet points).
- Keep **bold** on the same terms.
- Translate "## Points clés" to "## Key Points" and replace "## INTRO" with "## TL;DR".
- For each point: bold title alone on its line, blank line, then the paragraph indented by two spaces (preserve this format if the source uses it, and apply it if the source has the title and paragraph on the same line).
- Do not further summarize, translate faithfully.
- STRICT LIMIT: the translated Markdown must be at most ${SUMMARY_MAX_CHARS} characters. If a faithful translation goes over, slightly shorten the paragraphs to stay below ${SUMMARY_MAX_CHARS} characters while keeping all key figures, proper nouns and facts.`;
}

/** Strip a trailing "…" / "..." line accidentally added by a previous run. */
function stripTrailingEllipsis(md: string): string {
  return md.replace(/\n+\s*(?:…|\.\.\.)\s*$/u, "").trimEnd();
}

/**
 * GPT sometimes wraps long Markdown responses in a fenced code block
 * (```markdown ... ```). Stored as-is, ReactMarkdown renders the whole
 * summary as a single `<pre><code>` (monospace, no word-wrap). Strip
 * the wrapping fence at write time so the DB never holds it.
 */
function stripCodeFences(md: string): string {
  if (!md) return md;
  const trimmed = md.trim();
  const m = trimmed.match(/^```[A-Za-z0-9_-]*\s*\n([\s\S]*?)\n```$/);
  return m ? m[1] : md;
}

/**
 * If the produced Markdown summary exceeds {@link SUMMARY_MAX_CHARS}, ask
 * the model to rewrite it shorter (preserving structure, tone, and key
 * facts) instead of truncating. We never cut the text mid-sentence because
 * a truncated summary is worse UX than a slightly-over summary; if the
 * model still misses after a couple of retries we return the latest version
 * as-is.
 */
async function compressSummaryIfNeeded(
  openai: OpenAI,
  lang: string,
  summaryMd: string,
): Promise<string> {
  let current = stripCodeFences(stripTrailingEllipsis(summaryMd ?? ""));
  if (!current) return current;

  // We want to leave a small safety margin so the next render doesn't sit
  // exactly at the cap and risk overflowing through later edits.
  const TARGET_CHARS = Math.floor(SUMMARY_MAX_CHARS * 0.95);

  for (let attempt = 0; attempt < 2 && current.length > SUMMARY_MAX_CHARS; attempt++) {
    const overBy = current.length - SUMMARY_MAX_CHARS;
    const system = lang === "fr"
      ? `Tu réécris le résumé Markdown ci-dessous pour qu'il fasse AU PLUS ${SUMMARY_MAX_CHARS} caractères (cible idéale ${TARGET_CHARS}). Le texte actuel dépasse de ${overBy} caractères.

Règles strictes :
- Conserve la structure exacte : ## INTRO / ## Points clés / ## Key Points et bullet points avec titre en **gras** seul sur sa ligne, ligne vide, paragraphe indenté de deux espaces.
- Conserve la langue, le ton journalistique, les chiffres clés, noms propres et faits marquants.
- Pour raccourcir : supprime des bullets entiers (les moins importants), condense les paragraphes, retire les détails accessoires.
- Termine toujours par une phrase complète. N'utilise JAMAIS de points de suspension « … » ni « ... » ni aucun marqueur de troncature.
- Réponds UNIQUEMENT avec le Markdown réécrit, rien d'autre.`
      : `You rewrite the Markdown summary below so it is AT MOST ${SUMMARY_MAX_CHARS} characters (ideal target ${TARGET_CHARS}). The current text is ${overBy} characters too long.

Strict rules:
- Keep the exact structure: ## INTRO / ## Points clés / ## Key Points and bullets with the bold title alone on its line, blank line, paragraph indented by two spaces.
- Keep the language, journalistic tone, key figures, proper nouns and facts.
- To shorten: drop entire bullets (the least important ones), condense paragraphs, remove secondary details.
- Always end with a complete sentence. NEVER use ellipsis "…" or "..." or any truncation marker.
- Respond ONLY with the rewritten Markdown, nothing else.`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: current },
      ],
    });
    const next = stripCodeFences(stripTrailingEllipsis(completion.choices[0]?.message?.content ?? ""));
    if (!next) break;
    current = next;
  }

  return stripTrailingEllipsis(current);
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
      const completion = await openai.chat.completions.create(
        {
          model: AI_MODEL,
          messages: [
            { role: "system", content: buildTranslatePrompt(safeLang) },
            { role: "user", content: otherCached.summary_md },
          ],
        },
        { timeout: OPENAI_TIMEOUT_MS },
      );
      // compressSummaryIfNeeded is intentionally skipped: each retry is
      // another 10-20s OpenAI call and would push us past Netlify's 30s
      // function timeout. The prompt already enforces SUMMARY_MAX_CHARS;
      // an oversized output is acceptable, a 502 is not.
      summaryMd = stripCodeFences(
        stripTrailingEllipsis(completion.choices[0]?.message?.content ?? ""),
      );
      transcriptText = otherCached.transcript;
      wordCount = otherCached.word_count ?? 0;
    } else {
      const transcript = await getVideoTranscript(videoId);
      const target = targetWords(transcript.wordCount);
      durationSec = transcript.durationSec;

      const truncatedTranscript = maybeTruncateTranscript(transcript.text);
      if (truncatedTranscript.length < transcript.text.length) {
        console.warn(
          `[transcribe] truncated transcript for ${videoId}: ${transcript.text.length} -> ${truncatedTranscript.length} chars`,
        );
      }

      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create(
        {
          model: AI_MODEL,
          messages: [
            { role: "system", content: buildSummaryPrompt(safeLang, target) },
            { role: "user", content: truncatedTranscript },
          ],
        },
        { timeout: OPENAI_TIMEOUT_MS },
      );
      summaryMd = stripCodeFences(
        stripTrailingEllipsis(completion.choices[0]?.message?.content ?? ""),
      );
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

    // Fetch topic_id + published_date from the cached video row. Both
    // are needed to compute the SSR slug — without either, the per-video
    // page /{topic}/v/{date}/{slug} cannot exist (the row is still
    // inserted, just without slug_keywords; backfill can fix it later).
    let topicId: string | null = null;
    let publishedDate: string | null = null;
    try {
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      const { data: vid } = await db
        .from("youtube_videos")
        .select("topic_id, published_date")
        .eq("video_id", videoId)
        .single();
      if (vid?.topic_id) topicId = vid.topic_id;
      if (vid?.published_date) publishedDate = vid.published_date;
    } catch { /* non-critical */ }

    // Compute slug if we have everything we need (topic + date + a non-empty
    // base from the title). Skipping is safe — the row is still useful for
    // the SPA, only the SSR page won't exist.
    let slug: string | null = null;
    if (topicId && publishedDate) {
      const base = slugifyVideoTitle(title ?? "Untitled", safeLang);
      if (base) {
        try {
          const db = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } },
          );
          slug = await uniquifyVideoSlug(db, base, topicId, publishedDate, safeLang, videoId);
        } catch (err) {
          // Fall back to the base slug if the uniquifier query fails — a
          // potential collision is preferable to no slug at all (the
          // unique index on the table will reject the duplicate INSERT
          // and the row will still be created without slug_keywords via
          // the catch path in insertVideoTranscription).
          console.error(`[transcribe] uniquifyVideoSlug failed for ${videoId}:`, err);
          slug = base;
        }
      }
    }

    const transcriptionId = await insertVideoTranscription({
      video_id: videoId,
      channel_id: channelId ?? "",
      title: title ?? "Untitled",
      lang: safeLang,
      topic_id: topicId,
      transcript: transcriptText,
      summary_md: summaryMd,
      word_count: wordCount,
      slug_keywords: slug,
      published_date: publishedDate,
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
    // Always surface the failure to Netlify logs with the videoId so we
    // can trace which assets / models / API providers misbehave.
    console.error(`[transcribe] videoId=${videoId} lang=${safeLang} failed: ${msg}`);

    // Map well-known failure shapes to friendlier user-facing messages.
    // Order matters — match the most specific signal first.
    let userMsg = msg;
    let status = 502;
    if (/timeout|timed out|aborted/i.test(msg)) {
      userMsg =
        safeLang === "fr"
          ? "Vidéo trop longue : le résumé n'a pas tenu dans les 30 secondes allouées. Réessayez ; si l'erreur persiste, c'est que le contenu dépasse la capacité actuelle."
          : "Video too long: the summary did not fit within the 30-second budget. Retry; if it keeps failing, the content exceeds the current capacity.";
      status = 504;
    } else if (/transcript .*404|no transcript|not available/i.test(msg)) {
      userMsg =
        safeLang === "fr"
          ? "Cette vidéo ne propose pas de sous-titres exploitables, transcription impossible."
          : "This video does not provide usable captions, transcription is not possible.";
      status = 404;
    } else if (/rate.?limit|429/i.test(msg)) {
      userMsg =
        safeLang === "fr"
          ? "Limite de requêtes atteinte côté IA. Réessayez dans une minute."
          : "AI rate limit hit. Retry in about a minute.";
      status = 429;
    }

    return NextResponse.json({ error: userMsg, raw: msg }, { status });
  }
}
