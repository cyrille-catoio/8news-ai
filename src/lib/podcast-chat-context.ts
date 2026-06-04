import type { Lang } from "@/lib/i18n";
import type {
  TopSummaryRow,
  TopSummaryBulletRow,
} from "@/lib/supabase/top-summaries";

/**
 * Builds the grounding system prompt injected on every Daily Podcast
 * chat turn. The context is the day's Top 24h snapshot rendered as
 * plain text: per-topic groups (title + notes) and their source links.
 *
 * Why server-side and not client-supplied: the panel must not be able
 * to spoof the briefing it is « grounded » in, and rebuilding from the
 * snapshot guarantees the answer reflects the live `top_summaries` row.
 *
 * Token budget: the briefing itself is already a compressed editorial
 * digest (a few thousand chars), and the only other growing input is
 * the day's conversation history (bounded by one day of usage). We
 * defensively cap the rendered context so a pathological snapshot can't
 * blow the request size.
 */

/** Defensive cap on the rendered briefing text (chars, not tokens).
 *  ~24k chars ≈ 6k tokens — comfortably below any chat model window
 *  once the conversation history is added on top. */
const MAX_CONTEXT_CHARS = 24_000;

interface BuildArgs {
  snapshot: TopSummaryRow;
  bullets: TopSummaryBulletRow[];
  lang: Lang;
}

/** Folds consecutive bullets sharing a title into one topic block, then
 *  renders each block as « ## Title », its paragraphs, and a deduped
 *  list of source links. Bullets without a title render as their own
 *  untitled block so nothing is dropped. */
function renderBriefing(bullets: TopSummaryBulletRow[]): string {
  const blocks: string[] = [];
  let currentTitle: string | null = null;
  let bodyLines: string[] = [];
  let refLines: string[] = [];
  const seenRefs = new Set<string>();

  const flush = () => {
    if (bodyLines.length === 0 && refLines.length === 0) return;
    const head = currentTitle ? `## ${currentTitle}` : "##";
    const parts = [head, ...bodyLines];
    if (refLines.length > 0) {
      parts.push("Sources:");
      parts.push(...refLines);
    }
    blocks.push(parts.join("\n"));
    bodyLines = [];
    refLines = [];
    seenRefs.clear();
  };

  for (const b of bullets) {
    const title = (b.title ?? "").trim();
    if (title !== (currentTitle ?? "")) {
      flush();
      currentTitle = title || null;
    }
    const text = b.text.trim();
    if (text) bodyLines.push(text);
    for (const ref of b.refs ?? []) {
      const link = (ref.link ?? "").trim();
      if (!link || seenRefs.has(link)) continue;
      seenRefs.add(link);
      const label = (ref.title ?? ref.source ?? link).trim();
      const source = (ref.source ?? "").trim();
      refLines.push(source ? `- ${label} (${source}) — ${link}` : `- ${label} — ${link}`);
    }
  }
  flush();

  return blocks.join("\n\n");
}

export function buildPodcastSystemPrompt({
  snapshot,
  bullets,
  lang,
}: BuildArgs): string {
  let briefing = renderBriefing(bullets);
  if (briefing.length > MAX_CONTEXT_CHARS) {
    briefing = `${briefing.slice(0, MAX_CONTEXT_CHARS)}\n\n[...]`;
  }

  if (lang === "fr") {
    return [
      "Tu es l'assistant du « Podcast du jour » de 8news, un briefing quotidien sur la tech, l'IA et la crypto.",
      `Le briefing ci-dessous est daté du ${snapshot.summary_date} (UTC). C'est ta SEULE source de vérité.`,
      "",
      "Règles :",
      "- Réponds en français, de façon concise, factuelle et structurée (markdown autorisé).",
      "- Appuie-toi uniquement sur le briefing et la conversation en cours ; n'invente jamais de faits ni de chiffres.",
      "- Quand c'est pertinent, cite les liens sources fournis dans le briefing.",
      "- Si l'information demandée n'est pas dans le briefing, dis-le clairement plutôt que de spéculer.",
      "",
      "=== BRIEFING DU JOUR ===",
      briefing || "(briefing vide)",
      "=== FIN DU BRIEFING ===",
    ].join("\n");
  }

  return [
    "You are the assistant for 8news' « Daily Podcast », a daily briefing on tech, AI and crypto.",
    `The briefing below is dated ${snapshot.summary_date} (UTC). It is your ONLY source of truth.`,
    "",
    "Rules:",
    "- Answer in English, concise, factual and well-structured (markdown allowed).",
    "- Rely only on the briefing and the running conversation; never invent facts or figures.",
    "- When relevant, cite the source links provided in the briefing.",
    "- If the requested information is not in the briefing, say so plainly rather than speculating.",
    "",
    "=== TODAY'S BRIEFING ===",
    briefing || "(empty briefing)",
    "=== END OF BRIEFING ===",
  ].join("\n");
}
