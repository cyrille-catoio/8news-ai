"use client";

import { useState, useEffect } from "react";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, sectionCard, spinnerStyle } from "@/lib/theme";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";

interface FavoriteItem {
  id: number;
  url: string;
  title: string;
  source: string;
  pubDate: string | null;
  createdAt: string;
}

export function FavoritesPage({
  lang,
  favoriteUrls,
  onToggleFavorite,
}: {
  lang: Lang;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string }) => void;
}) {
  const [favorites, setFavorites] = useState<FavoriteItem[] | null>(null);
  const locale = dateLocale(lang);
  const loading = favorites === null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/favorites", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((json: { favorites: FavoriteItem[] }) => {
        if (!cancelled) setFavorites(json.favorites);
      })
      .catch(() => {
        if (!cancelled) setFavorites([]);
      });
    return () => { cancelled = true; };
  }, []);

  const handleRemove = (fav: FavoriteItem) => {
    onToggleFavorite({ url: fav.url, title: fav.title, source: fav.source, pubDate: fav.pubDate ?? undefined });
    setFavorites((prev) => (prev ?? []).filter((f) => f.url !== fav.url));
  };

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 20, marginTop: 0 }}>
        {t("favoritesTitle", lang)}
      </h2>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <span style={spinnerStyle(24)} />
          <p style={{ color: color.textMuted, fontSize: 13, marginTop: 12 }}>{t("favoritesLoading", lang)}</p>
        </div>
      ) : (favorites ?? []).length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color.textDim}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.5, marginBottom: 16 }}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <p style={{ color: color.textMuted, fontSize: 16, fontWeight: 600, margin: 0 }}>
            {t("favoritesEmpty", lang)}
          </p>
          <p style={{ color: color.textDim, fontSize: 13, marginTop: 8, maxWidth: 320, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
            {t("favoritesEmptyHint", lang)}
          </p>
        </div>
      ) : (
        <div style={sectionCard}>
          {(favorites ?? []).map((fav, i) => {
            let domain = "";
            try { domain = new URL(fav.url).hostname.replace("www.", ""); } catch { /* */ }

            return (
              <div
                key={fav.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 0",
                  borderBottom: i < (favorites ?? []).length - 1 ? `1px solid ${color.border}` : "none",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleRemove(fav)}
                  title={t("removeFromFavorites", lang)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    color: favoriteUrls.has(fav.url) ? color.gold : color.textDim,
                    marginTop: 2,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a
                    href={fav.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: "none", color: color.text, fontWeight: 500, fontSize: 14, lineHeight: 1.4 }}
                  >
                    {fav.title}
                  </a>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ color: color.textDim, fontSize: 12 }}>
                      {fav.source || domain}
                      {fav.pubDate ? ` · ${new Date(fav.pubDate).toLocaleDateString(locale)}` : ""}
                    </span>
                    <CopyLinkButton url={fav.url} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
