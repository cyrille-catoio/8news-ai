"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { color, primaryButtonStyle, spinnerStyle } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { AudioPlayer } from "@/app/components/AudioPlayer";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { DownloadTranscriptButton } from "@/app/components/DownloadTranscriptButton";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

/** Slow layout push for summary panel + fade-in of content (respect reduced-motion below). */
const VIDEO_SUMMARY_GRID_MS = 2200;
const VIDEO_SUMMARY_FADE_MS = 1100;
const VIDEO_SUMMARY_FADE_DELAY_MS = 380;

const DESC_MAX = 120;

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

  const transcriptionFailed = isTranscriptionErrorMarkdown(summaryMd);
  const hasTranscription = !!summaryMd && !transcriptionFailed;

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

  const cardStyle: CSSProperties = {
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

  const bodyStyle: CSSProperties = {
    padding: "14px 16px 14px 0",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };

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

  const btnStyle: CSSProperties = {
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

  return (
    <div style={cardStyle}>
      <div className="video-card-row">
        <div className="video-thumb">
          <div style={thumbWrap}>
            {playing ? (
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
                onClick={() => setPlaying(true)}
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
                  <img src={v.thumbnail} alt="" style={thumbImg} loading="lazy" />
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
            )}
          </div>
        </div>
        <div className="video-body" style={bodyStyle}>
          <a href={v.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <div className="app-title-sm" style={{ color: color.text, fontWeight: 600, marginBottom: 6 }}>{v.title}</div>
          </a>

          {/* Description — truncated with "Voir plus" */}
          {v.description && (
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
            <span style={{ color: color.textSecondary, fontWeight: 500 }}>{v.channelTitle}</span>
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
            {v.topicId && v.slugKeywords && v.publishedDate && (
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
                  setPlaying(true);
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
      </div>

      {/* Error after a failed run (always visible). Success summary only when expanded (toggle via Transcription). */}
      {summaryMd && transcriptionFailed && (
        <div
          style={{ padding: "0 20px 20px", borderTop: `1px solid ${color.border}` }}
        >
          <ReactMarkdown components={mdComponents}>{summaryMd}</ReactMarkdown>
        </div>
      )}
      {summaryMd && !transcriptionFailed && (
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
              style={{
                padding: "0 20px 20px",
                borderTop: `1px solid ${color.border}`,
                opacity: summaryExpanded ? 1 : 0,
                transition: summaryExpanded
                  ? `opacity ${fadeMs}ms ease ${fadeDelayMs}ms`
                  : `opacity ${reducedMotion ? 1 : 320}ms ease`,
              }}
            >
              {(() => {
                // h2 = section markers (drop the line). h3 = per-key-point
                // title (keep text, drop just the `### ` prefix) so TTS
                // speaks them as part of the body.
                const plain = summaryMd.replace(/^##\s+.+$/gm, "").replace(/^###\s+/gm, "").replace(/\*\*/g, "").replace(/^\s*[-*]\s+/gm, "").replace(/\n{2,}/g, "\n").trim();
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
                    <AudioPlayer text={`${intro} ${body}`} lang={lang} speed={speed} voice={voice} />
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
      )}
    </div>
  );
}
