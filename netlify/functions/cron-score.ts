import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { scoreAndStoreTopicDynamic } from "./shared/score-topic";

export default async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: topic } = await supabase
    .from("topics")
    .select("id, scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5")
    .eq("is_active", true)
    .order("last_scored_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .single();

  if (!topic) return new Response("No active topics");

  const result = await scoreAndStoreTopicDynamic(topic.id, topic, supabase);

  await supabase
    .from("topics")
    .update({ last_scored_at: new Date().toISOString() })
    .eq("id", topic.id);

  return new Response(result);
};

export const config: Config = { schedule: "*/3 * * * *" };
