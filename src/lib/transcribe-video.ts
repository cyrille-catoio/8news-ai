/**
 * Core transcription + AI-summary pipeline for a single YouTube video.
 *
 * Shared between two callers:
 *  - `POST /api/youtube-channels/transcribe` (synchronous HTTP — Netlify
 *    function 30s budget, default `openaiTimeoutMs = 25_000`). User-
 *    triggered: never persists bullets (default `persistBullets=false`,
 *    v2.10.3+). The next cron tick backfills them.
 *  - `netlify/functions/cron-video-transcribe-background.ts` (background
 *    function, 15 min budget — passes `openaiTimeoutMs = 180_000` and
 *    `persistBullets=true` so it's the sole `summary_bullets` writer
 *    for `source_type='video'`).
 *
 * Idempotent: a cache hit on `video_transcriptions(video_id, lang)`
 * returns immediately without touching OpenAI. The cron leans on this
 * to fast-skip already-done buckets across ticks.
 *
 * Pipeline (when no cache):
 *   1. Look up the alt-lang cache row. If present, translate that
 *      summary into the requested lang via GPT (~8s) — much cheaper
 *      than re-running the full pipeline.
 *   2. Otherwise: fetch the YouTube transcript via TranscriptAPI,
 *      sample if oversized (3-tier truncation), ask GPT for a
 *      structured Markdown summary.
 *   3. Compute the SSR slug (`/{topic}/v/{date}/{slug}`) when both
 *      `topic_id` and `published_date` are known.
 *   4. Persist the row in `video_transcriptions`. When `persistBullets`
 *      is `true` (cron only), also mirror the bullets into
 *      `summary_bullets` (`source_type='video'`) via `buildVideoBulletRows`.
 */

import OpenAI from "openai";
import { getVideoTranscript } from "./transcript-api";
import {
  getServerClient,
  getVideoTranscription,
  insertVideoTranscription,
  insertVideoBullets,
} from "./supabase";
import { normalizeSummaryHeadings } from "./summary-headings";
import { stripSubtitleCreditArtifacts } from "./text-artifacts";
import { slugifyVideoTitle, uniquifyVideoSlug } from "./slug";
import { buildVideoBulletRows } from "./video-bullets";

/** OpenAI model used for all video transcription summaries. */
const DEFAULT_AI_MODEL = "gpt-4.1-mini";

/** Hard cap on the produced Markdown summary length, in characters. */
const SUMMARY_MAX_CHARS = 5000;

/**
 * Default OpenAI per-call timeout. Tuned for the synchronous API route
 * (Netlify cap = 30s, leaves ~5s for fetch + DB + SDK overhead). The
 * cron passes a larger value (e.g. 90_000) since background functions
 * have a 15 min budget.
 */
const DEFAULT_OPENAI_TIMEOUT_MS = 25_000;

/**
 * Long podcasts can produce 200K+ char transcripts; sending all of that
 * to the model both inflates latency past the 30s budget and risks
 * hitting context-window or rate-limit issues. Three tiers:
 *   - ≤ 50K:      no truncation (typical 30 min video)
 *   - 50K – 150K: 32K head + 14K tail (~46K total, ~11K tokens)
 *   - > 150K:     28K head + 12K tail (~40K total, ~10K tokens)
 */
const TRANSCRIPT_MAX_CHARS = 50_000;
const TRANSCRIPT_AGGRESSIVE_THRESHOLD = 150_000;
const TRANSCRIPT_HEAD_CHARS = 32_000;
const TRANSCRIPT_TAIL_CHARS = 14_000;
const TRANSCRIPT_HEAD_CHARS_AGGRESSIVE = 28_000;
const TRANSCRIPT_TAIL_CHARS_AGGRESSIVE = 12_000;

function maybeTruncateTranscript(text: string): string {
  if (text.length <= TRANSCRIPT_MAX_CHARS) return text;
  const aggressive = text.length > TRANSCRIPT_AGGRESSIVE_THRESHOLD;
  const headSize = aggressive ? TRANSCRIPT_HEAD_CHARS_AGGRESSIVE : TRANSCRIPT_HEAD_CHARS;
  const tailSize = aggressive ? TRANSCRIPT_TAIL_CHARS_AGGRESSIVE : TRANSCRIPT_TAIL_CHARS;
  const head = text.slice(0, headSize).trimEnd();
  const tail = text.slice(-tailSize).trimStart();
  return `${head}\n\n[…]\n\n${tail}`;
}

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
- Ignore et supprime tout artefact technique de sous-titrage ou crédit de captions (ex. « Sous-titrage ST' 501 »), qui n'est jamais du contenu éditorial.
- Aucune référence entre parenthèses.
- Mets en **gras** les chiffres clés, noms propres et termes importants.
- Structure obligatoire :

## INTRO
Une phrase de synthèse, factuelle, sans mention de la source.

## POINTS CLÉS
- **Point 1**

  2-4 phrases détaillées avec chiffres, noms, faits marquants, écrites comme un paragraphe d'article.

- **Point 2**

  …

(entre 5 et 15 bullet points selon la longueur ; pour chaque point : titre en **gras** seul sur sa ligne, ligne vide, puis le paragraphe indenté de deux espaces)

## CONCLUSION
Une courte conclusion factuelle de 1-2 phrases, qui synthétise l'enjeu principal sans mentionner la source. Le titre doit être exactement "## CONCLUSION" en majuscules.

- Longueur cible indicative : ${targetRange} mots, MAIS sans jamais dépasser ${SUMMARY_MAX_CHARS} caractères au total.
- Sois factuel et informatif, avec anecdotes ou détails surprenants quand ils sont présents.
- Termine toujours par la section "## CONCLUSION" et sa phrase finale complète.

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
- Ignore and remove any technical caption/subtitle artifact or credit (for example "Sous-titrage ST' 501"); it is never editorial content.
- No parenthetical references.
- Use **bold** for key figures, proper nouns, and important terms.
- Mandatory structure:

## TL;DR
One factual summary sentence, with no mention of the source.

## KEY POINTS
- **Point 1**

  2-4 detailed sentences with figures, names, key facts, written as an article paragraph.

- **Point 2**

  …

(between 5 and 15 bullet points depending on length; for each point: bold title alone on its line, blank line, then the paragraph indented by two spaces)

## CONCLUSION
A short factual conclusion of 1-2 sentences that synthesizes the main stake without mentioning the source. The heading must be exactly "## CONCLUSION" in uppercase.

- Indicative target length: ${targetRange} words, but NEVER exceed ${SUMMARY_MAX_CHARS} characters total.
- Be factual and informative; include surprising anecdotes or details when they appear in the material.
- Always end with the "## CONCLUSION" section and its complete final sentence.

FINAL REMINDER: the full Markdown output MUST be at most ${SUMMARY_MAX_CHARS} characters and end with a complete sentence, never with "…" or "...". If you risk going over, write fewer bullets or shorter paragraphs from the start instead of truncating the ending.`;
}

/**
 * Tiny LLM call that rewrites a video title in the target lang.
 *
 * - Returns the translated title (single line, no quotes / markdown).
 * - Returns `null` when the source is empty, the API key is missing,
 *   the call errors out, or the response would degrade the original
 *   (e.g. came back wrapped in quotes that we can't safely strip).
 * - Caller persists the result in `video_transcriptions.title_localized`.
 *   On `null`, the column is left unset and the read side falls back
 *   to `youtube_videos.title` — same display as before migration 023.
 *
 * Cost: ~50 input tokens, ~30 output tokens with `gpt-4.1-mini`.
 * Worst case under the synchronous route's 25 s timeout, the title
 * translation is allowed up to 8 s before we abandon and persist the
 * row without it.
 */
async function translateVideoTitle(
  client: OpenAI,
  sourceTitle: string,
  targetLang: "en" | "fr",
  model: string,
  timeoutMs: number,
): Promise<string | null> {
  const trimmed = sourceTitle.trim();
  if (!trimmed) return null;

  const system =
    targetLang === "fr"
      ? `Tu traduis un titre de vidéo YouTube en français journalistique.

Règles strictes :
- Réponds UNIQUEMENT par le titre traduit, sur une seule ligne, sans guillemets, sans markdown, sans préfixe/suffixe.
- Si le titre est déjà en français, renvoie-le tel quel (corrige seulement les fautes manifestes ou la casse exagérée).
- Conserve les noms propres, marques, sigles, chiffres et unités.
- Conserve la ponctuation et la structure (« : », « — », « ? », « ! »…).
- Pas d'ajout ni d'omission d'information : pas de reformulation marketing.
- Vise un titre court (≤ 110 caractères). Si le titre source est plus long, condense légèrement sans perdre les noms propres et chiffres clés.`
      : `You translate a YouTube video title into journalistic English.

Strict rules:
- Reply ONLY with the translated title, on a single line, no quotes, no markdown, no prefix/suffix.
- If the title is already in English, return it as-is (fix obvious typos or excessive caps only).
- Keep proper nouns, brands, acronyms, numbers, and units.
- Preserve punctuation and structure (":", "—", "?", "!"…).
- No added or omitted information; do not reword for marketing.
- Aim for a short title (≤ 110 characters). If the source is longer, condense slightly without losing proper nouns and key figures.`;

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: trimmed },
        ],
      },
      { timeout: timeoutMs },
    );
    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = raw
      .replace(/^\s*["“«]+|["”»]+\s*$/g, "")
      .split(/\r?\n/)[0]
      .trim();
    if (!cleaned) return null;
    if (cleaned === trimmed) return cleaned;
    return cleaned;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.warn(
      `[transcribe] translateVideoTitle failed (lang=${targetLang}, model=${model}): ${msg}`,
    );
    return null;
  }
}

function buildTranslatePrompt(targetLang: string): string {
  if (targetLang === "fr") {
    return `Tu es un traducteur expert. Traduis le résumé Markdown suivant en français.

Règles :
- Conserve exactement la même structure Markdown (## INTRO, ## POINTS CLÉS, bullet points, ## CONCLUSION).
- Conserve le **gras** sur les mêmes termes.
- Traduis "## KEY POINTS" en "## POINTS CLÉS", remplace "## TL;DR" par "## INTRO", et conserve/ajoute le titre final "## CONCLUSION" en majuscules.
- Les titres "## INTRO", "## POINTS CLÉS" et "## CONCLUSION" doivent être strictement en majuscules.
- Pour chaque point : titre en **gras** seul sur sa ligne, ligne vide, puis le paragraphe indenté de deux espaces (préserve ce format si l'original l'utilise, et applique-le si l'original a le titre et le paragraphe sur la même ligne).
- Si le résumé source n'a pas de conclusion, ajoute une courte section finale "## CONCLUSION" de 1-2 phrases.
- Supprime tout artefact technique de sous-titrage ou crédit de captions (ex. « Sous-titrage ST' 501 »).
- Ne résume pas davantage, traduis fidèlement.
- LIMITE STRICTE : la traduction Markdown doit faire au maximum ${SUMMARY_MAX_CHARS} caractères. La traduction française est en général plus longue que l'anglais ; si la traduction fidèle dépasse cette limite, raccourcis légèrement les paragraphes pour rester sous ${SUMMARY_MAX_CHARS} caractères tout en gardant les chiffres, noms propres et faits clés.`;
  }

  return `You are an expert translator. Translate the following Markdown summary into English.

Rules:
- Keep the exact same Markdown structure (## TL;DR, ## KEY POINTS, bullet points, ## CONCLUSION).
- Keep **bold** on the same terms.
- Translate "## POINTS CLÉS" to "## KEY POINTS", replace "## INTRO" with "## TL;DR", and keep/add the final heading "## CONCLUSION" in uppercase.
- The headings "## TL;DR", "## KEY POINTS" and "## CONCLUSION" must be strictly uppercase.
- For each point: bold title alone on its line, blank line, then the paragraph indented by two spaces (preserve this format if the source uses it, and apply it if the source has the title and paragraph on the same line).
- If the source summary has no conclusion, add a short final "## CONCLUSION" section of 1-2 sentences.
- Remove any technical caption/subtitle artifact or credit (for example "Sous-titrage ST' 501").
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

export type TranscribeStatus =
  | "ok"
  | "cached"
  | "no_transcript"
  | "ai_timeout"
  | "ai_error"
  | "rate_limit"
  | "no_openai"
  | "db_error"
  | "bad_input";

export interface TranscribeResult {
  status: TranscribeStatus;
  videoId: string;
  lang: "en" | "fr";
  cached: boolean;
  /** Set when status === "ok" or "cached". */
  summaryMd?: string;
  /** Raw error message (for logs / surfacing to the API caller). */
  errorMessage?: string;
}

export interface TranscribeMeta {
  /** Title used both for slug computation and the DB row's `title`. */
  title?: string;
  /** Channel id stored on the DB row (used for joins/audits). */
  channelId?: string;
}

export interface TranscribeOptions {
  /** OpenAI per-call timeout. Default 25_000 (synchronous API route).
   *  Pass a larger value (e.g. 180_000) for the background cron. */
  openaiTimeoutMs?: number;
  /** OpenAI chat model override. Default `gpt-5.5`. */
  model?: string;
  /** v2.10.3+ — when `true`, the resulting bullets are mirrored into
   *  `summary_bullets` (`source_type='video'`). Default `false` so
   *  user-triggered routes (synchronous `transcribe`, prewarm) never
   *  write bullet rows. Only the background cron passes `true` — the
   *  cron also runs a separate backfill pass for any video whose
   *  transcription row exists without bullets (e.g. previously written
   *  by a user click before this flag landed). */
  persistBullets?: boolean;
}

/**
 * Transcribe + summarize a single video for a given language.
 * See module doc above for the full pipeline.
 */
export async function transcribeVideo(
  videoId: string,
  lang: "en" | "fr",
  meta: TranscribeMeta = {},
  opts: TranscribeOptions = {},
): Promise<TranscribeResult> {
  if (!videoId) {
    return { status: "bad_input", videoId, lang, cached: false, errorMessage: "videoId is required" };
  }
  const safeLang: "en" | "fr" = lang === "fr" ? "fr" : "en";
  const openaiTimeoutMs = opts.openaiTimeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS;
  const model = opts.model ?? DEFAULT_AI_MODEL;
  const { title, channelId } = meta;

  // Fast path: cache hit. Same shape as the API route's previous behavior.
  const cached = await getVideoTranscription(videoId, safeLang);
  if (cached) {
    return {
      status: "cached",
      videoId,
      lang: safeLang,
      cached: true,
      summaryMd: normalizeSummaryHeadings(cached.summary_md ?? "", safeLang),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: "no_openai", videoId, lang: safeLang, cached: false, errorMessage: "OPENAI_API_KEY not configured" };
  }

  try {
    const otherLang: "en" | "fr" = safeLang === "fr" ? "en" : "fr";
    const otherCached = await getVideoTranscription(videoId, otherLang);

    let summaryMd: string;
    let transcriptText: string;
    let wordCount: number;
    let durationSec = 0;

    if (otherCached && otherCached.summary_md) {
      // Translate path — much faster than re-running the full pipeline.
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: buildTranslatePrompt(safeLang) },
            { role: "user", content: otherCached.summary_md },
          ],
        },
        { timeout: openaiTimeoutMs },
      );
      // compressSummaryIfNeeded is intentionally skipped: each retry is
      // another 10-20s OpenAI call and would push us past the 30s budget
      // on the synchronous route. The prompt already enforces the cap;
      // an oversized output is acceptable, a 502 is not.
      summaryMd = stripSubtitleCreditArtifacts(stripCodeFences(
        stripTrailingEllipsis(completion.choices[0]?.message?.content ?? ""),
      ));
      transcriptText = otherCached.transcript;
      wordCount = otherCached.word_count ?? 0;
    } else {
      // Full pipeline: fetch transcript + GPT summary.
      const transcript = await getVideoTranscript(videoId);
      const target = targetWords(transcript.wordCount);
      durationSec = transcript.durationSec;

      const truncatedTranscript = maybeTruncateTranscript(transcript.text);
      if (truncatedTranscript.length < transcript.text.length) {
        const tier = transcript.text.length > TRANSCRIPT_AGGRESSIVE_THRESHOLD ? "aggressive" : "normal";
        console.warn(
          `[transcribe] truncated transcript for ${videoId} (${tier}): ${transcript.text.length} -> ${truncatedTranscript.length} chars, words=${transcript.wordCount}`,
        );
      }

      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: buildSummaryPrompt(safeLang, target) },
            { role: "user", content: truncatedTranscript },
          ],
        },
        { timeout: openaiTimeoutMs },
      );
      summaryMd = stripSubtitleCreditArtifacts(stripCodeFences(
        stripTrailingEllipsis(completion.choices[0]?.message?.content ?? ""),
      ));
      transcriptText = transcript.text;
      wordCount = transcript.wordCount;

      // Persist duration on the cached video row (best-effort).
      if (durationSec > 0) {
        try {
          const dbP = getServerClient();
          if (dbP) {
            const db = await dbP;
            await db.from("youtube_videos").update({ duration_sec: durationSec }).eq("video_id", videoId);
          }
        } catch { /* non-critical */ }
      }
    }

    // Fetch topic_id + published_date + channel_title from the cached
    // video row. The first two are needed to compute the SSR slug —
    // without either, the per-video page /{topic}/v/{date}/{slug}
    // cannot exist (the row is still inserted, just without
    // slug_keywords; backfill can fix it later). `channel_title` is
    // used by the bullet-fan-out below to populate `refs[0].source`
    // so the persisted bullets carry an attributable channel name
    // (v2.10.3+).
    let topicId: string | null = null;
    let publishedDate: string | null = null;
    let channelTitle: string | null = null;
    try {
      const dbP = getServerClient();
      if (!dbP) throw new Error("Supabase env missing");
      const db = await dbP;
      const { data: vid } = await db
        .from("youtube_videos")
        .select("topic_id, published_date, channel_title")
        .eq("video_id", videoId)
        .single();
      if (vid?.topic_id) topicId = vid.topic_id;
      if (vid?.published_date) publishedDate = vid.published_date;
      if (vid?.channel_title) channelTitle = vid.channel_title;
    } catch { /* non-critical */ }

    // Compute slug if we have everything needed. Skipping is safe — the
    // row is still useful for the SPA, only the SSR page won't exist.
    let slug: string | null = null;
    if (topicId && publishedDate) {
      const base = slugifyVideoTitle(title ?? "Untitled", safeLang);
      if (base) {
        try {
          const dbP = getServerClient();
          if (!dbP) throw new Error("Supabase env missing");
          const db = await dbP;
          slug = await uniquifyVideoSlug(db, base, topicId, publishedDate, safeLang, videoId);
        } catch (err) {
          // Fall back to the base slug if the uniquifier query fails — a
          // potential collision is preferable to no slug at all.
          console.error(`[transcribe] uniquifyVideoSlug failed for ${videoId}:`, err);
          slug = base;
        }
      }
    }

    // Translate the YouTube title into the row's lang so the home page
    // and SSR pages display titles in the visitor's UI lang. Best-effort:
    // a failure here returns NULL and the read side falls back to
    // `youtube_videos.title` (same display as before migration 023).
    // Capped at 8 s so it never starves the surrounding 25 s synchronous
    // budget — gpt-4.1-mini typically returns in 1-3 s on these inputs.
    let titleLocalized: string | null = null;
    if (title && title.trim().length > 0) {
      titleLocalized = await translateVideoTitle(
        new OpenAI({ apiKey }),
        title,
        safeLang,
        model,
        Math.min(8000, openaiTimeoutMs),
      );
    }

    const transcriptionId = await insertVideoTranscription({
      video_id: videoId,
      channel_id: channelId ?? "",
      title: title ?? "Untitled",
      title_localized: titleLocalized,
      lang: safeLang,
      topic_id: topicId,
      transcript: transcriptText,
      summary_md: summaryMd,
      word_count: wordCount,
      slug_keywords: slug,
      published_date: publishedDate,
    });

    // v2.10.3+ — bullets are only persisted when the caller opts in.
    // User-triggered routes (synchronous transcribe button, prewarm GET)
    // leave the default `persistBullets=false` so a user click never
    // writes a row. The cron passes `true` and is the sole writer for
    // `source_type='video'`. The cron also runs a separate backfill
    // pass that picks up transcriptions whose bullets are missing.
    if (transcriptionId && opts.persistBullets === true) {
      const bulletRows = buildVideoBulletRows({
        transcriptionId,
        topicId,
        lang: safeLang,
        videoId,
        videoTitle: title ?? "Untitled",
        channelTitle,
        publishedDate,
        summaryMd,
      });
      if (bulletRows.length > 0) {
        const bulletsOk = await insertVideoBullets(bulletRows);
        if (!bulletsOk) {
          console.warn(
            `[transcribe] insertVideoBullets failed (videoId=${videoId}, lang=${safeLang}, transcriptionId=${transcriptionId}, rows=${bulletRows.length}) — backfill pass will retry`,
          );
        }
      }
    }

    return {
      status: "ok",
      videoId,
      lang: safeLang,
      cached: false,
      summaryMd: normalizeSummaryHeadings(summaryMd, safeLang),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    // Always surface failures with the videoId so we can trace which
    // assets / models / API providers misbehave.
    console.error(`[transcribe] videoId=${videoId} lang=${safeLang} failed: ${msg}`);

    // Map well-known failure shapes to specific status codes. Order matters
    // — match the most specific signal first.
    let status: TranscribeStatus = "ai_error";
    if (/timeout|timed out|aborted/i.test(msg)) {
      status = "ai_timeout";
    } else if (/transcript .*404|no transcript|not available/i.test(msg)) {
      status = "no_transcript";
    } else if (/rate.?limit|429/i.test(msg)) {
      status = "rate_limit";
    }

    return { status, videoId, lang: safeLang, cached: false, errorMessage: msg };
  }
}

/**
 * Map a {@link TranscribeStatus} to a user-facing message in the right
 * lang. Used by the API route to keep the same surfaced wording as the
 * pre-refactor inline error mapping.
 */
export function transcribeStatusToUserMessage(
  status: TranscribeStatus,
  lang: "en" | "fr",
  fallback?: string,
): string | undefined {
  if (status === "ai_timeout") {
    return lang === "fr"
      ? "Vidéo trop longue : le résumé n'a pas tenu dans les 30 secondes allouées. Réessayez ; si l'erreur persiste, c'est que le contenu dépasse la capacité actuelle."
      : "Video too long: the summary did not fit within the 30-second budget. Retry; if it keeps failing, the content exceeds the current capacity.";
  }
  if (status === "no_transcript") {
    return lang === "fr"
      ? "Cette vidéo ne propose pas de sous-titres exploitables, transcription impossible."
      : "This video does not provide usable captions, transcription is not possible.";
  }
  if (status === "rate_limit") {
    return lang === "fr"
      ? "Limite de requêtes atteinte côté IA. Réessayez dans une minute."
      : "AI rate limit hit. Retry in about a minute.";
  }
  return fallback;
}

/** HTTP status code that the API route should return for a given outcome. */
export function transcribeStatusToHttpCode(status: TranscribeStatus): number {
  switch (status) {
    case "ok":
    case "cached":
      return 200;
    case "no_transcript":
      return 404;
    case "rate_limit":
      return 429;
    case "ai_timeout":
      return 504;
    case "no_openai":
      return 500;
    case "bad_input":
      return 400;
    default:
      return 502;
  }
}
