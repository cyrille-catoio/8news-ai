import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }

  let topicA: string, topicB: string;
  try {
    const body = await req.json();
    topicA = (body.topicA || "").trim();
    topicB = (body.topicB || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!topicA || !topicB || topicA === topicB) {
    return NextResponse.json({ error: "Two distinct topic IDs required" }, { status: 400 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: rowA } = await supabase
    .from("topics")
    .select("sort_order")
    .eq("id", topicA)
    .single();

  const { data: rowB } = await supabase
    .from("topics")
    .select("sort_order")
    .eq("id", topicB)
    .single();

  if (!rowA || !rowB) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  await Promise.all([
    supabase.from("topics").update({ sort_order: rowB.sort_order }).eq("id", topicA),
    supabase.from("topics").update({ sort_order: rowA.sort_order }).eq("id", topicB),
  ]);

  return NextResponse.json({ ok: true });
}
