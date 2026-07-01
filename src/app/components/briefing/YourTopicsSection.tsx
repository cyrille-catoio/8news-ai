"use client";

import { color, card } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import type { TopicLabel } from "@/lib/types";
import { trackEvent } from "@/lib/track";
import { kicker } from "@/app/components/briefing/styles";
import { relativeTime, scoreTierColor } from "@/app/components/briefing/utils";
import { formatScore } from "@/lib/score-format";

/** Minimal article shape used by the "Your topics" mini-feed. */
export interface MiniArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet?: string | null;
  score?: number | null;
}

/**
 * « Vos topics · 24 dernières heures » — compact digest that mirrors the
 * « Top vidéos des dernières 24 h » presentation: a single gold-bordered
 * panel with tight one-line rows (topic pill · title · relative time ·
 * AI score pinned right), sorted by score descending. Reuses the shared
 * `recent-video-*` CSS so the two home sections read identically and get
 * the same responsive card reflow on mobile.
 *
 * v2.12 extracted from `BriefingPage.tsx`; compacted to match the video
 * list in v2.17+.
 */
export function YourTopicsSection({
  articlesByTopic,
  topicLabels,
  lang,
}: {
  articlesByTopic: Record<string, MiniArticle[]>;
  topicLabels: TopicLabel[];
  lang: Lang;
}) {
  const labelById = new Map(topicLabels.map((tl) => [tl.id, tl.label]));

  // Flatten every topic's articles into one list carrying its topic
  // label, then sort by AI score desc (unscored last) — same "top first"
  // ordering as the video list.
  const rows = Object.entries(articlesByTopic)
    .flatMap(([tid, arts]) =>
      (arts ?? []).map((art) => ({
        art,
        topicId: tid,
        topicLabel: labelById.get(tid) ?? tid,
      })),
    )
    .sort((a, b) => (b.art.score ?? -1) - (a.art.score ?? -1));

  if (rows.length === 0) return null;

  return (
    <section style={{ marginBottom: 36 }}>
      <div className="recent-video-section-head">
        <div className="recent-video-heading" style={{ ...kicker(color.gold) }}>
          {lang === "fr" ? "Vos topics · 24 dernières heures" : "Your topics · last 24 hours"}
        </div>
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
          {rows.map(({ art, topicId, topicLabel }, i) => {
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
                      meta: { section: "your_topics", source: art.source, score: art.score, rank: i, topic: topicId },
                    })
                  }
                >
                  <span className="recent-video-topic">{topicLabel}</span>
                  <span className="recent-video-title">{art.title}</span>
                  <span className="recent-video-date">{relativeTime(art.pubDate, lang)}</span>
                  <span
                    className="recent-video-score"
                    aria-label={hasScore ? `Score ${art.score}/10` : undefined}
                    aria-hidden={hasScore ? undefined : true}
                    style={{ color: hasScore ? scoreTierColor(art.score as number) : "transparent" }}
                  >
                    {hasScore ? `${formatScore(art.score as number)}/10` : "—/10"}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
