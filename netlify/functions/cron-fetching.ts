import type { Config } from "@netlify/functions";

export default async () => {
  const siteUrl = process.env.URL || "https://8news.ai";
  const endpoint = `${siteUrl}/.netlify/functions/cron-fetching-background`;

  try {
    const res = await fetch(endpoint, { method: "POST" });
    console.log(`[cron-fetching] triggered background function — status ${res.status}`);
    return new Response(`triggered: ${res.status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cron-fetching] failed to trigger background: ${msg}`);
    return new Response(`error: ${msg}`, { status: 500 });
  }
};

export const config: Config = { schedule: "*/10 * * * *" };
