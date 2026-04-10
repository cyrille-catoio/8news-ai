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
  lang,
  locale,
  lastUpdatedAt,
}: {
  articles: TopFeedArticle[];
  loading: boolean;
  lang: Lang;
  locale: string;
  lastUpdatedAt: Date | null;
}) {
  const sorted = [...articles].sort((a, b) => {
    const aNew = isNew(a.pubDate) ? 1 : 0;
    const bNew = isNew(b.pubDate) ? 1 : 0;
    return bNew - aNew;
  });

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <p style={{ color: color.textMuted, fontSize: 12, margin: 0 }}>
          {t("homeTop20Subtitle", lang)}
          {lastUpdatedAt && (
            <>
              {" — "}
              {lang === "fr" ? "Mise à jour" : "Updated"}{" "}
              {lastUpdatedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
            </>
          )}
        </p>
      </div>
      {sorted.map((art, i) => (
        <div key={`${art.link}-${i}`} style={{ ...card, display: "block" }}>
          <a
            href={art.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
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
                {lang === "fr" && art.snippet ? (
                  <>
                    <span style={{ color: color.text, fontWeight: 500, fontSize: 17, lineHeight: 1.35, display: "block" }}>
                      {art.snippet}
                    </span>
                    <p
                      style={{
                        color: color.articleSnippet,
                        fontSize: 13,
                        marginTop: 6,
                        marginBottom: 0,
                        lineHeight: 1.45,
                      }}
                    >
                      {art.title}
                    </p>
                  </>
                ) : (
                  <>
                    <span style={{ color: color.text, fontWeight: 500, fontSize: 17, lineHeight: 1.35, display: "block" }}>
                      {art.title}
                    </span>
                    {art.snippet ? (
                      <p style={{ color: color.articleSnippet, fontSize: 14, marginTop: 6, marginBottom: 0, lineHeight: 1.5 }}>
                        {art.snippet}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: art.score >= 7 ? "#22c55e" : art.score >= 5 ? color.gold : color.textMuted,
                  flexShrink: 0,
                  lineHeight: 1.2,
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
