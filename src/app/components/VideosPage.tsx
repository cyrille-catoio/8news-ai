"use client";

import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from "react";
import { color, formInputStyle, spinnerStyle } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { getCookie, setCookie } from "@/lib/cookies";
import { VideoCard, type VideoItem } from "@/app/components/VideoCard";

const VIDEO_SORT_COOKIE = "videoSortOrder";

/** Short: duration known and strictly under 3 minutes. Unknown duration is not treated as a short. */
function isShortVideo(v: VideoItem): boolean {
  return v.durationSec != null && v.durationSec < 180;
}

function publishedTimeDesc(a: VideoItem, b: VideoItem): number {
  return new Date(b.published).getTime() - new Date(a.published).getTime();
}

type VideoSort = "score" | "date";

function readVideoSortCookie(): VideoSort {
  if (typeof document === "undefined") return "score";
  const raw = getCookie(VIDEO_SORT_COOKIE);
  return raw === "date" ? "date" : "score";
}

function scoreDesc(a: VideoItem, b: VideoItem): number {
  const sa = a.summaryScore ?? -1;
  const sb = b.summaryScore ?? -1;
  if (sb !== sa) return sb - sa;
  return publishedTimeDesc(a, b);
}

function sortVideos(list: VideoItem[], sort: VideoSort): VideoItem[] {
  const copy = [...list];
  copy.sort(sort === "score" ? scoreDesc : publishedTimeDesc);
  return copy;
}

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toISODate(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
/** Browser IANA timezone (e.g. "Europe/Paris"). Empty string in non-browser env. */
function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}
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

function VideoSortToggle({
  sort,
  onChange,
  lang,
}: {
  sort: VideoSort;
  onChange: (v: VideoSort) => void;
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
      aria-label={t("videoSortToggleAria", lang)}
      style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
    >
      <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${color.gold}` }}>
        <button
          type="button"
          onClick={() => onChange("score")}
          style={segBtn(sort === "score", true)}
          aria-pressed={sort === "score"}
        >
          {t("videoSortScore", lang)}
        </button>
        <button
          type="button"
          onClick={() => onChange("date")}
          style={segBtn(sort === "date", false)}
          aria-pressed={sort === "date"}
        >
          {t("videoSortDate", lang)}
        </button>
      </div>
    </div>
  );
}

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
  const [videoSort, setVideoSort] = useState<VideoSort>(() => readVideoSortCookie());
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});

  const isToday = date === toISODate(new Date());

  const visibleVideos = useMemo(() => {
    const filtered = videoKind === "shorts"
      ? videos.filter(isShortVideo)
      : videos.filter((v) => !isShortVideo(v));
    return sortVideos(filtered, videoSort);
  }, [videos, videoKind, videoSort]);

  const handleVideoSortChange = useCallback((next: VideoSort) => {
    setVideoSort(next);
    setCookie(VIDEO_SORT_COOKIE, next);
  }, []);

  const fetchVideos = useCallback(async (d: string, l: Lang) => {
    setLoading(true);
    setError(null);
    setVideos([]);
    setSummaries({});
    try {
      const tz = browserTimeZone();
      const tzQs = tz ? `&tz=${encodeURIComponent(tz)}` : "";
      const res = await fetch(`/api/youtube-channels/videos?date=${encodeURIComponent(d)}&lang=${l}${tzQs}`, { cache: "no-store" });
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
        {lang === "fr" ? "Vidéos du jour" : "Videos of the day"}
        {!loading && ` (${visibleVideos.length})`}
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

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <VideoSortToggle sort={videoSort} onChange={handleVideoSortChange} lang={lang} />
          <VideoKindToggle kind={videoKind} onChange={setVideoKind} lang={lang} />
        </div>
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
