"use client";

import { color, card } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import { kicker } from "@/app/components/briefing/styles";

/** A row in the « Tendances · 24h » strip. Mirrors the response shape of
 *  `GET /api/topics/trending`. */
export interface TrendingTopic {
  id: string;
  label: string;
  count: number;
}

/**
 * « Tendances · 24h » — gold-bordered pill row. Click on a pill calls
 * `onTopicClick(topicId)` so the parent can open Articles with that topic.
 *
 * v2.12 extracted from `BriefingPage.tsx`.
 */
export function TrendingStrip({
  topics,
  lang,
  onTopicClick,
}: {
  topics: TrendingTopic[];
  lang: Lang;
  onTopicClick: (id: string) => void;
}) {
  const labelArticles = lang === "fr" ? "articles" : "articles";
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
        {lang === "fr" ? "Tendances · 24h" : "Trending · 24h"}
      </div>
      <div
        style={{
          ...card,
          display: "block",
          padding: "16px 18px",
          borderColor: color.gold,
          background:
            "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {topics.map((tp) => (
            <button
              key={tp.id}
              type="button"
              onClick={() => onTopicClick(tp.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${color.border}`,
                background: color.surface,
                color: color.text,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                whiteSpace: "nowrap",
              }}
            >
              <span>{tp.label}</span>
              <span style={{ color: color.gold, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, fontWeight: 700 }}>
                {tp.count}
                <span style={{ color: color.textMuted, marginLeft: 4, fontWeight: 400 }}>
                  {labelArticles}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
