"use client";

import { color, card } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import type { TopFeedArticle } from "@/hooks/useTopFeed";

const NEW_THRESHOLD_MS = 3_600_000;

function isNew(pubDate: string | undefined): boolean {
  return !!pubDate && Date.now() - new Date(pubDate).getTime() < NEW_THRESHOLD_MS;
}

export function TopFeedSection({
  articles,
  loading,
  onRefresh,
  lang,
  locale,
}: {
  articles: TopFeedArticle[];
  loading: boolean;
  onRefresh: () => void;
  lang: Lang;
  locale: string;
}) {
  const sorted = [...articles].sort((a, b) => {
    const aNew = isNew(a.pubDate) ? 1 : 0;
    const bNew = isNew(b.pubDate) ? 1 : 0;
    return bNew - aNew;
  });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ color: color.textMuted, fontSize: 12, margin: 0 }}>{t("homeTop20Subtitle", lang)}</p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            border: `1px solid ${color.border}`,
            borderRadius: 6,
            background: color.surface,
            color: color.gold,
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.5 : 1,
            transition: "opacity 0.15s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {t("actionRefresh", lang)}
        </button>
      </div>
      {sorted.map((art, i) => (
        <div key={`${art.link}-${i}`} style={{ ...card, display: "block" }}>
          <a
            href={art.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: color.text, fontWeight: 500, fontSize: 17, flex: 1 }}>
                {isNew(art.pubDate) && (
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#000",
                      background: "#22c55e",
                      borderRadius: 4,
                      padding: "1px 5px",
                      marginRight: 6,
                      verticalAlign: "middle",
                      letterSpacing: 0.5,
                    }}
                  >
                    {t("articleNewBadge", lang)}
                  </span>
                )}
                {art.title}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: art.score >= 7 ? "#22c55e" : art.score >= 5 ? color.gold : color.textMuted,
                  marginLeft: 8,
                  flexShrink: 0,
                }}
              >
                {art.score}/10
              </span>
            </div>
          </a>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <a href={art.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <span style={{ color: color.gold, fontSize: 13 }}>
                {art.topic && (
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 10,
                      fontWeight: 700,
                      color: color.gold,
                      border: `1px solid ${color.gold}`,
                      borderRadius: 4,
                      padding: "1px 5px",
                      marginRight: 6,
                      verticalAlign: "middle",
                      letterSpacing: 0.3,
                      opacity: 0.85,
                    }}
                  >
                    {art.topic}
                  </span>
                )}
                {art.source} · {art.pubDate ? new Date(art.pubDate).toLocaleString(locale) : ""}
              </span>
            </a>
            <CopyLinkButton url={art.link} />
          </div>
        </div>
      ))}
    </>
  );
}
