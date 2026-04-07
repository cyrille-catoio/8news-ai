import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { fetchAndStoreTopicDynamic } from "./shared/fetch-topic";
import { scoreAndStoreTopicDynamic } from "./shared/score-topic";

const FETCH_DEADLINE_MS = 12_000;
const POST_FETCH_SCORE_RESERVE_MS = 6_000;
const DEFAULT_MINI_SCORE_ARTICLES = 50;
const MAX_TOPICS_PER_RUN = 4;

type TopicFetchRow = {
  id: string;
  last_fetched_at: string | null;
  scoring_domain: string;
  scoring_tier1: string;
  scoring_tier2: string;
  scoring_tier3: string;
  scoring_tier4: string;
  scoring_tier5: string;
};

export default async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: allTopics, error } = await supabase
    .from("topics")
    .select(
      "id, last_fetched_at, scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5",
    )
    .eq("is_active", true)
    .order("last_fetched_at", { ascending: true, nullsFirst: true });

  if (error) {
    return new Response(`DB error: ${error.message}`, { status: 500 });
  }

  const n = allTopics?.length ?? 0;
  if (n === 0) return new Response("No active topics");

  const k = Math.min(Math.max(1, Math.ceil(n / 10)), MAX_TOPICS_PER_RUN);
  const batch = (allTopics as TopicFetchRow[]).slice(0, k);

  const deadline = Date.now() + FETCH_DEADLINE_MS;
  const lines: string[] = [];

  for (const topic of batch) {
    if (Date.now() >= deadline) {
      lines.push("[deadline] skipped remaining topics in batch");
      break;
    }

    await supabase
      .from("topics")
      .update({ last_fetched_at: new Date().toISOString() })
      .eq("id", topic.id);

    const { summary, inserted } = await fetchAndStoreTopicDynamic(topic.id, supabase);
    lines.push(summary);

    if (Date.now() + POST_FETCH_SCORE_RESERVE_MS < deadline) {
      const miniScoreMax = Math.min(DEFAULT_MINI_SCORE_ARTICLES, Math.max(15, inserted));
      const criteria = {
        scoring_domain: topic.scoring_domain,
        scoring_tier1: topic.scoring_tier1,
        scoring_tier2: topic.scoring_tier2,
        scoring_tier3: topic.scoring_tier3,
        scoring_tier4: topic.scoring_tier4,
        scoring_tier5: topic.scoring_tier5,
      };
      const scoreMsg = await scoreAndStoreTopicDynamic(topic.id, criteria, supabase, {
        maxArticles: miniScoreMax,
        windowHours: null,
      });
      lines.push(`post-fetch: ${scoreMsg}`);
    }
  }

  return new Response(lines.join("\n"));
};

export const config: Config = { schedule: "* * * * *" };
