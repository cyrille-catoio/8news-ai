import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth-api";
import { getServerClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const supabaseP = getServerClient();
  if (!supabaseP) {
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

  const supabase = await supabaseP;

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

  const orderA = rowA.sort_order as number;
  let orderB = rowB.sort_order as number;

  if (orderA === orderB) {
    orderB = orderA + 1;
  }

  await Promise.all([
    supabase.from("topics").update({ sort_order: orderB }).eq("id", topicA),
    supabase.from("topics").update({ sort_order: orderA }).eq("id", topicB),
  ]);

  return NextResponse.json({ ok: true });
}
