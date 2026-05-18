"use client";

import { color, card } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import type { TopicLabel } from "@/lib/types";
import { ScoreMeter } from "@/app/components/ScoreMeter";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { trackEvent } from "@/lib/track";
import { kicker } from "@/app/components/briefing/styles";
import { relativeTime } from "@/app/components/briefing/utils";

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
 * « Vos topics · 24 dernières heures » — gold-bordered card wrapping
 * every topic block. Each topic reads as a paragraph: gold title + a
 * bulleted list of articles with the ScoreMeter pinned right and the
 * favorite / copy-link cluster aligned vertically. Replaces the older
 * per-article mini-cards layout (v2.10.x).
 *
 * v2.12 extracted from `BriefingPage.tsx`.
 */
export function YourTopicsSection({
  articlesByTopic,
  topicLabels,
  lang,
  favoriteUrls,
  onToggleFavorite,
  isAuthenticated,
  onRequestAuth,
  onSeeAllForTopic,
}: {
  articlesByTopic: Record<string, MiniArticle[]>;
  topicLabels: TopicLabel[];
  lang: Lang;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string }) => void;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
  onSeeAllForTopic: (id: string) => void;
}) {
  const orderedIds = Object.keys(articlesByTopic);

  // Surface only topic blocks that actually have at least one article
  // — empty topics shouldn't render an empty paragraph in the new
  // collapsed layout.
  const visibleIds = orderedIds.filter((tid) => (articlesByTopic[tid]?.length ?? 0) > 0);
  if (visibleIds.length === 0) return null;

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
        {lang === "fr" ? "Vos topics · 24 dernières heures" : "Your topics · last 24 hours"}
      </div>
      {/* v2.10.x — Single outer gold-bordered card wrapping every topic
          block. Each topic reads as a « paragraph »: gold title, then
          article titles as gold-bulleted rows with the ScoreMeter on
          the right. The per-article cards are replaced with tight
          single-line rows so the whole section reads as one coherent
          editorial digest rather than a stack of mini boxes. */}
      <div
        style={{
          ...card,
          display: "block",
          padding: "18px 20px",
          borderColor: color.gold,
          background:
            "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
        }}
      >
        {visibleIds.map((tid, blockIdx) => {
          const articles = articlesByTopic[tid];
          const topic = topicLabels.find((tl) => tl.id === tid);
          const isLastBlock = blockIdx === visibleIds.length - 1;
          return (
            <div
              key={tid}
              style={{
                marginBottom: isLastBlock ? 0 : 18,
                paddingBottom: isLastBlock ? 0 : 18,
                borderBottom: isLastBlock ? "none" : `1px solid ${color.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 12 }}>
                <h3 style={{ color: color.gold, fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: "0.01em" }}>
                  {topic?.label ?? tid}
                </h3>
                <button
                  type="button"
                  onClick={() => onSeeAllForTopic(tid)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: color.gold,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                    fontFamily: "inherit",
                  }}
                >
                  {lang === "fr" ? "Voir tous →" : "See all →"}
                </button>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {articles.map((art, i) => (
                  <li
                    key={`${art.link}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "8px 0",
                    }}
                  >
                    <span
                      style={{
                        color: color.gold,
                        flexShrink: 0,
                        fontSize: 18,
                        lineHeight: 1.35,
                      }}
                      aria-hidden
                    >
                      •
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a
                        href={art.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: "none", color: "inherit", display: "block" }}
                        onClick={() =>
                          trackEvent("article.link_click", {
                            target_id: art.link,
                            lang,
                            meta: { section: "your_topics", source: art.source, score: art.score, rank: i },
                          })
                        }
                      >
                        <div style={{ color: color.text, fontWeight: 500, fontSize: 15, lineHeight: 1.4 }}>
                          {art.title}
                        </div>
                      </a>
                      <div
                        style={{
                          color: color.textMuted,
                          fontSize: 11,
                          fontFamily: "ui-monospace, Menlo, monospace",
                          letterSpacing: "0.04em",
                          marginTop: 2,
                        }}
                      >
                        <span style={{ color: color.gold }}>{art.source.toUpperCase()}</span>
                        <span style={{ marginLeft: 6 }}>· {relativeTime(art.pubDate, lang)}</span>
                      </div>
                    </div>
                    {art.score != null && (
                      <span style={{ flexShrink: 0, alignSelf: "center" }}>
                        <ScoreMeter score={art.score} width={56} />
                      </span>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, alignSelf: "center" }}>
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
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
