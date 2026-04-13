import { NextRequest, NextResponse } from "next/server";
import { getCategories, createCategory } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/auth-api";
import type { CategoryItem } from "@/lib/types";

export async function GET() {
  try {
    const rows = await getCategories();
    const categories: CategoryItem[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      labelEn: r.label_en,
      labelFr: r.label_fr,
    }));
    return NextResponse.json(categories, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const { slug, labelEn, labelFr } = body;
    if (!slug || !labelEn || !labelFr) {
      return NextResponse.json({ error: "slug, labelEn and labelFr are required" }, { status: 400 });
    }
    const existing = await getCategories();
    const maxSort = existing.reduce((m, c) => Math.max(m, c.sort_order), 0);
    const row = await createCategory({
      slug: slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 30),
      label_en: labelEn.slice(0, 50),
      label_fr: labelFr.slice(0, 50),
      sort_order: maxSort + 1,
    });
    if (!row) {
      return NextResponse.json({ error: "Category already exists or creation failed" }, { status: 409 });
    }
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
