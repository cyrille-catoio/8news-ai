"use client";

import Link from "next/link";
import { color } from "@/lib/theme";
import { type Lang, dateLocale } from "@/lib/i18n";
import { summaryPath } from "@/lib/summary-routes";
import type { ArchivesPayload, ArchivesTopicRow } from "@/lib/supabase/archives";

/**
 * Presentation layer for `/archives`.
 *
 * It deliberately keeps every deep URL unchanged:
 * - article summaries use `summaryPath()` (`/en|fr/[topic]/[date]/[slug]`)
 * - video recaps use `/[topic]/r/[date]/[slug]`
 * - transcribed-video drill-down uses `/[topic]/videos/[date]`
 */

export interface ArchivesTimelineProps {
  data: ArchivesPayload;
  topics: Array<{
    id: string;
    label_en: string;
    label_fr: string;
    sort_order?: number;
  }>;
  lang: Lang;
  embedded?: boolean;
  emptyMessage?: string;
}

function coverageCount(row: ArchivesTopicRow): number {
  return Number(Boolean(row.dailySummary))
    + Number(Boolean(row.videoRoundup))
    + Number(row.transcribedVideoCount > 0);
}

export function ArchivesTimeline({ data, topics, lang, emptyMessage }: ArchivesTimelineProps) {
  const locale = dateLocale(lang);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const orderById = new Map(topics.map((t, i) => [t.id, t.sort_order ?? i]));

  if (data.days.length === 0) {
    return (
      <div className="archive-empty-state">
        {emptyMessage ??
          (lang === "fr"
            ? "Aucune archive sur cette période. Élargis la fenêtre ou retire le filtre topic."
            : "No archive on this range. Widen the window or remove the topic filter.")}
      </div>
    );
  }

  return (
    <div className="archives-timeline">
      {data.days.map((day) => {
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
        const articleCount = rows.filter((row) => row.dailySummary).length + Number(day.hasTopSummary);
        const videoRecapCount = rows.filter((row) => row.videoRoundup).length;
        const transcribedVideoCount = rows.reduce((sum, row) => sum + row.transcribedVideoCount, 0);

        return (
          <section key={day.date} className="archive-day">
            <aside className="archive-day-rail">
              <h2 className="archive-day-date">{dateLabel}</h2>
              <div className="archive-day-meta">
                <span className="archive-day-pill">
                  {articleCount} {lang === "fr" ? "articles" : "articles"}
                </span>
                <span className="archive-day-pill">
                  {videoRecapCount} {lang === "fr" ? "recaps" : "recaps"}
                </span>
                <span className="archive-day-pill">
                  {transcribedVideoCount} {lang === "fr" ? "vidéos" : "videos"}
                </span>
              </div>
            </aside>

            <div className="archive-day-content">
              {day.hasTopSummary && (
                <Link
                  href={`/${day.date}?lang=${lang}`}
                  className="archive-top-summary-card"
                  aria-label={
                    lang === "fr"
                      ? `Voir le top articles 24h du ${dateLabel}`
                      : `Open the top 24h articles for ${dateLabel}`
                  }
                >
                  <div className="archive-topic-head" style={{ marginBottom: 0 }}>
                    <div>
                      <span className="archive-topic-badge">
                        {lang === "fr" ? "Tous les topics" : "All topics"}
                      </span>
                      <span className="archive-slot-title" style={{ fontSize: 16 }}>
                        {lang === "fr" ? "Top articles 24h" : "Top 24h articles"}
                      </span>
                      <span className="archive-slot-kind" style={{ marginTop: 7 }}>
                        {lang === "fr"
                          ? "Résumé IA cross-topic des 50 articles du jour"
                          : "Cross-topic AI summary of the day's top 50 articles"}
                      </span>
                    </div>
                    <span style={{ color: color.gold, fontSize: 20 }} aria-hidden>
                      →
                    </span>
                  </div>
                </Link>
              )}

              {rows.map((row) => {
                const tp = topicById.get(row.topic_id);
                const label = tp ? (lang === "fr" ? tp.label_fr : tp.label_en) : row.topic_id;
                const coverage = coverageCount(row);

                return (
                  <article key={row.topic_id} className="archive-topic-card">
                    <div className="archive-topic-head">
                      <Link
                        href={`/${row.topic_id}?lang=${lang}`}
                        className="archive-topic-link"
                        aria-label={lang === "fr" ? `Voir le topic ${label}` : `Open topic ${label}`}
                      >
                        <span className="archive-topic-badge">{label}</span>
                      </Link>
                      <span className="archive-coverage-score">
                        {coverage}/3 {lang === "fr" ? "formats" : "formats"}
                      </span>
                    </div>

                    <div className="archive-slot-grid">
                      {row.dailySummary ? (
                        <Link
                          href={summaryPath({
                            lang,
                            topic_id: row.dailySummary.topic_id,
                            summary_date: row.dailySummary.summary_date,
                            slug_keywords: row.dailySummary.slug_keywords,
                          })}
                          className="archive-slot"
                        >
                          <span className="archive-slot-kind">
                            {lang === "fr" ? "Articles" : "Articles"}
                          </span>
                          <span className="archive-slot-title">
                            <span className="archive-slot-arrow">→</span>
                            {lang === "fr" ? "Résumé du jour" : "Daily summary"}
                          </span>
                        </Link>
                      ) : (
                        <span className="archive-slot archive-slot-empty">
                          <span className="archive-slot-kind">
                            {lang === "fr" ? "Articles" : "Articles"}
                          </span>
                          <span className="archive-slot-title">
                            {lang === "fr" ? "Pas de résumé" : "No summary"}
                          </span>
                        </span>
                      )}

                      {row.videoRoundup ? (
                        <Link
                          href={`/${row.videoRoundup.topic_id}/r/${row.videoRoundup.roundup_date}/${row.videoRoundup.slug_keywords}`}
                          className="archive-slot"
                        >
                          <span className="archive-slot-kind">
                            {lang === "fr" ? "Recap vidéo" : "Video recap"}
                          </span>
                          <span className="archive-slot-title">
                            <span className="archive-slot-arrow">→</span>
                            {lang === "fr" ? "Briefing vidéo" : "Video briefing"}
                          </span>
                        </Link>
                      ) : (
                        <span className="archive-slot archive-slot-empty">
                          <span className="archive-slot-kind">
                            {lang === "fr" ? "Recap vidéo" : "Video recap"}
                          </span>
                          <span className="archive-slot-title">
                            {lang === "fr" ? "Pas de recap" : "No recap"}
                          </span>
                        </span>
                      )}

                      {row.transcribedVideoCount > 0 ? (
                        <Link
                          href={`/${row.topic_id}/videos/${day.date}?lang=${lang}`}
                          className="archive-slot"
                        >
                          <span className="archive-slot-kind">
                            {lang === "fr" ? "Vidéos" : "Videos"}
                          </span>
                          <span className="archive-slot-title">
                            <span className="archive-slot-arrow">→</span>
                            {row.transcribedVideoCount === 1
                              ? lang === "fr"
                                ? "1 vidéo transcrite"
                                : "1 transcribed video"
                              : lang === "fr"
                              ? `${row.transcribedVideoCount} vidéos transcrites`
                              : `${row.transcribedVideoCount} transcribed videos`}
                          </span>
                        </Link>
                      ) : (
                        <span className="archive-slot archive-slot-empty">
                          <span className="archive-slot-kind">
                            {lang === "fr" ? "Vidéos" : "Videos"}
                          </span>
                          <span className="archive-slot-title">
                            {lang === "fr" ? "Aucune transcription" : "No transcripts"}
                          </span>
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
