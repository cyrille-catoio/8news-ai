"use client";

import { color, card, outlinedButtonStyle } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import type { TopFeedArticle } from "@/hooks/useTopFeed";
import type { TopicLabel } from "@/lib/types";
import { ScoreMeter } from "@/app/components/ScoreMeter";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { trackEvent } from "@/lib/track";
import { kicker } from "@/app/components/briefing/styles";
import { relativeTime } from "@/app/components/briefing/utils";
import { HistoryArrows } from "@/app/components/briefing/HistoryArrows";

/**
 * Hero card on the briefing — headline and CTA link to the article
 * (new tab); source line stays plain text so we avoid the old
 * triple-link double-tab issue with extensions / touch ghosting.
 *
 * `onPrev` walks one step further into the past (older pick); `onNext`
 * brings the user back towards the current (live) pick. Used by both
 * the article hero and the TOP VIDEO card.
 *
 * v2.12 extracted from `BriefingPage.tsx`.
 */
export function HeroStory({
  article,
  lang,
  isFavorite,
  isAuthenticated,
  onToggleFavorite,
  onRequestAuth,
  historyOffset,
  canGoOlder,
  onHistoryPrev,
  onHistoryNext,
  topicLabels,
}: {
  article: TopFeedArticle;
  lang: Lang;
  isFavorite: boolean;
  isAuthenticated: boolean;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string; sourceType?: "article" | "video" }) => void;
  onRequestAuth: () => void;
  historyOffset: number;
  canGoOlder: boolean;
  onHistoryPrev: () => void;
  onHistoryNext: () => void;
  topicLabels: TopicLabel[];
}) {
  const topicLabel = topicLabels.find((t) => t.id === article.topic)?.label
    ?? article.topic;
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ ...kicker(color.gold) }}>
          {lang === "fr" ? "Top story · maintenant" : "Top story · now"}
        </div>
        <HistoryArrows
          offset={historyOffset}
          canGoOlder={canGoOlder}
          onPrev={onHistoryPrev}
          onNext={onHistoryNext}
          lang={lang}
        />
      </div>
      <div
        style={{
          ...card,
          display: "block",
          padding: "24px 24px 22px",
          borderColor: color.gold,
          background: "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <h2
            style={{
              fontFamily: "ui-serif, Georgia, serif",
              fontSize: "clamp(22px, 3.2vw, 32px)",
              lineHeight: 1.18,
              color: color.text,
              margin: 0,
              flex: 1,
              minWidth: 0,
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            <span className="hero-story-title-link">
              {article.title}
            </span>
          </h2>
          <span style={{ flexShrink: 0 }}>
            <ScoreMeter score={article.score} width={72} />
          </span>
        </div>
        {article.snippet && (
          <p className="app-paragraph-lg" style={{ color: color.articleSnippet, marginTop: 12, marginBottom: 0 }}>
            {article.snippet}
          </p>
        )}
        {/* Keep a single external click target per card so extensions and
            browser click replays can't open duplicate tabs. */}
        <div style={{ display: "flex", marginTop: article.snippet ? 16 : 18, marginBottom: 14 }}>
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={lang === "fr" ? "Lire l'article (nouvel onglet)" : "Read the article (new tab)"}
            onClick={() =>
              trackEvent("top_story.cta_read_article", {
                target_id: article.link,
                lang,
                meta: { source: article.source, score: article.score },
              })
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(201,162,39,0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            style={{
              ...outlinedButtonStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              fontWeight: 700,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {lang === "fr" ? "Lire l'article →" : "Read article →"}
          </a>
        </div>
        {/* Metadata row stays separate from the primary CTA so the
            favorite star doesn't compete visually with the article
            button. */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: color.gold,
              fontSize: 13,
              fontFamily: "ui-monospace, Menlo, monospace",
              letterSpacing: "0.04em",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: color.textMuted, marginRight: 8 }}>
              {topicLabel.toUpperCase()}
            </span>
            <span style={{ color: color.textMuted, marginRight: 8 }}>·</span>
            {article.source.toUpperCase()}
            <span style={{ color: color.textMuted, marginLeft: 8 }}>· {relativeTime(article.pubDate, lang)}</span>
          </span>
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <FavoriteButton
              url={article.link}
              title={article.title}
              source={article.source}
              pubDate={article.pubDate}
              sourceType="article"
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
    </section>
  );
}
