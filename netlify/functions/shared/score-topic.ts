import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getScoringPrompt } from "../../../src/lib/scoring-prompts";
import type { Topic } from "../../../src/lib/types";

const BATCH_SIZE = 50;
const SCORE_WINDOW_HOURS = 168;

interface DbRow {
  id: number;
  title: string;
  snippet: string | null;
  content: string | null;
}

interface ScoreResult {
  index: number;
  score: number;
  reason: string;
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

async function scoreArticleBatch(
  batch: DbRow[],
  topic: Topic,
  openai: OpenAI,
): Promise<ScoreResult[]> {
  const articleList = batch
    .map((a, i) => `[${i}] ${a.title} | ${(a.snippet || a.content || "").slice(0, 300)}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: getScoringPrompt(topic) },
      { role: "user", content: articleList },
    ],
    response_format: { type: "json_object" },
  });

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

export async function scoreAndStoreTopic(topic: Topic): Promise<string> {
  const apiKey = getOpenAIKey();
  const openai = new OpenAI({ apiKey });
  const supabase = getSupabase();

  const since = new Date(Date.now() - SCORE_WINDOW_HOURS * 3_600_000).toISOString();

  const { data: unscored, error } = await supabase
    .from("articles")
    .select("id, title, snippet, content")
    .eq("topic", topic)
    .gte("pub_date", since)
    .is("relevance_score", null)
    .order("pub_date", { ascending: false })
    .limit(200);

  if (error) {
    console.error(`[${topic}] DB error:`, error.message);
    return `[${topic}] DB error: ${error.message}`;
  }

  const rows = (unscored ?? []) as DbRow[];
  if (rows.length === 0) {
    const msg = `[${topic}] No unscored articles`;
    console.log(msg);
    return msg;
  }

  let scored = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    try {
      const results = await scoreArticleBatch(batch, topic, openai);

      const updates = results
        .filter((r) => r.index >= 0 && r.index < batch.length)
        .map((r) => {
          const article = batch[r.index];
          return supabase
            .from("articles")
            .update({
              relevance_score: Math.min(10, Math.max(1, Math.round(r.score))),
              score_reason: (r.reason || "").slice(0, 200),
              scored_at: new Date().toISOString(),
            })
            .eq("id", article.id);
        });

      await Promise.all(updates);
      scored += updates.length;
    } catch (err) {
      console.error(`[${topic}] Scoring batch error:`, err instanceof Error ? err.message : err);
    }
  }

  const msg = `[${topic}] Scored ${scored}/${rows.length} articles`;
  console.log(msg);
  return msg;
}
