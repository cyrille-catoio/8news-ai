"use client";

import { useState, useEffect } from "react";
import { color, spinnerStyle } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import type { TopicItem } from "@/lib/types";
import { SummaryExplorer } from "@/app/components/SummaryExplorer";
import { summaryPath } from "@/lib/summary-routes";

interface SummaryRoute {
  topic_id: string;
  summary_date: string;
  slug_keywords: string;
  lang: string;
}

export function SummariesBrowsePage({ lang }: { lang: Lang }) {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [routes, setRoutes] = useState<SummaryRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/topics", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/summaries/routes", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([tps, rts]: [TopicItem[], SummaryRoute[]]) => {
        if (cancelled) return;
        setTopics(tps);
        setRoutes(rts);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const targetLang = lang === "fr" ? "fr" : "en";
  const filtered = routes.filter((r) => r.lang === targetLang);

  const recentByTopic = new Map<string, SummaryRoute[]>();
  for (const r of filtered) {
    const arr = recentByTopic.get(r.topic_id) ?? [];
    if (arr.length < 8) arr.push(r);
    recentByTopic.set(r.topic_id, arr);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
        <span style={spinnerStyle(28)} />
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ color: color.gold, fontSize: 22, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
        {lang === "fr" ? "Résumés quotidiens IA" : "Daily AI News Summaries"}
      </h1>
      <p style={{ color: color.textMuted, fontSize: 14, marginTop: 0, marginBottom: 28, lineHeight: 1.5 }}>
        {lang === "fr"
          ? "Chaque jour, l'IA analyse les dernières actualités par sujet et génère un résumé avec les points clés et les articles pertinents."
          : "Every day, AI analyzes the latest news by topic and generates a summary with key points and relevant articles."}
      </p>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
          {lang === "fr" ? "Explorer un résumé" : "Browse a summary"}
        </h2>
        <SummaryExplorer lang={lang} />
      </section>

      <section>
        <h2 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
          Topics
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {topics.map((tp) => {
            const label = lang === "fr" ? tp.labelFr : tp.labelEn;
            const recent = recentByTopic.get(tp.id) ?? [];
            return (
              <div
                key={tp.id}
                style={{
                  background: color.surface,
                  border: `1px solid ${color.border}`,
                  borderRadius: 10,
                  padding: "16px 20px",
                }}
              >
                <a
                  href={`/${tp.id}?lang=${lang}`}
                  style={{ color: color.gold, textDecoration: "none", fontSize: 16, fontWeight: 600 }}
                >
                  {label}
                </a>
                {recent.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 0" }}>
                    {recent.map((r) => (
                      <li key={`${r.summary_date}-${r.lang}`} style={{ marginBottom: 4 }}>
                        <a
                          href={summaryPath(r)}
                          style={{ color: color.textSecondary, textDecoration: "none", fontSize: 13 }}
                        >
                          {r.summary_date}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {recent.length === 0 && (
                  <p style={{ color: color.textDim, fontSize: 12, margin: "6px 0 0 0" }}>
                    {lang === "fr" ? "Aucun résumé" : "No summaries yet"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
