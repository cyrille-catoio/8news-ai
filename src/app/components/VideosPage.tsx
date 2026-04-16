"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { color, primaryButtonStyle, formInputStyle, spinnerStyle } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

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
}: {
  v: VideoItem;
  lang: Lang;
  summaryMd: string | null;
  transcribing: boolean;
  onTranscribe: () => void;
}) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);

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
    opacity: transcribing ? 0.7 : 1,
  };

  const descTruncated = v.description && v.description.length > DESC_MAX && !descExpanded;

  return (
    <div style={cardStyle}>
      <div className="video-card-row">
        <a href={v.link} target="_blank" rel="noopener noreferrer" className="video-thumb">
          <div style={thumbWrap}>
            {v.thumbnail ? (
              <img src={v.thumbnail} alt="" style={thumbImg} loading="lazy" />
            ) : (
              <div style={{ ...thumbImg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={color.textDim} strokeWidth="1.5">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </div>
            )}
          </div>
        </a>
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

          {/* Transcription button */}
          {!summaryMd && (
            <div>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); onTranscribe(); }}
                disabled={transcribing}
                style={btnStyle}
              >
                {transcribing ? (
                  <>
                    <span style={spinnerStyle(14, { borderWidth: 2 })} />
                    {lang === "fr" ? "Transcription en cours…" : "Transcribing…"}
                  </>
                ) : (
                  "Transcription"
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {summaryMd && (
        <div style={{ padding: summaryExpanded ? "0 20px 20px" : "8px 20px 10px", borderTop: `1px solid ${color.border}` }}>
          {summaryExpanded ? (
            <>
              <ReactMarkdown components={mdComponents}>{summaryMd}</ReactMarkdown>
              <button type="button" onClick={() => setSummaryExpanded(false)} style={{ ...toggleLink, marginTop: 8 }}>
                {lang === "fr" ? "Réduire le résumé" : "Collapse summary"}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setSummaryExpanded(true)} style={{ ...toggleLink, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
              </svg>
              {lang === "fr" ? "Résumé IA — Voir" : "AI Summary — View"}
            </button>
          )}
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

/* ── Main page ───────────────────────────────────────────────────── */

export function VideosPage({ lang }: { lang: Lang }) {
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});

  const isToday = date === toISODate(new Date());

  const fetchVideos = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    setVideos([]);
    try {
      const res = await fetch(`/api/youtube-channels/videos?date=${d}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: VideoItem[] = await res.json();
      setVideos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos(date);
  }, [date, fetchVideos]);

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
        {lang === "fr" ? "Vidéos" : "Videos"}
      </h2>

      {/* ── Date picker bar ───────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
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
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {videos.map((v) => (
            <VideoCard
              key={v.videoId}
              v={v}
              lang={lang}
              summaryMd={summaries[v.videoId] ?? null}
              transcribing={transcribing[v.videoId] ?? false}
              onTranscribe={() => handleTranscribe(v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
