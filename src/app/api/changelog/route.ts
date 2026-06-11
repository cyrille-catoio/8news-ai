import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHANGELOG_ENTRIES } from "@/lib/changelog-entries";
import { getServerClient } from "@/lib/supabase";

let syncDone = false;

async function ensureChangelogSynced(supabase: SupabaseClient) {
  if (syncDone) return;

  const { data: existing } = await supabase
    .from("changelog")
    .select("version");

  const existingVersions = new Set((existing ?? []).map((r: { version: string }) => r.version));
  const missing = CHANGELOG_ENTRIES.filter((e) => !existingVersions.has(e.version));

  if (missing.length > 0) {
    await supabase.from("changelog").insert(missing);
  }

  syncDone = true;
}

export async function GET() {
  const supabaseP = getServerClient();
  if (!supabaseP) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }
  const supabase = await supabaseP;

  await ensureChangelogSynced(supabase);

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

  // Source of truth: CHANGELOG_ENTRIES. Hide DB rows for versions that have
  // been superseded/merged in code (e.g. patch releases folded into a parent
  // entry) and override stored title/body with the current code values so a
  // single deploy is enough to refresh the public changelog.
  const codeMap = new Map(CHANGELOG_ENTRIES.map((e) => [e.version, e]));
  const filtered = entries
    .filter((e) => codeMap.has(e.version))
    .map((e) => {
      const code = codeMap.get(e.version)!;
      return {
        ...e,
        title_en: code.title_en,
        title_fr: code.title_fr,
        body_en: code.body_en,
        body_fr: code.body_fr,
      };
    });

  return NextResponse.json({ entries: filtered }, {
    headers: { "Cache-Control": "no-store" },
  });
}
