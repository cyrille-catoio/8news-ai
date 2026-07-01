import OpenAI from "openai";
import { OPENAI_MODELS } from "@/lib/openai-models";

/**
 * Community chat moderation gate (v2.14+).
 *
 * A single cheap LLM call judges every non-trivial message on TWO axes at
 * once and returns a structured verdict:
 *   - respect: reject insults / harassment / hate / sexual / violent /
 *     contemptuous content;
 *   - topic: only accept technology and tech-adjacent subjects (AI,
 *     crypto, science, gadgets, dev, the business of tech, gaming,
 *     hardware…), staying lenient on borderline cases; reject clearly
 *     off-topic chatter (sport, cooking, partisan politics, private life…).
 *
 * Trivial social messages (greetings, thanks, yes/no, a lone emoji) skip
 * the LLM entirely via `isTriviallyAllowed`.
 *
 * Failure policy is FAIL-OPEN: if the API key is missing, or OpenAI errors
 * / times out / returns something unparseable, the message is ALLOWED and
 * the incident is logged. We never block the room on an outage.
 *
 * The pure helpers (`buildModerationSystemPrompt`, `parseModerationVerdict`,
 * `isTriviallyAllowed`) are unit-tested; `runUserChatModeration` is the I/O
 * wrapper around the model call.
 */

export type ModerationDecision = "allow" | "reject";
export type ModerationReason = "ok" | "off_topic" | "disrespect";

export interface ModerationVerdict {
  decision: ModerationDecision;
  reason: ModerationReason;
}

const MODERATION_MODEL = OPENAI_MODELS.moderation;
const MODERATION_TIMEOUT_MS = 8_000;

const TECH_TERMS_RE =
  /\b(ai|ia|tech|technologie|technology|software|logiciel|hardware|materiel|matériel|code|coding|dev|developer|developpeur|développeur|programming|programmation|app|api|saas|startup|cloud|data|database|base de donnees|base de données|cyber|cybersecurity|cybersecurite|cybersécurité|crypto|bitcoin|ethereum|web3|blockchain|llm|gpt|openai|anthropic|claude|cursor|robot|robotique|iot|internet|server|serveur|gpu|chip|semiconductor|semiconducteur|quantum|quantique|gaming|video game|jeu video|jeu vidéo|console)\b/i;

const OBVIOUS_OFF_TOPIC_RE =
  /\b(chou|choux|jardin|jardinage|potager|planter|plantation|arroser|semis|engrais|tomate|tomates|carotte|carottes|salade|courgette|cabbage|garden|gardening|plant|planting|watering|recipe|recette|cuisine|cook|cooking|football|soccer|tennis|rugby|basket|sport|dating|rencard|mariage|astrologie|horoscope)\b/i;

/** Bilingual instructions. The model must judge the message in whatever
 *  language it is written, independently of the UI language. */
export function buildModerationSystemPrompt(): string {
  return [
    "You are the moderation gate of a public community chat about TECHNOLOGY.",
    "Judge the user's message and reply with STRICT JSON only:",
    '{ "decision": "allow" | "reject", "reason": "ok" | "off_topic" | "disrespect" }',
    "",
    "Rules:",
    "1. RESPECT: reject (reason \"disrespect\") any insult, harassment, hate,",
    "   threats, sexual or violent content, or contemptuous tone toward anyone.",
    "2. TOPIC: the room is for technology AND tech-adjacent subjects —",
    "   software, hardware, AI, data, crypto/web3, startups and the business",
    "   of tech, science, gadgets, video games, the internet, cybersecurity, etc.",
    "   Be LENIENT: when a message is plausibly related to tech, allow it.",
    "   Reject (reason \"off_topic\") only messages clearly outside tech, such as",
    "   sports results, cooking recipes, partisan politics, personal/private life,",
    "   dating, or generic small talk that has nothing to do with technology.",
    "3. Always ALLOW short social messages: greetings (hello/hi/bonjour/salut),",
    "   thanks (thank you/merci), simple acknowledgements (yes/no/ok/oui/non),",
    "   and emoji-only messages. Use reason \"ok\" for these.",
    "",
    "When a message is both off-topic AND disrespectful, prefer \"disrespect\".",
    "Output JSON only, no prose, no code fences.",
    "",
    "Vous êtes le filtre de modération d'un chat communautaire public sur la TECHNOLOGIE.",
    "Mêmes règles en français : rejeter le manque de respect (\"disrespect\"),",
    "n'accepter que la tech et les sujets connexes (rester souple), rejeter le",
    "hors-sujet net (\"off_topic\"), et toujours accepter bonjour / merci / oui / non.",
  ].join("\n");
}

function asDecision(value: unknown): ModerationDecision | null {
  return value === "allow" || value === "reject" ? value : null;
}

function asReason(value: unknown): ModerationReason {
  return value === "off_topic" || value === "disrespect" || value === "ok"
    ? value
    : "ok";
}

/**
 * Defensive parse of the model's JSON verdict. Anything malformed,
 * missing or unexpected falls back to ALLOW (fail-open) so a bad
 * completion never silently blocks a member.
 */
export function parseModerationVerdict(raw: string | null | undefined): ModerationVerdict {
  if (!raw) return { decision: "allow", reason: "ok" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { decision: "allow", reason: "ok" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { decision: "allow", reason: "ok" };
  }
  const obj = parsed as Record<string, unknown>;
  const decision = asDecision(obj.decision);
  if (decision === null) return { decision: "allow", reason: "ok" };
  if (decision === "allow") return { decision: "allow", reason: "ok" };
  // A reject must carry a concrete reason; default to off_topic if the
  // model omitted a usable one.
  const reason = asReason(obj.reason);
  return { decision: "reject", reason: reason === "ok" ? "off_topic" : reason };
}

// Whole-message allowlist for trivial social messages. We strip emoji,
// punctuation and whitespace, then check the remaining tokens. A message
// only short-circuits the LLM when EVERY token is in the set (so
// "bonjour connard" does not match and is sent to the gate).
const TRIVIAL_TOKENS = new Set([
  // greetings
  "hello", "hi", "hey", "yo", "bonjour", "salut", "coucou", "hola",
  "bonsoir", "re",
  // thanks
  "thanks", "thank", "thx", "merci", "ty",
  // acknowledgements
  "yes", "no", "yep", "nope", "ok", "okay", "oui", "non", "ouais",
  "yeah", "sure", "k",
  // partings
  "bye", "ciao", "aurevoir", "goodbye",
]);

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const NON_LETTER_RE = /[^\p{L}\p{N}]+/gu;

export function isTriviallyAllowed(content: string): boolean {
  const withoutEmoji = content.replace(EMOJI_RE, " ").trim();
  // Emoji-only message (nothing left once emoji are removed).
  if (withoutEmoji === "") return content.trim() !== "";

  const tokens = withoutEmoji
    .toLowerCase()
    .split(NON_LETTER_RE)
    .filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.length > 4) return false; // keep the fast-path to short messages
  return tokens.every((tok) => TRIVIAL_TOKENS.has(tok));
}

/**
 * Deterministic guardrail before the LLM: reject subjects that are
 * obviously outside the technology room (gardening, recipes, sport…)
 * unless the same message also contains an explicit tech term. This
 * keeps the LLM's leniency for borderline tech-adjacent cases, while
 * making canonical probes like « comment planter des choux » reliable.
 */
export function detectObviousOffTopic(content: string): boolean {
  return OBVIOUS_OFF_TOPIC_RE.test(content) && !TECH_TERMS_RE.test(content);
}

/**
 * Runs the moderation gate for a non-trivial message. FAIL-OPEN: returns
 * `allow` whenever moderation can't run (no key) or fails (error / timeout
 * / unparseable output), logging the incident.
 */
export async function runUserChatModeration(
  content: string,
): Promise<ModerationVerdict> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[runUserChatModeration] OPENAI_API_KEY missing — allowing (fail-open)");
    return { decision: "allow", reason: "ok" };
  }
  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create(
      {
        model: MODERATION_MODEL,
        messages: [
          { role: "system", content: buildModerationSystemPrompt() },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      },
      { timeout: MODERATION_TIMEOUT_MS },
    );
    return parseModerationVerdict(completion.choices[0]?.message?.content);
  } catch (err) {
    console.warn("[runUserChatModeration] moderation failed — allowing (fail-open):", err);
    return { decision: "allow", reason: "ok" };
  }
}
