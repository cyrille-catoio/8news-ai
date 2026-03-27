import { NextRequest, NextResponse } from "next/server";
import {
  getTopicWithFeeds,
  updateTopic,
  deleteTopic,
} from "@/lib/supabase";
import type { TopicDetail, FeedItem } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const row = await getTopicWithFeeds(id);

    if (!row) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const detail: TopicDetail = {
      id: row.id,
      labelEn: row.label_en,
      labelFr: row.label_fr,
      scoringDomain: row.scoring_domain,
      scoringTier1: row.scoring_tier1,
      scoringTier2: row.scoring_tier2,
      scoringTier3: row.scoring_tier3,
      scoringTier4: row.scoring_tier4,
      scoringTier5: row.scoring_tier5,
      promptEn: row.prompt_en ?? "",
      promptFr: row.prompt_fr ?? "",
      isActive: row.is_active,
      sortOrder: row.sort_order,
      feeds: row.feeds.map(
        (f): FeedItem => ({
          id: f.id,
          name: f.name,
          url: f.url,
          isActive: f.is_active,
        }),
      ),
    };

    return NextResponse.json(detail, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch topic" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const allowed: Record<string, string> = {
      labelEn: "label_en",
      labelFr: "label_fr",
      scoringDomain: "scoring_domain",
      scoringTier1: "scoring_tier1",
      scoringTier2: "scoring_tier2",
      scoringTier3: "scoring_tier3",
      scoringTier4: "scoring_tier4",
      scoringTier5: "scoring_tier5",
      promptEn: "prompt_en",
      promptFr: "prompt_fr",
      isActive: "is_active",
      sortOrder: "sort_order",
    };

    const updateData: Record<string, unknown> = {};
    for (const [camel, snake] of Object.entries(allowed)) {
      if (body[camel] !== undefined) {
        updateData[snake] = body[camel];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const row = await updateTopic(id, updateData);

    if (!row) {
      return NextResponse.json(
        { error: "Topic not found or update failed" },
        { status: 404 },
      );
    }

    return NextResponse.json(row);
  } catch {
    return NextResponse.json(
      { error: "Failed to update topic" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ok = await deleteTopic(id);

    if (!ok) {
      return NextResponse.json(
        { error: "Topic not found or delete failed" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete topic" },
      { status: 500 },
    );
  }
}
