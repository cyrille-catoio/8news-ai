import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-api";
import {
  getUserFavorites,
  getUserFavoriteUrls,
  addUserFavorite,
  removeUserFavorite,
  getVideoIdsWithTranscription,
  getVideoPagePathsByVideoIds,
} from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const urlsOnly = req.nextUrl.searchParams.get("urls") === "1";

  if (urlsOnly) {
    const urls = await getUserFavoriteUrls(auth.user.id);
    return NextResponse.json({ urls }, { headers: { "Cache-Control": "no-store" } });
  }

  const lang = req.nextUrl.searchParams.get("lang") ?? "en";
  const favorites = await getUserFavorites(auth.user.id);

  const videoIdMap = new Map<string, string>();
  for (const f of favorites) {
    const vid = extractYouTubeVideoId(f.article_url);
    if (vid) videoIdMap.set(f.article_url, vid);
  }

  const transcribedIds = videoIdMap.size > 0
    ? await getVideoIdsWithTranscription([...videoIdMap.values()], lang === "fr" ? "fr" : "en")
    : new Set<string>();
  const pageLang = lang === "fr" ? "fr" : "en";
  const internalPaths = videoIdMap.size > 0
    ? await getVideoPagePathsByVideoIds([...videoIdMap.values()], pageLang)
    : new Map<string, string>();

  return NextResponse.json(
    {
      favorites: favorites.map((f) => {
        const vid = videoIdMap.get(f.article_url);
        return {
          id: f.id,
          url: f.article_url,
          title: f.article_title,
          source: f.article_source,
          pubDate: f.article_date,
          sourceType: f.source_type || "article",
          createdAt: f.created_at,
          videoId: vid ?? null,
          hasTranscription: vid ? transcribedIds.has(vid) : false,
          internalPath: vid ? (internalPaths.get(vid) ?? null) : null,
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let body: { url?: unknown; title?: unknown; source?: unknown; pubDate?: unknown; sourceType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, title, source, pubDate, sourceType } = body;
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
    sourceType: typeof sourceType === "string" ? sourceType : "article",
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

function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
  } catch { /* */ }
  return null;
}
