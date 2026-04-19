"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { color, primaryButtonStyle, formInputStyle, spinnerStyle } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { AudioPlayer } from "@/app/components/AudioPlayer";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { DownloadTranscriptButton } from "@/app/components/DownloadTranscriptButton";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

/** Slow layout push for summary panel + fade-in of content (respect reduced-motion below). */
const VIDEO_SUMMARY_GRID_MS = 2200;
const VIDEO_SUMMARY_FADE_MS = 1100;
const VIDEO_SUMMARY_FADE_DELAY_MS = 380;

interface VideoItem {
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
}

function formatViews(v: string | null): string {
  if (!v) return "";
  const n = parseInt(v, 10);
  if (isNaN(n)) return v;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/** Short: duration known and strictly under 2 minutes. Unknown duration is not treated as a short. */
function isShortVideo(v: VideoItem): boolean {
  return v.durationSec != null && v.durationSec < 120;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toISODate(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/* ── MiniCalendar ────────────────────────────────────────────────── */

function MiniCalendar({ value, onChange, lang }: { value: string; onChange: (d: string) => void; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = value ? new Date(value + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(sel.getFullYear());
  const [viewMonth, setViewMonth] = useState(sel.getMonth());

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const DAYS_FR = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
  const DAYS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = lang === "fr" ? DAYS_FR : DAYS_EN;
  const monthNames = lang === "fr" ? MONTHS_FR : MONTHS_EN;

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedDay = sel.getFullYear() === viewYear && sel.getMonth() === viewMonth ? sel.getDate() : -1;
  const today = new Date();
  const todayDay = today.getFullYear() === viewYear && today.getMonth() === viewMonth ? today.getDate() : -1;

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1);
  }
  function pick(day: number) {
    onChange(`${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`);
    setOpen(false);
  }

  const displayDate = value
    ? new Date(value + "T00:00:00").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "short", day: "numeric" })
    : "—";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...formInputStyle, maxWidth: 180, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, background: color.surface }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {displayDate}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 10, padding: 12, zIndex: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: 260 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button type="button" onClick={prevMonth} style={{ border: "none", background: "transparent", color: color.textMuted, cursor: "pointer", fontSize: 16, padding: "2px 8px" }}>‹</button>
            <span style={{ color: color.text, fontSize: 13, fontWeight: 600 }}>{monthNames[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} style={{ border: "none", background: "transparent", color: color.textMuted, cursor: "pointer", fontSize: 16, padding: "2px 8px" }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
            {dayNames.map((d) => (
              <div key={d} style={{ color: color.textDim, fontSize: 10, fontWeight: 600, padding: "4px 0" }}>{d}</div>
            ))}
            {cells.map((day, i) =>
              day === null ? (
                <div key={`e-${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  style={{
                    border: day === todayDay ? `1px solid ${color.gold}` : "1px solid transparent",
                    borderRadius: 6,
                    background: day === selectedDay ? color.gold : "transparent",
                    color: day === selectedDay ? "#000" : color.text,
                    fontSize: 12,
                    fontWeight: day === selectedDay ? 700 : 400,
                    padding: "6px 0",
                    cursor: "pointer",
                  }}
                >
                  {day}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Markdown style overrides for dark theme ─────────────────────── */

const mdComponents = {
  h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
    <h2 style={{ color: color.gold, fontSize: 16, fontWeight: 700, margin: "18px 0 8px" }} {...props}>{children}</h2>
  ),
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.6, margin: "6px 0" }} {...props}>{children}</p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
    <ul style={{ paddingLeft: 20, margin: "6px 0" }} {...props}>{children}</ul>
  ),
  li: ({ children, ...props }: React.ComponentProps<"li">) => (
    <li style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.6, marginBottom: 8 }} {...props}>{children}</li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
    <strong style={{ color: color.text, fontWeight: 700 }} {...props}>{children}</strong>
  ),
};

/* ── Helpers ──────────────────────────────────────────────────────── */

const DESC_MAX = 120;

function isTranscriptionErrorMarkdown(md: string | null): boolean {
  return !!md && md.startsWith("> **Error:**");
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

/* ── Single video card with transcription ────────────────────────── */

function VideoCard({
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

  return (
    <div style={cardStyle}>
      <div className="video-card-row">
        <div className="video-thumb">
          <div style={thumbWrap}>
            {playing ? (
              <iframe
                src={`https://www.youtube.com/embed/${v.videoId}?autoplay=1&rel=0&modestbranding=1`}
                title={v.title}
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
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
            <div style={{ color: color.text, fontSize: 15, fontWeight: 600, lineHeight: 1.35, marginBottom: 6 }}>{v.title}</div>
          </a>

          {/* Description — truncated with "Voir plus" */}
          {v.description && (
            <div style={{ color: color.textMuted, fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>
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
                const plain = summaryMd.replace(/^##\s+.+$/gm, "").replace(/\*\*/g, "").replace(/^\s*[-*]\s+/gm, "").replace(/\n{2,}/g, "\n").trim();
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

/* ── Day navigation arrows ───────────────────────────────────────── */

const arrowBtn: CSSProperties = {
  border: `1px solid ${color.border}`,
  background: "transparent",
  color: color.textSecondary,
  fontSize: 18,
  fontWeight: 700,
  cursor: "pointer",
  borderRadius: 6,
  padding: "4px 10px",
  lineHeight: 1,
  fontFamily: "inherit",
};

type VideoKind = "long" | "shorts";

function VideoKindToggle({
  kind,
  onChange,
  lang,
}: {
  kind: VideoKind;
  onChange: (v: VideoKind) => void;
  lang: Lang;
}) {
  const segBtn = (active: boolean, isLeft: boolean): CSSProperties => ({
    padding: "4px 10px",
    fontSize: 10.4,
    fontWeight: 600,
    border: "none",
    borderLeft: isLeft ? "none" : `1px solid ${color.gold}`,
    cursor: "pointer",
    background: active ? color.gold : "transparent",
    color: active ? "#000" : color.gold,
    transition: "all 0.15s",
    fontFamily: "inherit",
  });

  return (
    <div
      role="group"
      aria-label={t("videoKindToggleAria", lang)}
      style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
    >
      <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${color.gold}` }}>
        <button
          type="button"
          onClick={() => onChange("long")}
          style={segBtn(kind === "long", true)}
          aria-pressed={kind === "long"}
        >
          {t("videoKindLong", lang)}
        </button>
        <button
          type="button"
          onClick={() => onChange("shorts")}
          style={segBtn(kind === "shorts", false)}
          aria-pressed={kind === "shorts"}
        >
          {t("videoKindShorts", lang)}
        </button>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export function VideosPage({
  lang,
  speed,
  voice,
  favoriteUrls,
  onToggleFavorite,
  isAuthenticated,
  onRequestAuth,
}: {
  lang: Lang;
  speed: number;
  voice: string;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string; sourceType?: "article" | "video" }) => void;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
}) {
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [videoKind, setVideoKind] = useState<VideoKind>("long");
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});

  const isToday = date === toISODate(new Date());

  const visibleVideos = videoKind === "shorts"
    ? videos.filter(isShortVideo)
    : videos.filter((v) => !isShortVideo(v));

  const fetchVideos = useCallback(async (d: string, l: Lang) => {
    setLoading(true);
    setError(null);
    setVideos([]);
    setSummaries({});
    try {
      const res = await fetch(`/api/youtube-channels/videos?date=${encodeURIComponent(d)}&lang=${l}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Array<VideoItem & { summaryMd?: string | null }>;
      const sm: Record<string, string> = {};
      const clean: VideoItem[] = [];
      for (const row of data) {
        const { summaryMd, ...rest } = row;
        clean.push(rest);
        if (typeof summaryMd === "string" && summaryMd.length > 0) {
          sm[rest.videoId] = summaryMd;
        }
      }
      setVideos(clean);
      setSummaries(sm);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos(date, lang);
  }, [date, lang, fetchVideos]);

  const handleTranscribe = useCallback(async (v: VideoItem) => {
    setTranscribing((prev) => ({ ...prev, [v.videoId]: true }));
    try {
      const res = await fetch("/api/youtube-channels/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: v.videoId, title: v.title, channelId: v.channelId, lang }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const { summaryMd } = await res.json();
      setSummaries((prev) => ({ ...prev, [v.videoId]: summaryMd }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setSummaries((prev) => ({ ...prev, [v.videoId]: `> **Error:** ${msg}` }));
    } finally {
      setTranscribing((prev) => ({ ...prev, [v.videoId]: false }));
    }
  }, [lang]);

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 12, marginTop: 16 }}>
        {lang === "fr" ? "Vidéo du jour" : "Video of the day"}
      </h2>

      {/* ── Date row: navigation left, Shorts toggle right (aligned with video cards) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <button type="button" onClick={() => setDate(addDays(date, -1))} style={arrowBtn} title={lang === "fr" ? "Jour précédent" : "Previous day"}>
            ‹
          </button>

          <MiniCalendar value={date} onChange={setDate} lang={lang} />

          <button
            type="button"
            onClick={() => { if (!isToday) setDate(addDays(date, 1)); }}
            style={{ ...arrowBtn, opacity: isToday ? 0.3 : 1, cursor: isToday ? "default" : "pointer" }}
            disabled={isToday}
            title={lang === "fr" ? "Jour suivant" : "Next day"}
          >
            ›
          </button>

          {!isToday && (
            <button
              type="button"
              onClick={() => setDate(toISODate(new Date()))}
              style={{ ...arrowBtn, fontSize: 12, fontWeight: 500, padding: "5px 12px" }}
            >
              {lang === "fr" ? "Aujourd'hui" : "Today"}
            </button>
          )}
        </div>

        <VideoKindToggle kind={videoKind} onChange={setVideoKind} lang={lang} />
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0", flexDirection: "column", gap: 12 }}>
          <span style={spinnerStyle(28)} />
          <span style={{ color: color.textMuted, fontSize: 13 }}>
            {lang === "fr" ? "Chargement des vidéos…" : "Loading videos…"}
          </span>
        </div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ color: color.errorText, fontSize: 14 }}>{error}</p>
        </div>
      ) : videos.length === 0 ? (
        <p style={{ color: color.textMuted, fontSize: 14, textAlign: "center", padding: "48px 0" }}>
          {lang === "fr"
            ? "Aucune vidéo publiée ce jour sur les chaînes configurées"
            : "No videos published on this date from configured channels"}
        </p>
      ) : visibleVideos.length === 0 ? (
        <p style={{ color: color.textMuted, fontSize: 14, textAlign: "center", padding: "48px 0", maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
          {videoKind === "long"
            ? t("videoKindHintNoLong", lang)
            : t("videoKindHintNoShorts", lang)}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {visibleVideos.map((v) => (
            <VideoCard
              key={v.videoId}
              v={v}
              lang={lang}
              summaryMd={summaries[v.videoId] ?? null}
              transcribing={transcribing[v.videoId] ?? false}
              onTranscribe={() => handleTranscribe(v)}
              speed={speed}
              voice={voice}
              isFavorite={favoriteUrls.has(v.link)}
              isAuthenticated={isAuthenticated}
              onToggleFavorite={onToggleFavorite}
              onRequestAuth={onRequestAuth}
            />
          ))}
        </div>
      )}
    </div>
  );
}
