import OpenAI from "openai";
import { OPENAI_MODELS } from "@/lib/openai-models";

export type VideoSummaryScoreInput = {
  id: number;
  video_id: string;
  title: string;
  lang: string;
  summary_md: string;
};

export type ScoreVideoSummaryBatchOptions = {
  model?: string;
  maxCharsPerSummary?: number;
  openaiTimeoutMs?: number;
  maxRetries?: number;
};

/**
 * Batched 1-10 score for AI-generated video recap Markdown.
 *
 * Two composing factors (multiplicative-ish, see prompt below):
 *  1. **Topic importance** — historical impact on the tech industry,
 *     with a hard bonus when the recap covers a frontier-AI / Big Tech
 *     major player (OpenAI, Anthropic, Google/DeepMind, Meta AI, xAI,
 *     Microsoft AI, NVIDIA, Apple, Amazon, Tesla/SpaceX/Neuralink,
 *     Mistral, Hugging Face, Cohere, Perplexity…). The intuition is
 *     that a 30-min interview with Sam Altman or Dario Amodei is
 *     intrinsically more impactful for the reader than a tutorial on a
 *     niche library — even if both are equally well-written.
 *  2. **Recap quality** — structure, density of named facts, useful
 *     numbers, names, dates. The pipeline already produces clean
 *     markdown with `gpt-5.3-chat-latest`, so most recaps clear the
 *     bar; this dimension prevents thin / vague summaries from
 *     borrowing a high score solely from a hot topic.
 *
 * The previous prompt (v2.6.7-) only scored quality — and since the
 * pipeline writes consistently-structured markdown, scores clustered
 * around 7-8 with no genuine 10s and no spread. The rewrite below
 * gives explicit calibration anchors per integer step + an anti-cluster
 * directive + a major-actor whitelist so the model can actually
 * discriminate « historic news from a frontier lab » from « interesting
 * tech recap from a generalist channel ».
 *
 * Default model: gpt-4.1-mini. Upgraded from gpt-4.1-nano in v2.6.10
 * because nano consistently picked the central 7-8 values on editorial
 * nuance. mini discriminates nettement better; cost is still negligible
 * (~$0.005 / 100 recaps with cap 12 / batch 8). Override via env.
 *
 * `temperature: 0` is set for run-to-run reproducibility — scoring is a
 * numeric task, no creative variation wanted.
 */
/**
 * Parse the LLM `{scores:[{index,score}]}` response into `{id,score}`
 * rows. Pure and deterministic — extracted from `scoreVideoSummaryBatch`
 * so the clamp + one-decimal-in-the-9-10-band rounding can be unit-tested
 * without an OpenAI call. Entries with the wrong types, a non-finite
 * score, or an index outside `rows` are dropped; a malformed payload
 * yields an empty array (never throws).
 */
export function parseVideoScoreResponse(
  raw: string | null | undefined,
  rows: Array<{ id: number }>,
): { id: number; score: number }[] {
  if (!raw) return [];

  let parsed: { scores?: Array<{ index?: number; score?: number }> };
  try {
    parsed = JSON.parse(raw) as { scores?: Array<{ index?: number; score?: number }> };
  } catch {
    return [];
  }

  const out: { id: number; score: number }[] = [];
  for (const s of parsed.scores ?? []) {
    if (typeof s.index !== "number" || typeof s.score !== "number") continue;
    const row = rows[s.index];
    if (!row) continue;
    let sc = Number(s.score);
    if (!Number.isFinite(sc)) continue;
    if (sc < 1) sc = 1;
    if (sc > 10) sc = 10;
    // One-decimal precision only in the 9-10 band; integers below 9.
    sc = sc >= 9 ? Math.round(sc * 10) / 10 : Math.round(sc);
    out.push({ id: row.id, score: sc });
  }
  return out;
}

export async function scoreVideoSummaryBatch(
  rows: VideoSummaryScoreInput[],
  apiKey: string,
  opts: ScoreVideoSummaryBatchOptions = {},
): Promise<{ id: number; score: number }[]> {
  if (rows.length === 0) return [];

  const model = opts.model ?? OPENAI_MODELS.videoSummaryScore;
  const maxChars = opts.maxCharsPerSummary ?? 3500;
  const openai = new OpenAI({
    apiKey,
    maxRetries: opts.maxRetries ?? 0,
    timeout: opts.openaiTimeoutMs ?? 20_000,
  });

  const system = [
    "You are an editorial scorer for an AI tech-news product. You rate AI-generated video recap markdowns 1-10.",
    "",
    "SCORING IS COMPOSITE — combine TWO signals:",
    "  A) IMPORTANCE — historical impact on the tech industry. Be demanding: « important » means « will still matter in 12 months », not just « interesting today ».",
    "     Hard signal-bumper: the recap covers a FRONTIER PLAYER actively shaping AI / tech in 2026. Whitelist (non-exhaustive):",
    "       - Frontier-AI labs: OpenAI, Anthropic, Google DeepMind, Meta AI / FAIR, xAI, Mistral, Cohere, Perplexity, Hugging Face, Stability AI",
    "       - Big Tech AI surfaces: Microsoft (Copilot, Azure AI), Apple Intelligence, Amazon (AWS Bedrock, Anthropic stake), NVIDIA (chips, CUDA, Blackwell)",
    "       - Crypto majors: Bitcoin, Ethereum, Solana, Coinbase, Binance, BlackRock ETFs",
    "       - Robotics / mobility: Tesla, SpaceX, Neuralink, Boston Dynamics, Figure, Unitree",
    "       - Semis: TSMC, ASML, Intel, AMD, ARM",
    "     A 60-min interview WITH a CEO/founder of one of these (Altman, Amodei, Hassabis, Musk, Huang, Zuckerberg, Pichai, Mensch, Karpathy…) → score floor ≥ 8.",
    "     A 5-min explainer ABOUT one of these from a generalist YouTuber → no floor; quality decides.",
    "     A niche library tutorial / generalist topic with no major-player anchor → cap ≤ 7.",
    "",
    "  B) QUALITY — recap-only signals (the underlying video is unseen): named entities density, concrete numbers (raises, valuations, benchmarks, percents), dates, named products/models. Penalize vague paragraphs, marketing fluff, missing facts.",
    "",
    "TARGET DISTRIBUTION across a typical batch (use this to sanity-check yourself before emitting):",
    "  - About 5% SHOULD score 10 → roughly 1 recap out of 20 when a batch contains a clearly standout frontier-player / industry-moving item with dense facts.",
    "  - About 5-10% SHOULD score 9 → excellent, strategic major-player coverage that is very strong but not the single best 10-level item.",
    "  - About 20-30% in 7-8 → solid major-player coverage that's notable but not landmark.",
    "  - About 30-40% in 5-6 → decent recap of medium-importance news.",
    "  - About 20-30% in 3-4 → opinion / generalist takes / niche tutorials.",
    "  - About 5-10% in 1-2 → vague / off-topic / promotional / very thin.",
    "DO NOT cluster scores around 7-8 « to play safe » — that defeats the ranking. If a batch has ~20 items and one recap clearly stands above the rest on BOTH importance and factual density, use 10. Do not reserve 10 only for once-per-year AGI moments.",
    "If you hesitate between 9 and 10: use 10 when the recap combines (a) a frontier player / market-moving event, (b) concrete numbers or named products, and (c) clear strategic consequence. Otherwise use 9.",
    "DECIMAL PRECISION IN THE 9-10 BAND: scores 1-8 are integers, but in the 9-10 range use ONE decimal place (e.g. 9.1, 9.4, 9.7, 10.0) to finely rank the very best recaps against each other. Reserve 10.0 for the single best, market-moving item; spread the rest across 9.0-9.9 by relative strength. Below 9, keep integers.",
    "If you hesitate between 7 and 8, look at the major-player anchor: if absent, drop to 5-6.",
    "",
    "ANCHOR EXAMPLES (calibrate against these):",
    "  10 → Best-in-batch, top ~5%: OpenAI announces GPT-5 with new benchmarks; Anthropic raises $20B at $250B valuation; NVIDIA reveals Blackwell-scale demand with concrete revenue/shipments; Bitcoin spot ETF approved; an AGI breakthrough demo from a frontier lab. Recap covers it densely with names + numbers.",
    "  9  → Google DeepMind releases a new frontier model; Sam Altman 90-min interview on AI strategy; NVIDIA quarterly results breaking $40B revenue; Anthropic-Amazon $4B deal expansion. Strong frontier-player coverage, but not quite the batch's single 10-level item.",
    "  8  → A major-player product update (new Claude version, new Gemini API), a notable acquisition $500M-$1B, a strategic partnership between named majors. Well-written.",
    "  7  → A solid recap of a notable but non-frontier story (e.g. mid-tier startup raise, vertical-AI release), OR a frontier-player story poorly covered.",
    "  5-6 → Decent generalist coverage with some facts; no major-player anchor OR major-player anchor but thin facts.",
    "  3-4 → Opinion piece, prediction without data, recap of a niche YouTuber take, content with little named entity density.",
    "  1-2 → Vague, promotional, off-topic, content marketing, unsubstantiated rumor.",
    "",
    "Score the WRITTEN RECAP only (not the video). Be consistent across items in the same batch — relative ranking matters.",
    "Reply with JSON only, no markdown fences.",
  ].join("\n");

  const blocks = rows.map((r, i) => {
    const body =
      r.summary_md.length > maxChars
        ? `${r.summary_md.slice(0, maxChars)}\n[…truncated…]`
        : r.summary_md;
    return `[index ${i}] video_id=${r.video_id} lang=${r.lang}\ntitle: ${r.title}\n---\n${body}`;
  });

  const user = [
    `There are ${rows.length} recaps to score, indices 0..${rows.length - 1}.`,
    "Apply the COMPOSITE scoring above (importance × quality, anchored on major-player presence).",
    "Use the FULL 1-10 range — most batches should NOT be a 7-8 cluster.",
    "Return exactly: {\"scores\":[{\"index\":0,\"score\":7},{\"index\":1,\"score\":9.3},...]} with one entry per index present.",
    "Each score is 1-10: integers for 1-8, and one decimal in the 9-10 band (e.g. 9.2, 9.8, 10.0).",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    // Numeric scoring task — keep the answer reproducible across runs.
    // Without this, two ticks over the same backlog can give two
    // different score distributions just from sampling noise.
    temperature: 0,
  });

  const raw = completion.choices[0]?.message?.content;
  return parseVideoScoreResponse(raw, rows);
}
