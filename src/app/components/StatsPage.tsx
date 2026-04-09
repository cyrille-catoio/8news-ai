"use client";

import { type CSSProperties, useState, useEffect, useRef } from "react";
import type { StatsResponse, TopicLabel } from "@/lib/types";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, scoreClr, hitClr, covClr, spinnerStyle, sectionCard, formSectionTitle } from "@/lib/theme";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";

const TIER_COLORS: Record<string, string> = {
  "9-10": "#22c55e",
  "7-8": "#c9a227",
  "5-6": "#eab308",
  "3-4": "#f97316",
  "1-2": "#ef4444",
};

function heatmapBg(pct: number, tier: string): string | undefined {
  if (pct <= 0) return undefined;
  const hex = TIER_COLORS[tier] || "#666";
  const r = parseInt(hex.slice(1, 3), 16);
  const gr = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Math.min(0.6, 0.1 + (pct / 100) * 0.5);
  return `rgba(${r},${gr},${b},${a})`;
}

type TopicCompSortKey =
  | "topic"
  | "total"
  | "scored"
  | "pctScored"
  | "avgScore"
  | "hitRate"
  | "totalFeeds"
  | "activeSources";

export function StatsPage({ lang, topics }: { lang: Lang; topics: TopicLabel[] }) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statsTopic, setStatsTopic] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState("avgScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tcSortKey, setTcSortKey] = useState<TopicCompSortKey>("total");
  const [tcSortDir, setTcSortDir] = useState<"asc" | "desc">("desc");
  const [visibleArticleCount, setVisibleArticleCount] = useState(50);
  const cache = useRef<Record<string, StatsResponse>>({});
  const locale = dateLocale(lang);

  const isHome = statsTopic === null;
  const hasSelection = statsTopic !== null && days !== null;

  useEffect(() => {
    if (statsTopic !== null && days === null) return;
    setVisibleArticleCount(50);

    const isInitial = statsTopic === null;
    const topic = statsTopic ?? "all";
    const d = days ?? 0;
    const key = isInitial ? "_kpi_" : `${topic}:${d}`;
    if (cache.current[key]) {
      setData(cache.current[key]);
      setErr(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    const url = isInitial
      ? "/api/stats?kpi_only=1"
      : `/api/stats?topic=${topic}&days=${d === -1 ? (Date.now() - new Date().setHours(0, 0, 0, 0)) / 86_400_000 : d}`;
    fetch(url, { signal: ac.signal, cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json: StatsResponse) => {
        if (ac.signal.aborted) return;
        cache.current[key] = json;
        setData(json);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!ac.signal.aborted) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [statsTopic, days]);

  const fmt = (n: number) => n.toLocaleString(locale);

  const topicLabel = (tp: string) => {
    const found = topics.find((item) => item.id === tp);
    return found ? found.label : tp;
  };

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortArrow = (key: string) => (key === sortKey ? (sortDir === "desc" ? " ▼" : " ▲") : "");

  const handleTcSort = (key: TopicCompSortKey) => {
    if (key === tcSortKey) setTcSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setTcSortKey(key);
      setTcSortDir(key === "topic" ? "asc" : "desc");
    }
  };
  const tcSortArrow = (key: TopicCompSortKey) =>
    key === tcSortKey ? (tcSortDir === "desc" ? " ▼" : " ▲") : "";

  // ── Shared styles ──
  const kpiCard: CSSProperties = { background: color.surface, border: `1px solid ${color.border}`, borderRadius: 8, padding: "10px 6px", textAlign: "center" };
  const kpiVal: CSSProperties = { fontSize: 17, fontWeight: 700, color: color.gold };
  const kpiLbl: CSSProperties = { fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: color.textMuted, marginTop: 2 };
  const periodOpts = [
    { label: t("allTime", lang), value: 0 },
    { label: t("last1h", lang), value: 1 / 24 },
    { label: t("last3h", lang), value: 3 / 24 },
    { label: t("last6h", lang), value: 6 / 24 },
    { label: t("today", lang), value: -1 },
    { label: t("yesterday", lang), value: 1 },
    { label: t("last3d", lang), value: 3 },
    { label: t("last7d", lang), value: 7 },
    { label: t("last30d", lang), value: 30 },
  ];

  // ── Loading ──
  if (loading && !data) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <span style={spinnerStyle(28)} />
        <p style={{ color: color.textMuted, fontSize: 14, marginTop: 12 }}>
          {lang === "fr" ? "Chargement des statistiques…" : "Loading statistics…"}
        </p>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <p style={{ color: color.errorText, fontSize: 15 }}>{err}</p>
      </div>
    );
  }

  const g = data?.global;
  const scoreDistribution = data?.scoreDistribution ?? [];
  const feedRanking = data?.feedRanking ?? [];
  const topArticles = data?.topArticles ?? [];
  const topicComparison = data?.topicComparison ?? [];
  const maxPct = Math.max(...scoreDistribution.map((d) => d.pct), 1);

  const sorted = [...feedRanking].sort((a, b) => {
    const va = (a as Record<string, unknown>)[sortKey] as number;
    const vb = (b as Record<string, unknown>)[sortKey] as number;
    return sortDir === "desc" ? vb - va : va - vb;
  });

  const sortedTopicComparison = [...topicComparison].sort((a, b) => {
    const lbl = (tp: string) => topics.find((item) => item.id === tp)?.label ?? tp;
    let cmp = 0;
    switch (tcSortKey) {
      case "topic":
        cmp = lbl(a.topic).localeCompare(lbl(b.topic), locale, { sensitivity: "base" });
        break;
      case "total":
        cmp = a.total - b.total;
        break;
      case "scored":
        cmp = a.scored - b.scored;
        break;
      case "pctScored":
        cmp = a.pctScored - b.pctScored;
        break;
      case "avgScore":
        cmp = a.avgScore - b.avgScore;
        break;
      case "hitRate":
        cmp = a.hitRate - b.hitRate;
        break;
      case "totalFeeds":
        cmp = a.totalFeeds - b.totalFeeds;
        break;
      case "activeSources":
        cmp = a.activeSources - b.activeSources;
        break;
      default:
        break;
    }
    return tcSortDir === "desc" ? -cmp : cmp;
  });

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 20, marginTop: 0 }}>
        {t("statsTitle", lang)}
      </h2>

      {/* ── Topic Selector ───────────────────────── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${color.border}`, flexWrap: "wrap" }}>
        <button
          onClick={() => setStatsTopic("all")}
          style={{
            padding: "7px 12px", fontSize: 12, fontWeight: 600, border: "none",
            borderBottom: statsTopic === "all" ? `2px solid ${color.gold}` : "2px solid transparent",
            background: "transparent", color: statsTopic === "all" ? color.gold : color.textMuted,
            cursor: statsTopic === "all" ? "default" : "pointer", transition: "all 0.15s",
          }}
        >
          {t("allTopics", lang)}
        </button>
        {topics.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setStatsTopic(id)}
            style={{
              padding: "7px 12px", fontSize: 12, fontWeight: 600, border: "none",
              borderBottom: statsTopic === id ? `2px solid ${color.gold}` : "2px solid transparent",
              background: "transparent", color: statsTopic === id ? color.gold : color.textMuted,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Period filter ────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {periodOpts.map((o) => (
          <button
            key={o.value}
            onClick={() => setDays(o.value)}
            style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: `1px solid ${days === o.value ? color.gold : color.border}`,
              background: days === o.value ? color.gold : "transparent",
              color: days === o.value ? "#000" : color.textMuted,
              cursor: days === o.value ? "default" : "pointer", transition: "all 0.15s",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* ── Data sections (dim when refreshing) ── */}
      <div style={{ position: "relative", transition: "opacity 0.25s", opacity: loading ? 0.3 : 1, pointerEvents: loading ? "none" : "auto" }}>

      {loading && (
        <div style={{ position: "absolute", top: 60, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 5 }}>
          <span style={spinnerStyle(24)} />
        </div>
      )}

      {/* ── KPIs (home only) ───────────────────────── */}
      {isHome && g && (
        <div className="s-kpi5">
          <div style={kpiCard}><div style={kpiVal}>{fmt(g.totalArticles)}</div><div style={kpiLbl}>{t("totalArticles", lang)}</div></div>
          <div style={kpiCard}><div style={kpiVal}>{fmt(g.scoredArticles)}</div><div style={kpiLbl}>{t("scoredArticles", lang)}</div></div>
          <div style={kpiCard}><div style={{ ...kpiVal, color: covClr(g.pctScored) }}>{g.pctScored}%</div><div style={kpiLbl}>{t("coverage", lang)}</div></div>
          <div style={kpiCard}><div style={{ ...kpiVal, color: scoreClr(g.avgScore) }}>{g.avgScore}</div><div style={kpiLbl}>{t("avgScore", lang)}</div></div>
          <div style={kpiCard}><div style={kpiVal}>{g.hitRate}%</div><div style={kpiLbl}>Score ≥ 7</div></div>
        </div>
      )}

      {isHome && (
        <p style={{ color: color.textMuted, fontSize: 14, textAlign: "center", margin: "30px 0" }}>
          {lang === "fr" ? "Sélectionnez un topic et une période pour afficher les statistiques détaillées." : "Select a topic and a period to display detailed statistics."}
        </p>
      )}

      {statsTopic !== null && days === null && (
        <p style={{ color: color.textMuted, fontSize: 14, textAlign: "center", margin: "30px 0" }}>
          {lang === "fr" ? "Sélectionnez une période pour lancer le calcul." : "Select a period to start the analysis."}
        </p>
      )}

      {hasSelection && g && <>
      {/* ── KPIs (filtered) ──────────────────────── */}
      <div className="s-kpi5">
        <div style={kpiCard}><div style={kpiVal}>{fmt(g.totalArticles)}</div><div style={kpiLbl}>{t("totalArticles", lang)}</div></div>
        <div style={kpiCard}><div style={kpiVal}>{fmt(g.scoredArticles)}</div><div style={kpiLbl}>{t("scoredArticles", lang)}</div></div>
        <div style={kpiCard}><div style={{ ...kpiVal, color: covClr(g.pctScored) }}>{g.pctScored}%</div><div style={kpiLbl}>{t("coverage", lang)}</div></div>
        <div style={kpiCard}><div style={{ ...kpiVal, color: scoreClr(g.avgScore) }}>{g.avgScore}</div><div style={kpiLbl}>{t("avgScore", lang)}</div></div>
        <div style={kpiCard}><div style={kpiVal}>{g.hitRate}%</div><div style={kpiLbl}>Score ≥ 7</div></div>
      </div>

      {/* ── Score Distribution ────────────────────── */}
      <div style={sectionCard}>
        <h4 style={formSectionTitle}>{t("scoreDistrib", lang)}</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scoreDistribution.map((d) => (
            <div key={d.tier} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 36, fontSize: 13, fontWeight: 600, color: TIER_COLORS[d.tier], textAlign: "right", flexShrink: 0 }}>{d.tier}</span>
              <div style={{ flex: 1, height: 24, background: color.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, background: TIER_COLORS[d.tier], width: `${(d.pct / maxPct) * 100}%`, transition: "width 0.4s ease-out" }} />
              </div>
              <span style={{ width: 44, fontSize: 12, color: color.textMuted, textAlign: "right", flexShrink: 0 }}>{d.pct}%</span>
              <span style={{ width: 60, fontSize: 11, color: color.textDim, textAlign: "right", flexShrink: 0 }}>({fmt(d.count)})</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Topic Comparison (All only) ──────────── */}
      {(statsTopic === "all" || statsTopic === null) && topicComparison.length > 0 && (
        <div style={sectionCard}>
          <h4 style={formSectionTitle}>{t("topicComparison", lang)}</h4>
          <div className="s-tw">
            <table className="s-tb">
              <thead>
                <tr>
                  <th className="sc" onClick={() => handleTcSort("topic")}>
                    Topic{tcSortArrow("topic")}
                  </th>
                  <th className="sc" onClick={() => handleTcSort("total")}>
                    {t("total", lang)}{tcSortArrow("total")}
                  </th>
                  <th className="sc" onClick={() => handleTcSort("scored")}>
                    {t("scored", lang)}{tcSortArrow("scored")}
                  </th>
                  <th className="sc" onClick={() => handleTcSort("pctScored")}>
                    {t("coverage", lang)}{tcSortArrow("pctScored")}
                  </th>
                  <th className="sc" onClick={() => handleTcSort("avgScore")}>
                    {t("avgScore", lang)}{tcSortArrow("avgScore")}
                  </th>
                  <th className="sc" onClick={() => handleTcSort("hitRate")}>
                    Score ≥ 7{tcSortArrow("hitRate")}
                  </th>
                  <th className="sc" onClick={() => handleTcSort("totalFeeds")}>
                    {t("feeds", lang)}{tcSortArrow("totalFeeds")}
                  </th>
                  <th className="sc" onClick={() => handleTcSort("activeSources")}>
                    {t("activeFeeds", lang)} ({lang === "fr" ? "7j" : "7d"}){tcSortArrow("activeSources")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTopicComparison.map((tc) => (
                  <tr key={tc.topic}>
                    <td style={{ fontWeight: 500, color: color.gold }}>{topicLabel(tc.topic)}</td>
                    <td>{fmt(tc.total)}</td>
                    <td>{fmt(tc.scored)}</td>
                    <td style={{ color: covClr(tc.pctScored) }}>{tc.pctScored}%</td>
                    <td style={{ fontWeight: 700, color: scoreClr(tc.avgScore) }}>{tc.avgScore}</td>
                    <td style={{ color: hitClr(tc.hitRate), fontWeight: 600 }}>{tc.hitRate}%</td>
                    <td>{tc.totalFeeds}</td>
                    <td>{tc.activeSources}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Feed Ranking Table ────────────────────── */}
      <div style={sectionCard}>
        <h4 style={formSectionTitle}>{t("feedRanking", lang)}</h4>
        {sorted.length === 0 ? (
          <p style={{ color: color.textDim, fontSize: 14, margin: 0 }}>—</p>
        ) : (
          <div className="s-tw">
            <table className="s-tb">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="col-src">{t("source", lang)}</th>
                  {(statsTopic === "all" || statsTopic === null) && <th>Topic</th>}
                  <th className="sc" onClick={() => handleSort("total")}>{t("total", lang)}{sortArrow("total")}</th>
                  <th className="sc" onClick={() => handleSort("scored")}>{t("scored", lang)}{sortArrow("scored")}</th>
                  <th className="sc" onClick={() => handleSort("avgScore")}>{t("average", lang)}{sortArrow("avgScore")}</th>
                  <th className="sc" onClick={() => handleSort("hitRate")}>≥ 7{sortArrow("hitRate")}</th>
                  <th className="sc" onClick={() => handleSort("pct9_10")}>9-10{sortArrow("pct9_10")}</th>
                  <th className="sc" onClick={() => handleSort("pct7_8")}>7-8{sortArrow("pct7_8")}</th>
                  <th>5-6</th>
                  <th>3-4</th>
                  <th>1-2</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => (
                  <tr key={`${f.source}\0${f.topic}`}>
                    <td style={{ color: color.textDim, fontSize: 11 }}>{i + 1}</td>
                    <td
                      className="col-src"
                      title={f.source}
                      style={{ fontWeight: 500, color: color.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {f.sourceUrl ? (
                        <a
                          href={f.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: color.text, textDecoration: "none" }}
                        >
                          {f.source}
                        </a>
                      ) : (
                        f.source
                      )}
                    </td>
                    {(statsTopic === "all" || statsTopic === null) && <td style={{ color: color.textMuted, fontSize: 12 }}>{topicLabel(f.topic)}</td>}
                    <td>{fmt(f.total)}</td>
                    <td>{fmt(f.scored)}</td>
                    <td style={{ fontWeight: 700, color: scoreClr(f.avgScore) }}>
                      {f.avgScore}
                      <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: scoreClr(f.avgScore), width: `${(f.avgScore / 10) * 100}%`, opacity: 0.5 }} />
                    </td>
                    <td style={{ color: hitClr(f.hitRate), fontWeight: 600 }}>{f.hitRate}%</td>
                    <td style={{ background: heatmapBg(f.pct9_10, "9-10"), textAlign: "center", borderRadius: 3 }}>{f.pct9_10 > 0 ? `${f.pct9_10}%` : "—"}</td>
                    <td style={{ background: heatmapBg(f.pct7_8, "7-8"), textAlign: "center", borderRadius: 3 }}>{f.pct7_8 > 0 ? `${f.pct7_8}%` : "—"}</td>
                    <td style={{ background: heatmapBg(f.pct5_6, "5-6"), textAlign: "center", borderRadius: 3 }}>{f.pct5_6 > 0 ? `${f.pct5_6}%` : "—"}</td>
                    <td style={{ background: heatmapBg(f.pct3_4, "3-4"), textAlign: "center", borderRadius: 3 }}>{f.pct3_4 > 0 ? `${f.pct3_4}%` : "—"}</td>
                    <td style={{ background: heatmapBg(f.pct1_2, "1-2"), textAlign: "center", borderRadius: 3 }}>{f.pct1_2 > 0 ? `${f.pct1_2}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Article Ranking ─────────────────────── */}
      <div style={sectionCard}>
        <h4 style={formSectionTitle}>{t("topArticles", lang)}</h4>
        {topArticles.length === 0 ? (
          <p style={{ color: color.textDim, fontSize: 14, margin: 0 }}>—</p>
        ) : (<>
          {topArticles.slice(0, visibleArticleCount).map((a, i) => (
            <div
              key={`${a.link}-${i}`}
              style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "10px 0",
                borderBottom: i < Math.min(visibleArticleCount, topArticles.length) - 1 ? `1px solid ${color.border}` : "none",
              }}
            >
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 4,
                fontSize: 13, fontWeight: 700, color: "#000", flexShrink: 0,
                background: a.score >= 9 ? "#22c55e" : a.score >= 7 ? color.gold : a.score >= 5 ? "#eab308" : "#f97316",
              }}>
                {a.score}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={a.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ color: color.text, fontWeight: 500, fontSize: 14 }}>{a.title}</div>
                </a>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
                  <span style={{ color: color.textMuted, fontSize: 12 }}>
                    {a.source} · {new Date(a.pubDate).toLocaleDateString(locale)}
                  </span>
                  <CopyLinkButton url={a.link} />
                </div>
                {a.reason && (
                  <div style={{ color: color.textDim, fontSize: 12, marginTop: 2, whiteSpace: "normal" }}>
                    {a.reason.length > 80 ? `${a.reason.slice(0, 80)}…` : a.reason}
                  </div>
                )}
              </div>
            </div>
          ))}
          {visibleArticleCount < topArticles.length && (
            <div style={{ textAlign: "center", paddingTop: 16 }}>
              <button
                onClick={() => setVisibleArticleCount((c) => c + 50)}
                style={{
                  padding: "8px 24px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                  border: `1px solid ${color.gold}`, background: "transparent", color: color.gold,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {lang === "fr"
                  ? `Afficher 50 de plus (${Math.min(visibleArticleCount, topArticles.length)}/${topArticles.length})`
                  : `Show 50 more (${Math.min(visibleArticleCount, topArticles.length)}/${topArticles.length})`}
              </button>
            </div>
          )}
          {visibleArticleCount >= topArticles.length && topArticles.length > 50 && (
            <p style={{ color: color.textDim, fontSize: 12, textAlign: "center", margin: "12px 0 0" }}>
              {lang === "fr" ? `${topArticles.length} articles affichés` : `${topArticles.length} articles displayed`}
            </p>
          )}
        </>)}
      </div>

      </>}

      </div>{/* end filtered sections wrapper */}
    </div>
  );
}
