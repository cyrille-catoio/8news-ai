import type { Config } from "@netlify/functions";
import { fetchAndStoreTopic } from "./shared/fetch-topic";

export default async () => {
  const result = await fetchAndStoreTopic("videogames");
  return new Response(result);
};

export const config: Config = { schedule: "@hourly" };
