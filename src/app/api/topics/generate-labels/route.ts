import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireSession } from "@/lib/auth-api";

export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let labelEn: string;
  try {
    const body = await req.json();
    labelEn = (body.labelEn || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!labelEn) {
    return NextResponse.json({ error: "labelEn is required" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  const systemPrompt = `You are an assistant that helps set up news monitoring topics.
Given an English topic label, generate:
1. "slug": a URL-safe lowercase slug (2-30 chars, only a-z, 0-9, hyphens). Keep it short and meaningful.
2. "labelFr": a natural French translation of the topic label. It MUST be as short as the English label (same word count or fewer). Keep it concise — no extra words.
3. "domain": a concise English description of the news domain covered by this topic (1-3 sentences, max 300 chars). Include key sub-topics, technologies, or actors that are relevant. This will be used to guide AI scoring and feed discovery.

Return ONLY valid JSON (no markdown, no code fences):
{"slug": "...", "labelFr": "...", "domain": "..."}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Topic label: ${labelEn}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(raw);

    const slug = String(parsed.slug || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);

    return NextResponse.json({
      slug,
      labelFr: String(parsed.labelFr || "").slice(0, 50),
      domain: String(parsed.domain || "").slice(0, 500),
    });
  } catch (e) {
    console.error("generate-labels error:", e);
    return NextResponse.json({ error: "Failed to generate labels" }, { status: 500 });
  }
}
