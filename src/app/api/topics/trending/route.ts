import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/topics/trending?since=6h&lang=fr
 *
 * Returns the topics that received the most articles in the recent
 * window, ordered by count desc, limit 8. Powers the "Tendances" strip
 * on the Briefing homepage.
 *
 * Response: [{ id, label, count }]
 */
export async function GET(req: NextRequest) {
  const sinceParam = req.nextUrl.searchParams.get("since") ?? "6h";
  const langParam = req.nextUrl.searchParams.get("lang") ?? "en";
  const lang = langParam === "fr" ? "fr" : "en";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  const sinceMs = parseSinceWindow(sinceParam);
  const sinceISO = new Date(Date.now() - sinceMs).toISOString();

  const db = createClient(url, key, { auth: { persistSession: false } });

  // Pull just the topic column for articles fetched in the window. Cap at
  // 5000 rows to bound memory: typical 6h window is well under that.
  const { data: rows, error } = await db
    .from("articles")
    .select("topic")
    .gte("fetched_at", sinceISO)
    .limit(5000);

  if (error || !rows) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  const counts = new Map<string, number>();
  for (const r of rows as Array<{ topic: string }>) {
    counts.set(r.topic, (counts.get(r.topic) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return NextResponse.json([], {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  }

  const { data: topicRows } = await db
    .from("topics")
    .select("id, label_en, label_fr, is_active, is_displayed")
    .in("id", Array.from(counts.keys()));

  const labelById = new Map<string, string>();
  for (const t of (topicRows ?? []) as Array<{
    id: string;
    label_en: string;
    label_fr: string;
    is_active: boolean;
    is_displayed: boolean;
  }>) {
    if (!t.is_active || !t.is_displayed) continue; // hide topics not surfaced to users
    labelById.set(t.id, lang === "fr" ? t.label_fr : t.label_en);
  }

  const ranked = Array.from(counts.entries())
    .filter(([id]) => labelById.has(id))
    .map(([id, count]) => ({ id, label: labelById.get(id)!, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return NextResponse.json(ranked, {
    // Light cache: trending is OK to be a few minutes stale.
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}

/**
 * Parse "6h", "24h", "30m" etc. into milliseconds. Defaults to 6h on any
 * unparseable input. Caps at 7d to avoid huge windows.
 */
function parseSinceWindow(s: string): number {
  const m = s.trim().match(/^(\d+)\s*([mhd])$/i);
  if (!m) return 6 * 3_600_000;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const ms =
    unit === "m" ? n * 60_000
      : unit === "h" ? n * 3_600_000
      : n * 86_400_000;
  return Math.min(ms, 7 * 86_400_000);
}
