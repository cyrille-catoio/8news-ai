"use client";

import type { ArticleSummary } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { color, card } from "@/lib/theme";
import { ScoreMeter } from "@/app/components/ScoreMeter";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";

/**
 * Single article card used in the « instant summary » results list
 * (Ma veille / Topics page in the SPA).
 *
 * Wraps the article meta-block (title, score, snippet, source, date)
 * inside a clickable card and surfaces the favorite + copy-link cluster
 * underneath. The card is intentionally minimal — the heavy editorial
 * styling lives in the Top 5 / Your topics sections on the home.
 *
 * v2.12 extracted from `src/app/app/page.tsx`. No behavior change.
 */
export function ArticleCard({
  article,
  locale,
  lang,
  isFavorite,
  isAuthenticated,
  onToggleFavorite,
  onRequestAuth,
}: {
  article: ArticleSummary;
  locale: string;
  lang: Lang;
  isFavorite: boolean;
  isAuthenticated: boolean;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string }) => void;
  onRequestAuth: () => void;
}) {
  return (
    <div style={{ ...card, display: "block", position: "relative" }}>
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <span style={{ color: color.text, fontWeight: 500, fontSize: 17, flex: 1, minWidth: 0 }}>
            {article.title}
          </span>
          {article.score != null && (
            <span style={{ flexShrink: 0 }}>
              <ScoreMeter score={article.score} />
            </span>
          )}
        </div>
        <p style={{ color: color.articleSnippet, fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
          {article.snippet}
        </p>
      </a>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ color: color.gold, fontSize: 13 }}>
          {article.source} · {article.pubDate ? new Date(article.pubDate).toLocaleString(locale) : ""}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <FavoriteButton
            url={article.link}
            title={article.title}
            source={article.source}
            pubDate={article.pubDate}
            isFavorite={isFavorite}
            lang={lang}
            onToggle={onToggleFavorite}
            onRequestAuth={onRequestAuth}
            isAuthenticated={isAuthenticated}
          />
          <CopyLinkButton url={article.link} />
        </div>
      </div>
    </div>
  );
}
