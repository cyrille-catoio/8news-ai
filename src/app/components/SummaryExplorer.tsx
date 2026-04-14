"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, font, sectionCard, formInputStyle, spinnerStyle } from "@/lib/theme";
import type { TopicItem, ArticleSummary, SummaryBullet } from "@/lib/types";

interface SummaryData {
  id: number;
  topicId: string;
  date: string;
  lang: string;
  slug: string;
  bullets: SummaryBullet[];
  articles: ArticleSummary[];
  meta: { totalArticles?: number; scoredArticles?: number; analyzedArticles?: number } | null;
  seoTitle: string;
  seoH1: string;
}

export function SummaryExplorer({ lang }: { lang: Lang }) {
  const locale = dateLocale(lang);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() - 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [fetched, setFetched] = useState(false);

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
    setSummary(null);
    setNotFound(false);
    setFetched(false);

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
        if (!cancelled && data) setSummary(data as SummaryData);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setFetched(true);
        }
      });

    return () => { cancelled = true; };
  }, [selectedTopic, date, lang]);

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>
        <nav style={{ fontSize: 13, marginBottom: 24 }}>
          <Link href="/" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
          <span style={{ color: color.textDim, margin: "0 8px" }}>/</span>
          <span style={{ color: color.textMuted }}>{t("dailySummaryExplorerTitle", lang)}</span>
        </nav>

        <h1 style={{ color: color.gold, fontSize: 22, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
          {t("dailySummaryExplorerTitle", lang)}
        </h1>
        <p style={{ color: color.textMuted, fontSize: 14, marginTop: 0, marginBottom: 24 }}>
          {t("dailySummaryExplorerDesc", lang)}
        </p>

        {/* Selectors */}
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
              {lang === "fr" ? "Date" : "Date"}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...formInputStyle, width: "100%" }}
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <span style={spinnerStyle(24)} />
          </div>
        )}

        {/* Not found */}
        {!loading && fetched && notFound && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ color: color.textDim, fontSize: 15 }}>
              {t("dailySummaryNotFound", lang)}
            </p>
          </div>
        )}

        {/* Summary content */}
        {!loading && summary && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ color: color.gold, fontSize: 18, fontWeight: 700, margin: 0 }}>
                {summary.seoH1 || summary.seoTitle}
              </h2>
              <a
                href={`/${summary.topicId}/${summary.date}/${summary.slug}?lang=${lang}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: color.gold,
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                  border: `1px solid ${color.gold}`,
                  borderRadius: 6,
                  padding: "4px 10px",
                }}
              >
                {t("dailySummaryViewFull", lang)} ↗
              </a>
            </div>

            {summary.meta && (
              <p style={{ color: color.textDim, fontSize: 12, marginBottom: 16 }}>
                {summary.meta.analyzedArticles ?? 0} {lang === "fr" ? "articles analysés par IA" : "articles analyzed by AI"}
                {summary.meta.totalArticles ? ` / ${summary.meta.totalArticles} total` : ""}
              </p>
            )}

            {/* Bullets */}
            {summary.bullets.length > 0 && (
              <section style={{
                background: color.surface, border: `1px solid ${color.border}`,
                borderRadius: 10, padding: "20px 24px", marginBottom: 24,
              }}>
                <h3 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 0, marginBottom: 16 }}>
                  {lang === "fr" ? "Points clés" : "Key points"}
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {summary.bullets.map((b: SummaryBullet, i: number) => (
                    <li key={i} style={{ marginBottom: 14, lineHeight: 1.55 }}>
                      <span style={{ color: color.gold, fontWeight: 700, marginRight: 8 }}>•</span>
                      <span style={{ color: color.text, fontSize: 15 }}>{b.text}</span>
                      {b.refs && b.refs.length > 0 && (
                        <span style={{ marginLeft: 6 }}>
                          {b.refs.map((ref, ri) => (
                            <a
                              key={ri}
                              href={ref.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={ref.title}
                              style={{ color: color.textDim, fontSize: 11, textDecoration: "none", marginLeft: 4 }}
                            >
                              [{ref.source}]
                            </a>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Articles */}
            {summary.articles.length > 0 && (
              <section>
                <h3 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                  {lang === "fr" ? "Articles pertinents" : "Relevant articles"}
                </h3>
                {summary.articles.map((art: ArticleSummary, i: number) => (
                  <article
                    key={i}
                    style={{
                      background: color.surface, border: `1px solid ${color.border}`,
                      borderRadius: 10, padding: 16, marginBottom: 12,
                    }}
                  >
                    <a
                      href={art.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "none", color: "inherit", display: "block" }}
                    >
                      <h4 style={{ color: color.text, fontWeight: 500, fontSize: 16, margin: 0 }}>
                        {art.title}
                      </h4>
                      {art.snippet && (
                        <p style={{ color: color.articleSnippet, fontSize: 14, marginTop: 6, lineHeight: 1.5, marginBottom: 0 }}>
                          {art.snippet}
                        </p>
                      )}
                    </a>
                    <div style={{ marginTop: 8 }}>
                      <span style={{ color: color.gold, fontSize: 13 }}>
                        {art.source} · {art.pubDate ? new Date(art.pubDate).toLocaleString(locale) : ""}
                      </span>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
