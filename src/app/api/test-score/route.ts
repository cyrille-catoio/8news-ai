import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreTopicForAdmin } from "@/lib/score-topic-dynamic";

export const maxDuration = 60;

const DEFAULT_HOURS = 168;
const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const secret = params.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const topicParam = params.get("topic");
  if (!topicParam) {
    return NextResponse.json({ error: "Missing topic parameter" }, { status: 400 });
  }

  const hours = Math.max(1, parseInt(params.get("hours") ?? String(DEFAULT_HOURS), 10) || DEFAULT_HOURS);
  const limit = Math.min(200, Math.max(1, parseInt(params.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const showDebug = params.get("debug") === "1";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: topicRow, error: topicError } = await supabase
    .from("topics")
    .select("scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5")
    .eq("id", topicParam)
    .eq("is_active", true)
    .single();

  if (topicError || !topicRow) {
    return NextResponse.json({ error: "Invalid or inactive topic" }, { status: 400 });
  }

  const [{ count: totalCount }, { count: unscoredCount }] = await Promise.all([
    supabase.from("articles").select("id", { count: "exact", head: true }).eq("topic", topicParam),
    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("topic", topicParam)
      .is("relevance_score", null),
  ]);

  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  try {
    const criteria = {
      scoring_domain: topicRow.scoring_domain,
      scoring_tier1: topicRow.scoring_tier1,
      scoring_tier2: topicRow.scoring_tier2,
      scoring_tier3: topicRow.scoring_tier3,
      scoring_tier4: topicRow.scoring_tier4,
      scoring_tier5: topicRow.scoring_tier5,
    };

    const run = await scoreTopicForAdmin(topicParam, criteria, supabase, {
      windowHours: hours,
      maxArticles: limit,
      collectAiDebug: showDebug,
    });

    if (run.dbError) {
      return NextResponse.json({ error: `DB error: ${run.dbError}` }, { status: 500 });
    }

    if (run.candidateCount === 0) {
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

    return NextResponse.json({
      status: "ok",
      topic: topicParam,
      totalUnscored: run.candidateCount,
      scored: run.scored,
      debug: {
        totalArticlesInDb: totalCount ?? 0,
        totalUnscoredInDb: unscoredCount ?? 0,
        windowHours: hours,
        since,
      },
      ...(showDebug && run.aiDebug ? { aiDebug: run.aiDebug } : {}),
      ...(run.errors.length > 0 ? { errors: run.errors } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Scoring failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
