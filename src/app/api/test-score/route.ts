import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getScoringPrompt } from "@/lib/scoring-prompts";
import { VALID_TOPICS } from "@/lib/types";
import type { Topic, ScoreResult } from "@/lib/types";

export const maxDuration = 60;

const BATCH_SIZE = 50;
const DEFAULT_HOURS = 168;
const DEFAULT_LIMIT = 50;

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

  const hours = Math.max(1, parseInt(params.get("hours") ?? String(DEFAULT_HOURS), 10) || DEFAULT_HOURS);
  const limit = Math.min(200, Math.max(1, parseInt(params.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const showDebug = params.get("debug") === "1";

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
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  // Diagnostic: count total + unscored articles for this topic
  const [{ count: totalCount }, { count: unscoredCount }] = await Promise.all([
    supabase.from("articles").select("id", { count: "exact", head: true }).eq("topic", topicParam),
    supabase.from("articles").select("id", { count: "exact", head: true }).eq("topic", topicParam).is("relevance_score", null),
  ]);

  const { data: unscored, error: dbError } = await supabase
    .from("articles")
    .select("id, title, snippet, content")
    .eq("topic", topicParam)
    .gte("pub_date", since)
    .is("relevance_score", null)
    .order("pub_date", { ascending: false })
    .limit(limit);

  if (dbError) {
    return NextResponse.json({ error: `DB error: ${dbError.message}` }, { status: 500 });
  }

  const rows = (unscored ?? []) as { id: number; title: string; snippet: string | null; content: string | null }[];

  if (rows.length === 0) {
    return NextResponse.json({
      status: "ok",
      topic: topicParam,
      message: "No unscored articles in time window",
      scored: 0,
      debug: {
        totalArticlesInDb: totalCount ?? 0,
        totalUnscoredInDb: unscoredCount ?? 0,
        windowHours: hours,
        since,
      },
    });
  }

  let scored = 0;
  const errors: string[] = [];
  const aiDebug: { rawKeys?: string[]; rawSample?: string; arrayLength?: number; filterPassed?: number }[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const articleList = batch
      .map((a, idx) => `[${idx}] ${a.title} | ${(a.snippet || a.content || "").slice(0, 300)}`)
      .join("\n");

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: [
          { role: "system", content: getScoringPrompt(topicParam) },
          { role: "user", content: articleList },
        ],
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        aiDebug.push({ rawSample: "null" });
        continue;
      }

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
        (r: ScoreResult) => typeof r.index === "number" && typeof r.score === "number" && r.index >= 0 && r.index < batch.length,
      );

      aiDebug.push({
        rawKeys: keys,
        rawSample: raw.slice(0, 300),
        arrayLength: arr.length,
        filterPassed: results.length,
      });

      const updates = results.map((r: ScoreResult) => {
        const article = batch[r.index];
        const fields: Record<string, unknown> = {
          relevance_score: Math.min(10, Math.max(1, Math.round(r.score))),
          score_reason: (r.reason || "").slice(0, 200),
          scored_at: new Date().toISOString(),
        };
        if (r.summary_en) fields.snippet_en = r.summary_en.slice(0, 500);
        if (r.summary_fr) fields.snippet_fr = r.summary_fr.slice(0, 500);
        return supabase
          .from("articles")
          .update(fields)
          .eq("id", article.id);
      });

      await Promise.all(updates);
      scored += updates.length;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({
    status: "ok",
    topic: topicParam,
    totalUnscored: rows.length,
    scored,
    debug: {
      totalArticlesInDb: totalCount ?? 0,
      totalUnscoredInDb: unscoredCount ?? 0,
      windowHours: hours,
      since,
    },
    ...(showDebug ? { aiDebug } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  });
}
