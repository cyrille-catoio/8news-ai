import OpenAI from "openai";

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
 * Batched 1-10 quality score for AI-generated video recap Markdown.
 * Uses a single JSON response to maximize throughput in cron (15 min wall).
 * Default model: gpt-4.1-nano (fast, cheap; override via env in caller).
 */
export async function scoreVideoSummaryBatch(
  rows: VideoSummaryScoreInput[],
  apiKey: string,
  opts: ScoreVideoSummaryBatchOptions = {},
): Promise<{ id: number; score: number }[]> {
  if (rows.length === 0) return [];

  const model = opts.model ?? "gpt-4.1-nano";
  const maxChars = opts.maxCharsPerSummary ?? 3500;
  const openai = new OpenAI({
    apiKey,
    maxRetries: opts.maxRetries ?? 0,
    timeout: opts.openaiTimeoutMs ?? 20_000,
  });

  const system = [
    "You rate AI-generated video recap summaries (Markdown) for a tech news product.",
    "For each item, output one integer score from 1 to 10:",
    "10 = excellent: clear structure, specific facts, high signal, useful for a professional reader.",
    "5 = average: acceptable but generic or thin.",
    "1 = poor: vague, misleading, messy, or very low information value.",
    "Score the written recap only (not the video). Be consistent across items in the batch.",
    "Reply with JSON only, no markdown fences.",
  ].join(" ");

  const blocks = rows.map((r, i) => {
    const body =
      r.summary_md.length > maxChars
        ? `${r.summary_md.slice(0, maxChars)}\n[…truncated…]`
        : r.summary_md;
    return `[index ${i}] video_id=${r.video_id} lang=${r.lang}\ntitle: ${r.title}\n---\n${body}`;
  });

  const user = [
    `There are ${rows.length} recaps, indices 0..${rows.length - 1}.`,
    "Return exactly: {\"scores\":[{\"index\":0,\"score\":7},...]} with one entry per index present.",
    "Each score must be an integer 1-10.",
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
  });

  const raw = completion.choices[0]?.message?.content;
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
    let sc = Math.round(Number(s.score));
    if (Number.isNaN(sc)) continue;
    if (sc < 1) sc = 1;
    if (sc > 10) sc = 10;
    out.push({ id: row.id, score: sc });
  }
  return out;
}
