"use client";

import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { color, primaryButtonStyle, spinnerStyle } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { AudioPlayer } from "@/app/components/AudioPlayer";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { DownloadTranscriptButton } from "@/app/components/DownloadTranscriptButton";
import { ScoreMeter } from "@/app/components/ScoreMeter";
import type { TopicLabel } from "@/lib/types";
import { trackEvent } from "@/lib/track";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

/** Slow layout push for summary panel + fade-in of content (respect reduced-motion below). */
const VIDEO_SUMMARY_GRID_MS = 2200;
const VIDEO_SUMMARY_FADE_MS = 1100;
const VIDEO_SUMMARY_FADE_DELAY_MS = 380;

const DESC_MAX = 120;

/**
 * Strip markdown formatting from the AI summary and return a clean
 * teaser snippet (first words, ≤ `maxChars`) suitable for the
 * homepage hero side panel — no headings, no bullets, no `**`.
 */
function buildSummaryPreview(md: string | null, maxChars = 240): string {
  if (!md) return "";
  const plain = md
    .replace(/^##\s+.+$/gm, "")     // drop ## section markers (whole line)
    .replace(/^###\s+/gm, "")       // strip ### prefix, keep title text
    .replace(/\*\*/g, "")           // remove bold markers
    .replace(/^\s*[-*]\s+/gm, "")   // strip leading list bullets
    .replace(/\n+/g, " ")           // collapse newlines into spaces
    .replace(/\s{2,}/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  const cut = plain.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  const safe = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return safe.trimEnd() + "…";
}

export interface VideoItem {
  videoId: string;
  title: string;
  description: string | null;
  channelTitle: string;
  channelId: string;
  published: string;
  thumbnail: string | null;
  viewCount: string | null;
  durationSec: number | null;
  link: string;
  /**
   * SSR per-video page coordinates for the current UI lang. All three
   * are non-null when the video has been transcribed AND its channel
   * has an assigned topic_id. Used to render the "Read article" link
   * pointing at /{topicId}/v/{publishedDate}/{slugKeywords}.
   */
  topicId?: string | null;
  slugKeywords?: string | null;
  publishedDate?: string | null;
  /** 1-10 recap quality (same meter as articles); unset until scored by cron. */
  summaryScore?: number | null;
}

export function isTranscriptionErrorMarkdown(md: string | null): boolean {
  return !!md && md.startsWith("> **Error:**");
}

function formatViews(v: string | null): string {
  if (!v) return "";
  const n = parseInt(v, 10);
  if (isNaN(n)) return v;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const toggleLink: CSSProperties = {
  background: "none",
  border: "none",
  color: color.gold,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
};

/* ── Markdown style overrides for dark theme ─────────────────────── */

const mdComponents = {
  h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
    <h2 className="app-title" style={{ color: color.gold, fontWeight: 700, margin: "18px 0 8px" }} {...props}>{children}</h2>
  ),
  // h3 is the per-key-point title (promoted from `- **Title**` bullets by
  // `promoteBulletTitlesToHeadings`). Styled in gold to match the roundup
  // pages' bullet titles for visual consistency across briefings and
  // per-video summaries.
  h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
    <h3 className="app-title" style={{ color: color.gold, fontWeight: 700, margin: "14px 0 4px" }} {...props}>{children}</h3>
  ),
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p className="app-paragraph" style={{ color: color.textSecondary, margin: "6px 0" }} {...props}>{children}</p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
    <ul style={{ paddingLeft: 20, margin: "6px 0" }} {...props}>{children}</ul>
  ),
  li: ({ children, ...props }: React.ComponentProps<"li">) => (
    <li className="app-paragraph" style={{ color: color.textSecondary, marginBottom: 8 }} {...props}>{children}</li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
    <strong style={{ color: color.text, fontWeight: 700 }} {...props}>{children}</strong>
  ),
};

/**
 * Single video card with thumbnail + body (title, description, meta) + actions
 * (Play / Summary / Favorite / Open YouTube / Download / Copy link). When a
 * transcription summary exists or is fetched, it expands inline below the
 * card with an audio player and the rendered Markdown.
 *
 * Used by VideosPage (`/app/videos`) and BriefingPage (`/app`).
 */
export function VideoCard({
  v,
  lang,
  summaryMd,
  transcribing,
  onTranscribe,
  speed,
  voice,
  isFavorite,
  isAuthenticated,
  onToggleFavorite,
  onRequestAuth,
  variant = "default",
  topicLabels = [],
  onPlaybackChange,
}: {
  v: VideoItem;
  lang: Lang;
  summaryMd: string | null;
  transcribing: boolean;
  onTranscribe: () => void;
  speed: number;
  voice: string;
  isFavorite: boolean;
  isAuthenticated: boolean;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string; sourceType?: "article" | "video" }) => void;
  onRequestAuth: () => void;
  /**
   * Visual chrome variant. `"default"` is the standard gray-bordered card
   * used everywhere (`/app/videos`, channel pages, etc.). `"hero"` mirrors
   * the home « Top story · maintenant » outer styling — gold border + a
   * subtle gold gradient overlay — so the homepage TOP VIDEO block reads
   * as a peer of the article hero card right above it.
   */
  variant?: "default" | "hero";
  /**
   * Optional topic label dictionary used to prepend the topic name to the
   * meta line (e.g. « CRYPTO · Hasheur · 5 mai 2026 · … »). When empty or
   * the topic id has no match, the meta line falls back to its previous
   * shape without the prefix. Used by the homepage TOP VIDEO block.
   */
  topicLabels?: TopicLabel[];
  /** Homepage TOP VIDEO: notify parent when inline playback starts/stops so auto-refresh can pause. */
  onPlaybackChange?: (playing: boolean) => void;
}) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [playing, setPlaying] = useState(false);
  const pendingExpandAfterTranscribeRef = useRef(false);
  const summaryPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const startPlayback = useCallback(() => {
    setPlaying(true);
    trackEvent("top_video.play_start", {
      target_id: v.videoId,
      lang,
      meta: { channelTitle: v.channelTitle, variant },
    });
  }, [v.videoId, v.channelTitle, lang, variant]);

  useEffect(() => {
    if (variant !== "hero" || !onPlaybackChange) return;
    onPlaybackChange(playing);
  }, [playing, variant, onPlaybackChange]);

  useEffect(() => {
    if (variant !== "hero" || !onPlaybackChange) return;
    return () => {
      onPlaybackChange(false);
    };
  }, [variant, onPlaybackChange]);

  const transcriptionFailed = isTranscriptionErrorMarkdown(summaryMd);
  const hasTranscription = !!summaryMd && !transcriptionFailed;

  /** Hero homepage: AI summary preview shown next to the thumbnail. */
  const heroSummaryPreview =
    variant === "hero" && hasTranscription ? buildSummaryPreview(summaryMd, 432) : "";
  /** Hero homepage fallback when no AI summary yet — degrade gracefully to YouTube description. */
  const heroDescriptionFallback =
    variant === "hero" && !hasTranscription ? (v.description ?? "") : "";

  /**
   * « Lire la suite » CTA next to the thumb — opens the full summary
   * panel below. If the summary is not transcribed yet, falls back to
   * the same flow as the « Résumé » button (request transcription,
   * auto-expand on success).
   */
  const handleSummaryCta = useCallback(() => {
    if (transcribing) return;
    if (hasTranscription) {
      trackEvent("top_video.summary_expand", { target_id: v.videoId, lang });
      setSummaryExpanded(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          summaryPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      });
      return;
    }
    trackEvent("top_video.transcribe_request", { target_id: v.videoId, lang });
    pendingExpandAfterTranscribeRef.current = true;
    onTranscribe();
  }, [transcribing, hasTranscription, onTranscribe, setSummaryExpanded, v.videoId, lang]);

  useEffect(() => {
    if (transcriptionFailed && summaryMd) {
      pendingExpandAfterTranscribeRef.current = false;
      return;
    }
    if (!pendingExpandAfterTranscribeRef.current) return;
    if (!hasTranscription || transcribing) return;
    pendingExpandAfterTranscribeRef.current = false;
    setSummaryExpanded(true);
    if (reducedMotion) return;
    const scroll = () => summaryPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(scroll, 120);
      });
    });
  }, [hasTranscription, transcribing, transcriptionFailed, summaryMd, reducedMotion]);

  const gridMs = reducedMotion ? 1 : VIDEO_SUMMARY_GRID_MS;
  const fadeMs = reducedMotion ? 1 : VIDEO_SUMMARY_FADE_MS;
  const fadeDelayMs = reducedMotion ? 0 : VIDEO_SUMMARY_FADE_DELAY_MS;

  const cardStyle: CSSProperties = variant === "hero"
    ? {
        background:
          "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
        border: `1px solid ${color.gold}`,
        borderRadius: 10,
        overflow: "hidden",
      }
    : {
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 10,
        overflow: "hidden",
      };

  const thumbWrap: CSSProperties = {
    aspectRatio: "16 / 9",
    background: "#1a1a1a",
  };

  const thumbImg: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };

  const isHero = variant === "hero";
  /** Homepage TOP VIDEO: full thumbnail uncropped; pillarboxing on wide strip (`object-fit: contain`). */
  const thumbImgHero: CSSProperties = {
    ...thumbImg,
    objectFit: "contain",
  };
  // Default uses asymmetric padding (no left padding because the thumbnail
  // sits to the left and already provides visual edge). Hero is a vertical
  // stack so we want a balanced 24px around — see `.video-card-hero` rule
  // in globals.css for the responsive override.
  const bodyStyle: CSSProperties = isHero
    ? {
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
      }
    : {
        padding: "14px 16px 14px 0",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      };

  const titleStyle: CSSProperties = isHero
    ? {
        fontFamily: "ui-serif, Georgia, serif",
        fontSize: "clamp(20px, 2.6vw, 28px)",
        lineHeight: 1.2,
        color: color.text,
        fontWeight: 400,
        letterSpacing: "-0.01em",
        margin: 0,
      }
    : {};

  const metaStyle: CSSProperties = {
    color: color.textDim,
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  };

  const formatTime = (published: string): string => {
    const d = new Date(published);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  // Primary CTA shape. In the hero variant we bump padding / font size
  // so the buttons match the « Lire l'article » CTA on the home Top
  // Story hero — the two cards sit next to each other and primary
  // actions need to read at the same visual weight. In the default
  // variant we keep the historical compact shape used on /app/videos
  // and channel pages.
  const btnStyle: CSSProperties = isHero
    ? {
        ...primaryButtonStyle,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "9px 16px",
        fontSize: 13,
        fontWeight: 700,
        marginTop: 10,
        opacity: 1,
      }
    : {
        ...primaryButtonStyle,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        fontSize: 12,
        marginTop: 10,
        opacity: 1,
      };

  /** Gold-on-gold spinner is invisible; use dark ring on primary (gold) button. */
  const transcribeBtnSpinnerStyle: CSSProperties = {
    ...spinnerStyle(15, { borderWidth: 2, flexShrink: 0 }),
    border: "2px solid rgba(0,0,0,0.38)",
    borderTop: "2px solid transparent",
  };

  const descTruncated = v.description && v.description.length > DESC_MAX && !descExpanded;
  const youtubeEmbedSrc = (() => {
    const isLocal =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    const host = isLocal ? "https://www.youtube-nocookie.com" : "https://www.youtube.com";
    const params = new URLSearchParams({
      autoplay: "1",
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
    });

    // Keep the fragile JS API/origin pair for production only. YouTube
    // embeds can be picky with 127.0.0.1 origins in local dev, and we do
    // not use the iframe JS API here anyway.
    if (!isLocal && typeof window !== "undefined") {
      params.set("enablejsapi", "1");
      params.set("origin", window.location.origin);
    }

    return `${host}/embed/${encodeURIComponent(v.videoId)}?${params.toString()}`;
  })();

  const thumbMedia = playing ? (
    <iframe
      src={youtubeEmbedSrc}
      title={v.title}
      style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  ) : (
    <button
      type="button"
      onClick={startPlayback}
      aria-label={lang === "fr" ? `Lire la vidéo : ${v.title}` : `Play video: ${v.title}`}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        height: "100%",
        padding: 0,
        margin: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
      }}
    >
      {v.thumbnail ? (
        <img src={v.thumbnail} alt="" style={isHero ? thumbImgHero : thumbImg} loading="lazy" />
      ) : (
        <div style={{ ...thumbImg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={color.textDim} strokeWidth="1.5">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </div>
      )}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.18)",
          transition: "background 0.15s",
        }}
      >
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.65)",
            border: `2px solid ${color.gold}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(0,0,0,0.55)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill={color.gold} stroke="none" style={{ marginLeft: 3 }}>
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </span>
      </span>
    </button>
  );

  /** Default variant only — hero renders its own thumb inside the body's media row. */
  const thumbBlock = (
    <div className="video-thumb">
      <div style={thumbWrap}>{thumbMedia}</div>
    </div>
  );

  const bodyBlock = (
        <div className="video-body" style={bodyStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              marginBottom: isHero ? 12 : 6,
            }}
          >
            <a
              href={v.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none", flex: 1, minWidth: 0 }}
            >
              {isHero ? (
                <h2 style={titleStyle}>{v.title}</h2>
              ) : (
                <div className="app-title-sm" style={{ color: color.text, fontWeight: 600 }}>{v.title}</div>
              )}
            </a>
            {typeof v.summaryScore === "number" && v.summaryScore >= 1 && v.summaryScore <= 10 && (
              <span style={{ flexShrink: 0, marginLeft: 4 }}>
                <ScoreMeter score={v.summaryScore} width={isHero ? 72 : 60} />
              </span>
            )}
          </div>

          {/* YouTube description — kept for the default variant only.
              In hero we show the AI summary teaser to the right of the
              thumbnail instead, so the YT marketing copy is hidden to
              avoid duplicating the editorial preview. */}
          {!isHero && v.description && (
            <div className="app-paragraph-sm" style={{ color: color.textMuted, marginBottom: 8 }}>
              {descTruncated ? (
                <>
                  {v.description.slice(0, DESC_MAX)}…{" "}
                  <button type="button" onClick={() => setDescExpanded(true)} style={toggleLink}>
                    {lang === "fr" ? "Voir plus" : "See more"}
                  </button>
                </>
              ) : (
                <>
                  {v.description}
                  {v.description.length > DESC_MAX && (
                    <>
                      {" "}
                      <button type="button" onClick={() => setDescExpanded(false)} style={toggleLink}>
                        {lang === "fr" ? "Réduire" : "Show less"}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div style={metaStyle}>
            {(() => {
              const topicLabel = v.topicId
                ? topicLabels.find((tl) => tl.id === v.topicId)?.label ?? null
                : null;
              if (!topicLabel) return null;
              return (
                <>
                  <span
                    style={{
                      color: color.textMuted,
                      fontFamily: "ui-monospace, Menlo, monospace",
                      letterSpacing: "0.04em",
                      fontWeight: 600,
                    }}
                  >
                    {topicLabel.toUpperCase()}
                  </span>
                  <span>·</span>
                </>
              );
            })()}
            <span
              style={{
                color: color.gold,
                fontWeight: 700,
                border: `1px solid rgba(201,162,39,0.45)`,
                background: "rgba(201,162,39,0.10)",
                borderRadius: 999,
                padding: "2px 8px",
                lineHeight: 1.4,
              }}
            >
              {v.channelTitle}
            </span>
            <span>·</span>
            <span>{new Date(v.published).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short", year: "numeric" })}</span>
            <span>·</span>
            <span>{formatTime(v.published)}</span>
            {v.durationSec != null && v.durationSec > 0 && (
              <>
                <span>·</span>
                <span>{formatDuration(v.durationSec)}</span>
              </>
            )}
            {v.viewCount && (
              <>
                <span>·</span>
                <span>{formatViews(v.viewCount)} {lang === "fr" ? "vues" : "views"}</span>
              </>
            )}
            {!isHero && v.topicId && v.slugKeywords && v.publishedDate && (
              <>
                <span>·</span>
                <a
                  href={`/${v.topicId}/v/${v.publishedDate}/${v.slugKeywords}`}
                  style={{ color: color.gold, fontWeight: 500, textDecoration: "none" }}
                >
                  {lang === "fr" ? "Lire l'article →" : "Read article →"}
                </a>
              </>
            )}
          </div>

          {/* Hero homepage: thumbnail (left) + AI summary teaser (right).
              The thumbnail's left edge aligns with the body padding —
              same column as the « Play Vidéo » CTA below — so the
              card reads as one consistent vertical column. When the
              user starts playback, the grid template animates so the
              video frame grows to full width and the teaser fades. */}
          {isHero && (
            <div
              className={
                "video-card-hero-media-row" +
                (playing ? " video-card-hero-media-row--playing" : "")
              }
            >
              <div className="video-card-hero-media-thumb">
                <div className="video-thumb-hero-frame">{thumbMedia}</div>
              </div>
              {(heroSummaryPreview || heroDescriptionFallback) && (
                <div className="video-card-hero-media-summary">
                  <p className="video-card-hero-media-summary-text">
                    {heroSummaryPreview || heroDescriptionFallback}
                  </p>
                  <button
                    type="button"
                    className="video-card-hero-media-summary-cta"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSummaryCta();
                    }}
                    aria-busy={transcribing}
                    aria-controls={
                      hasTranscription ? `video-ai-summary-${v.videoId}` : undefined
                    }
                  >
                    {transcribing
                      ? lang === "fr"
                        ? "Génération du résumé…"
                        : "Generating summary…"
                      : hasTranscription
                      ? lang === "fr"
                        ? "Lire la suite →"
                        : "Read more →"
                      : lang === "fr"
                      ? "Générer le résumé →"
                      : "Generate summary →"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            {playing ? (
              <a
                href={v.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...btnStyle, textDecoration: "none", opacity: 1 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                {lang === "fr" ? "Ouvrir sur YouTube" : "Open on YouTube"}
              </a>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  startPlayback();
                }}
                style={{ ...btnStyle, opacity: 1 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#000" stroke="none">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                {lang === "fr" ? "Play Vidéo" : "Play Video"}
              </button>
            )}
            <button
              type="button"
              disabled={transcribing}
              onClick={(e) => {
                e.preventDefault();
                if (transcribing) return;
                if (hasTranscription) {
                  setSummaryExpanded((x) => !x);
                  return;
                }
                pendingExpandAfterTranscribeRef.current = true;
                onTranscribe();
              }}
              aria-expanded={hasTranscription ? summaryExpanded : undefined}
              aria-controls={hasTranscription ? `video-ai-summary-${v.videoId}` : undefined}
              aria-busy={transcribing}
              style={{ ...btnStyle, cursor: transcribing ? "wait" : "pointer" }}
            >
              {transcribing ? (
                <span style={transcribeBtnSpinnerStyle} aria-hidden />
              ) : hasTranscription ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              )}
              {lang === "fr" ? "Résumé" : "Summary"}
            </button>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
              <FavoriteButton
                url={v.link}
                title={v.title}
                source={v.channelTitle}
                pubDate={v.published}
                sourceType="video"
                isFavorite={isFavorite}
                lang={lang}
                onToggle={onToggleFavorite}
                onRequestAuth={onRequestAuth}
                isAuthenticated={isAuthenticated}
              />
              <a
                href={v.link}
                target="_blank"
                rel="noopener noreferrer"
                title={lang === "fr" ? "Ouvrir sur YouTube" : "Open on YouTube"}
                aria-label={lang === "fr" ? "Ouvrir sur YouTube" : "Open on YouTube"}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: color.textDim,
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = color.gold;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = color.textDim;
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
              <DownloadTranscriptButton
                videoId={v.videoId}
                hasTranscription={hasTranscription}
                summaryMd={summaryMd}
                title={v.title}
                lang={lang}
              />
              <CopyLinkButton url={v.link} />
            </div>
          </div>
        </div>
  );

  /** Hero homepage: full summary panel sits at the bottom of the card under the actions row. */
  const transcriptionErrorBlock =
    summaryMd && transcriptionFailed ? (
      <div
        className={isHero ? "video-card-hero-summary-panel" : undefined}
        style={{
          ...(isHero ? {} : { padding: "0 20px 20px" }),
          borderTop: `1px solid ${color.border}`,
        }}
      >
        <ReactMarkdown components={mdComponents}>{summaryMd}</ReactMarkdown>
      </div>
    ) : null;

  const transcriptionSuccessBlock =
    summaryMd && !transcriptionFailed ? (
      <div
        style={{
          display: "grid",
          gridTemplateRows: summaryExpanded ? "1fr" : "0fr",
          transition: `grid-template-rows ${gridMs}ms cubic-bezier(0.33, 0.86, 0.2, 1)`,
        }}
      >
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <div
            ref={summaryPanelRef}
            id={`video-ai-summary-${v.videoId}`}
            role="region"
            aria-label={t("videoSummaryRegionAria", lang)}
            className={isHero ? "video-card-hero-summary-panel" : undefined}
            style={{
              ...(isHero ? {} : { padding: "0 20px 20px" }),
              borderTop: `1px solid ${color.border}`,
              opacity: summaryExpanded ? 1 : 0,
              transition: summaryExpanded
                ? `opacity ${fadeMs}ms ease ${fadeDelayMs}ms`
                : `opacity ${reducedMotion ? 1 : 320}ms ease`,
            }}
          >
            {(() => {
              const plain = summaryMd
                .replace(/^##\s+.+$/gm, "")
                .replace(/^###\s+/gm, "")
                .replace(/\*\*/g, "")
                .replace(/^\s*[-*]\s+/gm, "")
                .replace(/\n{2,}/g, "\n")
                .trim();
              const intro = lang === "fr" ? `Résumé de la vidéo ${v.title}.` : `Summary of the video ${v.title}.`;
              const maxBody = 4800 - intro.length;
              const body = plain.length > maxBody ? plain.slice(0, maxBody) + "…" : plain;
              return body.length > 0 ? (
                <div style={{ paddingTop: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      color: color.gold,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 6,
                    }}
                  >
                    {lang === "fr" ? "Lecteur audio" : "Audio player"}
                  </div>
                  <AudioPlayer text={`${intro} ${body}`} lang={lang} speed={speed} voice={voice} context="video_card" contextId={v.videoId} />
                </div>
              ) : null;
            })()}
            <ReactMarkdown components={mdComponents}>{summaryMd}</ReactMarkdown>
            <button type="button" onClick={() => setSummaryExpanded(false)} style={{ ...toggleLink, marginTop: 8 }}>
              {lang === "fr" ? "Réduire le résumé" : "Collapse summary"}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div style={cardStyle}>
      <div className={isHero ? "video-card-hero" : "video-card-row"}>
        {isHero ? (
          bodyBlock
        ) : (
          <>
            {thumbBlock}
            {bodyBlock}
          </>
        )}
      </div>

      {transcriptionErrorBlock}
      {transcriptionSuccessBlock}
    </div>
  );
}
