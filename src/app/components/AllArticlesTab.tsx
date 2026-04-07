"use client";

import { useState, useEffect } from "react";
import type { ArticleSummary } from "@/lib/types";
import { type Lang } from "@/lib/i18n";
import { color, spinnerStyle } from "@/lib/theme";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";

const ALL_ARTICLES_PAGE_SIZE = 50;

export type AllArticleEntry = ArticleSummary & { score?: number | null };

export function AllArticlesTab({ articles, loading, locale, lang }: { articles: AllArticleEntry[]; loading: boolean; locale: string; lang: Lang }) {
  const [visible, setVisible] = useState(ALL_ARTICLES_PAGE_SIZE);

  useEffect(() => { setVisible(ALL_ARTICLES_PAGE_SIZE); }, [articles]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: color.textMuted, fontSize: 14 }}>
        <span style={spinnerStyle(24, { marginRight: 10, verticalAlign: "middle" })} />
        {lang === "fr" ? "Chargement des articles…" : "Loading articles…"}
      </div>
    );
  }

  const grouped = articles.reduce<Record<string, AllArticleEntry[]>>((acc, art) => {
    const key = art.source || "Unknown";
    (acc[key] ??= []).push(art);
    return acc;
  }, {});

  const sources = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  if (sources.length === 0) {
    return <p style={{ color: color.textDim, fontSize: 15 }}>No articles found.</p>;
  }

  let rendered = 0;
  const hasMore = visible < articles.length;

  return (
    <div>
      <p style={{ color: color.textMuted, fontSize: 12, marginBottom: 16 }}>
        {articles.length.toLocaleString(locale)} {lang === "fr" ? "articles triés par score" : "articles sorted by score"}
      </p>
      {sources.map((source) => {
        const sourceArticles = grouped[source];
        const toRender = sourceArticles.filter(() => {
          if (rendered >= visible) return false;
          rendered++;
          return true;
        });
        if (toRender.length === 0) return null;
        return (
          <div key={source} style={{ marginBottom: 28 }}>
            <h3 style={{ color: color.gold, fontSize: 16, fontWeight: 600, marginBottom: 12, borderBottom: `1px solid ${color.border}`, paddingBottom: 8 }}>
              {source} ({sourceArticles.length})
            </h3>
            {toRender.map((art, i) => (
              <div
                key={`${art.link}-${i}`}
                style={{
                  padding: "10px 14px",
                  marginBottom: 6,
                  borderRadius: 8,
                  background: color.surface,
                }}
              >
                <a
                  href={art.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "none", color: "inherit", display: "block" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ color: color.text, fontWeight: 500, fontSize: 15, flex: 1 }}>
                      {art.title}
                    </span>
                    {art.score != null && (
                      <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: art.score >= 7 ? "#22c55e" : art.score >= 5 ? color.gold : color.textMuted,
                        marginLeft: 8,
                        flexShrink: 0,
                      }}>
                        {art.score}/10
                      </span>
                    )}
                  </div>
                  {art.snippet && (
                    <p style={{ color: color.articleSnippet, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                      {art.snippet}
                    </p>
                  )}
                </a>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ color: color.textDim, fontSize: 12 }}>
                    {art.pubDate ? new Date(art.pubDate).toLocaleString(locale) : ""}
                  </span>
                  <CopyLinkButton url={art.link} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {hasMore && (
        <button
          onClick={() => setVisible((v) => v + ALL_ARTICLES_PAGE_SIZE)}
          style={{
            display: "block",
            width: "100%",
            padding: "12px 0",
            marginTop: 8,
            border: `1px solid ${color.border}`,
            borderRadius: 8,
            background: color.surface,
            color: color.gold,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          {lang === "fr"
            ? `Afficher plus (${Math.min(ALL_ARTICLES_PAGE_SIZE, articles.length - visible)} suivants)`
            : `Show more (${Math.min(ALL_ARTICLES_PAGE_SIZE, articles.length - visible)} next)`}
        </button>
      )}
    </div>
  );
}
