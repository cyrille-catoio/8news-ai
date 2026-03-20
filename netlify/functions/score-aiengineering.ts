import type { Config } from "@netlify/functions";
import { scoreAndStoreTopic } from "./shared/score-topic";

export default async () => {
  const result = await scoreAndStoreTopic("aiengineering");
  return new Response(result);
};

export const config: Config = { schedule: "5 * * * *" };
