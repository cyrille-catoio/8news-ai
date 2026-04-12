import type { Config } from "@netlify/functions";

export default async () => {
  const now = new Date().toISOString();
  console.log(`[cron-test] executed at ${now}`);
  return new Response(`cron-test OK at ${now}`);
};

export const config: Config = { schedule: "* * * * *" };
