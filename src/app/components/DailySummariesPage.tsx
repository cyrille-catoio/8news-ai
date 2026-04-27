"use client";

import { useState, useRef, useEffect } from "react";
import { t, type Lang } from "@/lib/i18n";
import { color, sectionCard, formInputStyle, primaryButtonStyle, spinnerStyle } from "@/lib/theme";
import type { TopicLabel } from "@/lib/types";
import { summaryPath } from "@/lib/summary-routes";

interface GenerateResult {
  lang: string;
  summaryId?: number;
  slug?: string;
  status?: string;
  error?: string;
}

function MiniCalendar({
  value,
  onChange,
  lang,
}: {
  value: string;
  onChange: (d: string) => void;
  lang: Lang;
}) {
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

  const pad = (n: number) => String(n).padStart(2, "0");
  const selectedDay = sel.getFullYear() === viewYear && sel.getMonth() === viewMonth ? sel.getDate() : -1;
  const today = new Date();
  const todayDay = today.getFullYear() === viewYear && today.getMonth() === viewMonth ? today.getDate() : -1;

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }
  function pick(day: number) {
    onChange(`${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`);
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
        style={{
          ...formInputStyle,
          maxWidth: 180,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: color.surface,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {displayDate}
      </button>
      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          marginTop: 4,
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: 10,
          padding: 12,
          zIndex: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          minWidth: 260,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button type="button" onClick={prevMonth} style={{ border: "none", background: "transparent", color: color.textMuted, cursor: "pointer", fontSize: 16, padding: "2px 8px" }}>‹</button>
            <span style={{ color: color.text, fontSize: 13, fontWeight: 600 }}>
              {monthNames[viewMonth]} {viewYear}
            </span>
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

export function DailySummariesPage({ lang, topics }: { lang: Lang; topics: TopicLabel[] }) {
  const [selectedTopic, setSelectedTopic] = useState(topics[0]?.id ?? "");
  // If topics weren't loaded yet at mount (e.g. direct navigation to
  // /app/daily-summaries before the parent finished fetching /api/topics),
  // pick the first topic as soon as the list arrives so the select isn't
  // empty and `handleGenerate` is not blocked by `!selectedTopic`.
  useEffect(() => {
    if (!selectedTopic && topics.length > 0) {
      setSelectedTopic(topics[0].id);
    }
  }, [topics, selectedTopic]);
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() - 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const [generating, setGenerating] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [allDate, setAllDate] = useState(() => {
    const d = new Date(Date.now() - 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const [results, setResults] = useState<Array<{ topic: string; date: string; results: GenerateResult[] }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!selectedTopic || !date) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/summaries/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: selectedTopic, date }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResults((prev) => [data, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dailySummariesError", lang));
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    setError(null);

    for (const tp of topics) {
      try {
        const res = await fetch("/api/summaries/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: tp.id, date: allDate }),
        });
        if (res.ok) {
          const data = await res.json();
          setResults((prev) => [data, ...prev]);
        }
      } catch {
        setResults((prev) => [{ topic: tp.id, date: allDate, results: [{ lang: "en", error: "Failed" }] }, ...prev]);
      }
    }

    setGeneratingAll(false);
  }

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 8, marginTop: 0 }}>
        {t("dailySummariesTitle", lang)}
      </h2>
      <p style={{ color: color.textMuted, fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
        {t("dailySummariesDesc", lang)}
      </p>

      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={sectionCard}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
              {t("dailySummariesTopic", lang)}
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              style={{ ...formInputStyle, maxWidth: 220 }}
            >
              {topics.map((tp) => (
                <option key={tp.id} value={tp.id}>{tp.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
              {t("dailySummariesDate", lang)}
            </label>
            <MiniCalendar value={date} onChange={setDate} lang={lang} />
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || generatingAll || !selectedTopic}
            style={{ ...primaryButtonStyle, opacity: generating ? 0.6 : 1 }}
          >
            {generating ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={spinnerStyle(14, { borderWidth: 2 })} />
                {t("dailySummariesGenerating", lang)}
              </span>
            ) : (
              t("dailySummariesGenerate", lang)
            )}
          </button>
        </div>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${color.border}`, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
              {t("dailySummariesDate", lang)}
            </label>
            <MiniCalendar value={allDate} onChange={setAllDate} lang={lang} />
          </div>
          <button
            type="button"
            onClick={handleGenerateAll}
            disabled={generating || generatingAll}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: `1px solid ${color.gold}`,
              background: "transparent",
              color: color.gold,
              fontSize: 13,
              fontWeight: 600,
              cursor: generatingAll ? "not-allowed" : "pointer",
              opacity: generatingAll ? 0.6 : 1,
            }}
          >
            {generatingAll ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={spinnerStyle(14, { borderWidth: 2 })} />
                {t("dailySummariesGenerating", lang)}
              </span>
            ) : (
              t("dailySummariesGenerateAll", lang)
            )}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div style={sectionCard}>
          <h3 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 0, marginBottom: 12 }}>
            {lang === "fr" ? "Résultats" : "Results"}
          </h3>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                padding: "10px 0",
                borderBottom: i < results.length - 1 ? `1px solid ${color.border}` : "none",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: color.text, fontSize: 14, fontWeight: 600 }}>{r.topic}</span>
                <span style={{ color: color.textDim, fontSize: 12 }}>{r.date}</span>
              </div>
              {r.results.map((res, ri) => (
                <div key={ri} style={{ marginTop: 4, marginLeft: 12 }}>
                  <span style={{ color: color.textMuted, fontSize: 12, fontWeight: 600 }}>{res.lang.toUpperCase()}</span>
                  {res.status === "skipped" ? (
                    <span style={{ marginLeft: 8 }}>
                      <span style={{ color: color.gold, fontSize: 12 }}>
                        {lang === "fr" ? "Déjà généré" : "Already exists"}
                      </span>
                      {res.slug && (
                        <a
                          href={summaryPath({ lang: res.lang, topicId: r.topic, date: r.date, slug: res.slug })}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: color.textMuted, fontSize: 12, marginLeft: 8, textDecoration: "none" }}
                        >
                          {t("dailySummariesViewPage", lang)} ↗
                        </a>
                      )}
                    </span>
                  ) : res.status === "no_articles" ? (
                    <span style={{ color: color.textDim, fontSize: 12, marginLeft: 8 }}>
                      {lang === "fr" ? "Aucun article pour cette date" : "No articles for this date"}
                    </span>
                  ) : res.slug ? (
                    <span style={{ marginLeft: 8 }}>
                      <span style={{ color: "#4ade80", fontSize: 12 }}>
                        {t("dailySummariesSuccess", lang)}
                      </span>
                      <a
                        href={summaryPath({ lang: res.lang, topicId: r.topic, date: r.date, slug: res.slug })}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: color.gold, fontSize: 12, marginLeft: 8, textDecoration: "none" }}
                      >
                        {t("dailySummariesViewPage", lang)} ↗
                      </a>
                    </span>
                  ) : (
                    <span style={{ color: "#ef4444", fontSize: 12, marginLeft: 8 }}>
                      {res.error || t("dailySummariesError", lang)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
