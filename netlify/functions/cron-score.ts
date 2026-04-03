import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { scoreAndStoreTopicDynamic, SCORE_WINDOW_HOURS } from "./shared/score-topic";

export default async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: topics } = await supabase
    .from("topics")
    .select("id, scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5")
    .eq("is_active", true)
    .order("last_scored_at", { ascending: true, nullsFirst: true });

  if (!topics || topics.length === 0) return new Response("No active topics");

  const since = new Date(Date.now() - SCORE_WINDOW_HOURS * 3_600_000).toISOString();

  for (const topic of topics) {
    const { count } = await supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("topic", topic.id)
      .gte("pub_date", since)
      .is("relevance_score", null);

    if (!count || count === 0) {
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

    const result = await scoreAndStoreTopicDynamic(topic.id, topic, supabase);
    return new Response(result);
  }

  return new Response("All topics up to date — no unscored articles");
};

export const config: Config = { schedule: "* * * * *" };
