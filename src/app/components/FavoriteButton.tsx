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
  /** SVG side length in px. Defaults to 15 — the size used inline next
   *  to article/video card titles in the SPA lists. Page-level headers
   *  (the SEO daily-summary page) pass a larger value to balance the H1. */
  size?: number;
  /** `"icon"` (default) = bare star, used inline in SPA lists.
   *  `"pill"` = rounded gold-outlined chip with the star + a
   *  « Favoris » / « Favorites » label — same chrome as the Share
   *  button on the SSR detail pages, so the two sit side by side
   *  as a homogeneous action row. */
  variant?: "icon" | "pill";
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
  size = 15,
  variant = "icon",
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

  const star = isFavorite ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={isFavorite ? t("removeFromFavorites", lang) : t("addToFavorites", lang)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px",
          borderRadius: 999,
          border: `1px solid ${color.gold}`,
          background: isFavorite ? "rgba(201,162,39,0.15)" : "transparent",
          color: color.gold,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
          transition: "background 0.15s",
        }}
      >
        {star}
        {t("myFavoritesBtn", lang)}
      </button>
    );
  }

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
      {star}
    </button>
  );
}
