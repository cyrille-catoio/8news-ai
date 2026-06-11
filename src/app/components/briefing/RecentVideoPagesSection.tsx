"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { color, card } from "@/lib/theme";
import { dateLocale, type Lang } from "@/lib/i18n";
import type { TopicLabel } from "@/lib/types";
import { stripEmoji } from "@/lib/html";
import { kicker } from "@/app/components/briefing/styles";
import { scoreTierColor } from "@/app/components/briefing/utils";
import { formatScore } from "@/lib/score-format";

/** A SSR per-video page surfaced in the bottom "Toutes les vidéos
 *  transcrites" list. Same shape as the items in the response of
 *  GET /api/video-pages/recent. */
export interface RecentVideoPage {
  videoId: string;
  title: string;
  topicId: string;
  publishedDate: string;
  slug: string;
  lang: string;
  /** AI quality score 1-10, or null when the recap is still unscored. */
  summaryScore: number | null;
}

/** Server response shape — classic offset/limit pagination metadata. */
export interface RecentVideoPagesResponse {
  items: RecentVideoPage[];
  /** 1-indexed page number actually returned (clamped server-side). */
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/**
 * Bottom-of-page list of every transcribed video that has an SSR page.
 * Classic offset/limit pagination — 10 items per page, page index
 * 1-indexed. The list is ordered by AI quality `summary_score DESC`
 * (unscored last), then `published_date DESC, created_at DESC`, so each
 * page runs from the highest score to the lowest. Each row shows the topic pill,
 * the emoji-stripped title, the publication date suffixed after a dash
 * (e.g. « — 5 mai 2026 ») and the AI quality score pinned right.
 *
 * Pagination controls are minimalist: « ‹ Précédent · Page X / N ·
 * Suivant › ». The section hides itself only when the server reports
 * an empty total count for this language.
 *
 * Topic labels are looked up locally from `topicLabels` so we don't
 * add a second API roundtrip just to humanize a slug.
 *
 * v2.12 extracted from `BriefingPage.tsx`.
 */
export function RecentVideoPagesSection({
  topicLabels,
  lang,
}: {
  topicLabels: TopicLabel[];
  lang: Lang;
}) {
  const labelById = useMemo(
    () => new Map(topicLabels.map((t) => [t.id, t.label])),
    [topicLabels],
  );
  const locale = dateLocale(lang);

  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecentVideoPagesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Refetch whenever the page or lang changes. AbortController prevents
  // an in-flight response from a stale page from racing the latest one.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const cacheBust = Date.now();
    fetch(`/api/video-pages/recent?page=${page}&pageSize=10&lang=${lang}&_=${cacheBust}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: RecentVideoPagesResponse | null) => {
        setData(json);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [page, lang]);

  // Reset to page 1 on lang switch — content cadence differs per lang
  // and a high page index in EN may not exist in FR (or vice versa).
  useEffect(() => {
    setPage(1);
  }, [lang]);

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  // Functional updates so multiple rapid taps compose even while a
  // fetch is in flight. Boundaries are clamped client-side so the
  // server never has to clamp a request past the last page.
  const onPrev = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);
  const onNext = useCallback(() => {
    setPage((p) => (totalPages > 0 ? Math.min(totalPages, p + 1) : p));
  }, [totalPages]);

  // Hide the section entirely when this language has no transcribed
  // videos at all. Otherwise we keep it rendered so the user can
  // browse pages even mid-loading.
  if (!loading && totalCount === 0) return null;

  const btnBase: CSSProperties = {
    background: "transparent",
    color: color.gold,
    border: `1px solid ${color.gold}`,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
  const btnDisabled: CSSProperties = {
    ...btnBase,
    opacity: 0.35,
    cursor: "not-allowed",
  };

  const dateFmt: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  };

  return (
    <section style={{ marginBottom: 36 }}>
      <div className="recent-video-section-head">
        <div className="recent-video-heading" style={{ ...kicker(color.gold) }}>
          {lang === "fr" ? "Top des vidéos transcrites" : "Top transcribed videos"}
        </div>
      </div>

      <div
        className="recent-video-panel"
        style={{
          ...card,
          display: "block",
          padding: undefined,
          borderColor: color.gold,
          background:
            "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
        }}
      >
        {loading && items.length === 0 ? (
          <div style={{ color: color.textMuted, fontSize: 13, textAlign: "center", padding: "16px 0" }}>
            {lang === "fr" ? "Chargement…" : "Loading…"}
          </div>
        ) : items.length === 0 ? (
          <div style={{ color: color.textMuted, fontSize: 13, textAlign: "center", padding: "16px 0" }}>
            {lang === "fr"
              ? "Aucune vidéo transcrite pour le moment."
              : "No transcribed videos yet."}
          </div>
        ) : (
          <ul className="recent-video-list" style={{ opacity: loading ? 0.6 : 1 }}>
            {items.map((p) => {
              const cleanTitle = stripEmoji(p.title);
              const hasScore =
                typeof p.summaryScore === "number"
                && p.summaryScore >= 1
                && p.summaryScore <= 10;
              const formattedDate = p.publishedDate
                ? new Date(`${p.publishedDate}T00:00:00`).toLocaleDateString(locale, dateFmt)
                : "";
              return (
                <li key={p.videoId} className="recent-video-item">
                  <a
                    href={`/${p.topicId}/v/${p.publishedDate}/${p.slug}`}
                    className="recent-video-link"
                  >
                    <span className="recent-video-topic">
                      {labelById.get(p.topicId) ?? p.topicId}
                    </span>
                    <span className="recent-video-title">{cleanTitle}</span>
                    {formattedDate && (
                      <span className="recent-video-date">
                        {formattedDate}
                      </span>
                    )}
                    <span
                      className="recent-video-score"
                      aria-label={hasScore ? `Score ${p.summaryScore}/10` : undefined}
                      aria-hidden={hasScore ? undefined : true}
                      style={{
                        color: hasScore ? scoreTierColor(p.summaryScore as number) : "transparent",
                      }}
                    >
                      {hasScore ? `${formatScore(p.summaryScore as number)}/10` : "—/10"}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Pagination controls — minimalist style. Buttons stay clickable
          during `loading` (only dimmed) so rapid taps compose; only
          logical boundaries (page 1 / totalPages) actually disable. */}
      {totalPages > 1 && (
        <div className="recent-video-pager">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canGoPrev}
            aria-label={lang === "fr" ? "Page précédente" : "Previous page"}
            style={
              !canGoPrev
                ? btnDisabled
                : (loading ? { ...btnBase, opacity: 0.6 } : btnBase)
            }
          >
            {lang === "fr" ? "‹ Précédent" : "‹ Previous"}
          </button>
          <div className="recent-video-page-label">
            {lang === "fr" ? `Page ${page} / ${totalPages}` : `Page ${page} of ${totalPages}`}
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label={lang === "fr" ? "Page suivante" : "Next page"}
            style={
              !canGoNext
                ? btnDisabled
                : (loading ? { ...btnBase, opacity: 0.6 } : btnBase)
            }
          >
            {lang === "fr" ? "Suivant ›" : "Next ›"}
          </button>
        </div>
      )}
    </section>
  );
}
