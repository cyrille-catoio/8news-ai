import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireOwnerSession } from "@/lib/auth-api";

export async function POST(req: Request) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let domain: string;
  try {
    const body = await req.json();
    domain = (body.domain || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!domain) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  const systemPrompt = `You are an expert at creating scoring rubrics for news article relevance.
Given a topic domain description, generate 5 scoring tiers that define how relevant/important a news article is to that domain.

Return ONLY valid JSON with this exact structure (no markdown, no code fences):
{
  "tier1": "Description for score 9-10 (most relevant, breaking news, major events)",
  "tier2": "Description for score 7-8 (very relevant, significant updates)",
  "tier3": "Description for score 5-6 (moderately relevant, routine updates)",
  "tier4": "Description for score 3-4 (low relevance, opinion without new facts)",
  "tier5": "Description for score 1-2 (barely relevant, off-topic mentions)"
}

Each tier should be 1-3 sentences in English, specific to the given domain. Be concrete with examples of what qualifies for each tier.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Domain: ${domain}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(raw);

    return NextResponse.json({
      tier1: parsed.tier1 || "",
      tier2: parsed.tier2 || "",
      tier3: parsed.tier3 || "",
      tier4: parsed.tier4 || "",
      tier5: parsed.tier5 || "",
    });
  } catch (e) {
    console.error("generate-scoring error:", e);
    return NextResponse.json(
      { error: "Failed to generate scoring criteria" },
      { status: 500 },
    );
  }
}
