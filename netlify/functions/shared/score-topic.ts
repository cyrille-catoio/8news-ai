import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { ScoreResult } from "../../../src/lib/types";

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

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

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
): Promise<ScoreResult[]> {
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
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    let arr: ScoreResult[];
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (typeof parsed.index === "number" && typeof parsed.score === "number") {
      arr = [parsed as ScoreResult];
    } else {
      const key = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
      arr = key ? parsed[key] : [];
    }
    return arr.filter(
      (r) => typeof r.index === "number" && typeof r.score === "number",
    );
  } catch {
    return [];
  }
}

async function scoreCore(
  topicId: string,
  prompt: string,
  supabase: SupabaseClient,
): Promise<string> {
  const apiKey = getOpenAIKey();
  const openai = new OpenAI({ apiKey });

  const since = new Date(Date.now() - SCORE_WINDOW_HOURS * 3_600_000).toISOString();

  const { data: unscored, error } = await supabase
    .from("articles")
    .select("id, title, snippet, content")
    .eq("topic", topicId)
    .gte("pub_date", since)
    .is("relevance_score", null)
    .order("pub_date", { ascending: false })
    .limit(MAX_ARTICLES_PER_RUN);

  if (error) {
    console.error(`[${topicId}] DB error:`, error.message);
    return `[${topicId}] DB error: ${error.message}`;
  }

  const rows = (unscored ?? []) as DbRow[];
  if (rows.length === 0) {
    const msg = `[${topicId}] No unscored articles`;
    console.log(msg);
    return msg;
  }

  let scored = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    try {
      const results = await scoreArticleBatch(batch, prompt, openai);

      const updates = results
        .filter((r) => r.index >= 0 && r.index < batch.length)
        .map((r) => {
          const article = batch[r.index];
          const fields: Record<string, unknown> = {
            relevance_score: Math.min(10, Math.max(1, Math.round(r.score))),
            score_reason: (r.reason || "").slice(0, 200),
            scored_at: new Date().toISOString(),
          };
          if (r.summary_en) fields.snippet_ai_en = r.summary_en.slice(0, 500);
          if (r.summary_fr) fields.snippet_ai_fr = r.summary_fr.slice(0, 500);
          return supabase
            .from("articles")
            .update(fields)
            .eq("id", article.id);
        });

      await Promise.all(updates);
      scored += updates.length;
    } catch (err) {
      console.error(`[${topicId}] Scoring batch error:`, err instanceof Error ? err.message : err);
    }
  }

  const msg = `[${topicId}] Scored ${scored}/${rows.length} articles`;
  console.log(msg);
  return msg;
}

/**
 * Dynamic version: scoring criteria come from the DB row.
 * Called by the cron-score dispatcher.
 */
export async function scoreAndStoreTopicDynamic(
  topicId: string,
  criteria: ScoringCriteria,
  supabase: SupabaseClient,
): Promise<string> {
  const prompt = buildScoringPrompt(criteria);
  return scoreCore(topicId, prompt, supabase);
}

