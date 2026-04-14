import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth-api";
import { generateDailySummary } from "@/lib/generate-daily-summary";
import type { Lang } from "@/lib/i18n";

export const maxDuration = 60;

function yesterday(): string {
  const d = new Date(Date.now() - 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    // Authenticated via cron secret — skip session check
  } else {
    const auth = await requireOwnerSession();
    if (!auth.ok) return auth.response;
  }

  let body: { topic?: unknown; date?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date.trim() : yesterday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const langs: Lang[] = [];
  if (typeof body.lang === "string") {
    const l = body.lang.trim() as Lang;
    if (l !== "en" && l !== "fr") {
      return NextResponse.json({ error: 'lang must be "en" or "fr"' }, { status: 400 });
    }
    langs.push(l);
  } else {
    langs.push("en", "fr");
  }

  const results: Array<{ lang: string; summaryId?: number; slug?: string; status?: string; error?: string }> = [];

  for (const l of langs) {
    try {
      const result = await generateDailySummary(topic, date, l);
      if (result) {
        results.push({ lang: l, summaryId: result.summaryId, slug: result.slug, status: result.status });
      } else {
        results.push({ lang: l, error: "Generation failed", status: "error" });
      }
    } catch (e) {
      results.push({ lang: l, error: e instanceof Error ? e.message : "Unknown error", status: "error" });
    }
  }

  return NextResponse.json({ topic, date, results }, { status: 201 });
}
