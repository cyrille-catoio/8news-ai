"use client";

import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { trackEvent } from "@/lib/track";

export interface FavoriteButtonProps {
  url: string;
  title: string;
  source: string;
  pubDate?: string;
  sourceType?: "article" | "video";
  isFavorite: boolean;
  lang: Lang;
  onToggle: (article: { url: string; title: string; source: string; pubDate?: string; sourceType?: "article" | "video" }) => void;
  onRequestAuth?: () => void;
  isAuthenticated: boolean;
}

export function FavoriteButton({
  url,
  title: articleTitle,
  source,
  pubDate,
  sourceType,
  isFavorite,
  lang,
  onToggle,
  onRequestAuth,
  isAuthenticated,
}: FavoriteButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      onRequestAuth?.();
      return;
    }
    trackEvent(isFavorite ? "favorite.remove" : "favorite.add", {
      target_id: url,
      lang,
      meta: { source, sourceType: sourceType ?? "article" },
    });
    onToggle({ url, title: articleTitle, source, pubDate, sourceType });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={isFavorite ? t("removeFromFavorites", lang) : t("addToFavorites", lang)}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 4,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        transition: "color 0.15s, transform 0.15s",
        color: isFavorite ? color.gold : color.textDim,
        transform: isFavorite ? "scale(1.15)" : "scale(1)",
      }}
    >
      {isFavorite ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      )}
    </button>
  );
}
