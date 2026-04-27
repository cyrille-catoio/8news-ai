"use client";

import { useState, useEffect } from "react";
import { t, type Lang } from "@/lib/i18n";
import { color, sectionCard, formInputStyle, spinnerStyle } from "@/lib/theme";
import type { TopicItem } from "@/lib/types";
import { summaryPath } from "@/lib/summary-routes";

interface SlugResult {
  slug: string;
  topicId: string;
  date: string;
}

export function SummaryExplorer({ lang }: { lang: Lang }) {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() - 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SlugResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch("/api/topics", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: TopicItem[]) => {
        setTopics(list);
        if (list.length > 0 && !selectedTopic) setSelectedTopic(list[0].id);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTopic || !date) return;
    let cancelled = false;
    setLoading(true);
    setResult(null);
    setNotFound(false);

    fetch(`/api/summaries/${encodeURIComponent(selectedTopic)}/${date}?lang=${lang}`)
      .then((r) => {
        if (r.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (!cancelled && data) {
          setResult({ slug: data.slug, topicId: data.topicId, date: data.date });
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedTopic, date, lang]);

  return (
    <div style={{ ...sectionCard, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div style={{ flex: "1 1 200px" }}>
        <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
          Topic
        </label>
        <select
          value={selectedTopic}
          onChange={(e) => setSelectedTopic(e.target.value)}
          style={{ ...formInputStyle, width: "100%" }}
        >
          {topics.map((tp) => (
            <option key={tp.id} value={tp.id}>
              {lang === "fr" ? tp.labelFr : tp.labelEn}
            </option>
          ))}
        </select>
      </div>
      <div style={{ flex: "0 0 180px" }}>
        <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ ...formInputStyle, width: "100%" }}
        />
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
        {loading && <span style={spinnerStyle(16, { borderWidth: 2 })} />}
        {!loading && result && (
          <a
            href={summaryPath({ lang, topicId: result.topicId, date: result.date, slug: result.slug })}
            style={{
              color: color.gold,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              border: `1px solid ${color.gold}`,
              borderRadius: 6,
              padding: "6px 14px",
              whiteSpace: "nowrap",
            }}
          >
            {t("dailySummaryViewFull", lang)} →
          </a>
        )}
        {!loading && notFound && (
          <span style={{ color: color.textDim, fontSize: 12 }}>
            {t("dailySummaryNotFound", lang)}
          </span>
        )}
      </div>
    </div>
  );
}
