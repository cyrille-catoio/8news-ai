"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { color, sectionCard, formSectionTitle, spinnerStyle } from "@/lib/theme";
import { t, type Lang, dateLocale } from "@/lib/i18n";

/**
 * Owner-only behavioral analytics dashboard backed by the new
 * `user_event` (mig. 030) + `user_activity` (mig. 029) tables.
 *
 * Single API call to `/api/users/activity-stats?period=…` returns the
 * full payload (12 sections). Visualizations are CSS-only — no chart
 * library, matching the rest of the admin pages (`StatsPage`,
 * `CronMonitorPage`) which roll their own bar/donut/heatmap with
 * `<div>`s sized by inline width percentages.
 */

// ── Local mirror of the API payload shape ────────────────────────
type Period = "7d" | "30d" | "90d" | "all";

interface ActivityStats {
  period: { value: Period; fromISO: string; toISO: string };
  kpis: {
    dau: number;
    wau: number;
    mau: number;
    totalEvents: number;
    activeUsersInPeriod: number;
    totalRegisteredUsers: number;
    newSignupsInPeriod: number;
  };
  signupsByWeek: Array<{ weekStart: string; count: number }>;
  anonToAuth: { anonVisitors: number; converted: number; rate: number };
  eventsByType: Array<{ type: string; count: number }>;
  funnel: Array<{ key: string; label: string; count: number; rate: number }>;
  heatmap: number[][];
  topContent: {
    podcasts: Array<{ targetId: string; reads: number }>;
    favorites: Array<{ url: string; netAdds: number }>;
    videos: Array<{ videoId: string; plays: number }>;
  };
  langSplit: { en: number; fr: number; unknown: number };
  featureAdoption: Array<{ feature: string; adopted: number; totalUsers: number; rate: number }>;
  leaderboard: Array<{
    userId: string;
    email: string | null;
    eventCount: number;
    lastEventAt: string;
    signupAt: string | null;
  }>;
  retentionCohorts: Array<{
    cohortWeekStart: string;
    cohortSize: number;
    weeklyReturnRate: number[];
  }>;
}

// ── Shared style tokens ──────────────────────────────────────────
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
  { value: "90d", label: "90 d" },
  { value: "all", label: "All" },
];

const kpiCard: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  padding: "14px 16px",
  flex: "1 1 140px",
  minWidth: 140,
};
const kpiVal: CSSProperties = {
  color: color.gold,
  fontSize: 26,
  fontWeight: 700,
  lineHeight: 1.1,
  fontFamily: "ui-monospace, Menlo, monospace",
};
const kpiLbl: CSSProperties = {
  color: color.textMuted,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginTop: 4,
};
const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 700,
  color: color.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  borderBottom: `1px solid ${color.border}`,
};
const tdStyle: CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  color: color.text,
  borderBottom: `1px solid ${color.border}`,
};

// ── Helpers ───────────────────────────────────────────────────────
function fmtNum(n: number, locale: string): string {
  return n.toLocaleString(locale);
}
function fmtPct(r: number): string {
  return `${(r * 100).toFixed(r >= 0.1 ? 0 : 1)}%`;
}
function dayOfWeekLabel(d: number, lang: Lang): string {
  // 0 = Sunday … 6 = Saturday (UTC, matches server aggregation).
  const labels =
    lang === "fr"
      ? ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels[d];
}
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ── Section components ───────────────────────────────────────────

function FiltersBar({
  period,
  onPeriodChange,
  loading,
  lang,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  loading: boolean;
  lang: Lang;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
      <div style={{ color: color.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
        {lang === "fr" ? "Période" : "Period"}
      </div>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${color.border}` }}>
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onPeriodChange(p.value)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              background: period === p.value ? color.gold : "transparent",
              color: period === p.value ? "#000" : color.textMuted,
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {loading && (
        <span style={{ ...spinnerStyle(14), marginLeft: 6 }} aria-label="loading" />
      )}
    </div>
  );
}

function KpiGrid({ data, locale, lang }: { data: ActivityStats; locale: string; lang: Lang }) {
  const k = data.kpis;
  const cards: Array<{ label: string; val: string }> = [
    { label: "DAU", val: fmtNum(k.dau, locale) },
    { label: "WAU", val: fmtNum(k.wau, locale) },
    { label: "MAU", val: fmtNum(k.mau, locale) },
    {
      label: lang === "fr" ? "Évén. (période)" : "Events (period)",
      val: fmtNum(k.totalEvents, locale),
    },
    {
      label: lang === "fr" ? "Actifs (période)" : "Active (period)",
      val: fmtNum(k.activeUsersInPeriod, locale),
    },
    {
      label: lang === "fr" ? "Inscrits total" : "Total signups",
      val: fmtNum(k.totalRegisteredUsers, locale),
    },
    {
      label: lang === "fr" ? "Nouveaux (période)" : "New (period)",
      val: fmtNum(k.newSignupsInPeriod, locale),
    },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
      {cards.map((c) => (
        <div key={c.label} style={kpiCard}>
          <div style={kpiVal}>{c.val}</div>
          <div style={kpiLbl}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function SignupsChart({ data, lang }: { data: ActivityStats; lang: Lang }) {
  const rows = data.signupsByWeek;
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <div style={sectionCard}>
      <h3 style={formSectionTitle}>
        {lang === "fr" ? "Nouveaux inscrits par semaine" : "New signups per week"}
      </h3>
      {rows.length === 0 ? (
        <div style={{ color: color.textMuted, fontSize: 13 }}>
          {lang === "fr" ? "Aucune inscription dans la période." : "No signups in the period."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((r) => (
            <div key={r.weekStart} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 90, fontSize: 11, color: color.textMuted, fontFamily: "ui-monospace, Menlo, monospace" }}>
                {r.weekStart}
              </span>
              <div style={{ flex: 1, background: color.border, height: 10, borderRadius: 5, overflow: "hidden" }}>
                <div
                  style={{
                    width: max === 0 ? "0%" : `${(r.count / max) * 100}%`,
                    height: "100%",
                    background: color.gold,
                  }}
                />
              </div>
              <span style={{ width: 32, textAlign: "right", fontSize: 12, color: color.text, fontWeight: 600 }}>
                {r.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnonConversionCard({ data, lang, locale }: { data: ActivityStats; lang: Lang; locale: string }) {
  const a = data.anonToAuth;
  return (
    <div style={sectionCard}>
      <h3 style={formSectionTitle}>
        {lang === "fr" ? "Conversion anonyme → connecté" : "Anonymous → Authenticated"}
      </h3>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={kpiCard}>
          <div style={kpiVal}>{fmtNum(a.anonVisitors, locale)}</div>
          <div style={kpiLbl}>{lang === "fr" ? "Visiteurs anonymes" : "Anonymous visitors"}</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiVal}>{fmtNum(a.converted, locale)}</div>
          <div style={kpiLbl}>{lang === "fr" ? "Convertis" : "Converted"}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: a.rate >= 0.05 ? "#4ade80" : color.gold }}>{fmtPct(a.rate)}</div>
          <div style={kpiLbl}>{lang === "fr" ? "Taux" : "Rate"}</div>
        </div>
      </div>
      <p style={{ color: color.textMuted, fontSize: 12, margin: "12px 0 0", lineHeight: 1.4 }}>
        {lang === "fr"
          ? "Un visiteur est compté comme converti quand son visitor_id apparaît dans une ligne avec un user_id non nul (même browser session)."
          : "A visitor counts as converted when their visitor_id appears in a row with a non-null user_id (same browser session)."}
      </p>
    </div>
  );
}

function EventVolumeChart({ data, lang, locale }: { data: ActivityStats; lang: Lang; locale: string }) {
  const max = data.eventsByType.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <div style={sectionCard}>
      <h3 style={formSectionTitle}>
        {lang === "fr" ? "Volume d'événements par type" : "Event volume by type"}
      </h3>
      {data.eventsByType.length === 0 ? (
        <div style={{ color: color.textMuted, fontSize: 13 }}>
          {lang === "fr" ? "Pas d'événements." : "No events yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {data.eventsByType.map((r) => (
            <div key={r.type} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 220,
                  fontSize: 12,
                  color: color.text,
                  fontFamily: "ui-monospace, Menlo, monospace",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={r.type}
              >
                {r.type}
              </span>
              <div style={{ flex: 1, background: color.border, height: 8, borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: max === 0 ? "0%" : `${(r.count / max) * 100}%`,
                    height: "100%",
                    background: color.gold,
                  }}
                />
              </div>
              <span style={{ width: 60, textAlign: "right", fontSize: 12, color: color.text, fontWeight: 600 }}>
                {fmtNum(r.count, locale)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FunnelChart({ data, lang, locale }: { data: ActivityStats; lang: Lang; locale: string }) {
  const top = data.funnel[0]?.count ?? 0;
  return (
    <div style={sectionCard}>
      <h3 style={formSectionTitle}>{lang === "fr" ? "Funnel de conversion" : "Conversion funnel"}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.funnel.map((step, i) => {
          const widthPct = top > 0 ? (step.count / top) * 100 : 0;
          return (
            <div key={step.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: color.text, fontSize: 13, fontWeight: 600 }}>
                  {i + 1}. {step.label}
                </span>
                <span style={{ color: color.textMuted, fontSize: 12 }}>
                  {fmtNum(step.count, locale)}{" "}
                  {i > 0 && (
                    <span style={{ color: step.rate >= 0.3 ? "#4ade80" : step.rate >= 0.1 ? color.gold : "#f97316" }}>
                      ({fmtPct(step.rate)})
                    </span>
                  )}
                </span>
              </div>
              <div style={{ background: color.border, height: 24, borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, ${color.gold}, rgba(201,162,39,0.6))`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeatmapChart({ data, lang }: { data: ActivityStats; lang: Lang }) {
  const max = data.heatmap.reduce(
    (m, row) => row.reduce((mm, v) => Math.max(mm, v), m),
    0,
  );
  const cellSize = 22;
  return (
    <div style={sectionCard}>
      <h3 style={formSectionTitle}>
        {lang === "fr" ? "Carte horaire (UTC)" : "Time-of-day heatmap (UTC)"}
      </h3>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "inline-block", minWidth: 24 * cellSize + 50 }}>
          <div style={{ display: "flex", marginLeft: 44 }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                style={{
                  width: cellSize,
                  textAlign: "center",
                  fontSize: 10,
                  color: color.textMuted,
                  fontFamily: "ui-monospace, Menlo, monospace",
                }}
              >
                {h % 3 === 0 ? h : ""}
              </div>
            ))}
          </div>
          {data.heatmap.map((row, dow) => (
            <div key={dow} style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  width: 40,
                  fontSize: 11,
                  color: color.textMuted,
                  fontFamily: "ui-monospace, Menlo, monospace",
                  paddingRight: 4,
                  textAlign: "right",
                }}
              >
                {dayOfWeekLabel(dow, lang)}
              </span>
              {row.map((v, h) => {
                const intensity = max === 0 ? 0 : v / max;
                return (
                  <div
                    key={h}
                    title={`${dayOfWeekLabel(dow, lang)} ${h}h · ${v} events`}
                    style={{
                      width: cellSize - 2,
                      height: cellSize - 2,
                      margin: 1,
                      borderRadius: 3,
                      background:
                        v === 0
                          ? color.border
                          : `rgba(201, 162, 39, ${0.18 + intensity * 0.82})`,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopContentTables({ data, lang, locale }: { data: ActivityStats; lang: Lang; locale: string }) {
  return (
    <div style={sectionCard}>
      <h3 style={formSectionTitle}>{lang === "fr" ? "Contenus les plus consommés" : "Top content"}</h3>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div>
          <h4 style={{ color: color.text, fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>
            {lang === "fr" ? "Podcasts marqués lus" : "Podcasts marked read"}
          </h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>{lang === "fr" ? "Date" : "Date"}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Lus" : "Reads"}</th>
              </tr>
            </thead>
            <tbody>
              {data.topContent.podcasts.length === 0 ? (
                <tr><td style={tdStyle} colSpan={2}><span style={{ color: color.textMuted }}>—</span></td></tr>
              ) : (
                data.topContent.podcasts.map((r) => (
                  <tr key={r.targetId}>
                    <td style={{ ...tdStyle, fontFamily: "ui-monospace, Menlo, monospace" }}>{r.targetId}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: color.gold, fontWeight: 600 }}>{fmtNum(r.reads, locale)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div>
          <h4 style={{ color: color.text, fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>
            {lang === "fr" ? "Articles favoris (net)" : "Favorited articles (net)"}
          </h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>URL</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Favoris" : "Favs"}</th>
              </tr>
            </thead>
            <tbody>
              {data.topContent.favorites.length === 0 ? (
                <tr><td style={tdStyle} colSpan={2}><span style={{ color: color.textMuted }}>—</span></td></tr>
              ) : (
                data.topContent.favorites.map((r) => (
                  <tr key={r.url}>
                    <td style={tdStyle}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: color.gold, textDecoration: "none", fontSize: 12 }} title={r.url}>
                        {truncate(r.url, 38)}
                      </a>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: color.gold, fontWeight: 600 }}>{fmtNum(r.netAdds, locale)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div>
          <h4 style={{ color: color.text, fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>
            {lang === "fr" ? "Vidéos jouées" : "Played videos"}
          </h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>{lang === "fr" ? "Vidéo" : "Video"}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Lectures" : "Plays"}</th>
              </tr>
            </thead>
            <tbody>
              {data.topContent.videos.length === 0 ? (
                <tr><td style={tdStyle} colSpan={2}><span style={{ color: color.textMuted }}>—</span></td></tr>
              ) : (
                data.topContent.videos.map((r) => (
                  <tr key={r.videoId}>
                    <td style={tdStyle}>
                      <a href={`https://www.youtube.com/watch?v=${r.videoId}`} target="_blank" rel="noopener noreferrer" style={{ color: color.gold, textDecoration: "none", fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace" }}>
                        {r.videoId}
                      </a>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: color.gold, fontWeight: 600 }}>{fmtNum(r.plays, locale)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LangSplitChart({ data, lang, locale }: { data: ActivityStats; lang: Lang; locale: string }) {
  const total = data.langSplit.en + data.langSplit.fr + data.langSplit.unknown;
  const enPct = total > 0 ? (data.langSplit.en / total) * 100 : 0;
  const frPct = total > 0 ? (data.langSplit.fr / total) * 100 : 0;
  const unkPct = total > 0 ? (data.langSplit.unknown / total) * 100 : 0;
  return (
    <div style={sectionCard}>
      <h3 style={formSectionTitle}>{lang === "fr" ? "Répartition par langue" : "Language split"}</h3>
      {total === 0 ? (
        <div style={{ color: color.textMuted, fontSize: 13 }}>—</div>
      ) : (
        <>
          <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", border: `1px solid ${color.border}` }}>
            <div style={{ width: `${enPct}%`, background: "#3b82f6" }} title={`EN ${enPct.toFixed(1)}%`} />
            <div style={{ width: `${frPct}%`, background: color.gold }} title={`FR ${frPct.toFixed(1)}%`} />
            <div style={{ width: `${unkPct}%`, background: color.textDim }} title={`Unknown ${unkPct.toFixed(1)}%`} />
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: color.text, flexWrap: "wrap" }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#3b82f6", marginRight: 6, borderRadius: 2 }} />EN — {fmtNum(data.langSplit.en, locale)} ({enPct.toFixed(1)}%)</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: color.gold, marginRight: 6, borderRadius: 2 }} />FR — {fmtNum(data.langSplit.fr, locale)} ({frPct.toFixed(1)}%)</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: color.textDim, marginRight: 6, borderRadius: 2 }} />?  — {fmtNum(data.langSplit.unknown, locale)} ({unkPct.toFixed(1)}%)</span>
          </div>
        </>
      )}
    </div>
  );
}

function FeatureAdoptionChart({ data, lang, locale }: { data: ActivityStats; lang: Lang; locale: string }) {
  return (
    <div style={sectionCard}>
      <h3 style={formSectionTitle}>{lang === "fr" ? "Adoption des fonctionnalités" : "Feature adoption"}</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>{lang === "fr" ? "Fonctionnalité" : "Feature"}</th>
            <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Utilisateurs" : "Users"}</th>
            <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Taux" : "Rate"}</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {data.featureAdoption.map((f) => (
            <tr key={f.feature}>
              <td style={tdStyle}>{f.feature}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {fmtNum(f.adopted, locale)} / {fmtNum(f.totalUsers, locale)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", color: f.rate >= 0.4 ? "#4ade80" : f.rate >= 0.15 ? color.gold : color.textMuted, fontWeight: 600 }}>
                {fmtPct(f.rate)}
              </td>
              <td style={tdStyle}>
                <div style={{ background: color.border, height: 8, borderRadius: 4, overflow: "hidden", width: 120 }}>
                  <div style={{ width: `${f.rate * 100}%`, height: "100%", background: color.gold }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Leaderboard({ data, lang, locale }: { data: ActivityStats; lang: Lang; locale: string }) {
  return (
    <div style={sectionCard}>
      <h3 style={formSectionTitle}>{lang === "fr" ? "Top utilisateurs actifs" : "Most active users"}</h3>
      {data.leaderboard.length === 0 ? (
        <div style={{ color: color.textMuted, fontSize: 13 }}>—</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Email</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Évén." : "Events"}</th>
                <th style={thStyle}>{lang === "fr" ? "Dernière activité" : "Last activity"}</th>
                <th style={thStyle}>{lang === "fr" ? "Inscrit" : "Signup"}</th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.map((u, i) => (
                <tr key={u.userId}>
                  <td style={{ ...tdStyle, color: color.textMuted, fontFamily: "ui-monospace, Menlo, monospace" }}>{i + 1}</td>
                  <td style={tdStyle}>{u.email ?? <span style={{ color: color.textMuted }}>—</span>}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: color.gold, fontWeight: 600 }}>{fmtNum(u.eventCount, locale)}</td>
                  <td style={{ ...tdStyle, color: color.textMuted, fontSize: 12 }}>
                    {new Date(u.lastEventAt).toLocaleString(locale)}
                  </td>
                  <td style={{ ...tdStyle, color: color.textMuted, fontSize: 12 }}>
                    {u.signupAt ? new Date(u.signupAt).toLocaleDateString(locale) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RetentionHeatmap({ data, lang }: { data: ActivityStats; lang: Lang }) {
  if (data.retentionCohorts.length === 0) {
    return (
      <div style={sectionCard}>
        <h3 style={formSectionTitle}>{lang === "fr" ? "Rétention par cohorte" : "Retention cohorts"}</h3>
        <div style={{ color: color.textMuted, fontSize: 13 }}>—</div>
      </div>
    );
  }
  return (
    <div style={sectionCard}>
      <h3 style={formSectionTitle}>{lang === "fr" ? "Rétention par cohorte (semaine d'inscription → retours)" : "Retention cohorts (signup week → returns)"}</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>{lang === "fr" ? "Cohorte" : "Cohort"}</th>
              <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Taille" : "Size"}</th>
              {Array.from({ length: 8 }, (_, n) => (
                <th key={n} style={{ ...thStyle, textAlign: "center", minWidth: 48 }}>
                  W+{n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.retentionCohorts.map((c) => (
              <tr key={c.cohortWeekStart}>
                <td style={{ ...tdStyle, fontFamily: "ui-monospace, Menlo, monospace" }}>{c.cohortWeekStart}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: color.text, fontWeight: 600 }}>{c.cohortSize}</td>
                {c.weeklyReturnRate.map((r, n) => (
                  <td
                    key={n}
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      background: r === 0 ? color.border : `rgba(201, 162, 39, ${0.15 + r * 0.85})`,
                      color: r >= 0.4 ? "#000" : color.text,
                      fontWeight: 600,
                      minWidth: 48,
                    }}
                    title={`${(r * 100).toFixed(1)}%`}
                  >
                    {r === 0 ? "—" : `${Math.round(r * 100)}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────

export function UserActivityStatsPage({ lang }: { lang: Lang }) {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const locale = useMemo(() => dateLocale(lang), [lang]);

  const load = useCallback(
    async (p: Period) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/users/activity-stats?period=${p}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ActivityStats;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(period);
  }, [load, period]);

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 22, fontWeight: 600, margin: "0 0 16px" }}>
        {t("userActivityAdminAria", lang)}
      </h2>
      <p style={{ color: color.textMuted, fontSize: 13, margin: "0 0 18px", lineHeight: 1.5 }}>
        {lang === "fr"
          ? "Analyse comportementale des visiteurs anonymes et des utilisateurs connectés. Données issues des tables user_event (log) et user_activity (états)."
          : "Behavioral analytics across anonymous and authenticated visitors. Data sourced from the user_event log and user_activity state tables."}
      </p>

      <FiltersBar period={period} onPeriodChange={setPeriod} loading={loading} lang={lang} />

      {error && (
        <div style={{ ...sectionCard, borderColor: color.errorBorder, background: color.errorBg, color: color.errorText, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!data && loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <span style={spinnerStyle(28)} />
        </div>
      )}

      {data && (
        <>
          <KpiGrid data={data} locale={locale} lang={lang} />
          <SignupsChart data={data} lang={lang} />
          <AnonConversionCard data={data} lang={lang} locale={locale} />
          <EventVolumeChart data={data} lang={lang} locale={locale} />
          <FunnelChart data={data} lang={lang} locale={locale} />
          <HeatmapChart data={data} lang={lang} />
          <TopContentTables data={data} lang={lang} locale={locale} />
          <LangSplitChart data={data} lang={lang} locale={locale} />
          <FeatureAdoptionChart data={data} lang={lang} locale={locale} />
          <Leaderboard data={data} lang={lang} locale={locale} />
          <RetentionHeatmap data={data} lang={lang} />
        </>
      )}
    </div>
  );
}
