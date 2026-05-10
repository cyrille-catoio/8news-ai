"use client";

import { color } from "@/lib/theme";
import { dateLocale, type Lang } from "@/lib/i18n";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { ScoreMeter } from "@/app/components/ScoreMeter";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/app/providers";
import { useState } from "react";
import { AuthModal } from "@/app/components/AuthModal";

interface Article {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet?: string;
  /** Article relevance score, 0-10. When present a ScoreMeter is rendered. */
  score?: number | null;
}

export function DailySummaryArticles({ articles, lang }: { articles: Article[]; lang: Lang }) {
  const locale = dateLocale(lang);
  const { session } = useAuth();
  const isAuthenticated = Boolean(session?.user);
  const { favoriteUrls, toggleFavorite } = useFavorites(isAuthenticated);
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      {articles.map((art, i) => (
        <article
          key={i}
          style={{
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: 10,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <a
            href={art.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <h3 style={{ color: color.text, fontWeight: 500, fontSize: 17, margin: 0, flex: 1, minWidth: 0 }}>
                {art.title}
              </h3>
              {art.score != null && (
                <span style={{ flexShrink: 0 }}>
                  <ScoreMeter score={art.score} />
                </span>
              )}
            </div>
            {art.snippet && (
              <p style={{ color: color.articleSnippet, fontSize: 14, marginTop: 6, lineHeight: 1.5, marginBottom: 0 }}>
                {art.snippet}
              </p>
            )}
          </a>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ color: color.gold, fontSize: 13 }}>
              {art.source} · {art.pubDate ? new Date(art.pubDate).toLocaleString(locale) : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <FavoriteButton
                url={art.link}
                title={art.title}
                source={art.source}
                pubDate={art.pubDate}
                isFavorite={favoriteUrls.has(art.link)}
                lang={lang}
                onToggle={toggleFavorite}
                onRequestAuth={() => setAuthOpen(true)}
                isAuthenticated={isAuthenticated}
              />
              <CopyLinkButton url={art.link} />
            </div>
          </div>
        </article>
      ))}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} lang={lang} />
    </>
  );
}
