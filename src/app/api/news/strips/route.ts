import { NextRequest, NextResponse } from "next/server";
import { getScoredArticlesForTopics } from "@/lib/supabase";
import { NO_STORE_HEADERS, parseLang } from "@/lib/api-helpers";
import { groupArticlesByTopic } from "@/lib/topic-strips";

/**
 * GET /api/news/strips?topics=a,b,c&lang=fr — lightweight batch feed
 * for the home « Vos topics · 24 dernières heures » section.
 *
 * Replaces the previous pattern of one `/api/news` call per candidate
 * topic (each triggering a full gpt-4.1-nano analysis on cache miss —
 * the section routinely took ~30 s to fill). The strips only render
 * title / link / source / date / score, all of which already live in
 * `articles` (scores + AI-translated titles from the scoring
 * pipeline), so this route is a single Supabase read with zero LLM
 * involvement — the client gets every strip in one round-trip.
 *
 * Same selection contract as `/api/news` over 24 h: relevance_score
 * ≥ 6 (`getMinScore(24)`), best score first. 6 articles per topic so
 * `selectTopicStrips()` keeps spares for its cross-topic dedup.
 */

export const dynamic = "force-dynamic";

/** Mirror of `getMinScore(24)` in `/api/news` — keep strips consistent
 *  with what the per-topic 24 h view would surface. */
const MIN_SCORE = 6;
const PER_TOPIC = 6;
const MAX_TOPICS = 50;
/** Global row budget: 50 topics × 6 kept each stays well under it even
 *  before the per-topic cap, so no topic gets starved by truncation. */
const ROW_LIMIT = 1000;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lang = parseLang(params.get("lang"));

  const topicIds = (params.get("topics") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_TOPICS);

  if (topicIds.length === 0) {
    return NextResponse.json(
      { error: "Missing topics parameter" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const rows = await getScoredArticlesForTopics(topicIds, since, MIN_SCORE, ROW_LIMIT);
  const strips = groupArticlesByTopic(rows, PER_TOPIC, lang);

  return NextResponse.json({ strips }, { headers: NO_STORE_HEADERS });
}
