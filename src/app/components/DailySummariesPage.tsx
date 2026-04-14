"use client";

import { useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import { color, sectionCard, formInputStyle, primaryButtonStyle, spinnerStyle } from "@/lib/theme";
import type { TopicLabel } from "@/lib/types";

interface GenerateResult {
  lang: string;
  summaryId?: number;
  slug?: string;
  status?: string;
  error?: string;
}

export function DailySummariesPage({ lang, topics }: { lang: Lang; topics: TopicLabel[] }) {
  const [selectedTopic, setSelectedTopic] = useState(topics[0]?.id ?? "");
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() - 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const [generating, setGenerating] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [results, setResults] = useState<Array<{ topic: string; date: string; results: GenerateResult[] }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!selectedTopic || !date) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/summaries/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: selectedTopic, date }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResults((prev) => [data, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dailySummariesError", lang));
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    setError(null);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const newResults: Array<{ topic: string; date: string; results: GenerateResult[] }> = [];

    for (const tp of topics) {
      try {
        const res = await fetch("/api/summaries/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: tp.id, date: yesterday }),
        });
        if (res.ok) {
          const data = await res.json();
          newResults.push(data);
          setResults((prev) => [data, ...prev]);
        }
      } catch {
        newResults.push({ topic: tp.id, date: yesterday, results: [{ lang: "en", error: "Failed" }] });
      }
    }

    setGeneratingAll(false);
  }

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 8, marginTop: 0 }}>
        {t("dailySummariesTitle", lang)}
      </h2>
      <p style={{ color: color.textMuted, fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
        {t("dailySummariesDesc", lang)}
      </p>

      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={sectionCard}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
              {t("dailySummariesTopic", lang)}
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              style={{ ...formInputStyle, maxWidth: 220 }}
            >
              {topics.map((tp) => (
                <option key={tp.id} value={tp.id}>{tp.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
              {t("dailySummariesDate", lang)}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...formInputStyle, maxWidth: 180 }}
            />
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || generatingAll || !selectedTopic}
            style={{ ...primaryButtonStyle, opacity: generating ? 0.6 : 1 }}
          >
            {generating ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={spinnerStyle(14, { borderWidth: 2 })} />
                {t("dailySummariesGenerating", lang)}
              </span>
            ) : (
              t("dailySummariesGenerate", lang)
            )}
          </button>
        </div>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${color.border}` }}>
          <button
            type="button"
            onClick={handleGenerateAll}
            disabled={generating || generatingAll}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: `1px solid ${color.gold}`,
              background: "transparent",
              color: color.gold,
              fontSize: 13,
              fontWeight: 600,
              cursor: generatingAll ? "not-allowed" : "pointer",
              opacity: generatingAll ? 0.6 : 1,
            }}
          >
            {generatingAll ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={spinnerStyle(14, { borderWidth: 2 })} />
                {t("dailySummariesGenerating", lang)}
              </span>
            ) : (
              t("dailySummariesGenerateAll", lang)
            )}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div style={sectionCard}>
          <h3 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 0, marginBottom: 12 }}>
            {lang === "fr" ? "Résultats" : "Results"}
          </h3>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                padding: "10px 0",
                borderBottom: i < results.length - 1 ? `1px solid ${color.border}` : "none",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: color.text, fontSize: 14, fontWeight: 600 }}>{r.topic}</span>
                <span style={{ color: color.textDim, fontSize: 12 }}>{r.date}</span>
              </div>
              {r.results.map((res, ri) => (
                <div key={ri} style={{ marginTop: 4, marginLeft: 12 }}>
                  <span style={{ color: color.textMuted, fontSize: 12, fontWeight: 600 }}>{res.lang.toUpperCase()}</span>
                  {res.status === "skipped" ? (
                    <span style={{ marginLeft: 8 }}>
                      <span style={{ color: color.gold, fontSize: 12 }}>
                        {lang === "fr" ? "Déjà généré" : "Already exists"}
                      </span>
                      {res.slug && (
                        <a
                          href={`/${r.topic}/${r.date}/${res.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: color.textMuted, fontSize: 12, marginLeft: 8, textDecoration: "none" }}
                        >
                          {t("dailySummariesViewPage", lang)} ↗
                        </a>
                      )}
                    </span>
                  ) : res.status === "no_articles" ? (
                    <span style={{ color: color.textDim, fontSize: 12, marginLeft: 8 }}>
                      {lang === "fr" ? "Aucun article pour cette date" : "No articles for this date"}
                    </span>
                  ) : res.slug ? (
                    <span style={{ marginLeft: 8 }}>
                      <span style={{ color: "#4ade80", fontSize: 12 }}>
                        {t("dailySummariesSuccess", lang)}
                      </span>
                      <a
                        href={`/${r.topic}/${r.date}/${res.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: color.gold, fontSize: 12, marginLeft: 8, textDecoration: "none" }}
                      >
                        {t("dailySummariesViewPage", lang)} ↗
                      </a>
                    </span>
                  ) : (
                    <span style={{ color: "#ef4444", fontSize: 12, marginLeft: 8 }}>
                      {res.error || t("dailySummariesError", lang)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
