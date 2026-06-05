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
      `Le briefing ci-dessous est daté du ${snapshot.summary_date} (UTC). C'est ta source PRINCIPALE.`,
      "",
      "Règles :",
      "- Réponds en français, de façon concise, factuelle et structurée (markdown autorisé).",
      "- Priorité au briefing du jour : si la réponse s'y trouve, base-toi dessus et cite les liens sources pertinents.",
      "- Si la réponse n'est PAS dans le briefing, réponds quand même à partir de tes connaissances générales (modèle GPT-5.5), et indique clairement que ça sort du briefing du jour (ex. commence par « Hors briefing du jour : … »).",
      "- N'invente jamais de faits ni de chiffres. Si tu n'es pas sûr, dis-le ; pour un événement très récent absent du briefing, précise que tes informations peuvent ne pas être à jour (tu n'as pas d'accès en temps réel à Internet).",
      "",
      "=== BRIEFING DU JOUR ===",
      briefing || "(briefing vide)",
      "=== FIN DU BRIEFING ===",
    ].join("\n");
  }

  return [
    "You are the assistant for 8news' « Daily Podcast », a daily briefing on tech, AI and crypto.",
    `The briefing below is dated ${snapshot.summary_date} (UTC). It is your PRIMARY source.`,
    "",
    "Rules:",
    "- Answer in English, concise, factual and well-structured (markdown allowed).",
    "- Prioritize today's briefing: if the answer is in it, base your reply on it and cite the relevant source links.",
    "- If the answer is NOT in the briefing, still answer from your general knowledge (GPT-5.5 model), and clearly flag that it's outside today's briefing (e.g. start with « Outside today's briefing: … »).",
    "- Never invent facts or figures. If unsure, say so; for very recent events not in the briefing, note that your information may be out of date (you have no real-time internet access).",
    "",
    "=== TODAY'S BRIEFING ===",
    briefing || "(empty briefing)",
    "=== END OF BRIEFING ===",
  ].join("\n");
}
