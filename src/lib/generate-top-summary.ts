/**
 * Shared core for the daily Top articles AI summary.
 *
 * Two callers:
 *  - `netlify/functions/cron-top-summary-background.ts` — primary
 *    production driver. Runs once a day on cron-job.org, generates a
 *    fresh snapshot for both langs, persists into `top_summaries` +
 *    mirrors bullets into `summary_bullets`.
 *  - `src/app/api/news/top-summary/route.ts` — legacy POST endpoint
 *    kept for manual debug / replay. The /top-articles UI no longer
 *    calls it.
 *
 * Pipeline:
 *  1. Pull the top 50 articles of the past 24 h (excluding hidden
 *     topics) via `getTopArticlesForStats`.
 *  2. Build the `ArticleSummary[]` payload + the editorial prompt
 *     (FR or EN).
 *  3. Call `analyzeWithAI` with `gpt-5.5` — returns bullets each
 *     carrying { title, text, refs }. v2.19+: when the caller passes
 *     the EN edition's bullets (`pivotBullets`), the FR edition is a
 *     cheap TRANSLATION of them instead (identical groups/scores).
 *  4. Persist a frozen snapshot of the input articles + the rendered
 *     `summary_md` into `top_summaries` (one row per (date, lang)).
 *  5. Mirror per-bullet detail into `summary_bullets`
 *     (source_type='top50') keyed on (lang, summary_date) so the GET
 *     read path can hydrate structured data without parsing markdown.
 *
 * Idempotent: a re-run on the same (summary_date, lang) deletes the
 * previous row first (both for `top_summaries` and the matching
 * `summary_bullets` rows) before re-inserting. This is what makes
 * intra-day re-ticks safe.
 */

import OpenAI from "openai";
import { analyzeWithAI } from "./ai-analyze";
import {
  getHiddenTopicIds,
  getTopArticlesForStats,
  getTopVideosForDate,
  insertTopSummaryBullets,
  upsertTopSummary,
  type TopSummaryArticle,
  type TopVideoForDateRow,
} from "./supabase";
import type { Lang } from "./i18n";
import type { ArticleSummary, SummaryBullet } from "./types";
import { SNIPPET_MAX } from "./constants";
import { previousUtcDay } from "./dates-utc";
import { OPENAI_MODELS } from "./openai-models";

/** OpenAI model used for the editorial Top articles summary. */
export const TOP_SUMMARY_MODEL = OPENAI_MODELS.topSummary;

/** Top-50, last 24 h (rolling window). */
const TOP_DAYS = 1;
const TOP_LIMIT = 50;

/** Char cap on the snippet sent to the LLM (kept aligned with the
 *  legacy POST route to avoid surprising the prompt). */
const PROMPT_SNIPPET_MAX = 250;

/** How many « top videos of yesterday » bullets get pinned at the head
 *  of the Daily Podcast. */
const TOP_VIDEOS_COUNT = 2;

/** Hard cap on the bullet points persisted for the Daily Podcast —
 *  videos INCLUDED (2 videos + 6 article bullets on a normal day).
 *  Applies to every consumer of the snapshot (home hero, audio,
 *  newsletter, /{date} archive) since they all read `summary_bullets`.
 *  The LLM still produces its full 6-12 group briefing (kept in
 *  `summary_md` for the podcast-chat grounding); we keep only the most
 *  important bullets here. */
const TOTAL_BULLETS_MAX = 8;

/** Char cap on the condensed video summary used as the bullet body. */
const VIDEO_BULLET_MAX_CHARS = 450;

/** Absolute origin for the per-video SSR deep link stored in the
 *  bullet's ref — must be absolute so the same ref works in the SPA
 *  pills AND in the newsletter email. Same hardcoded origin as the SSR
 *  canonical URLs (see `src/lib/summary-routes.ts`). */
const SITE_ORIGIN = "https://8news.ai";

/**
 * Parse the optional `?langs=` query param of
 * `cron-top-summary-background` — a comma-separated subset of en/fr.
 * Used by the watchdog's self-heal re-trigger to regenerate ONLY the
 * missing lang without spending tokens on (and replacing) the healthy
 * one. Empty / absent / garbage input falls back to both langs, so the
 * daily cron-job.org tick (no param) keeps its existing behavior.
 */
export function parseTopSummaryLangsParam(raw: string | null | undefined): Lang[] {
  const ALL: Lang[] = ["en", "fr"];
  if (!raw) return ALL;
  const requested = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Lang => s === "en" || s === "fr");
  const dedup = [...new Set(requested)];
  return dedup.length > 0 ? dedup : ALL;
}

export function generateTopSummaryPrompt(lang: Lang): string {
  if (lang === "fr") {
    return [
      "Tu es un rédacteur en chef spécialisé dans l'actualité technologique. Tu produis un briefing quotidien de haut niveau.",
      "Tu reçois les 50 articles tech les mieux notés des dernières 24 heures.",
      "",
      "Structure du résumé : tu produis une liste de GROUPES THÉMATIQUES. Chaque groupe a un titre (« title ») unique et un tableau « bullets » qui contient 1 à 3 bullet points. Tu utilises plusieurs bullets dans un même groupe quand un même thème (par exemple une entreprise, un produit, un dossier) couvre plusieurs angles distincts qu'il vaut mieux séparer pour la lisibilité ; tu utilises un seul bullet quand le thème tient en un seul paragraphe cohérent.",
      "",
      "Règles strictes :",
      "1. Regroupe les articles par grand thème HOMOGÈNE (ex : Intelligence Artificielle, Cybersécurité, Cloud & Infrastructure, Hardware & Semi-conducteurs, Startups & Levées de fonds, Régulation & Politique tech…). Un GROUPE = un thème.",
      "2. Chaque bullet point couvre UN angle PRÉCIS du thème de son groupe. Ne mélange JAMAIS des sujets sans rapport entre eux dans le même groupe (ex : ne mets pas de géopolitique dans un groupe IA, sauf si le lien tech est direct comme les puces IA sous embargo).",
      "3. Pour chaque bullet point, rédige 3 à 5 phrases détaillées : explique les faits, nomme les entreprises/acteurs clés, et explique pourquoi c'est important pour l'industrie tech.",
      "4. Intègre systématiquement les CHIFFRES et DONNÉES concrètes mentionnés dans les articles (montants levés, pourcentages de croissance, nombre d'utilisateurs, benchmarks, prix, parts de marché…). Ajoute des ANECDOTES marquantes ou des détails surprenants quand les articles en contiennent, pour rendre le briefing vivant et mémorable.",
      "5. Produis entre 6 et 12 GROUPES, et entre 8 et 15 bullet points au TOTAL (toutes lignes « bullets » confondues), selon la richesse de l'actualité.",
      "6. Chaque bullet point DOIT référencer dans \"refs\" les indices de TOUS les articles qui alimentent ce bullet précisément (et pas tout le groupe). C'est essentiel pour que le lecteur puisse accéder aux bonnes sources.",
      "7. Si un article ne rentre dans aucun groupe cohérent, ignore-le plutôt que de forcer un regroupement artificiel.",
      "8. Sois factuel, précis et informatif. Le ton doit être celui d'un analyste tech professionnel qui sait captiver son audience.",
      "9. N'inclus JAMAIS de références aux articles, noms de sources ou numéros d'index dans le texte des bullet points (pas de citations entre parenthèses comme \"(Source)\", \"(Article 3)\", \"[TechCrunch]\", etc.). Les références sont gérées séparément via le tableau \"refs\".",
      "10. Pour CHAQUE groupe, produis un \"title\" : un titre court de 3 à 8 mots, accroche journalistique, ancré sur un nom propre, un produit ou un chiffre clé (ex : « OpenAI lève 40 Md$ », « Nvidia frôle les 4 000 Md$ », « Meta licencie 5 % de ses équipes IA »). Pas de guillemets, pas de ponctuation finale (ni point, ni « … »). Pas de chevrons. Le titre doit être informatif à lui seul (pas de teaser flou type « Une journée mouvementée pour la tech »).",
      "11. Si plusieurs bullets sont dans le même groupe, ils doivent vraiment partager un thème central et apporter chacun un angle différent (ex : « Nvidia frôle les 4 000 Md$ » avec un bullet sur la valorisation, un bullet sur les contrats data center, un bullet sur la réaction des concurrents). Si tu hésites, fais plutôt un groupe d'un seul bullet plutôt qu'un groupe artificiel.",
      "12. Pour CHAQUE groupe, produis un score d'importance éditoriale entier de 1 à 10 dans le champ \"importance\". Échelle calibrée comme le scoring article :",
      "    - 10 : breaking news majeure (régulation historique, M&A > 10 Md$, événement de marché > 5 %, crash, AGI/AGR notable, IPO emblématique)",
      "    - 9  : signal fort (lancement produit phare d'un acteur majeur, partenariat structurant, levée > 1 Md$, benchmark record d'un modèle frontier)",
      "    - 7-8: développement notable (release importante, levée 100 M-1 Md$, mouvement marché significatif, partenariat sourcé)",
      "    - 5-6: intéressant mais sans urgence (mise à jour produit, analyse sourcée, mouvement de fonds notable)",
      "    - 3-4: peu important (opinion sans faits nouveaux, analyse sans data)",
      "    - 1-2: anecdotique (rumeur, content marketing, top-list, contenu promotionnel)",
      "    Le score reflète l'importance d'aujourd'hui pour un lecteur tech professionnel. Sois exigeant : ne donne 9-10 que si l'événement est vraiment marquant à l'échelle de l'industrie.",
      "",
      "Réponds en JSON : {\"globalSummary\":[{\"title\":\"titre court accrocheur\",\"importance\":8,\"bullets\":[{\"text\":\"premier angle détaillé\",\"refs\":[0,1]},{\"text\":\"second angle détaillé\",\"refs\":[2]}]}]}. Ne renvoie AUCUN autre champ de premier niveau.",
    ].join("\n");
  }
  return [
    "You are an editor-in-chief specializing in technology news. You produce a high-level daily briefing.",
    "You receive the top 50 highest-scored tech articles from the last 24 hours.",
    "",
    "Summary structure: you produce a list of THEMATIC GROUPS. Each group has one \"title\" and a \"bullets\" array containing 1 to 3 bullet points. Use multiple bullets in a group when a single theme (e.g. a company, a product, a story) has several distinct angles worth separating for readability; use a single bullet when the theme fits one coherent paragraph.",
    "",
    "Strict rules:",
    "1. Group articles by HOMOGENEOUS theme (e.g. Artificial Intelligence, Cybersecurity, Cloud & Infrastructure, Hardware & Semiconductors, Startups & Fundraising, Tech Regulation & Policy…). One GROUP = one theme.",
    "2. Each bullet point covers ONE precise angle of its group's theme. NEVER mix unrelated topics inside the same group (e.g. do not mention geopolitics in an AI group unless the tech link is direct, like AI chips under embargo).",
    "3. For each bullet point, write 3-5 detailed sentences: explain the facts, name the key companies/players, and explain why it matters for the tech industry.",
    "4. Systematically include NUMBERS and CONCRETE DATA from the articles (funding amounts, growth percentages, user counts, benchmarks, prices, market share…). Add striking ANECDOTES or surprising details when the articles contain them, to make the briefing vivid and memorable.",
    "5. Produce 6-12 GROUPS and 8-15 bullet points TOTAL (across all \"bullets\" arrays combined), depending on how rich the news cycle is.",
    "6. Each bullet point MUST reference in \"refs\" the indices of ALL articles that feed THAT specific bullet (not the whole group). This is essential so readers can access the right sources.",
    "7. If an article does not fit any coherent group, skip it rather than forcing an artificial grouping.",
    "8. Be factual, precise, and informative. The tone should be that of a professional tech analyst who knows how to captivate their audience.",
    "9. NEVER include article references, source names, or index numbers inside the bullet text (no parenthetical citations like \"(Source)\", \"(Article 3)\", \"[TechCrunch]\", etc.). References are handled separately via the \"refs\" array.",
    "10. For EACH group, produce a \"title\": a short 3-8 word journalistic headline, anchored on a proper noun, product or key figure (e.g. \"OpenAI raises $40B\", \"Nvidia nears $4T market cap\", \"Meta cuts 5% of AI staff\"). No quotes, no trailing punctuation (no period, no ellipsis), no angle brackets. The title must be informative on its own (no vague teaser like \"A busy day in tech\").",
    "11. When a group has multiple bullets, they must genuinely share a central theme and each must bring a distinct angle (e.g. \"Nvidia nears $4T\" with one bullet on valuation, one on data-center contracts, one on competitor reaction). If in doubt, prefer a single-bullet group over an artificial multi-bullet one.",
    "12. For EACH group, produce an editorial importance integer score 1-10 in the \"importance\" field. Scale calibrated like article scoring:",
    "    - 10: major breaking news (historic regulation, M&A > $10B, market move > 5%, crash, notable AGI/AGR step, landmark IPO)",
    "    - 9 : strong signal (flagship product launch from a major player, structuring partnership, raise > $1B, frontier-model benchmark record)",
    "    - 7-8: notable development (significant release, $100M-$1B raise, meaningful market move, sourced partnership)",
    "    - 5-6: interesting but not urgent (product update, sourced analysis, notable fund flow)",
    "    - 3-4: low value (opinion without new facts, analysis without data)",
    "    - 1-2: anecdotal (rumor, content marketing, listicle, promotional content)",
    "    The score reflects how important THIS news is TODAY for a professional tech reader. Be demanding: only award 9-10 when the event is genuinely industry-defining.",
    "",
    "Respond with JSON: {\"globalSummary\":[{\"title\":\"short punchy headline\",\"importance\":8,\"bullets\":[{\"text\":\"first angle, detailed\",\"refs\":[0,1]},{\"text\":\"second angle, detailed\",\"refs\":[2]}]}]}. Do NOT return any other top-level field.",
  ].join("\n");
}

/** Strip markdown decoration (bold/italic markers, list bullets,
 *  heading hashes) so the extracted prose renders cleanly as the plain
 *  bullet text the Top 24h surfaces display verbatim. */
export function stripMarkdownInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Condense a video `summary_md` into a few-line bullet body — no extra
 * LLM round-trip. Takes the TL;DR / INTRO section first, appends the
 * first key point when there's room, and caps at
 * `VIDEO_BULLET_MAX_CHARS` on a word boundary.
 *
 * The summaries follow the `transcribe-video.ts` contract:
 *   ## TL;DR (EN) / ## INTRO (FR) → one factual sentence
 *   ## KEY POINTS / ## POINTS CLÉS → 5-15 titled bullets
 *   ## CONCLUSION → 1-2 sentence wrap-up
 * Falls back to the first non-heading paragraph for any summary that
 * doesn't match the expected shape.
 */
export function extractVideoBulletText(
  summaryMd: string,
  maxChars = VIDEO_BULLET_MAX_CHARS,
): string {
  let md = (summaryMd ?? "").trim();
  const fence = md.match(/^```[A-Za-z0-9_-]*\s*\n([\s\S]*?)\n```$/);
  if (fence) md = fence[1].trim();
  if (!md) return "";

  let intro = "";
  let firstPoint = "";
  const sections = md.split(/^##\s+/m).filter((s) => s.trim().length > 0);
  for (const sec of sections) {
    const nl = sec.indexOf("\n");
    const heading = (nl === -1 ? sec : sec.slice(0, nl)).trim().toUpperCase();
    const body = nl === -1 ? "" : sec.slice(nl + 1).trim();
    if (!intro && (heading.startsWith("TL;DR") || heading.startsWith("INTRO"))) {
      intro = stripMarkdownInline(body);
    } else if (
      !firstPoint &&
      (heading.startsWith("KEY POINT") || heading.startsWith("POINTS CL"))
    ) {
      // First key point = everything until the second `- ` bullet
      // marker (loose-list form keeps the body indented under it).
      const lines = body.split("\n");
      const collected: string[] = [];
      let bulletCount = 0;
      for (const line of lines) {
        if (/^\s*[-*]\s+/.test(line)) {
          bulletCount += 1;
          if (bulletCount > 1) break;
        }
        if (bulletCount >= 1) collected.push(line);
      }
      firstPoint = stripMarkdownInline(collected.join(" "));
    }
  }

  if (!intro) {
    // Fallback: first non-heading paragraph anywhere in the summary.
    const para = md
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .find((p) => p.length > 0 && !p.startsWith("#"));
    intro = stripMarkdownInline(para ?? "");
  }

  let out = intro;
  if (firstPoint && out.length + firstPoint.length + 1 <= maxChars) {
    out = out ? `${out} ${firstPoint}` : firstPoint;
  }
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(" ");
    out = `${cut.slice(0, lastSpace > maxChars * 0.6 ? lastSpace : maxChars).trimEnd()}…`;
  }
  return out;
}

/** Shape shared with the article bullet rows built in
 *  `generateTopSummary` below. */
interface TopSummaryBulletInsertRow {
  topic_id: string | null;
  lang: string;
  summary_date: string;
  bullet_index: number;
  title: string | null;
  text: string;
  refs: unknown;
  source_type: string;
  entities: string[];
  importance_score: number | null;
  video_transcription_id?: number | null;
}

/**
 * Build the « top videos of yesterday » bullets pinned at the head of
 * the Daily Podcast (bullet_index 0..N-1; the article bullets are
 * shifted by the returned array's length). One ref per bullet pointing
 * at the per-video SSR page (full AI summary + embedded player).
 */
function buildVideoBulletRows(
  videos: TopVideoForDateRow[],
  lang: Lang,
  summaryDate: string,
): TopSummaryBulletInsertRow[] {
  const rows: TopSummaryBulletInsertRow[] = [];
  for (const v of videos) {
    const body = extractVideoBulletText(v.summary_md);
    if (!body) continue;
    const ssrUrl = `${SITE_ORIGIN}/${v.topic_id}/v/${v.published_date}/${v.slug_keywords}`;
    // Keep the recap quality score's one-decimal precision (mig 034 /
    // 036): rounding to an integer here is what made « 9.3 » render as
    // « 9 » in the podcast. Clamp to [1,10] and round to one decimal.
    const importance = Math.round(Math.max(1, Math.min(10, v.summary_score)) * 10) / 10;
    rows.push({
      topic_id: v.topic_id,
      lang,
      summary_date: summaryDate,
      bullet_index: rows.length,
      title: v.title,
      text: `**${v.title}**\n\n${body}`,
      refs: [
        {
          title: v.title,
          link: ssrUrl,
          source: v.channel_title ?? "YouTube",
        },
      ],
      source_type: "top50",
      entities: [],
      importance_score: importance,
      video_transcription_id: v.id,
    });
  }
  return rows;
}

/**
 * Pick the article bullets for the capped Daily Podcast, MAXIMIZING the
 * number of distinct visible subjects.
 *
 * Consecutive same-title bullets are folded into their thematic group
 * (same logic as the UI's `groupBullets`) and groups are stable-sorted
 * by `importance` DESC (missing scores sink to 0). The selection then:
 *
 *  1. takes ONE bullet from each group, in importance order, until the
 *     budget is reached — so `budget` slots yield `budget` DISTINCT
 *     subjects (the UI folds same-title bullets into a single subject,
 *     so spending two slots on one multi-angle group used to silently
 *     drop the visible count, e.g. 8 bullets rendering as 6 subjects);
 *  2. only when there are FEWER groups than the budget (a thin-news
 *     day), backfills the remaining slots with the extra angles of the
 *     highest-importance groups — so the podcast still fills its
 *     `budget` bullets instead of shrinking.
 *
 * Output keeps each group's bullets consecutive and in narrative order,
 * so the UI re-folds them into one subject. Total bullets never exceed
 * `budget` (the 8-bullet podcast cap is preserved).
 */
export function selectTopArticleBullets<
  T extends { title?: string | null; importance?: number | null },
>(bullets: T[], budget: number): T[] {
  if (budget <= 0) return [];
  if (bullets.length <= budget) return bullets;

  const groups: Array<{ importance: number; bullets: T[] }> = [];
  for (const b of bullets) {
    const t = (b.title ?? "").trim();
    const last = groups[groups.length - 1];
    if (t && last && (last.bullets[0].title ?? "").trim() === t) {
      last.bullets.push(b);
    } else {
      groups.push({
        importance: typeof b.importance === "number" ? b.importance : 0,
        bullets: [b],
      });
    }
  }

  const sorted = groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (b.g.importance - a.g.importance) || (a.i - b.i))
    .map((d) => d.g);

  // How many bullets to keep from each group. Pass 1: one per group
  // (distinct subjects first). Pass 2: round-robin the extra angles of
  // the top groups only if groups ran out before the budget did.
  const take = new Map<(typeof sorted)[number], number>();
  let used = 0;
  for (const g of sorted) {
    if (used >= budget) break;
    take.set(g, 1);
    used += 1;
  }
  let progressed = true;
  while (used < budget && progressed) {
    progressed = false;
    for (const g of sorted) {
      if (used >= budget) break;
      const cur = take.get(g);
      if (cur !== undefined && cur < g.bullets.length) {
        take.set(g, cur + 1);
        used += 1;
        progressed = true;
      }
    }
  }

  const out: T[] = [];
  for (const g of sorted) {
    const n = take.get(g) ?? 0;
    for (let i = 0; i < n; i++) out.push(g.bullets[i]);
  }
  return out;
}

/**
 * FR edition via translation of the EN pivot (v2.19+)
 * ---------------------------------------------------
 * The daily cron used to run TWO independent gpt-5.5 editorial passes
 * (one per lang) over the same 50 articles. Each pass re-derived its
 * own thematic groups AND its own 1-10 importance scores, so the two
 * editions routinely disagreed (a story scored 8/10 in EN and 7/10 in
 * FR, groups split differently, hence a different 8-bullet selection).
 *
 * Now the EN pass is the single editorial source of truth; the FR
 * edition is a translation of its titles + bullet texts with the
 * structure, refs and importance scores preserved verbatim — identical
 * scores by construction, and the FR call no longer ships the 50
 * articles nor the editorial prompt (a cheaper model suffices for
 * translation). Same register as the transcribe-video cross-language
 * optimization. If the pivot is unavailable (EN failed, or the
 * watchdog self-heals FR alone via `?langs=fr`), the FR edition falls
 * back to the previous native generation.
 */

/** Payload sent to the translation call. `titles` holds the UNIQUE
 *  group titles in first-appearance order — translating each title
 *  exactly once guarantees the same-title runs stay identical after
 *  translation, so the UI's `groupBullets` folding is preserved.
 *  `texts` holds one entry per bullet, in order. */
export interface BulletTranslationPayload {
  titles: string[];
  texts: string[];
}

export function buildBulletTranslationPayload(
  bullets: SummaryBullet[],
): BulletTranslationPayload {
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const b of bullets) {
    const t = (b.title ?? "").trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      titles.push(t);
    }
  }
  return { titles, texts: bullets.map((b) => b.text) };
}

/**
 * Rebuild the bullet list from the translated payload. Refs and
 * importance are copied from the source bullets untouched; each
 * bullet's title is swapped for the translation of its group title.
 * Returns `null` when the translated arrays don't line up with the
 * source (wrong lengths, empty strings) so the caller can fall back
 * to native generation instead of persisting a broken edition.
 */
export function applyBulletTranslations(
  bullets: SummaryBullet[],
  translated: { titles?: unknown; texts?: unknown },
): SummaryBullet[] | null {
  const payload = buildBulletTranslationPayload(bullets);
  const titles = Array.isArray(translated.titles) ? translated.titles : null;
  const texts = Array.isArray(translated.texts) ? translated.texts : null;
  if (!titles || !texts) return null;
  if (titles.length !== payload.titles.length) return null;
  if (texts.length !== payload.texts.length) return null;

  const titleMap = new Map<string, string>();
  for (let i = 0; i < payload.titles.length; i++) {
    const t = String(titles[i] ?? "").trim();
    if (!t) return null;
    titleMap.set(payload.titles[i], t);
  }

  const out: SummaryBullet[] = [];
  for (let i = 0; i < bullets.length; i++) {
    const src = bullets[i];
    const text = String(texts[i] ?? "").trim();
    if (!text) return null;
    const srcTitle = (src.title ?? "").trim();
    out.push({
      ...src,
      text,
      title: srcTitle ? (titleMap.get(srcTitle) ?? null) : null,
    });
  }
  return out;
}

/** Grouped-markdown renderer — the exact layout `analyzeWithAI`
 *  produces for `summary_md` (group title in bold once, then `•` lines
 *  for every bullet that shares it). The translation path needs it to
 *  rebuild the FR `summary_md` without a second editorial pass. */
export function renderBulletsMarkdown(bullets: SummaryBullet[]): string {
  const lines: string[] = [];
  let prevTitle: string | null = null;
  let firstGroup = true;
  for (const b of bullets) {
    const t: string | null = b.title ?? null;
    if (t !== prevTitle) {
      if (!firstGroup) lines.push("");
      if (t) lines.push(`**${t}**`);
      prevTitle = t;
      firstGroup = false;
    }
    lines.push(`• ${b.text}`);
  }
  return lines.join("\n");
}

const TRANSLATE_SYSTEM_PROMPT = [
  "You are a professional EN→FR translator for a tech news publication.",
  "You receive a JSON object with two arrays: \"titles\" (short journalistic headlines) and \"texts\" (detailed briefing paragraphs).",
  "Translate every entry into French with the tone of a professional French tech analyst.",
  "Strict rules:",
  "1. Return a JSON object with the SAME two arrays, SAME lengths, SAME order: {\"titles\":[...],\"texts\":[...]}.",
  "2. Keep company names, product names, model names and people names unchanged.",
  "3. Keep all numbers, amounts and percentages exactly as given (you may localize units, e.g. \"$40B\" → « 40 Md$ »).",
  "4. Titles stay short (3-8 words), no quotes, no trailing punctuation.",
  "5. No emojis. Do not add, merge, drop or reorder entries.",
].join("\n");

/**
 * Translate the EN pivot bullets into French (titles + texts only) on
 * the cheap `topSummaryTranslate` model. Returns `null` on any
 * parse/shape failure so the caller falls back to native generation.
 */
async function translateTopSummaryBullets(
  bullets: SummaryBullet[],
  apiKey: string,
): Promise<SummaryBullet[] | null> {
  const payload = buildBulletTranslationPayload(bullets);
  const openai = new OpenAI({ apiKey, timeout: 240_000, maxRetries: 2 });

  // Two-attempt parse, same rationale as `analyzeWithAI`: a malformed
  // JSON response is cheap to retry and much cheaper than the fallback
  // (a full native gpt-5.5 editorial pass).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODELS.topSummaryTranslate,
        messages: [
          { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        response_format: { type: "json_object" },
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { titles?: unknown; texts?: unknown };
      const applied = applyBulletTranslations(bullets, parsed);
      if (applied) return applied;
      console.error(
        `[translateTopSummaryBullets] shape mismatch (attempt=${attempt + 1}, titles=${payload.titles.length}, texts=${payload.texts.length})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error(
        `[translateTopSummaryBullets] failed (attempt=${attempt + 1}): ${msg}`,
      );
    }
  }
  return null;
}

export type GenerateTopSummaryStatus =
  | "ok"
  | "no_articles"
  | "no_openai"
  | "ai_error"
  | "db_error";

export interface GenerateTopSummaryResult {
  status: GenerateTopSummaryStatus;
  summaryDate: string;
  lang: Lang;
  articleCount: number;
  bulletCount: number;
  errorMessage?: string;
  /** Full (uncapped) article bullets produced by the editorial pass.
   *  The cron hands the EN ones back as `pivotBullets` for the FR run
   *  so the FR edition is a translation with identical scores. */
  bullets?: SummaryBullet[];
  /** True when this edition was produced by translating the pivot
   *  instead of a native editorial pass (logging/observability). */
  translatedFromPivot?: boolean;
}

/**
 * Pull the top 50 articles for the given lang and produce the AI
 * snapshot. Caller passes the date used as the snapshot key (typically
 * `today` in UTC).
 *
 * Optional `articlesOverride` lets the legacy POST route keep its
 * existing client-supplied articles flow without re-querying the DB.
 *
 * Optional `pivotBullets` (FR only): the EN edition's uncapped bullets.
 * When present, the FR edition is produced by TRANSLATING them
 * (structure, refs and importance preserved — see the pivot doc block
 * above) instead of a second native editorial pass. Translation
 * failure falls back to the native pass so a bad translation can never
 * cost the FR edition.
 */
export async function generateTopSummary(
  summaryDate: string,
  lang: Lang,
  options: {
    articlesOverride?: TopSummaryArticle[];
    pivotBullets?: SummaryBullet[];
  } = {},
): Promise<GenerateTopSummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "sk-your-key-here") {
    return {
      status: "no_openai",
      summaryDate,
      lang,
      articleCount: 0,
      bulletCount: 0,
      errorMessage: "OPENAI_API_KEY not configured",
    };
  }

  let articles: TopSummaryArticle[] = options.articlesOverride ?? [];
  if (articles.length === 0) {
    const hiddenIds = await getHiddenTopicIds();
    const rows = await getTopArticlesForStats(
      null,
      TOP_DAYS,
      TOP_LIMIT,
      hiddenIds.length > 0 ? hiddenIds : undefined,
    );
    articles = rows.map((r) => {
      const aiSnippet = lang === "fr" ? r.snippet_ai_fr : r.snippet_ai_en;
      const base = (aiSnippet || r.snippet || r.content || "").trim();
      return {
        title: r.title,
        link: r.link,
        source: r.source,
        pubDate: r.pub_date,
        snippet: base.slice(0, SNIPPET_MAX),
        topic: r.topic,
        score: r.relevance_score,
        imageUrl: r.image_url ?? null,
      };
    });
  }

  if (articles.length === 0) {
    return {
      status: "no_articles",
      summaryDate,
      lang,
      articleCount: 0,
      bulletCount: 0,
    };
  }

  const items: ArticleSummary[] = articles.map((a) => ({
    title: a.title,
    link: a.link,
    source: a.source,
    pubDate: a.pubDate,
    snippet: (a.snippet || "").slice(0, PROMPT_SNIPPET_MAX),
  }));

  let summaryMd = "";
  let bullets: SummaryBullet[] = [];
  let translatedFromPivot = false;

  // FR-from-pivot path: translate the EN edition's bullets instead of
  // re-running the editorial pass. Identical groups/scores/refs by
  // construction, and no 50-article payload on the second call.
  if (lang === "fr" && options.pivotBullets && options.pivotBullets.length > 0) {
    const translated = await translateTopSummaryBullets(options.pivotBullets, apiKey);
    if (translated) {
      bullets = translated;
      summaryMd = renderBulletsMarkdown(translated);
      translatedFromPivot = true;
      console.log(
        `[generateTopSummary] fr edition translated from EN pivot (date=${summaryDate}, bullets=${translated.length})`,
      );
    } else {
      console.error(
        `[generateTopSummary] pivot translation failed (date=${summaryDate}) — falling back to native fr generation`,
      );
    }
  }

  if (!translatedFromPivot) {
    const systemPrompt = generateTopSummaryPrompt(lang);
    try {
      const result = await analyzeWithAI(items, systemPrompt, lang, apiKey, TOP_SUMMARY_MODEL, {
        expectRelevant: false,
      });
      summaryMd = result.summary;
      bullets = result.bullets;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error(`[generateTopSummary] analyzeWithAI failed (lang=${lang}, date=${summaryDate}): ${msg}`);
      return {
        status: "ai_error",
        summaryDate,
        lang,
        articleCount: articles.length,
        bulletCount: 0,
        errorMessage: msg,
      };
    }
  }

  // Persist the frozen snapshot first — even if the bullet mirror
  // fails downstream, the GET endpoint can still render the summary
  // and the article list.
  const snapshotOk = await upsertTopSummary({
    summaryDate,
    lang,
    model: TOP_SUMMARY_MODEL,
    articles,
    summaryMd,
  });
  if (!snapshotOk) {
    return {
      status: "db_error",
      summaryDate,
      lang,
      articleCount: articles.length,
      bulletCount: bullets.length,
      errorMessage: "upsertTopSummary failed",
    };
  }

  // « Top videos of yesterday » — the 2 best-scored transcribed videos
  // published the day before the snapshot, pinned at the head of the
  // Daily Podcast (bullet_index 0..1, article bullets shifted by +2).
  // Best-effort: a video fetch failure must never break the article
  // briefing, so any error collapses to an empty array.
  let videoBulletRows: TopSummaryBulletInsertRow[] = [];
  try {
    const videos = await getTopVideosForDate(
      previousUtcDay(summaryDate),
      lang,
      TOP_VIDEOS_COUNT,
    );
    videoBulletRows = buildVideoBulletRows(videos, lang, summaryDate);
  } catch (err) {
    console.error(
      `[generateTopSummary] top videos fetch failed (lang=${lang}, date=${summaryDate}):`,
      err,
    );
  }

  // Cap the podcast at TOTAL_BULLETS_MAX bullet points, videos
  // included: the pinned videos always open the briefing, then the most
  // important article bullets fill the remaining slots. The full LLM
  // briefing stays in `summary_md` (podcast-chat grounding).
  const articleBudget = Math.max(0, TOTAL_BULLETS_MAX - videoBulletRows.length);
  const selectedBullets = selectTopArticleBullets(bullets, articleBudget);

  // Mirror each bullet into `summary_bullets` (source_type='top50').
  // Same shape used by the legacy POST route + the daily-summary
  // pipeline: the embedded `**Title**\n\nbody` markdown in `text` lets
  // any plain-text consumer keep the visual hierarchy without joining
  // on the dedicated `title` column.
  if (selectedBullets.length > 0 || videoBulletRows.length > 0) {
    const bulletRows: TopSummaryBulletInsertRow[] = [...videoBulletRows];
    const indexOffset = videoBulletRows.length;

    for (let i = 0; i < selectedBullets.length; i++) {
      const blt = selectedBullets[i];
      const refIndices = (blt.refs ?? [])
        .map((ref) => articles.findIndex((a) => a.link === ref.link))
        .filter((idx) => idx >= 0);
      const topics = new Set<string>();
      for (const idx of refIndices) {
        const t = articles[idx]?.topic;
        if (t) topics.add(t);
      }
      const persistedText = blt.title
        ? `**${blt.title}**\n\n${blt.text}`
        : blt.text;
      const titleValue = blt.title ?? null;
      const importanceValue =
        typeof blt.importance === "number" ? blt.importance : null;
      if (topics.size === 0) {
        bulletRows.push({
          topic_id: null,
          lang,
          summary_date: summaryDate,
          bullet_index: i + indexOffset,
          title: titleValue,
          text: persistedText,
          refs: blt.refs,
          source_type: "top50",
          entities: [],
          importance_score: importanceValue,
        });
      } else {
        for (const topicId of topics) {
          bulletRows.push({
            topic_id: topicId,
            lang,
            summary_date: summaryDate,
            bullet_index: i + indexOffset,
            title: titleValue,
            text: persistedText,
            refs: blt.refs,
            source_type: "top50",
            entities: [],
            importance_score: importanceValue,
          });
        }
      }
    }

    const bulletsOk = await insertTopSummaryBullets(lang, summaryDate, bulletRows);
    if (!bulletsOk) {
      // The snapshot row IS persisted (upsertTopSummary above), so the
      // GET endpoint still renders the markdown — but the structured
      // bullets (incl. the pinned video bullets) are missing. Surface
      // it as db_error so the cron logs + retries instead of "ok".
      console.error(
        `[generateTopSummary] insertTopSummaryBullets failed (lang=${lang}, date=${summaryDate}, rows=${bulletRows.length}, videoRows=${videoBulletRows.length})`,
      );
      return {
        status: "db_error",
        summaryDate,
        lang,
        articleCount: articles.length,
        bulletCount: selectedBullets.length + videoBulletRows.length,
        errorMessage: "insertTopSummaryBullets failed",
      };
    }
    console.log(
      `[generateTopSummary] bullets persisted (lang=${lang}, date=${summaryDate}, rows=${bulletRows.length}, videoBullets=${videoBulletRows.length}, articleBullets=${selectedBullets.length}/${bullets.length})`,
    );
  }

  return {
    status: "ok",
    summaryDate,
    lang,
    articleCount: articles.length,
    bulletCount: selectedBullets.length + videoBulletRows.length,
    bullets,
    translatedFromPivot,
  };
}
