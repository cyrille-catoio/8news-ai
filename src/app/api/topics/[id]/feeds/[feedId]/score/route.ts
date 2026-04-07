import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { ScoreResult } from "@/lib/types";
import { getFeedById } from "@/lib/supabase";

export const maxDuration = 60;

/** Max articles scored per request (pool = all unscored for this feed, newest first). */
const SCORE_LIMIT = 50;
const BATCH_SIZE = 50;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; feedId: string }> },
) {
  try {
    const { id: topicId, feedId: feedIdStr } = await params;
    const fid = parseInt(feedIdStr, 10);
    if (isNaN(fid)) {
      return NextResponse.json({ error: "Invalid feed ID" }, { status: 400 });
    }

    const feed = await getFeedById(fid);
    if (!feed || feed.topic_id !== topicId) {
      return NextResponse.json(
        { error: "Feed not found for this topic" },
        { status: 404 },
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 });
    }
    if (!apiKey || apiKey === "sk-your-key-here") {
      return NextResponse.json({ error: "Missing OpenAI API key" }, { status: 500 });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const { data: topicRow, error: topicError } = await supabase
      .from("topics")
      .select(
        "scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5",
      )
      .eq("id", topicId)
      .single();

    if (topicError || !topicRow) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const c = topicRow;
    const scoringPrompt = `You are a senior news editor specialized in ${c.scoring_domain}.

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

    const { data: unscored, error: dbError } = await supabase
      .from("articles")
      .select("id, title, snippet, content")
      .eq("topic", topicId)
      .eq("source", feed.name)
      .is("relevance_score", null)
      .order("pub_date", { ascending: false })
      .limit(SCORE_LIMIT);

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    const rows = (unscored ?? []) as {
      id: number;
      title: string;
      snippet: string | null;
      content: string | null;
    }[];

    if (rows.length === 0) {
      return NextResponse.json({
        scored: 0,
        candidates: 0,
        message: "No unscored articles for this feed",
      });
    }

    const openai = new OpenAI({ apiKey });
    let scored = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const articleList = batch
        .map((a, idx) => `[${idx}] ${a.title} | ${(a.snippet || a.content || "").slice(0, 300)}`)
        .join("\n");

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4.1-nano",
          messages: [
            { role: "system", content: scoringPrompt },
            { role: "user", content: articleList },
          ],
          response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) continue;

        const parsed = JSON.parse(raw);
        const keys = Object.keys(parsed);

        let arr: ScoreResult[];
        if (Array.isArray(parsed)) {
          arr = parsed;
        } else if (typeof parsed.index === "number" && typeof parsed.score === "number") {
          arr = [parsed as ScoreResult];
        } else {
          const found = keys.find((k) => Array.isArray(parsed[k]));
          arr = found ? parsed[found] : [];
        }

        const results = arr.filter(
          (r: ScoreResult) =>
            typeof r.index === "number" &&
            typeof r.score === "number" &&
            r.index >= 0 &&
            r.index < batch.length,
        );

        const updates = results.map((r: ScoreResult) => {
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
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    return NextResponse.json({
      scored,
      candidates: rows.length,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scoring failed" },
      { status: 500 },
    );
  }
}
