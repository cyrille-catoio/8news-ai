import { NextRequest, NextResponse } from "next/server";
import {
  getActiveTopics,
  createTopic,
} from "@/lib/supabase";
import type { TopicItem } from "@/lib/types";

export async function GET() {
  try {
    const rows = await getActiveTopics();

    const topics: TopicItem[] = rows.map((r) => ({
      id: r.id,
      labelEn: r.label_en,
      labelFr: r.label_fr,
      feedCount: r.feed_count,
      isActive: r.is_active,
      sortOrder: r.sort_order,
    }));

    return NextResponse.json(topics, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch topics" },
      { status: 500 },
    );
  }
}

const SLUG_RE = /^[a-z0-9-]{2,30}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      labelEn,
      labelFr,
      scoringDomain,
      scoringTier1,
      scoringTier2,
      scoringTier3,
      scoringTier4,
      scoringTier5,
    } = body;

    if (!id || !SLUG_RE.test(id)) {
      return NextResponse.json(
        { error: "id must be 2-30 lowercase alphanumeric chars or hyphens" },
        { status: 400 },
      );
    }

    for (const [key, val] of Object.entries({
      labelEn,
      labelFr,
    })) {
      if (!val || typeof val !== "string" || val.length > 50) {
        return NextResponse.json(
          { error: `${key} must be 1-50 characters` },
          { status: 400 },
        );
      }
    }

    for (const [key, val] of Object.entries({
      scoringDomain,
      scoringTier1,
      scoringTier2,
      scoringTier3,
      scoringTier4,
      scoringTier5,
    })) {
      if (!val || typeof val !== "string" || val.length > 500) {
        return NextResponse.json(
          { error: `${key} must be 1-500 characters` },
          { status: 400 },
        );
      }
    }

    const existingTopics = await getActiveTopics();
    const maxSort = existingTopics.reduce(
      (m, t) => Math.max(m, t.sort_order),
      -1,
    );

    const row = await createTopic({
      id,
      label_en: labelEn,
      label_fr: labelFr,
      scoring_domain: scoringDomain,
      scoring_tier1: scoringTier1,
      scoring_tier2: scoringTier2,
      scoring_tier3: scoringTier3,
      scoring_tier4: scoringTier4,
      scoring_tier5: scoringTier5,
      sort_order: maxSort + 1,
    });

    if (!row) {
      return NextResponse.json(
        { error: "Topic already exists or creation failed" },
        { status: 409 },
      );
    }

    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create topic" },
      { status: 500 },
    );
  }
}
