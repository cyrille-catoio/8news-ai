"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { color, formInputStyle, spinnerStyle } from "@/lib/theme";
import { type Lang, dateLocale } from "@/lib/i18n";
import type { TopicItem } from "@/lib/types";
import type { ArchivesPayload } from "@/lib/supabase/archives";
import { toUtcDateString } from "@/lib/dates-utc";
import { ArchivesTimeline } from "./ArchivesTimeline";

/**
 * Client orchestrator for the unified `/archives` hub.
 *
 * The component owns the browsing state only: topic filter, media type
 * filter and 7-day window pagination. Per-item paths are composed in
 * `ArchivesTimeline` and intentionally remain the current SEO routes.
 */

const DAY_MS = 86_400_000;
const PAGE_DAYS = 7;
const MAX_WEEKS_BACK = 12;

type TypeFilter = "all" | "articles" | "videos";

export interface ArchivesPageProps {
  lang: Lang;
  topics: TopicItem[];
  initialData?: ArchivesPayload;
}

const toIso = toUtcDateString;

function countStats(data: ArchivesPayload | null) {
  let topicRows = 0;
  let articleSummaries = 0;
  let videoRecaps = 0;
  let transcribedVideos = 0;
  let topSummaries = 0;

  for (const day of data?.days ?? []) {
    if (day.hasTopSummary) topSummaries += 1;
    for (const row of day.topics) {
      topicRows += 1;
      if (row.dailySummary) articleSummaries += 1;
      if (row.videoRoundup) videoRecaps += 1;
      transcribedVideos += row.transcribedVideoCount;
    }
  }

  return {
    days: data?.days.length ?? 0,
    topicRows,
    articleSummaries,
    videoRecaps,
    transcribedVideos,
    topSummaries,
  };
}

export function ArchivesPage({ lang, topics, initialData }: ArchivesPageProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [windowEnd, setWindowEnd] = useState<Date>(() => today);
  const [topicFilter, setTopicFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const [data, setData] = useState<ArchivesPayload | null>(initialData ?? null);
  const [loading, setLoading] = useState<boolean>(initialData == null);
  const [error, setError] = useState<string | null>(null);

  const fromDate = useMemo(
    () => new Date(windowEnd.getTime() - (PAGE_DAYS - 1) * DAY_MS),
    [windowEnd],
  );
  const fromIso = toIso(fromDate);
  const toIsoStr = toIso(windowEnd);

  const oldestAllowed = useMemo(
    () => new Date(today.getTime() - MAX_WEEKS_BACK * 7 * DAY_MS),
    [today],
  );

  const topicOptions = useMemo(
    () => [...topics].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [topics],
  );

  const selectedTopicLabel = useMemo(() => {
    if (!topicFilter) return lang === "fr" ? "Tous les topics" : "All topics";
    const topic = topicOptions.find((tp) => tp.id === topicFilter);
    return topic ? (lang === "fr" ? topic.labelFr : topic.labelEn) : topicFilter;
  }, [lang, topicFilter, topicOptions]);

  const fetchArchives = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        lang,
        from: fromIso,
        to: toIsoStr,
      });
      if (topicFilter) params.set("topic", topicFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      try {
        const res = await fetch(`/api/archives?${params.toString()}`, {
          cache: "no-store",
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData((await res.json()) as ArchivesPayload);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed");
      } finally {
        setLoading(false);
      }
    },
    [lang, fromIso, toIsoStr, topicFilter, typeFilter],
  );

  useEffect(() => {
    const isDefaultWindow =
      windowEnd.getTime() === today.getTime() && !topicFilter && typeFilter === "all";
    if (initialData && isDefaultWindow) {
      setData(initialData);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    fetchArchives(controller.signal);
    return () => controller.abort();
  }, [fetchArchives, initialData, windowEnd, today, topicFilter, typeFilter]);

  const canGoOlder = fromDate.getTime() > oldestAllowed.getTime();
  const canGoNewer = windowEnd.getTime() < today.getTime();

  const handleOlder = useCallback(() => {
    setWindowEnd((prev) => {
      const next = new Date(prev.getTime() - PAGE_DAYS * DAY_MS);
      const oldestEnd = new Date(oldestAllowed.getTime() + (PAGE_DAYS - 1) * DAY_MS);
      return next.getTime() < oldestEnd.getTime() ? oldestEnd : next;
    });
  }, [oldestAllowed]);

  const handleNewer = useCallback(() => {
    setWindowEnd((prev) => {
      const next = new Date(prev.getTime() + PAGE_DAYS * DAY_MS);
      return next.getTime() > today.getTime() ? today : next;
    });
  }, [today]);

  const locale = dateLocale(lang);
  const rangeLabel = useMemo(() => {
    const fromLabel = fromDate.toLocaleDateString(locale, { day: "numeric", month: "short" });
    const toLabel = windowEnd.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${fromLabel} -> ${toLabel}`;
  }, [fromDate, windowEnd, locale]);

  const stats = useMemo(() => countStats(data), [data]);

  const typeTabs: Array<{ value: TypeFilter; label: string }> = [
    { value: "all", label: lang === "fr" ? "Tout" : "All" },
    { value: "articles", label: lang === "fr" ? "Articles" : "Articles" },
    { value: "videos", label: lang === "fr" ? "Vidéos" : "Videos" },
  ];

  const compactSelectStyle: CSSProperties = {
    ...formInputStyle,
    minHeight: 38,
    fontSize: 13,
    padding: "7px 9px",
    background: "#090909",
  };

  const metricItems = useMemo(() => {
    const items: Array<{ value: number; label: string }> = [
      { value: stats.days, label: lang === "fr" ? "jours" : "days" },
      { value: stats.topicRows, label: lang === "fr" ? "topics" : "topics" },
      { value: stats.articleSummaries + stats.topSummaries, label: lang === "fr" ? "résumés articles" : "article briefs" },
      { value: stats.videoRecaps + stats.transcribedVideos, label: lang === "fr" ? "entrées vidéo" : "video entries" },
    ];
    return items.filter((it) => it.value > 0);
  }, [stats, lang]);

  return (
    <div>
      {metricItems.length > 0 && (
        <div className="archives-metrics-strip" aria-live="polite">
          {metricItems.map((it) => (
            <span key={it.label} className="archives-metric-inline">
              <span className="archives-metric-inline-value">{it.value.toLocaleString()}</span>
              <span className="archives-metric-inline-label">{it.label}</span>
            </span>
          ))}
        </div>
      )}

      <div className="archives-filter-bar">
        <label className="archives-field-label">
          {lang === "fr" ? "Topic" : "Topic"}
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            style={compactSelectStyle}
          >
            <option value="">{lang === "fr" ? "Tous les topics" : "All topics"}</option>
            {topicOptions.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {lang === "fr" ? tp.labelFr : tp.labelEn}
              </option>
            ))}
          </select>
        </label>

        <div className="archives-type-tabs" role="group" aria-label={lang === "fr" ? "Type d'archive" : "Archive type"}>
          {typeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className="archives-type-tab"
              data-active={typeFilter === tab.value}
              aria-pressed={typeFilter === tab.value}
              onClick={() => setTypeFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="archives-range-control">
          <button
            type="button"
            className="archives-chevron"
            onClick={handleNewer}
            disabled={!canGoNewer}
            aria-label={lang === "fr" ? "Plus récent" : "Newer"}
          >
            ‹
          </button>
          <span className="archives-range-label">{rangeLabel}</span>
          <button
            type="button"
            className="archives-chevron"
            onClick={handleOlder}
            disabled={!canGoOlder}
            aria-label={lang === "fr" ? "Plus ancien" : "Older"}
          >
            ›
          </button>
          {loading && <span style={spinnerStyle(14, { marginLeft: 4 })} aria-hidden />}
        </div>
      </div>

      {error && (
        <p style={{ color: color.errorText, fontSize: 13, marginBottom: 12 }}>
          {lang === "fr" ? `Erreur : ${error}` : `Error: ${error}`}
        </p>
      )}

      <ArchivesTimeline
        data={data ?? { days: [], from: fromIso, to: toIsoStr, lang }}
        topics={topics.map((t) => ({
          id: t.id,
          label_en: t.labelEn,
          label_fr: t.labelFr,
          sort_order: t.sortOrder,
        }))}
        lang={lang}
        emptyMessage={
          lang === "fr"
            ? `Aucune archive pour ${selectedTopicLabel} sur cette période.`
            : `No archive for ${selectedTopicLabel} in this range.`
        }
      />
    </div>
  );
}
