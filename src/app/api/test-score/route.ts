import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getScoringPrompt } from "@/lib/scoring-prompts";
import type { Topic } from "@/lib/types";

export const maxDuration = 60;

const VALID_TOPICS: Topic[] = ["conflict", "ai", "aiengineering", "robotics", "crypto", "bitcoin", "videogames"];
const BATCH_SIZE = 50;
const SCORE_WINDOW_HOURS = 48;

interface ScoreResult {
  index: number;
  score: number;
  reason: string;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const secret = params.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const topicParam = params.get("topic") as Topic | null;
  if (!topicParam || !VALID_TOPICS.includes(topicParam)) {
    return NextResponse.json({ error: `Invalid topic. Use one of: ${VALID_TOPICS.join(", ")}` }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "sk-your-key-here") {
    return NextResponse.json({ error: "Missing OpenAI API key" }, { status: 500 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const openai = new OpenAI({ apiKey });
  const since = new Date(Date.now() - SCORE_WINDOW_HOURS * 3_600_000).toISOString();

  const { data: unscored, error: dbError } = await supabase
    .from("articles")
    .select("id, title, snippet, content")
    .eq("topic", topicParam)
    .gte("pub_date", since)
    .is("relevance_score", null)
    .order("pub_date", { ascending: false })
    .limit(200);

  if (dbError) {
    return NextResponse.json({ error: `DB error: ${dbError.message}` }, { status: 500 });
  }

  const rows = (unscored ?? []) as { id: number; title: string; snippet: string | null; content: string | null }[];

  if (rows.length === 0) {
    return NextResponse.json({ status: "ok", topic: topicParam, message: "No unscored articles", scored: 0 });
  }

  let scored = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const articleList = batch
      .map((a, idx) => `[${idx}] ${a.title} | ${(a.snippet || a.content || "").slice(0, 300)}`)
      .join("\n");

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: getScoringPrompt(topicParam) },
          { role: "user", content: articleList },
        ],
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const results: ScoreResult[] = Array.isArray(parsed)
        ? parsed
        : parsed.scores ?? parsed.results ?? [];

      for (const r of results) {
        if (typeof r.index !== "number" || typeof r.score !== "number") continue;
        if (r.index < 0 || r.index >= batch.length) continue;

        const article = batch[r.index];
        const clampedScore = Math.min(10, Math.max(1, Math.round(r.score)));

        await supabase
          .from("articles")
          .update({
            relevance_score: clampedScore,
            score_reason: (r.reason || "").slice(0, 200),
            scored_at: new Date().toISOString(),
          })
          .eq("id", article.id);

        scored++;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({
    status: "ok",
    topic: topicParam,
    totalUnscored: rows.length,
    scored,
    errors: errors.length > 0 ? errors : undefined,
  });
}
