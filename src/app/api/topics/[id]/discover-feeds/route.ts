import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getTopicWithFeeds, createFeed } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth-api";

async function validateFeed(
  url: string,
): Promise<{ valid: boolean; reason?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "8news-ai/1.0 RSS-Checker" },
      redirect: "follow",
    });

    if (!res.ok) return { valid: false, reason: `HTTP ${res.status}` };

    const text = await res.text();

    const trimmed = text.trimStart().toLowerCase();
    const isXml =
      trimmed.startsWith("<?xml") ||
      trimmed.startsWith("<rss") ||
      trimmed.startsWith("<feed") ||
      trimmed.startsWith("<!doctype");
    if (!isXml) return { valid: false, reason: "Not RSS/XML content" };

    const hasItems = text.includes("<item") || text.includes("<entry");
    if (!hasItems) return { valid: false, reason: "No articles found" };

    return { valid: true };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Timeout (8s)"
        : "Network error";
    return { valid: false, reason: msg };
  } finally {
    clearTimeout(timeout);
  }
}

const systemPrompt = `You are an RSS feed expert. Given a news topic domain, suggest exactly 10 RSS feed URLs that are most likely to contain relevant articles.

Prioritize:
- Major news outlets with dedicated RSS feeds (Reuters, BBC, AP, etc.)
- Specialized blogs and publications for the domain
- Google News RSS search URLs (https://news.google.com/rss/search?q=...)
- Hacker News filtered RSS (https://hnrss.org/newest?q=...)
- Subreddit RSS feeds (https://www.reddit.com/r/{sub}/.rss)

Return ONLY valid JSON (no markdown, no code fences):
[
  { "name": "Human-readable source name", "url": "https://full-rss-url" },
  ...
]

Exactly 10 items. Each URL must be a direct RSS/Atom feed URL (not an HTML page).`;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const { id } = await params;

  const topic = await getTopicWithFeeds(id);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const existingUrls = new Set(topic.feeds.map((f) => f.url));

  const openai = new OpenAI({ apiKey });

  let suggestions: { name: string; url: string }[];
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Domain: ${topic.scoring_domain}\nTopic: ${topic.label_en}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "[]";
    suggestions = JSON.parse(raw);
    if (!Array.isArray(suggestions)) suggestions = [];
  } catch (e) {
    console.error("discover-feeds AI error:", e);
    return NextResponse.json({ added: [], rejected: [] });
  }

  const added: { name: string; url: string }[] = [];
  const rejected: { name: string; url: string; reason: string }[] = [];

  const results = await Promise.allSettled(
    suggestions.map(async (s) => {
      const name = (s.name || "").trim();
      const url = (s.url || "").trim();
      if (!url || !url.startsWith("http")) {
        return { name, url, valid: false, reason: "Invalid URL" };
      }
      if (existingUrls.has(url)) {
        return { name, url, valid: false, reason: "Already exists" };
      }
      const check = await validateFeed(url);
      return { name, url, valid: check.valid, reason: check.reason };
    }),
  );

  for (const r of results) {
    if (r.status === "rejected") continue;
    const { name, url, valid, reason } = r.value;
    if (valid) {
      const row = await createFeed(id, name || new URL(url).hostname, url);
      if (row) {
        added.push({ name: row.name, url: row.url });
        existingUrls.add(url);
      }
    } else {
      rejected.push({ name, url, reason: reason || "Unknown" });
    }
  }

  return NextResponse.json({ added, rejected });
}
