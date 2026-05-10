"use client";

import Link from "next/link";
import { type CSSProperties } from "react";
import { color } from "@/lib/theme";
import { type Lang, dateLocale } from "@/lib/i18n";
import { summaryPath } from "@/lib/summary-routes";
import type { ArchivesPayload } from "@/lib/supabase/archives";
import type { TopicItem } from "@/lib/types";

/**
 * Pure presentation component for the unified `/archives` hub.
 *
 * Receives a normalized `ArchivesPayload` (already day-grouped, ordered
 * date desc) plus a topic dictionary for label resolution and renders
 * a timeline with one card per day. Inside each day card, every active
 * topic that has at least one of (daily summary, video roundup,
 * transcribed videos) for that date gets its own row with up to three
 * link slots:
 *
 *   1. Daily summary article  → /en|fr/[topic]/[date]/[slug]
 *   2. Video roundup          → /[topic]/r/[date]/[slug]
 *   3. N transcribed videos   → /[topic]/videos/[date]
 *
 * Empty slots render as muted "no coverage" copy so the visual
 * completeness of a day is legible at a glance — important UX signal
 * (« my topic had no video coverage today » is itself information).
 *
 * The component is stateless: filter / pagination state lives in the
 * parent (`ArchivesPage` for the SPA, the SSR page for `/archives`).
 */

const dayCardStyle: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 12,
  padding: "20px 22px",
  marginBottom: 20,
};

const dayHeaderStyle: CSSProperties = {
  color: color.gold,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginTop: 0,
  marginBottom: 14,
  borderBottom: `1px solid ${color.border}`,
  paddingBottom: 10,
};

const topicRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(120px, 160px) 1fr",
  gap: 16,
  alignItems: "start",
  padding: "10px 0",
  borderBottom: `1px dashed ${color.borderLight}`,
};

const topicLabelStyle: CSSProperties = {
  color: color.gold,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  border: `1px solid ${color.gold}`,
  borderRadius: 4,
  padding: "3px 8px",
  display: "inline-block",
  width: "fit-content",
};

const slotsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 14,
  lineHeight: 1.5,
};

const slotEmptyStyle: CSSProperties = {
  color: color.textDim,
  fontStyle: "italic",
};

export interface ArchivesTimelineProps {
  data: ArchivesPayload;
  /** Active topics for label resolution + ordering rows within a day. Pass `getActiveTopics(false)` mapped result. */
  topics: Array<{
    id: string;
    label_en: string;
    label_fr: string;
    sort_order?: number;
  }>;
  lang: Lang;
  /** Set to true when the wrapper renders inside the SPA shell (no breadcrumb / no SEO h1 above). Just hides nothing for now — reserved for future visual tweaks. */
  embedded?: boolean;
  /** Empty-state copy override. Default uses i18n. */
  emptyMessage?: string;
}

export function ArchivesTimeline({ data, topics, lang, emptyMessage }: ArchivesTimelineProps) {
  const locale = dateLocale(lang);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const orderById = new Map(topics.map((t, i) => [t.id, t.sort_order ?? i]));

  if (data.days.length === 0) {
    return (
      <p style={{ color: color.textMuted, fontSize: 14, padding: "24px 0" }}>
        {emptyMessage ??
          (lang === "fr"
            ? "Aucune archive sur cette période. Élargis la fenêtre ou retire le filtre topic."
            : "No archive on this range. Widen the window or remove the topic filter.")}
      </p>
    );
  }

  return (
    <div>
      {data.days.map((day) => {
        // Sort topic rows by their `topics.sort_order` so the layout
        // stays predictable across days (same topic always on top
        // when present). Topics not in the dictionary fall back to
        // the end of the row list.
        const rows = [...day.topics].sort((a, b) => {
          const oa = orderById.get(a.topic_id) ?? Number.MAX_SAFE_INTEGER;
          const ob = orderById.get(b.topic_id) ?? Number.MAX_SAFE_INTEGER;
          return oa - ob;
        });

        const dateLabel = new Date(`${day.date}T00:00:00`).toLocaleDateString(locale, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        return (
          <section key={day.date} style={dayCardStyle}>
            <h2 style={dayHeaderStyle}>{dateLabel}</h2>

            {/* « ALL TOPICS » Top 24h cross-topic box (v2.7.1+).
                Hierarchically supersedes the per-topic rows below —
                gold border + faint gold gradient (same chrome as
                Top story / Top video heroes on the home) so the visual
                hierarchy is unambiguous: this is THE editorial brief
                of the day, the topic rows are the per-topic deep-dives.
                Conditional on `day.hasTopSummary` so a quiet day with
                no cross-topic snapshot doesn't render an empty card. */}
            {day.hasTopSummary && (
              <Link
                href={`/${day.date}?lang=${lang}`}
                style={{
                  display: "block",
                  padding: "14px 18px",
                  marginBottom: rows.length > 0 ? 14 : 0,
                  borderRadius: 8,
                  border: `1px solid ${color.gold}`,
                  background:
                    "linear-gradient(180deg, rgba(201,162,39,0.08), transparent 80%), " +
                    color.surface,
                  textDecoration: "none",
                  color: color.text,
                }}
                aria-label={
                  lang === "fr"
                    ? `Voir le top articles 24h du ${dateLabel}`
                    : `Open the top 24h articles for ${dateLabel}`
                }
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontFamily: "ui-monospace, Menlo, monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: color.gold,
                        border: `1px solid ${color.gold}`,
                        borderRadius: 3,
                        padding: "2px 7px",
                        marginRight: 10,
                      }}
                    >
                      {lang === "fr" ? "TOUS LES TOPICS" : "ALL TOPICS"}
                    </span>
                    <strong style={{ color: color.text, fontWeight: 700, fontSize: 15 }}>
                      {lang === "fr" ? "Top articles 24h" : "Top 24h articles"}
                    </strong>
                    <div
                      style={{
                        color: color.textMuted,
                        fontSize: 13,
                        marginTop: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {lang === "fr"
                        ? "Résumé IA cross-topic des 50 articles du jour."
                        : "Cross-topic AI summary of the day's top 50 articles."}
                    </div>
                  </div>
                  <span
                    style={{ color: color.gold, fontSize: 18, flexShrink: 0 }}
                    aria-hidden
                  >
                    →
                  </span>
                </div>
              </Link>
            )}

            {rows.map((row, idx) => {
              const tp = topicById.get(row.topic_id);
              const label = tp ? (lang === "fr" ? tp.label_fr : tp.label_en) : row.topic_id;
              const isLast = idx === rows.length - 1;

              return (
                <div
                  key={row.topic_id}
                  style={{
                    ...topicRowStyle,
                    borderBottom: isLast ? "none" : topicRowStyle.borderBottom,
                  }}
                >
                  <Link
                    href={`/${row.topic_id}?lang=${lang}`}
                    style={{ ...topicLabelStyle, textDecoration: "none" }}
                    aria-label={lang === "fr" ? `Voir le topic ${label}` : `Open topic ${label}`}
                  >
                    {label}
                  </Link>

                  <div style={slotsStyle}>
                    {row.dailySummary ? (
                      <Link
                        href={summaryPath({
                          lang,
                          topic_id: row.dailySummary.topic_id,
                          summary_date: row.dailySummary.summary_date,
                          slug_keywords: row.dailySummary.slug_keywords,
                        })}
                        style={{ color: color.text, textDecoration: "none" }}
                      >
                        <span style={{ color: color.gold, marginRight: 8 }}>→</span>
                        {lang === "fr" ? "Résumé articles du jour" : "Daily articles summary"}
                      </Link>
                    ) : (
                      <span style={slotEmptyStyle}>
                        {lang === "fr"
                          ? "— Pas de résumé articles ce jour"
                          : "— No daily articles summary"}
                      </span>
                    )}

                    {row.videoRoundup ? (
                      <Link
                        href={`/${row.videoRoundup.topic_id}/r/${row.videoRoundup.roundup_date}/${row.videoRoundup.slug_keywords}`}
                        style={{ color: color.text, textDecoration: "none" }}
                      >
                        <span style={{ color: color.gold, marginRight: 8 }}>→</span>
                        {lang === "fr" ? "Recap vidéo du jour" : "Daily video recap"}
                      </Link>
                    ) : (
                      <span style={slotEmptyStyle}>
                        {lang === "fr" ? "— Pas de recap vidéo ce jour" : "— No daily video recap"}
                      </span>
                    )}

                    {row.transcribedVideoCount > 0 && (
                      <Link
                        href={`/${row.topic_id}/videos/${day.date}?lang=${lang}`}
                        style={{ color: color.text, textDecoration: "none" }}
                      >
                        <span style={{ color: color.gold, marginRight: 8 }}>→</span>
                        {row.transcribedVideoCount === 1
                          ? lang === "fr"
                            ? "1 vidéo transcrite"
                            : "1 transcribed video"
                          : lang === "fr"
                          ? `${row.transcribedVideoCount} vidéos transcrites`
                          : `${row.transcribedVideoCount} transcribed videos`}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
