import { NextResponse } from "next/server";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }

  const PAGE = 1000;
  const entries: {
    id: number;
    version: string;
    title_en: string;
    title_fr: string;
    body_en: string;
    body_fr: string;
    created_at: string;
  }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("changelog")
      .select("id, version, title_en, title_fr, body_en, body_fr, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const batch = data ?? [];
    entries.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }

  return NextResponse.json({ entries }, {
    headers: { "Cache-Control": "no-store" },
  });
}
