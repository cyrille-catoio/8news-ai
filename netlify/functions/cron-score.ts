import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { scoreAndStoreTopicDynamic, SCORE_WINDOW_HOURS } from "./shared/score-topic";

type TopicScoreRow = {
  id: string;
  last_fetched_at: string | null;
  last_scored_at: string | null;
  scoring_domain: string;
  scoring_tier1: string;
  scoring_tier2: string;
  scoring_tier3: string;
  scoring_tier4: string;
  scoring_tier5: string;
};

function tsOrNull(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export default async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: topics, error } = await supabase
    .from("topics")
    .select(
      "id, last_fetched_at, last_scored_at, scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5",
    )
    .eq("is_active", true);

  if (error) {
    return new Response(`DB error: ${error.message}`, { status: 500 });
  }

  if (!topics || topics.length === 0) return new Response("No active topics");

  const since = new Date(Date.now() - SCORE_WINDOW_HOURS * 3_600_000).toISOString();

  const rows = topics as TopicScoreRow[];
  const withBacklog = await Promise.all(
    rows.map(async (topic) => {
      const { count } = await supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("topic", topic.id)
        .gte("pub_date", since)
        .is("relevance_score", null);
      return { topic, backlog: count ?? 0 };
    }),
  );

  withBacklog.sort((a, b) => {
    const ha = a.backlog > 0 ? 1 : 0;
    const hb = b.backlog > 0 ? 1 : 0;
    if (ha !== hb) return hb - ha;

    if (ha > 0) {
      const fa = tsOrNull(a.topic.last_fetched_at);
      const fb = tsOrNull(b.topic.last_fetched_at);
      if (fa === null && fb === null) return a.topic.id.localeCompare(b.topic.id);
      if (fa === null) return 1;
      if (fb === null) return -1;
      return fb - fa;
    }

    const sa = tsOrNull(a.topic.last_scored_at);
    const sb = tsOrNull(b.topic.last_scored_at);
    if (sa === null && sb === null) return a.topic.id.localeCompare(b.topic.id);
    if (sa === null) return -1;
    if (sb === null) return 1;
    if (sa !== sb) return sa - sb;
    return a.topic.id.localeCompare(b.topic.id);
  });

  for (const { topic, backlog } of withBacklog) {
    if (backlog === 0) {
      await supabase
        .from("topics")
        .update({ last_scored_at: new Date().toISOString() })
        .eq("id", topic.id);
      continue;
    }

    await supabase
      .from("topics")
      .update({ last_scored_at: new Date().toISOString() })
      .eq("id", topic.id);

    const criteria = {
      scoring_domain: topic.scoring_domain,
      scoring_tier1: topic.scoring_tier1,
      scoring_tier2: topic.scoring_tier2,
      scoring_tier3: topic.scoring_tier3,
      scoring_tier4: topic.scoring_tier4,
      scoring_tier5: topic.scoring_tier5,
    };

    const result = await scoreAndStoreTopicDynamic(topic.id, criteria, supabase);
    return new Response(result);
  }

  return new Response("All topics up to date — no unscored articles");
};

export const config: Config = { schedule: "* * * * *" };
