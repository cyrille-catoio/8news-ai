"use client";

import { useMemo } from "react";
import { color, card } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import type { TopFeedArticle } from "@/hooks/useTopFeed";
import type { TopicLabel } from "@/lib/types";
import { ScoreMeter } from "@/app/components/ScoreMeter";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { trackEvent } from "@/lib/track";
import { kicker, ctaLink } from "@/app/components/briefing/styles";
import { relativeTime } from "@/app/components/briefing/utils";

/**
 * Top 5 list of the day. Single outer gold-bordered card around all 5
 * items (Hero Story / Daily summary teaser / All transcribed videos
 * register) with thin row dividers — v2.10.x replaced per-row mini-
 * cards with a coherent list.
 *
 * v2.12 extracted from `BriefingPage.tsx`.
 */
export function Top5Section({
  articles,
  lang,
  locale,
  topicLabels,
  favoriteUrls,
  onToggleFavorite,
  isAuthenticated,
  onRequestAuth,
  onSeeAll,
}: {
  articles: TopFeedArticle[];
  lang: Lang;
  locale: string;
  topicLabels: TopicLabel[];
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string }) => void;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
  onSeeAll: () => void;
}) {
  const topicLabelById = useMemo(
    () => new Map(topicLabels.map((t) => [t.id, t.label])),
    [topicLabels],
  );
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
        {lang === "fr" ? "Briefing du jour · top 5" : "Today's briefing · top 5"}
      </div>
      {/* v2.10.x — Single outer gold-bordered card around all 5 items
          (Hero Story / Daily summary teaser / All transcribed videos
          register). The per-article cards are replaced with transparent
          rows separated by a thin divider, so the section reads as one
          coherent list rather than 5 stacked boxes. */}
      <div
        style={{
          ...card,
          display: "block",
          padding: "4px 18px",
          borderColor: color.gold,
          background:
            "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
        }}
      >
        {articles.map((art, i) => {
          const isLast = i === articles.length - 1;
          return (
            <div
              key={`${art.link}-${i}`}
              style={{
                display: "block",
                padding: "16px 0",
                borderBottom: isLast ? "none" : `1px solid ${color.border}`,
              }}
            >
              <a
                href={art.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
                onClick={() =>
                  trackEvent("article.link_click", {
                    target_id: art.link,
                    lang,
                    meta: { section: "top_5", source: art.source, score: art.score, rank: i },
                  })
                }
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ color: color.text, fontWeight: 500, fontSize: 16, lineHeight: 1.35, flex: 1, minWidth: 0 }}>
                    {art.title}
                  </span>
                  <span style={{ flexShrink: 0 }}>
                    <ScoreMeter score={art.score} />
                  </span>
                </div>
                {art.snippet && (
                  <p className="app-paragraph-lg" style={{ color: color.articleSnippet, marginTop: 6, marginBottom: 0 }}>
                    {art.snippet}
                  </p>
                )}
              </a>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ color: color.gold, fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.04em" }}>
                  <span style={{ color: color.textMuted, marginRight: 8 }}>
                    {(topicLabelById.get(art.topic) ?? art.topic).toUpperCase()}
                  </span>
                  <span style={{ color: color.textMuted, marginRight: 8 }}>·</span>
                  {art.source.toUpperCase()}
                  <span style={{ color: color.textMuted, marginLeft: 8 }}>· {relativeTime(art.pubDate, lang)}</span>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <FavoriteButton
                    url={art.link}
                    title={art.title}
                    source={art.source}
                    pubDate={art.pubDate}
                    isFavorite={favoriteUrls.has(art.link)}
                    lang={lang}
                    onToggle={onToggleFavorite}
                    onRequestAuth={onRequestAuth}
                    isAuthenticated={isAuthenticated}
                  />
                  <CopyLinkButton url={art.link} />
                </div>
              </div>
              {isLast && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 6,
                  }}
                >
                  <button type="button" onClick={onSeeAll} style={ctaLink}>
                    {lang === "fr" ? "Voir le top 50 →" : "See the full top 50 →"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* locale prop reserved for future timestamp formatting */}
      <span style={{ display: "none" }} aria-hidden>{locale}</span>
    </section>
  );
}
