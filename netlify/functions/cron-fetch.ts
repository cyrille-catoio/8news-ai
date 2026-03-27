import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { fetchAndStoreTopicDynamic } from "./shared/fetch-topic";

export default async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: topic } = await supabase
    .from("topics")
    .select("id")
    .eq("is_active", true)
    .order("last_fetched_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .single();

  if (!topic) return new Response("No active topics");

  const result = await fetchAndStoreTopicDynamic(topic.id, supabase);

  await supabase
    .from("topics")
    .update({ last_fetched_at: new Date().toISOString() })
    .eq("id", topic.id);

  return new Response(result);
};

export const config: Config = { schedule: "*/5 * * * *" };
