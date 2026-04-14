import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-api";
import {
  getUserFavorites,
  getUserFavoriteUrls,
  addUserFavorite,
  removeUserFavorite,
} from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const urlsOnly = req.nextUrl.searchParams.get("urls") === "1";

  if (urlsOnly) {
    const urls = await getUserFavoriteUrls(auth.user.id);
    return NextResponse.json({ urls }, { headers: { "Cache-Control": "no-store" } });
  }

  const favorites = await getUserFavorites(auth.user.id);
  return NextResponse.json(
    {
      favorites: favorites.map((f) => ({
        id: f.id,
        url: f.article_url,
        title: f.article_title,
        source: f.article_source,
        pubDate: f.article_date,
        createdAt: f.created_at,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let body: { url?: unknown; title?: unknown; source?: unknown; pubDate?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, title, source, pubDate } = body;
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const ok = await addUserFavorite(auth.user.id, {
    url: url.trim(),
    title: title.trim(),
    source: typeof source === "string" ? source.trim() : "",
    pubDate: typeof pubDate === "string" ? pubDate : undefined,
  });

  if (!ok) {
    return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url } = body;
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const ok = await removeUserFavorite(auth.user.id, url.trim());
  if (!ok) {
    return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
