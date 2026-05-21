"use client";

import { useState } from "react";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { AuthModal } from "@/app/components/AuthModal";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/app/providers";
import type { Lang } from "@/lib/i18n";

/**
 * Client wrapper that drops a star toggle on a daily-summary SEO page
 * (`/{topic}/{date}/{slug}` and its localised `/fr/...` & `/en/...`
 * variants). Mirrors `VideoPageFavoriteButton` but persists
 * `sourceType: "article"` so the favorited row groups with article
 * bookmarks on the « Favoris » page instead of the videos list. The
 * favorited `url` is the canonical 8news.ai page URL itself — when the
 * visitor clicks the entry in /favoris we route them back to the same
 * AI-curated briefing rather than off-site.
 */
export function DailySummaryFavoriteButton({
  url,
  title,
  source,
  pubDate,
  lang,
}: {
  url: string;
  title: string;
  source: string;
  pubDate?: string;
  lang: Lang;
}) {
  const { session } = useAuth();
  const isAuthenticated = Boolean(session?.user);
  const { favoriteUrls, toggleFavorite } = useFavorites(isAuthenticated);
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <FavoriteButton
        url={url}
        title={title}
        source={source}
        pubDate={pubDate}
        sourceType="article"
        isFavorite={favoriteUrls.has(url)}
        lang={lang}
        onToggle={toggleFavorite}
        onRequestAuth={() => setAuthOpen(true)}
        isAuthenticated={isAuthenticated}
        size={22}
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} lang={lang} />
    </>
  );
}
