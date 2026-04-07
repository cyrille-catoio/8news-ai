"use client";

import { type CSSProperties, useState, useEffect, useCallback } from "react";
import type { CronStatsResponse } from "@/lib/types";
import { t, type Lang } from "@/lib/i18n";
import { color, sectionHeading, spinnerStyle, sectionCard, formSectionTitle } from "@/lib/theme";

export function CronMonitorPage({ lang }: { lang: Lang }) {
  const [data, setData] = useState<CronStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const loadData = useCallback(() => {
    fetch("/api/cron-stats", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json: CronStatsResponse) => { setData(json); setErr(null); })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const id = setInterval(loadData, 60_000);
    return () => clearInterval(id);
  }, [loadData]);

  const fmt = (n: number) => n.toLocaleString(lang === "fr" ? "fr-FR" : "en-US");

  function timeAgo(iso: string | null): string {
    if (!iso) return "—";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return "< 1 " + t("minutesAgo", lang);
    if (mins < 60) return `${mins} ${t("minutesAgo", lang)}`;
    const hours = Math.floor(mins / 60);
    return `${hours} ${t("hoursAgo", lang)}`;
  }

  function statusIcon(s: "ok" | "slow" | "high"): string {
    if (s === "ok") return "✅";
    if (s === "slow") return "⚠️";
    return "🔴";
  }

  function statusLabel(s: "ok" | "slow" | "high"): string {
    if (s === "ok") return t("statusOk", lang);
    if (s === "slow") return t("statusSlow", lang);
    return t("statusHigh", lang);
  }

  function reasonLabel(status: string, reason: string | undefined): string {
    if (status === "ok" || !reason) return "";
    const threshold = status === "high" ? "30m" : "15m";
    if (reason === "backlog") return status === "high" ? "backlog > 200" : "backlog ≥ 50";
    if (reason === "fetch") return `fetch > ${threshold}`;
    return `score > ${threshold}`;
  }

  function kpiColor(val: number, thresholds: [number, number], invert = false): string {
    const [low, high] = thresholds;
    if (invert) {
      if (val <= low) return "#22c55e";
      if (val <= high) return color.gold;
      return "#ef4444";
    }
    if (val >= high) return "#22c55e";
    if (val >= low) return color.gold;
    return "#ef4444";
  }

  const kpiCard: CSSProperties = { background: color.surface, border: `1px solid ${color.border}`, borderRadius: 8, padding: "10px 6px", textAlign: "center" };
  const kpiVal: CSSProperties = { fontSize: 17, fontWeight: 700 };
  const kpiLbl: CSSProperties = { fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: color.textMuted, marginTop: 2 };
  const thStyle: CSSProperties = { textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 600, color: color.textMuted, borderBottom: `1px solid ${color.border}`, whiteSpace: "nowrap" };
  const tdStyle: CSSProperties = { padding: "6px 10px", fontSize: 13, borderBottom: `1px solid ${color.border}`, whiteSpace: "nowrap" };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: color.textMuted }}>
        <span style={spinnerStyle(24)} />
      </div>
    );
  }

  if (err) {
    return <div style={{ background: color.errorBg, border: `1px solid ${color.errorBorder}`, borderRadius: 8, padding: "12px 16px", color: color.errorText, fontSize: 15 }}>{err}</div>;
  }

  if (!data) return null;

  const maxBar = Math.max(...data.timeline.map((h) => Math.max(h.fetched, h.scored)), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <h2 style={{ ...sectionHeading, marginBottom: 0 }}>{t("cronMonitor", lang)}</h2>
        <span className="cron-pulse-dot" title="Auto-refresh 60s" />
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 20 }}>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: kpiColor(data.global.backlog, [50, 200], true) }}>{fmt(data.global.backlog)}</div>
          <div style={kpiLbl}>{t("backlog", lang)}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: color.gold }}>{fmt(data.global.fetched24h)}</div>
          <div style={kpiLbl}>{t("fetched24h", lang)}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: color.gold }}>{fmt(data.global.scored24h)}</div>
          <div style={kpiLbl}>{t("scored24hCron", lang)}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: kpiColor(data.global.coverage24h, [70, 90]) }}>{data.global.coverage24h}%</div>
          <div style={kpiLbl}>{t("coverage24h", lang)}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: kpiColor(data.global.avgDelayMinutes, [15, 60], true) }}>{Math.floor(data.global.avgDelayMinutes)}m{String(Math.round((data.global.avgDelayMinutes % 1) * 60)).padStart(2, "0")}s</div>
          <div style={kpiLbl}>{t("avgDelay", lang)}</div>
        </div>
      </div>

      {/* ── Topic Status ── */}
      <div style={sectionCard}>
        <h3 style={formSectionTitle}>{t("topicStatus", lang)}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Topic</th>
                <th style={thStyle}>{t("lastFetch", lang)}</th>
                <th style={thStyle}>{t("lastScore", lang)}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("backlog", lang)}</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>{lang === "fr" ? "Raison" : "Reason"}</th>
              </tr>
            </thead>
            <tbody>
              {data.topics.map((tp) => (
                <tr key={tp.id}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{tp.label}</td>
                  <td style={tdStyle}>{timeAgo(tp.lastFetchedAt)}</td>
                  <td style={tdStyle}>{timeAgo(tp.lastScoredAt)}</td>
                  <td style={{
                    ...tdStyle,
                    textAlign: "right",
                    fontWeight: 600,
                    color: tp.backlog > 200 ? "#ef4444" : tp.backlog >= 50 ? color.gold : color.text,
                  }}>{fmt(tp.backlog)}</td>
                  <td style={tdStyle}>{statusIcon(tp.status)} {statusLabel(tp.status)}</td>
                  <td style={{ ...tdStyle, color: color.textDim, fontSize: 12 }}>{reasonLabel(tp.status, tp.statusReason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Activity Timeline ── */}
      <div style={sectionCard}>
        <h3 style={formSectionTitle}>{t("activityTimeline", lang)}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>{t("hourCol", lang)}</th>
                <th style={thStyle}>{t("fetchedCol", lang)}</th>
                <th style={thStyle}>{t("scoredCol", lang)}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("coverage", lang)}</th>
                <th style={{ ...thStyle, width: "40%" }}></th>
              </tr>
            </thead>
            <tbody>
              {data.timeline.filter((row) => new Date(row.hour).getTime() <= Date.now()).map((row) => {
                const hDate = new Date(row.hour);
                const hLabel = hDate.toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
                const cov = row.fetched > 0 ? Math.round((row.scored / row.fetched) * 100) : 0;
                const fetchW = Math.max(2, (row.fetched / maxBar) * 100);
                const scoreW = Math.max(2, (row.scored / maxBar) * 100);
                return (
                  <tr key={row.hour}>
                    <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{hLabel}</td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{fmt(row.fetched)}</td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{fmt(row.scored)}</td>
                    <td style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: cov >= 90 ? "#22c55e" : cov >= 70 ? color.gold : "#ef4444",
                    }}>{cov}%</td>
                    <td style={{ ...tdStyle, padding: "6px 10px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ height: 6, width: `${fetchW}%`, background: color.gold, borderRadius: 3 }} title={`Fetched: ${row.fetched}`} />
                        <div style={{ height: 6, width: `${scoreW}%`, background: "#22c55e", borderRadius: 3 }} title={`Scored: ${row.scored}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: color.textMuted }}>
          <span><span style={{ display: "inline-block", width: 10, height: 6, background: color.gold, borderRadius: 2, marginRight: 4 }} />{t("fetchedCol", lang)}</span>
          <span><span style={{ display: "inline-block", width: 10, height: 6, background: "#22c55e", borderRadius: 2, marginRight: 4 }} />{t("scoredCol", lang)}</span>
        </div>
      </div>
    </div>
  );
}
