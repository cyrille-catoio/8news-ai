"use client";

import { useEffect, useState } from "react";
import { color, spinnerStyle } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import type { TopicItem } from "@/lib/types";
import { ArchivesPage } from "./ArchivesPage";

/**
 * SPA mirror of `/archives` (v2.7.0+) — replaces the previous
 * `SummariesBrowsePage` component that only listed article daily
 * summaries. Mounted at `/app/archives` (same pattern as the SSR
 * `/archives` page that hydrates with server-fetched data).
 *
 * Difference vs the SSR shell: no `initialData`, so `<ArchivesPage>`
 * fetches on mount. We do still load the topic list eagerly so the
 * filter dropdown is populated before the timeline arrives — better
 * than blocking the whole page on the topics call inside
 * `<ArchivesPage>` itself.
 */
export function ArchivesBrowsePage({ lang }: { lang: Lang }) {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/topics", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: TopicItem[]) => {
        if (cancelled) return;
        setTopics(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
        <span style={spinnerStyle(28)} />
      </div>
    );
  }

  return (
    <div>
      <h1
        style={{
          color: color.text,
          fontFamily: "ui-serif, Georgia, serif",
          fontSize: 30,
          fontWeight: 400,
          lineHeight: 1.14,
          letterSpacing: 0,
          marginBottom: 8,
          marginTop: 0,
        }}
      >
        {lang === "fr" ? "Archives" : "Archives"}
      </h1>
      <p
        style={{
          color: color.textMuted,
          fontSize: 14,
          marginTop: 0,
          marginBottom: 28,
          lineHeight: 1.6,
          maxWidth: 680,
        }}
      >
        {lang === "fr"
          ? "Toutes les couvertures du jour par topic — résumé articles, recap vidéo et vidéos transcrites — réunies sur une seule chronologie."
          : "Every day's coverage per topic — article summary, video recap and transcribed videos — gathered on a single timeline."}
      </p>

      <ArchivesPage lang={lang} topics={topics} />
    </div>
  );
}
