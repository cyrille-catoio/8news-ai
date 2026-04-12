import { NextResponse } from "next/server";
import { getCategories } from "@/lib/supabase";
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
