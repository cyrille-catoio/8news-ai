import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { ScoreResult } from "@/lib/types";

const BATCH_SIZE = 50;
const MAX_ARTICLES_PER_RUN = 50;
const OPENAI_TIMEOUT_MS = 6_000;
export const SCORE_WINDOW_HOURS = 168;

interface DbRow {
  id: number;
  title: string;
  snippet: string | null;
  content: string | null;
}

export interface ScoringCriteria {
  scoring_domain: string;
  scoring_tier1: string;
  scoring_tier2: string;
  scoring_tier3: string;
  scoring_tier4: string;
  scoring_tier5: string;
}

export type ScoreTopicOptions = {
  /** Articles to score this run (capped by maxArticlesCap). */
  maxArticles?: number;
  /** `pub_date` window in hours (default SCORE_WINDOW_HOURS). */
  windowHours?: number;
  /** Upper bound for maxArticles (default MAX_ARTICLES_PER_RUN). Admin endpoint uses 200. */
  maxArticlesCap?: number;
  /** Per-batch OpenAI parse debug (admin test-score). */
  collectAiDebug?: boolean;
};

export type AiBatchDebug = {
  rawKeys?: string[];
  rawSample?: string;
  arrayLength?: number;
  filterPassed?: number;
};

export type ScoreTopicDetailedResult = {
  message: string;
  scored: number;
  candidateCount: number;
  errors: string[];
  aiDebug?: AiBatchDebug[];
  dbError?: string;
};

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === "sk-your-key-here") throw new Error("Missing OpenAI API key");
  return key;
}

function buildScoringPrompt(c: ScoringCriteria): string {
  return `You are a senior news editor specialized in ${c.scoring_domain}.

Rate each article's relevance and importance from 1 to 10 (integer).
For articles scoring 5 or above, also write a factual 2-sentence summary in English AND in French.

## Scoring scale for ${c.scoring_domain}:
- 9-10: ${c.scoring_tier1}
- 7-8: ${c.scoring_tier2}
- 5-6: ${c.scoring_tier3}
- 3-4: ${c.scoring_tier4}
- 1-2: ${c.scoring_tier5}

## Rules:
- Score based on the TITLE and CONTENT provided, not assumptions.
- Duplicate or rehashed news from previous cycles = max score 3.
- Clickbait or vague opinion pieces without facts = max score 4.
- Must include concrete data (names, numbers, dates) to score above 6.
- Summaries must include key facts: who, what, where, when, specific numbers.

Respond ONLY with a JSON object containing a "scores" array. No markdown, no explanation:
{"scores": [{"index": 0, "score": 7, "reason": "New GPT-5 model announced with benchmarks", "summary_en": "OpenAI announced GPT-5 with...", "summary_fr": "OpenAI a annoncé GPT-5 avec..."}, ...]}

For articles scoring below 5, omit summary_en and summary_fr.`;
}

async function scoreArticleBatch(
  batch: DbRow[],
  prompt: string,
  openai: OpenAI,
  collectDebug: boolean,
): Promise<{ results: ScoreResult[]; debug?: AiBatchDebug }> {
  const articleList = batch
    .map((a, i) => `[${i}] ${a.title} | ${(a.snippet || a.content || "").slice(0, 300)}`)
    .join("\n");

  const completion = await openai.chat.completions.create(
    {
      model: "gpt-4.1-nano",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: articleList },
      ],
      response_format: { type: "json_object" },
    },
    { timeout: OPENAI_TIMEOUT_MS },
  );

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return {
      results: [],
      debug: collectDebug ? { rawSample: "null" } : undefined,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed);

    let arr: ScoreResult[];
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (typeof parsed.index === "number" && typeof parsed.score === "number") {
      arr = [parsed as ScoreResult];
    } else {
      const key = keys.find((k) => Array.isArray(parsed[k]));
      arr = key ? parsed[key] : [];
    }

    const looselyFiltered = arr.filter(
      (r) => typeof r.index === "number" && typeof r.score === "number",
    );

    const results = looselyFiltered.filter(
      (r) => r.index >= 0 && r.index < batch.length,
    );

    const debug: AiBatchDebug | undefined = collectDebug
      ? {
          rawKeys: keys,
          rawSample: raw.slice(0, 300),
          arrayLength: arr.length,
          filterPassed: results.length,
        }
      : undefined;

    return { results, debug };
  } catch {
    return { results: [], debug: collectDebug ? { rawSample: "parse_error" } : undefined };
  }
}

async function runScoreTopic(
  topicId: string,
  criteria: ScoringCriteria,
  supabase: SupabaseClient,
  opts?: ScoreTopicOptions,
): Promise<ScoreTopicDetailedResult> {
  const windowH = opts?.windowHours ?? SCORE_WINDOW_HOURS;
  const cap = opts?.maxArticlesCap ?? MAX_ARTICLES_PER_RUN;
  const limit = Math.min(Math.max(1, opts?.maxArticles ?? MAX_ARTICLES_PER_RUN), cap);
  const collectAiDebug = opts?.collectAiDebug ?? false;

  const apiKey = getOpenAIKey();
  const openai = new OpenAI({ apiKey });
  const prompt = buildScoringPrompt(criteria);

  const since = new Date(Date.now() - windowH * 3_600_000).toISOString();

  const { data: unscored, error } = await supabase
    .from("articles")
    .select("id, title, snippet, content")
    .eq("topic", topicId)
    .gte("pub_date", since)
    .is("relevance_score", null)
    .order("pub_date", { ascending: false })
    .limit(limit);

  if (error) {
    const message = `[${topicId}] DB error: ${error.message}`;
    console.error(message);
    return {
      message,
      scored: 0,
      candidateCount: 0,
      errors: [],
      dbError: error.message,
    };
  }

  const rows = (unscored ?? []) as DbRow[];
  if (rows.length === 0) {
    const message = `[${topicId}] No unscored articles`;
    console.log(message);
    return { message, scored: 0, candidateCount: 0, errors: [] };
  }

  let scored = 0;
  const errors: string[] = [];
  const aiDebug: AiBatchDebug[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    try {
      const { results, debug } = await scoreArticleBatch(batch, prompt, openai, collectAiDebug);
      if (debug) aiDebug.push(debug);

      const updates = results.map((r) => {
        const article = batch[r.index];
        const fields: Record<string, unknown> = {
          relevance_score: Math.min(10, Math.max(1, Math.round(r.score))),
          score_reason: (r.reason || "").slice(0, 200),
          scored_at: new Date().toISOString(),
        };
        if (r.summary_en) fields.snippet_ai_en = r.summary_en.slice(0, 500);
        if (r.summary_fr) fields.snippet_ai_fr = r.summary_fr.slice(0, 500);
        return supabase.from("articles").update(fields).eq("id", article.id);
      });

      await Promise.all(updates);
      scored += updates.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${topicId}] Scoring batch error:`, msg);
      errors.push(msg);
    }
  }

  const message = `[${topicId}] Scored ${scored}/${rows.length} articles`;
  console.log(message);
  return {
    message,
    scored,
    candidateCount: rows.length,
    errors,
    ...(collectAiDebug && aiDebug.length > 0 ? { aiDebug } : {}),
  };
}

/**
 * Scoring criteria from DB; used by cron-score and post-fetch mini-score.
 */
export async function scoreAndStoreTopicDynamic(
  topicId: string,
  criteria: ScoringCriteria,
  supabase: SupabaseClient,
  opts?: ScoreTopicOptions,
): Promise<string> {
  const r = await runScoreTopic(topicId, criteria, supabase, {
    ...opts,
    collectAiDebug: false,
  });
  return r.message;
}

/**
 * Admin test endpoint: custom window/limit (up to 200), optional AI debug payloads.
 */
export async function scoreTopicForAdmin(
  topicId: string,
  criteria: ScoringCriteria,
  supabase: SupabaseClient,
  params: {
    windowHours: number;
    maxArticles: number;
    collectAiDebug: boolean;
  },
): Promise<ScoreTopicDetailedResult> {
  return runScoreTopic(topicId, criteria, supabase, {
    windowHours: params.windowHours,
    maxArticles: params.maxArticles,
    maxArticlesCap: 200,
    collectAiDebug: params.collectAiDebug,
  });
}
