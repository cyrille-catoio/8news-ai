"use client";

import { type CSSProperties, useState, useEffect, useRef, useMemo } from "react";
import type { FeedAdminRow, TopicLabel } from "@/lib/types";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, scoreClr, hitClr, covClr, spinnerStyle } from "@/lib/theme";

function feedAdminCoveragePct(row: FeedAdminRow): number | null {
  if (row.totalArticles === 0) return null;
  return Math.round((row.scoredArticles / row.totalArticles) * 1000) / 10;
}

type FeedsAdminSortKey =
  | "topicId"
  | "totalArticles"
  | "scoredArticles"
  | "coverage"
  | "avgScore"
  | "hitRateGte7";

export function FeedsAdminPage({ lang, topics }: { lang: Lang; topics: TopicLabel[] }) {
  const [filter, setFilter] = useState<"all" | string>("all");
  const [rows, setRows] = useState<FeedAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [sortKey, setSortKey] = useState<FeedsAdminSortKey>("topicId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [feedsToast, setFeedsToast] = useState<{
    variant: "loading" | "success" | "error" | "info";
    message: string;
  } | null>(null);
  const feedsToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locale = dateLocale(lang);

  const topicLabel = (id: string) => topics.find((x) => x.id === id)?.label ?? id;

  const clearFeedsToastTimer = () => {
    if (feedsToastTimerRef.current) {
      clearTimeout(feedsToastTimerRef.current);
      feedsToastTimerRef.current = null;
    }
  };

  const showFeedsToast = (
    next: { variant: "loading" | "success" | "error" | "info"; message: string } | null,
    autoHideMs?: number,
  ) => {
    clearFeedsToastTimer();
    setFeedsToast(next);
    if (next && next.variant !== "loading" && autoHideMs != null && autoHideMs > 0) {
      feedsToastTimerRef.current = setTimeout(() => {
        setFeedsToast(null);
        feedsToastTimerRef.current = null;
      }, autoHideMs);
    }
  };

  useEffect(() => () => clearFeedsToastTimer(), []);

  const sortedRows = useMemo(() => {
    const label = (id: string) => topics.find((x) => x.id === id)?.label ?? id;
    const list = [...rows];
    list.sort((a, b) => {
      if (sortKey === "avgScore") {
        const na = a.avgScore;
        const nb = b.avgScore;
        if (na == null && nb == null) return 0;
        if (na == null) return 1;
        if (nb == null) return -1;
        const d = na - nb;
        return sortDir === "asc" ? d : -d;
      }

      if (sortKey === "coverage") {
        const pa = feedAdminCoveragePct(a);
        const pb = feedAdminCoveragePct(b);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        const d = pa - pb;
        return sortDir === "asc" ? d : -d;
      }

      let cmp = 0;
      switch (sortKey) {
        case "topicId": {
          cmp = label(a.topicId).localeCompare(label(b.topicId), locale, {
            sensitivity: "base",
          });
          if (cmp === 0) cmp = a.source.localeCompare(b.source);
          break;
        }
        case "totalArticles":
          cmp = a.totalArticles - b.totalArticles;
          break;
        case "scoredArticles":
          cmp = a.scoredArticles - b.scoredArticles;
          break;
        case "hitRateGte7":
          cmp = a.hitRateGte7 - b.hitRateGte7;
          if (cmp === 0) cmp = a.scoredArticles - b.scoredArticles;
          break;
        default:
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, sortKey, sortDir, locale, topics]);

  const handleFeedsSort = (key: FeedsAdminSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "topicId" ? "asc" : "desc");
    }
  };

  const feedsSortArrow = (key: FeedsAdminSortKey) =>
    key === sortKey ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  useEffect(() => {
    setRows([]);
  }, [filter]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    fetch(`/api/feeds-admin?topic=${encodeURIComponent(filter)}`, {
      signal: ac.signal,
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { feeds: FeedAdminRow[] }) => {
        if (ac.signal.aborted) return;
        setRows(json.feeds ?? []);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!ac.signal.aborted) {
          setErr(e instanceof Error ? e.message : String(e));
          setRows([]);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [filter, refresh]);

  const bump = () => setRefresh((n) => n + 1);

  const confirmFeed = (source: string) =>
    t("feedsAdminDeleteFeedConfirm", lang).replace("{source}", source);

  const confirmArticles = (source: string) =>
    t("feedsAdminDeleteArticlesConfirm", lang).replace("{source}", source);

  async function handleDeleteFeed(row: FeedAdminRow) {
    if (!window.confirm(confirmFeed(row.source))) return;
    showFeedsToast({ variant: "loading", message: t("feedsAdminToastLoadingDeleteFeed", lang) });
    setBusyId(row.id);
    try {
      const r = await fetch(`/api/topics/${row.topicId}/feeds/${row.id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error();
      setRows((prev) => prev.filter((x) => x.id !== row.id));
      showFeedsToast({ variant: "success", message: t("feedsAdminToastSuccessFeedRemoved", lang) }, 3800);
    } catch {
      showFeedsToast(
        {
          variant: "error",
          message: lang === "fr" ? "Échec de la suppression du flux." : "Could not remove feed.",
        },
        5200,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteArticles(row: FeedAdminRow) {
    if (!window.confirm(confirmArticles(row.source))) return;
    showFeedsToast({ variant: "loading", message: t("feedsAdminToastLoadingDeleteArticles", lang) });
    setBusyId(row.id);
    try {
      const r = await fetch(`/api/topics/${row.topicId}/feeds/${row.id}/articles`, {
        method: "DELETE",
      });
      const j = (await r.json()) as { deleted?: number; error?: string };
      if (!r.ok) throw new Error(j.error);
      bump();
      const n = typeof j.deleted === "number" ? j.deleted : 0;
      showFeedsToast(
        {
          variant: "success",
          message: t("feedsAdminToastSuccessArticlesRemoved", lang).replace("{n}", String(n)),
        },
        3800,
      );
    } catch {
      showFeedsToast(
        {
          variant: "error",
          message:
            lang === "fr"
              ? "Échec de la suppression des articles."
              : "Could not delete articles.",
        },
        5200,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleScoreFeed(row: FeedAdminRow) {
    showFeedsToast({ variant: "loading", message: t("feedsAdminToastLoadingScore", lang) });
    setBusyId(row.id);
    try {
      const r = await fetch(`/api/topics/${row.topicId}/feeds/${row.id}/score`, {
        method: "POST",
      });
      const j = (await r.json()) as {
        scored?: number;
        candidates?: number;
        error?: string;
      };
      if (!r.ok) {
        showFeedsToast(
          { variant: "error", message: j.error || t("feedsAdminScoreFeedError", lang) },
          5200,
        );
        return;
      }
      bump();
      if ((j.candidates ?? 0) === 0) {
        showFeedsToast({ variant: "info", message: t("feedsAdminScoreFeedNone", lang) }, 4500);
      } else if ((j.scored ?? 0) > 0) {
        showFeedsToast(
          {
            variant: "success",
            message: t("feedsAdminScoreFeedDone", lang).replace("{n}", String(j.scored)),
          },
          3800,
        );
      } else {
        showFeedsToast({ variant: "error", message: t("feedsAdminScoreFeedError", lang) }, 5200);
      }
    } catch {
      showFeedsToast({ variant: "error", message: t("feedsAdminScoreFeedError", lang) }, 5200);
    } finally {
      setBusyId(null);
    }
  }

  const pill = (active: boolean, onClick: () => void, label: string, listKey: string) => (
    <button
      key={listKey}
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 6,
        border: `1px solid ${color.gold}`,
        cursor: "pointer",
        background: active ? color.gold : "transparent",
        color: active ? "#000" : color.gold,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  const iconBtn: CSSProperties = {
    padding: 6,
    border: "none",
    background: "transparent",
    color: color.textMuted,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    verticalAlign: "middle",
  };

  return (
    <div>
      {feedsToast && (
        <div
          role={feedsToast.variant === "loading" ? "status" : "alert"}
          aria-live="polite"
          aria-busy={feedsToast.variant === "loading"}
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10050,
            maxWidth: "min(92vw, 420px)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderRadius: 10,
            fontSize: 14,
            lineHeight: 1.35,
            fontWeight: 500,
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            border: `1px solid ${
              feedsToast.variant === "error"
                ? color.errorBorder
                : feedsToast.variant === "info"
                  ? color.border
                  : color.gold
            }`,
            background: color.surface,
            color:
              feedsToast.variant === "error"
                ? color.errorText
                : feedsToast.variant === "info"
                  ? color.textMuted
                  : color.text,
          }}
        >
          {feedsToast.variant === "loading" && (
            <span style={spinnerStyle(22, { flexShrink: 0 })} />
          )}
          {feedsToast.variant === "success" && (
            <span style={{ color: "#4ade80", flexShrink: 0, fontSize: 18, fontWeight: 700 }}>✓</span>
          )}
          {feedsToast.variant === "error" && (
            <span style={{ flexShrink: 0, fontSize: 18, fontWeight: 700 }}>!</span>
          )}
          {feedsToast.variant === "info" && (
            <span style={{ color: color.gold, flexShrink: 0, fontSize: 16, fontWeight: 700 }}>i</span>
          )}
          <span style={{ flex: 1, minWidth: 0 }}>{feedsToast.message}</span>
        </div>
      )}

      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>
        {t("feedsAdminTitle", lang)}
      </h2>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 20,
          alignItems: "center",
        }}
      >
        {pill(filter === "all", () => setFilter("all"), t("allTopics", lang), "__all__")}
        {topics.map((tp) =>
          pill(filter === tp.id, () => setFilter(tp.id), tp.label, tp.id),
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div style={{ padding: "60px 0", textAlign: "center" }}>
          <span style={spinnerStyle(28)} />
          <p style={{ color: color.textMuted, fontSize: 14, marginTop: 12 }}>{t("feedsAdminLoading", lang)}</p>
        </div>
      ) : err ? (
        <p style={{ color: color.errorText, fontSize: 14 }}>{err}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: color.textDim, fontSize: 14 }}>—</p>
      ) : (
        <div className="fa-tw">
          <table className="fa-tb">
            <thead>
              <tr>
                <th>{t("source", lang)}</th>
                <th className="fa-sc" onClick={() => handleFeedsSort("topicId")}>
                  {t("feedsAdminColTopic", lang)}
                  {feedsSortArrow("topicId")}
                </th>
                <th>{t("feedsAdminCreatedAt", lang)}</th>
                <th className="fa-sc" onClick={() => handleFeedsSort("totalArticles")}>
                  {t("feedsAdminColArticles", lang)}
                  {feedsSortArrow("totalArticles")}
                </th>
                <th className="fa-sc" onClick={() => handleFeedsSort("scoredArticles")}>
                  {t("scoredArticles", lang)}
                  {feedsSortArrow("scoredArticles")}
                </th>
                <th className="fa-sc" onClick={() => handleFeedsSort("coverage")}>
                  {t("coverage", lang)}
                  {feedsSortArrow("coverage")}
                </th>
                <th className="fa-sc" onClick={() => handleFeedsSort("avgScore")}>
                  {t("avgScore", lang)}
                  {feedsSortArrow("avgScore")}
                </th>
                <th className="fa-sc" onClick={() => handleFeedsSort("hitRateGte7")}>
                  {t("hitRate", lang)}
                  {feedsSortArrow("hitRateGte7")}
                </th>
                <th>{t("feedsAdminActions", lang)}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const covPct = feedAdminCoveragePct(row);
                return (
                <tr key={row.id}>
                  <td className="fa-src" title={row.source}>
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: color.text, textDecoration: "none", fontWeight: 500 }}
                    >
                      {row.source}
                    </a>
                    {!row.isActive && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: color.textDim, fontWeight: 600 }}>
                        ({t("feedsAdminInactive", lang)})
                      </span>
                    )}
                  </td>
                  <td style={{ color: color.textMuted, fontSize: 12 }}>{topicLabel(row.topicId)}</td>
                  <td style={{ color: color.textDim, fontSize: 12, whiteSpace: "nowrap" }} title={row.createdAt}>
                    {Number.isNaN(new Date(row.createdAt).getTime())
                      ? "—"
                      : new Date(row.createdAt).toLocaleDateString(locale, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                  </td>
                  <td>{row.totalArticles.toLocaleString(locale)}</td>
                  <td>{row.scoredArticles.toLocaleString(locale)}</td>
                  <td
                    style={{
                      fontWeight: 600,
                      color: covPct != null ? covClr(covPct) : color.textDim,
                    }}
                  >
                    {covPct != null
                      ? `${covPct.toLocaleString(locale, { maximumFractionDigits: 1 })}%`
                      : "—"}
                  </td>
                  <td style={{ fontWeight: 600, color: row.avgScore != null ? scoreClr(row.avgScore) : color.textDim }}>
                    {row.avgScore != null ? row.avgScore : "—"}
                  </td>
                  <td style={{ color: row.scoredArticles > 0 ? hitClr(row.hitRateGte7) : color.textDim, fontWeight: 600 }}>
                    {row.scoredArticles > 0 ? `${row.hitRateGte7}%` : "—"}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      aria-label={t("feedsAdminScoreFeed", lang)}
                      title={t("feedsAdminScoreFeed", lang)}
                      disabled={busyId === row.id}
                      onClick={() => handleScoreFeed(row)}
                      style={{
                        ...iconBtn,
                        color: color.gold,
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.1L12 17.8 5.8 21l2.4-7.1L2 9.4h7.6L12 2z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={t("feedsAdminDeleteArticles", lang)}
                      title={t("feedsAdminDeleteArticles", lang)}
                      disabled={busyId === row.id || row.totalArticles === 0}
                      onClick={() => handleDeleteArticles(row)}
                      style={{
                        ...iconBtn,
                        marginLeft: 4,
                        opacity: row.totalArticles === 0 ? 0.35 : 1,
                        cursor: row.totalArticles === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="9" y1="15" x2="15" y2="9" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={t("feedsAdminDeleteFeed", lang)}
                      title={t("feedsAdminDeleteFeed", lang)}
                      disabled={busyId === row.id}
                      onClick={() => handleDeleteFeed(row)}
                      style={{ ...iconBtn, marginLeft: 4, color: "#f87171" }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
