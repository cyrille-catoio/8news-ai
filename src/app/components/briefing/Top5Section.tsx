"use client";

import { useMemo } from "react";
import { color, card } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import type { TopFeedArticle } from "@/hooks/useTopFeed";
import type { TopicLabel } from "@/lib/types";
import { trackEvent } from "@/lib/track";
import { kicker, ctaLink } from "@/app/components/briefing/styles";
import { relativeTime, scoreTierColor } from "@/app/components/briefing/utils";
import { formatScore } from "@/lib/score-format";

/**
 * Top 5 list of the day — compact digest that mirrors the « Top vidéos »
 * / « Vos topics » presentation: a single gold-bordered panel with tight
 * one-line rows (topic pill · title · relative time · AI score pinned
 * right). Reuses the shared `recent-video-*` CSS so every « Read now »
 * block reads identically and gets the same responsive card reflow on
 * mobile. A « See top 50 → » CTA closes the panel.
 *
 * v2.12 extracted from `BriefingPage.tsx`; compacted to match the video
 * list in v2.17+.
 */
export function Top5Section({
  articles,
  lang,
  topicLabels,
  newSinceVisit = 0,
  onSeeAll,
}: {
  articles: TopFeedArticle[];
  lang: Lang;
  topicLabels: TopicLabel[];
  /** Count of articles new since the last visit — shown as a gold pill. */
  newSinceVisit?: number;
  onSeeAll: () => void;
}) {
  const topicLabelById = useMemo(
    () => new Map(topicLabels.map((tl) => [tl.id, tl.label])),
    [topicLabels],
  );

  return (
    <section style={{ marginBottom: 36 }}>
      <div className="recent-video-section-head">
        <div className="recent-video-heading" style={{ ...kicker(color.gold) }}>
          {lang === "fr" ? "Briefing du jour · top 5" : "Today's briefing · top 5"}
        </div>
        {newSinceVisit > 0 && (
          <span
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 11,
              fontWeight: 700,
              color: "#000",
              background: color.gold,
              borderRadius: 999,
              padding: "2px 9px",
              letterSpacing: "0.02em",
            }}
          >
            {t("homeNewSinceVisit", lang).replace("{n}", String(newSinceVisit))}
          </span>
        )}
      </div>

      <div
        className="recent-video-panel"
        style={{
          ...card,
          display: "block",
          padding: undefined,
          background: color.surface,
        }}
      >
        <ul className="recent-video-list">
          {articles.map((art, i) => {
            const hasScore =
              typeof art.score === "number" && art.score >= 1 && art.score <= 10;
            return (
              <li key={`${art.link}-${i}`} className="recent-video-item">
                <a
                  href={art.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="recent-video-link"
                  onClick={() =>
                    trackEvent("article.link_click", {
                      target_id: art.link,
                      lang,
                      meta: { section: "top_5", source: art.source, score: art.score, rank: i },
                    })
                  }
                >
                  <span className="recent-video-topic">
                    {topicLabelById.get(art.topic) ?? art.topic}
                  </span>
                  <span className="recent-video-title">{art.title}</span>
                  <span className="recent-video-date">{relativeTime(art.pubDate, lang)}</span>
                  <span
                    className="recent-video-score"
                    aria-label={hasScore ? `Score ${art.score}/10` : undefined}
                    aria-hidden={hasScore ? undefined : true}
                    style={{ color: hasScore ? scoreTierColor(art.score) : "transparent" }}
                  >
                    {hasScore ? `${formatScore(art.score)}/10` : "—/10"}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>

        {/* Footer CTA kept INSIDE the panel, bottom-right, with a thin
            divider — mirrors the Daily Podcast « See all articles → ». */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${color.border}`,
          }}
        >
          <button type="button" onClick={onSeeAll} style={ctaLink}>
            {lang === "fr" ? "Voir le top 50 →" : "See the full top 50 →"}
          </button>
        </div>
      </div>
    </section>
  );
}
