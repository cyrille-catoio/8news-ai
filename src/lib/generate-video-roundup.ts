/**
 * Core logic for the per-topic-per-day video roundup pages.
 *
 * Shared between:
 *  - `POST /api/roundups/generate` (owner-only, manual trigger)
 *  - `netlify/functions/cron-video-roundup-background.ts` (nightly,
 *    walks every (topic, lang) yesterday)
 *
 * Idempotent: re-running on the same (topic, date, lang) UPSERTS the
 * persisted row, so multiple cron ticks or a manual re-run after a fix
 * never create duplicates.
 *
 * No-op (status="no_videos") when fewer than {@link MIN_VIDEOS} have
 * been transcribed — a single-video roundup adds nothing to the per-
 * video `/v/` page.
 */

import OpenAI from "openai";
import {
  getVideoTranscriptionsForRoundup,
  upsertVideoRoundup,
} from "./supabase";

const AI_MODEL = "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = 25_000;

/** Min number of transcribed videos before a roundup makes sense. */
const MIN_VIDEOS = 2;

/** Per-video summary cap fed into the prompt. Keeps the request under
 *  a reasonable token budget when 8-10 videos are bundled. */
const PER_VIDEO_SUMMARY_MAX = 1500;

export type RoundupStatus = "ok" | "no_videos" | "no_openai" | "ai_invalid_json" | "ai_error" | "db_error";

export interface RoundupResult {
  status: RoundupStatus;
  videoCount: number;
  /** Set when status === "ok". */
  roundupId?: number;
  slug?: string;
  url?: string;
  /** Set when status starts with `ai_` or is `db_error` — raw debug. */
  errorMessage?: string;
}

interface GeneratedRoundup {
  seo_title: string;
  seo_description: string;
  slug_keywords: string;
  intro_md: string;
}

function buildPrompt(lang: "en" | "fr", date: string, topicId: string): string {
  if (lang === "fr") {
    return `Tu es un éditeur de presse. À partir des résumés vidéo ci-dessous (issus de chaînes YouTube transcrites par IA pour le topic "${topicId}" le ${date}), produis un méta-article qui convergera les sujets communs.

Réponds UNIQUEMENT en JSON strict (pas de prose autour) avec exactement ces 4 champs :
{
  "seo_title": "...",        // ≤ 70 caractères, accroche SEO, contient le mot-clé du topic
  "seo_description": "...",  // ≤ 160 caractères, résumé en une phrase de l'angle commun
  "slug_keywords": "...",    // 4-5 mots-clés en kebab-case, sans accents, ASCII (ex: "openai-gpt5-context-2m")
  "intro_md": "..."          // Paragraphe Markdown de 3 à 5 phrases qui annonce ce que les vidéos couvrent ensemble. Style journalistique factuel. Mets en **gras** les noms propres et chiffres clés. Ne mentionne JAMAIS les vidéos ni les chaînes par leur nom — présente directement le sujet.
}`;
  }
  return `You are a news editor. From the video summaries below (AI-transcribed YouTube channels covering the "${topicId}" topic on ${date}), produce a meta-article that converges the common threads.

Respond ONLY in strict JSON (no surrounding prose) with exactly these 4 fields:
{
  "seo_title": "...",        // ≤ 70 chars, SEO-friendly hook, includes the topic keyword
  "seo_description": "...",  // ≤ 160 chars, one-sentence summary of the common angle
  "slug_keywords": "...",    // 4-5 keywords in kebab-case, ASCII only (e.g. "openai-gpt5-context-2m")
  "intro_md": "..."          // Markdown paragraph of 3-5 sentences announcing what the videos collectively cover. Factual journalistic tone. Use **bold** for proper nouns and key figures. NEVER mention the videos or channels by name — present the subject directly.
}`;
}

function extractJson(raw: string): unknown | null {
  // Be lenient: GPT sometimes wraps JSON in ```json fences despite the
  // instruction. Strip the fences then parse.
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

function sanitizeSlug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function generateVideoRoundup(
  topicId: string,
  date: string,
  lang: "en" | "fr",
): Promise<RoundupResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: "no_openai", videoCount: 0, errorMessage: "OPENAI_API_KEY not configured" };
  }

  // Pull every transcribed video the topic published on `date`.
  const videos = await getVideoTranscriptionsForRoundup(topicId, date, lang);
  if (videos.length < MIN_VIDEOS) {
    return { status: "no_videos", videoCount: videos.length };
  }

  // Concatenate the videos into the user message.
  const userPayload = videos
    .map((v, i) => {
      const trimmed = v.summary_md.length > PER_VIDEO_SUMMARY_MAX
        ? v.summary_md.slice(0, PER_VIDEO_SUMMARY_MAX) + "…"
        : v.summary_md;
      return `--- Video ${i + 1} (${v.video_id}) ---\n${trimmed}`;
    })
    .join("\n\n");

  let generated: GeneratedRoundup;
  try {
    const openai = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS });
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: buildPrompt(lang, date, topicId) },
        { role: "user", content: userPayload },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = extractJson(raw);
    if (!parsed || typeof parsed !== "object") {
      console.error(`[generateVideoRoundup] non-JSON response for topic=${topicId} date=${date} lang=${lang}: ${raw.slice(0, 200)}`);
      return { status: "ai_invalid_json", videoCount: videos.length, errorMessage: raw.slice(0, 500) };
    }
    const obj = parsed as Record<string, unknown>;
    if (
      typeof obj.seo_title !== "string" ||
      typeof obj.slug_keywords !== "string" ||
      typeof obj.intro_md !== "string"
    ) {
      return { status: "ai_invalid_json", videoCount: videos.length, errorMessage: "Missing required fields" };
    }
    generated = {
      seo_title: obj.seo_title.slice(0, 100),
      seo_description: typeof obj.seo_description === "string" ? obj.seo_description.slice(0, 200) : "",
      slug_keywords: sanitizeSlug(obj.slug_keywords) || `roundup-${date}`,
      intro_md: obj.intro_md.trim(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[generateVideoRoundup] OpenAI failed for topic=${topicId} date=${date} lang=${lang}: ${msg}`);
    return { status: "ai_error", videoCount: videos.length, errorMessage: msg };
  }

  const row = await upsertVideoRoundup({
    topic_id: topicId,
    roundup_date: date,
    lang,
    slug_keywords: generated.slug_keywords,
    seo_title: generated.seo_title,
    seo_description: generated.seo_description,
    intro_md: generated.intro_md,
    video_ids: videos.map((v) => v.video_id),
  });

  if (!row) {
    return { status: "db_error", videoCount: videos.length, errorMessage: "Failed to persist roundup" };
  }

  return {
    status: "ok",
    videoCount: videos.length,
    roundupId: row.id,
    slug: row.slug_keywords,
    url: `/${topicId}/r/${date}/${row.slug_keywords}`,
  };
}
