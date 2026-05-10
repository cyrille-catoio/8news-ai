"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { color, formInputStyle, spinnerStyle } from "@/lib/theme";
import { type Lang, dateLocale } from "@/lib/i18n";
import type { TopicItem } from "@/lib/types";
import type { ArchivesPayload } from "@/lib/supabase/archives";
import { ArchivesTimeline } from "./ArchivesTimeline";
import { SummaryExplorer } from "./SummaryExplorer";

/**
 * Client orchestrator for the unified `/archives` hub (v2.7.0+).
 *
 * Responsibilities:
 *  - Filter state (topic, type article|video|all) — `lang` is owned by
 *    the parent, never touched here.
 *  - 7-day window pagination via [Older | Newer] buttons that shift
 *    `from` / `to` by 7 days on each click. The deepest reachable
 *    window is bounded to ~12 weeks so a user can't keep scrolling
 *    indefinitely past data the cron has produced.
 *  - Fetch on filter / window change, with `AbortController` so a
 *    rapid sequence of filter clicks never lets a stale response
 *    overwrite the current one.
 *  - Renders the SummaryExplorer at the top (quick-jump to one
 *    article daily summary), the filter bar, the day-grouped
 *    timeline, then the prev/next pager.
 *
 * Used twice:
 *  - In `src/app/archives/page.tsx` (SSR) — receives `initialData`
 *    rendered server-side so SEO crawlers see the timeline; the
 *    client takes over for filter / pagination interactions.
 *  - In `src/app/app/page.tsx` SPA route `/app/archives` — no
 *    `initialData`, so the component fetches on mount.
 */

const DAY_MS = 86_400_000;
const PAGE_DAYS = 7;
const MAX_WEEKS_BACK = 12;

export interface ArchivesPageProps {
  lang: Lang;
  /** Active topics for label resolution + filter dropdown. Caller passes the same `getActiveTopics(false)` result it used to seed `initialData.topics`. */
  topics: TopicItem[];
  /** Server-rendered initial payload for SEO. When omitted (SPA usage), the component fetches on mount. */
  initialData?: ArchivesPayload;
  /** Hide the SummaryExplorer quick-jump (not always wanted on the SPA which already has its own search/topic dropdown elsewhere). */
  hideExplorer?: boolean;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ArchivesPage({ lang, topics, initialData, hideExplorer }: ArchivesPageProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Window state: [from, to] inclusive, both YYYY-MM-DD. Default = last
  // 7 days ending today. We expose them to the client URL as query
  // params for deep-linkability (« share this archive view »).
  const [windowEnd, setWindowEnd] = useState<Date>(() => today);
  const [topicFilter, setTopicFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "articles" | "videos">("all");

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

  /**
   * Fetch the archives feed for the current filter + window. We send
   * `cache: "no-store"` so a freshly-shipped daily summary appears
   * within a minute of its cron tick — the API itself is also
   * `s-maxage=300` for the unauthenticated baseline.
   */
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
        const json = (await res.json()) as ArchivesPayload;
        setData(json);
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
    // Skip the very first fetch when SSR seeded the initial payload AND
    // the filter window is the default — no need to round-trip on mount
    // for a payload we already have.
    const isDefaultWindow =
      windowEnd.getTime() === today.getTime() && !topicFilter && typeFilter === "all";
    if (initialData && isDefaultWindow) {
      setLoading(false);
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
    return `${fromLabel} → ${toLabel}`;
  }, [fromDate, windowEnd, locale]);

  // Compose the sticky filter bar. Plain inputs/selects styled with the
  // shared theme — keeps the visual register identical to the topics
  // admin and stats pages.
  const filterBarStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: 10,
    marginBottom: 18,
    position: "sticky",
    top: 0,
    zIndex: 10,
  };

  // Inline chevron buttons rendered next to the date range inside the
  // sticky filter bar — keeps « plus ancien / plus récent » always
  // reachable without scrolling to the bottom of the timeline.
  // Mental model: « ‹ = newer (toward today) », « › = older (back in
  // time) », same direction as the home heroes' history chevrons
  // (mirror of v2.6.4's « right = past » convention).
  const chevronBtn: CSSProperties = {
    background: "transparent",
    border: "none",
    color: color.textDim,
    fontSize: 22,
    lineHeight: 1,
    fontFamily: "inherit",
    padding: "0 4px",
    cursor: "pointer",
    transition: "color 120ms ease, opacity 120ms ease",
    position: "relative",
    top: 1,
  };

  return (
    <div>
      {!hideExplorer && (
        <section style={{ marginBottom: 28 }}>
          <h2
            style={{
              color: color.gold,
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 14,
              marginTop: 0,
            }}
          >
            {lang === "fr" ? "Accès direct à un résumé" : "Jump to a summary"}
          </h2>
          <SummaryExplorer lang={lang} />
        </section>
      )}

      <div style={filterBarStyle}>
        <label style={{ fontSize: 12, color: color.textMuted, fontWeight: 600 }}>
          {lang === "fr" ? "Topic" : "Topic"}
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            style={{ ...formInputStyle, marginLeft: 6, fontSize: 13, padding: "6px 8px" }}
          >
            <option value="">{lang === "fr" ? "Tous" : "All"}</option>
            {topics.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {lang === "fr" ? tp.labelFr : tp.labelEn}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 12, color: color.textMuted, fontWeight: 600 }}>
          {lang === "fr" ? "Type" : "Type"}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            style={{ ...formInputStyle, marginLeft: 6, fontSize: 13, padding: "6px 8px" }}
          >
            <option value="all">{lang === "fr" ? "Tout" : "All"}</option>
            <option value="articles">{lang === "fr" ? "Articles" : "Articles"}</option>
            <option value="videos">{lang === "fr" ? "Vidéos" : "Videos"}</option>
          </select>
        </label>

        <div
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {/* Left chevron walks toward « now » (newer) — disabled at
              the present-day boundary. Same convention as the home
              hero chevrons (v2.6.4). */}
          <button
            type="button"
            onClick={handleNewer}
            disabled={!canGoNewer}
            aria-label={lang === "fr" ? "Plus récent" : "Newer"}
            style={{
              ...chevronBtn,
              opacity: canGoNewer ? 0.7 : 0.2,
              cursor: canGoNewer ? "pointer" : "not-allowed",
            }}
            onMouseEnter={(e) => {
              if (canGoNewer) (e.currentTarget as HTMLButtonElement).style.color = color.gold;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = color.textDim;
            }}
          >
            ‹
          </button>
          <span
            style={{
              fontSize: 12,
              color: color.textDim,
              minWidth: 140,
              textAlign: "center",
            }}
          >
            {rangeLabel}
          </span>
          {/* Right chevron walks toward the past (older) — disabled
              when the next page would cross the 12-week wall. */}
          <button
            type="button"
            onClick={handleOlder}
            disabled={!canGoOlder}
            aria-label={lang === "fr" ? "Plus ancien" : "Older"}
            style={{
              ...chevronBtn,
              opacity: canGoOlder ? 0.7 : 0.2,
              cursor: canGoOlder ? "pointer" : "not-allowed",
            }}
            onMouseEnter={(e) => {
              if (canGoOlder) (e.currentTarget as HTMLButtonElement).style.color = color.gold;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = color.textDim;
            }}
          >
            ›
          </button>
          {loading && <span style={spinnerStyle(14)} aria-hidden />}
        </div>
      </div>

      {error && (
        <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>
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
      />
    </div>
  );
}
