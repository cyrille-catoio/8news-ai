"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { formatScore } from "@/lib/score-format";
import { scoreTierColor } from "@/app/components/briefing/utils";
import { RefIcon, YouTubeIcon } from "@/app/components/top24h/Top24hHeroIcons";
import {
  formatSummaryDayLabel,
  type Bullet,
} from "@/app/components/top24h/Top24hHeroHelpers";
import {
  buildReaderPages,
  clampPageIndex,
  readerCounterLabel,
} from "@/app/components/top24h/PodcastReaderHelpers";
import { trackEvent } from "@/lib/track";

/**
 * Fullscreen Daily Podcast reader (home hero, v2.19+). One news per
 * viewport-height slide, in large type, so the podcast reads
 * comfortably — especially on phones.
 *
 * Navigation model — a single implementation for both form factors:
 * the overlay hosts a `scroll-snap-type: y mandatory` container where
 * every slide is one full viewport tall. On touch devices this gives
 * the TikTok-style swipe up/down for free (native momentum + snap);
 * on desktop the Previous/Next buttons and the keyboard (arrows,
 * PageUp/Down) drive the same container via `scrollTo`, with the CSS
 * `scroll-behavior` handling smoothness (disabled under
 * `prefers-reduced-motion`).
 *
 * Slide deck: the FIRST slide is the first news directly (no cover
 * page, no audio player — the card on the home keeps the player), one
 * slide per thematic group in the same importance-DESC order as the
 * home accordion (`buildReaderPages` delegates to `groupBullets`).
 * The « Podcast du jour » + date context lives in a fixed header at
 * the top of the overlay, visible on every slide. A fixed bottom bar
 * carries Previous / « i / N » / Next on every viewport — the buttons
 * are explicitly wanted on phones too, even though the swipe works.
 *
 * The open/close state is owned by the parent (`Top24hHero`);
 * `onClose` fires on the close button and on Escape. While mounted the
 * body scroll is locked and restored on unmount.
 */

export function PodcastReader({
  bullets,
  lang,
  summaryDate,
  onClose,
}: {
  bullets: Bullet[];
  lang: Lang;
  /** YYYY-MM-DD — the snapshot's `summary_date` (header date + telemetry). */
  summaryDate: string;
  onClose: () => void;
}) {
  const pages = useMemo(() => buildReaderPages(bullets), [bullets]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  /** Mirror of `currentIndex` for the keydown listener so it doesn't
   *  need to re-bind on every slide change. */
  const currentIndexRef = useRef(0);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const scrollToPage = useCallback(
    (index: number, via: "buttons" | "keyboard") => {
      const container = scrollRef.current;
      if (!container) return;
      const from = currentIndexRef.current;
      const target = clampPageIndex(index, pages.length);
      if (target === from) return;
      trackEvent(target > from ? "top24h.reader_next" : "top24h.reader_prev", {
        lang,
        meta: { summaryDate, fromIndex: from, toIndex: target, via },
      });
      // `behavior` intentionally omitted — the CSS `scroll-behavior` on
      // `.top24h-reader-scroll` decides (smooth, or instant under
      // `prefers-reduced-motion`).
      container.scrollTo({ top: target * container.clientHeight });
    },
    [pages.length, lang, summaryDate],
  );

  // Lock the page scroll behind the overlay while the reader is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Keyboard driving (desktop): arrows / PageUp / PageDown navigate,
  // Escape closes. Attached to the document so the reader works
  // without needing focus on a specific element.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't steal the arrows from focused interactive controls —
      // Escape still closes.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isFormControl =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (isFormControl && e.key !== "Escape") return;
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          scrollToPage(currentIndexRef.current + 1, "keyboard");
          break;
        case "ArrowUp":
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          scrollToPage(currentIndexRef.current - 1, "keyboard");
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [scrollToPage, onClose]);

  // Track the visible slide (swipe AND programmatic scrolls end up
  // here) so the counter, progress bar and button disabled states
  // follow whatever is actually on screen. A second job: once a slide
  // is FULLY off-screen, rewind its inner article to the top.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const slide = entry.target as HTMLElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const raw = slide.dataset.readerIndex;
            const idx = raw === undefined ? NaN : Number(raw);
            if (!Number.isNaN(idx)) setCurrentIndex(idx);
          } else if (!entry.isIntersecting) {
            // Slide fully scrolled off-screen — rewind its article to the
            // top so returning to this news lands on the headline, not
            // where the reader was left. The chaining fix (globals.css)
            // forces a long article to be scrolled to its bottom before
            // you can swipe past it, which would otherwise leave it
            // pinned at the end on return. Safe here: the slide is
            // invisible, so no visible jump and no live gesture to fight.
            const inner = slide.querySelector<HTMLElement>(".top24h-reader-inner");
            if (inner) inner.scrollTop = 0;
          }
        }
      },
      { root: container, threshold: [0, 0.6] },
    );
    for (const el of slideRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pages.length]);

  if (pages.length === 0) return null;

  const total = pages.length;
  const atFirst = currentIndex === 0;
  const atLast = currentIndex === total - 1;
  const navButtonStyle = (disabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${disabled ? color.border : color.gold}`,
    background: disabled ? "transparent" : "rgba(201,162,39,0.10)",
    color: disabled ? color.textDim : color.gold,
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 700,
    padding: "10px 20px",
    borderRadius: 999,
    letterSpacing: "0.01em",
    transition: "color 140ms ease, border-color 140ms ease, background 140ms ease",
  });

  return (
    <div
      className="top24h-reader"
      role="dialog"
      aria-modal="true"
      aria-label={t("top24hReaderOpen", lang)}
    >
      {/* Thin gold progress bar pinned at the very top. */}
      <div className="top24h-reader-progress" aria-hidden>
        <div
          className="top24h-reader-progress-fill"
          style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
        />
      </div>

      {/* Fixed header — « Podcast du jour » + date, visible on every
          slide since there is no cover page anymore. */}
      <div className="top24h-reader-header">
        <span className="top24h-reader-header-kicker" style={{ color: color.gold }}>
          {t("top24hHeroHomeTitle", lang)}
        </span>
        <span className="top24h-reader-header-date" style={{ color: color.textMuted }}>
          {formatSummaryDayLabel(summaryDate, lang)}
        </span>
      </div>

      <button
        type="button"
        className="top24h-reader-close"
        onClick={onClose}
        aria-label={t("top24hReaderClose", lang)}
        title={t("top24hReaderClose", lang)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="top24h-reader-scroll" ref={scrollRef}>
        {pages.map((page, i) => (
          <div
            key={i}
            className="top24h-reader-slide"
            data-reader-index={i}
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
          >
            <div className="top24h-reader-inner">
              {/* Kicker row — counter on the left, importance score
                  pushed to the far right edge of the column. */}
              <div
                className="top24h-reader-kicker"
                style={{
                  color: color.gold,
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                <span>{readerCounterLabel(page.index, page.total)}</span>
                {(() => {
                  const score = page.group.bullets[0]?.importanceScore;
                  if (typeof score !== "number") return null;
                  return (
                    <span
                      style={{ color: scoreTierColor(score) }}
                      aria-label={`Importance ${score}/10`}
                    >
                      {formatScore(score)}/10
                    </span>
                  );
                })()}
              </div>
              {page.group.title && (
                <h2 className="top24h-reader-title" style={{ color: color.text }}>
                  {page.group.title}
                </h2>
              )}
              {page.group.bullets.map((b, j) => (
                <div key={j} className="top24h-reader-bullet">
                  <p
                    className="top24h-reader-bullet-text"
                    style={{ color: color.textSecondary }}
                  >
                    {b.text}
                  </p>
                  {b.refs.length > 0 && (
                    <div className="top24h-reader-refs">
                      {b.refs.map((ref, k) => (
                        <a
                          key={k}
                          href={ref.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={ref.title}
                          className="top24h-reader-ref"
                          onClick={() =>
                            trackEvent("top24h.ref_click", {
                              target_id: ref.link,
                              lang,
                              meta: {
                                source: ref.source,
                                title: ref.title,
                                summaryDate,
                                surface: "reader",
                              },
                            })
                          }
                        >
                          {ref.source} {b.isVideo ? <YouTubeIcon /> : <RefIcon />}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Fixed bottom navigation — Previous / counter / Next. Wanted on
          every viewport, including phones where the swipe already works. */}
      <div className="top24h-reader-nav">
        <button
          type="button"
          onClick={() => scrollToPage(currentIndex - 1, "buttons")}
          disabled={atFirst}
          aria-label={t("top24hReaderPrev", lang)}
          style={navButtonStyle(atFirst)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="6 15 12 9 18 15" />
          </svg>
          {t("top24hReaderPrev", lang)}
        </button>
        <span
          className="top24h-reader-counter"
          style={{ color: color.textMuted }}
          aria-live="polite"
        >
          {readerCounterLabel(currentIndex + 1, total)}
        </span>
        <button
          type="button"
          onClick={() => scrollToPage(currentIndex + 1, "buttons")}
          disabled={atLast}
          aria-label={t("top24hReaderNext", lang)}
          style={navButtonStyle(atLast)}
        >
          {t("top24hReaderNext", lang)}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
