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
  insertVideoRoundupBullets,
} from "./supabase";

/**
 * Roundups are the editorial flagship — use the strongest model. Same
 * choice as `/api/news/top-summary`. Slower than gpt-4.1-mini but the
 * caller is the nightly cron (background function, 15 min budget) so
 * latency is not a concern; quality is.
 */
const AI_MODEL = "gpt-5.3-chat-latest";
const OPENAI_TIMEOUT_MS = 500_000;

/** Min number of transcribed videos before a roundup makes sense. */
const MIN_VIDEOS = 2;

/** Per-video summary cap fed into the prompt. Keeps the request under
 *  a reasonable token budget when 8-10 videos are bundled. */
const PER_VIDEO_SUMMARY_MAX = 1500;

/**
 * Window (in days, inclusive on both bounds) used by the cron to fetch
 * source videos. A roundup keyed to roundup_date=X bundles videos with
 * published_date in [X - (WINDOW_DAYS - 1), X]. With WINDOW_DAYS=2 this
 * is the last 48 h up to end-of-day X — usually enough material for a
 * dense 8-bullet briefing even on slower news days.
 */
const WINDOW_DAYS = 2;

/**
 * Briefing target shape. Tuned together: 8 bullets × 3-5 sentences
 * gives ~25-40 sentences of structured editorial — long enough to feel
 * substantial vs the previous one-paragraph intro, short enough to stay
 * scannable on mobile. The model is told to prefer 4 sentences/bullet.
 */
const TARGET_BULLET_COUNT = 8;

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

interface BulletDef {
  title: string;
  body: string;
}

interface GeneratedRoundup {
  seo_title: string;
  seo_description: string;
  slug_keywords: string;
  bullets: BulletDef[];
}

function buildPrompt(lang: "en" | "fr", date: string, topicId: string): string {
  if (lang === "fr") {
    return `Tu es un éditeur de presse expert spécialisé en synthèse éditoriale. À partir des résumés vidéo ci-dessous (issus de chaînes YouTube transcrites par IA pour le topic "${topicId}" le ${date}), produis un briefing structuré qui couvre les sujets traités du jour.

Réponds UNIQUEMENT en JSON strict (pas de prose autour, pas de \`\`\`fences) avec exactement ces 4 champs :

{
  "seo_title": "...",        // ≤ 70 caractères. Accroche SEO PUNCHY avec des termes spécifiques de l'actualité couverte (noms propres, produits, chiffres, événements concrets). Pas de formulation générique du type "Briefing tech du jour" ou "L'actu IA en bref". Exemples valides: "Sora 2 contre Veo 3 : OpenAI riposte avec un mode caméra natif" / "GPT-5 passe à 2M de contexte, Anthropic réplique avec Claude 4.6".
  "seo_description": "...",  // ≤ 160 caractères. Phrase unique qui contient au minimum 3 termes spécifiques (noms de produits, chiffres clés, entreprises, dates).
  "slug_keywords": "...",    // 5 à 7 mots-clés en kebab-case, ASCII strict (pas d'accents). Doit reprendre les termes spécifiques les plus distinctifs du jour. Exemple: "openai-sora-2-veo-3-camera-native". INTERDIT: mots génériques (news, briefing, daily, ai, tech, video, today).
  "bullets": [               // EXACTEMENT ${TARGET_BULLET_COUNT} entrées, dans l'ordre éditorial décroissant d'importance.
    { "title": "...", "body": "..." },
    ...
  ]
}

Règles strictes pour chaque bullet :
- "title" : 3 à 8 mots, accroche journalistique avec un nom propre, un produit ou un chiffre clé en évidence (ex: "GPT-5 passe à 2M tokens", "Mistral lève 1 Md€"). Pas de point final.
- "body" : 3 à 5 phrases (cible 4) en Markdown. Style éditorial dense, factuel, journalistique. Utilise **gras** pour les noms propres, chiffres, dates, produits. Ne mentionne JAMAIS les vidéos, les chaînes YouTube ou les speakers par leur nom — présente directement le sujet comme un article de presse.
- Les ${TARGET_BULLET_COUNT} bullets doivent couvrir des angles distincts (zéro redondance). Si le matériel source est mince sur certains angles, regroupe les angles complémentaires plutôt que de répéter ; vise la densité informationnelle, pas le remplissage.`;
  }
  return `You are an expert news editor specialized in editorial synthesis. From the video summaries below (AI-transcribed YouTube channels covering the "${topicId}" topic on ${date}), produce a structured briefing that covers the day's stories.

Respond ONLY in strict JSON (no surrounding prose, no \`\`\`fences) with exactly these 4 fields:

{
  "seo_title": "...",        // ≤ 70 chars. PUNCHY SEO hook with specific terms from the actual stories covered (proper nouns, products, numbers, concrete events). No generic phrasing like "Daily tech briefing" or "Today's AI news". Valid examples: "Sora 2 vs Veo 3: OpenAI strikes back with native camera mode" / "GPT-5 jumps to 2M context, Anthropic replies with Claude 4.6".
  "seo_description": "...",  // ≤ 160 chars. Single sentence containing at least 3 specific terms (product names, key figures, companies, dates).
  "slug_keywords": "...",    // 5-7 kebab-case keywords, strict ASCII. Must use the most distinctive specific terms of the day. Example: "openai-sora-2-veo-3-camera-native". FORBIDDEN: generic words (news, briefing, daily, ai, tech, video, today).
  "bullets": [               // EXACTLY ${TARGET_BULLET_COUNT} entries, in decreasing editorial importance.
    { "title": "...", "body": "..." },
    ...
  ]
}

Strict rules for each bullet:
- "title": 3 to 8 words, journalistic hook with a proper noun, product or key figure prominent (e.g. "GPT-5 jumps to 2M tokens", "Mistral raises €1B"). No trailing period.
- "body": 3 to 5 sentences (target 4) in Markdown. Dense editorial style, factual, journalistic. Use **bold** for proper nouns, figures, dates, products. NEVER mention the videos, YouTube channels, or speakers by name — present the subject directly as a press article would.
- The ${TARGET_BULLET_COUNT} bullets must cover distinct angles (zero redundancy). If the source material is thin on some angles, merge complementary angles rather than repeat; aim for informational density, not filler.`;
}

/** Serialize the {title, body} bullet array into the Markdown that
 *  ends up in `video_roundups.intro_md`. The SSR page renders this
 *  with ReactMarkdown — `### Title` becomes a styled h3, the body
 *  paragraphs render normally below. Keeping the storage as a single
 *  Markdown string (vs JSONB) avoids a schema migration. */
function bulletsToMarkdown(bullets: BulletDef[]): string {
  return bullets
    .map((b) => {
      const title = b.title.replace(/\.+$/, "").trim();
      const body = b.body.trim();
      return `### ${title}\n\n${body}`;
    })
    .join("\n\n");
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

  // Pull every transcribed video the topic published in the last
  // {@link WINDOW_DAYS} days up to and including `date`. The roundup
  // is still keyed to (topic, date, lang) — the wider source window
  // just gives the model more material to converge on.
  const fromDate = new Date(`${date}T00:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (WINDOW_DAYS - 1));
  const fromDateStr = fromDate.toISOString().slice(0, 10);
  const videos = await getVideoTranscriptionsForRoundup(topicId, fromDateStr, date, lang);
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
      !Array.isArray(obj.bullets)
    ) {
      return { status: "ai_invalid_json", videoCount: videos.length, errorMessage: "Missing required fields (seo_title / slug_keywords / bullets)" };
    }
    // Filter to well-formed { title, body } pairs. The model is told to
    // return EXACTLY 8, but we accept any non-empty subset rather than
    // failing the whole roundup — a 6-bullet briefing is still useful.
    const rawBullets = obj.bullets as unknown[];
    const bullets: BulletDef[] = [];
    for (const raw of rawBullets) {
      if (raw && typeof raw === "object") {
        const r = raw as Record<string, unknown>;
        if (typeof r.title === "string" && typeof r.body === "string" && r.title.trim() && r.body.trim()) {
          bullets.push({ title: r.title.trim(), body: r.body.trim() });
        }
      }
    }
    if (bullets.length === 0) {
      return { status: "ai_invalid_json", videoCount: videos.length, errorMessage: "bullets array contained no valid entries" };
    }
    generated = {
      seo_title: obj.seo_title.slice(0, 100),
      seo_description: typeof obj.seo_description === "string" ? obj.seo_description.slice(0, 200) : "",
      slug_keywords: sanitizeSlug(obj.slug_keywords) || `roundup-${date}`,
      bullets,
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
    intro_md: bulletsToMarkdown(generated.bullets),
    video_ids: videos.map((v) => v.video_id),
  });

  if (!row) {
    return { status: "db_error", videoCount: videos.length, errorMessage: "Failed to persist roundup" };
  }

  // Mirror the structured bullets into summary_bullets (one row per
  // bullet) so they're queryable side-by-side with the article + video
  // bullets — same `source_type` discriminator pattern used for the
  // other surfaces. Failure here is logged but non-fatal: the roundup
  // page itself reads from `intro_md`, not from these rows.
  const bulletRows = generated.bullets.map((b, i) => ({
    video_roundup_id: row.id,
    topic_id: topicId,
    lang,
    summary_date: date,
    bullet_index: i,
    text: `**${b.title.replace(/\.+$/, "").trim()}**\n\n${b.body.trim()}`,
    source_type: "video_roundup",
    entities: [],
  }));
  const bulletsOk = await insertVideoRoundupBullets(bulletRows);
  if (!bulletsOk) {
    console.warn(
      `[generateVideoRoundup] roundup ${row.id} persisted but summary_bullets mirror failed for topic=${topicId} date=${date} lang=${lang}`,
    );
  }

  return {
    status: "ok",
    videoCount: videos.length,
    roundupId: row.id,
    slug: row.slug_keywords,
    url: `/${topicId}/r/${date}/${row.slug_keywords}`,
  };
}
