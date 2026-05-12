"use client";

import { useCallback, useState } from "react";
import { color, card, sectionHeading } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { ScoreMeter } from "@/app/components/ScoreMeter";
import type { TopFeedArticle } from "@/hooks/useTopFeed";

const NEW_THRESHOLD_MS = 3_600_000;

function isNew(pubDate: string | undefined): boolean {
  return !!pubDate && Date.now() - new Date(pubDate).getTime() < NEW_THRESHOLD_MS;
}

export function TopFeedSection({
  articles,
  lang,
  locale,
  lastUpdatedAt,
  favoriteUrls,
  onToggleFavorite,
  isAuthenticated,
  onRequestAuth,
}: {
  articles: TopFeedArticle[];
  loading: boolean;
  lang: Lang;
  locale: string;
  lastUpdatedAt: Date | null;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string }) => void;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
}) {
  // v2.6.15+ — broken-image guard. Some feeds advertise `image_url`
  // values that 404 (CDN expiration, paywalled CMS, hot-linked-and-
  // pulled assets) or serve a non-image MIME the browser refuses. We
  // catch the `<img>` onError once, memoize the failing URL in this
  // session set, and skip the `<img>` slot on the next render — the
  // parent flex layout naturally reclaims the space so the title fills
  // the row like for an article that never had an image. State is
  // per-mount of TopFeedSection (~per `/top-articles` visit), so a
  // refresh gives images a fresh chance in case the CDN recovers.
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const markImageBroken = useCallback((url: string) => {
    setBrokenImages((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);
  const sorted = [...articles].sort((a, b) => {
    const aNew = isNew(a.pubDate) ? 1 : 0;
    const bNew = isNew(b.pubDate) ? 1 : 0;
    return bNew - aNew;
  });

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h2 style={sectionHeading}>
          {t("homeTop20Subtitle", lang)}
        </h2>
        {lastUpdatedAt && (
          <p style={{ color: color.textMuted, fontSize: 12, margin: 0 }}>
            {lang === "fr" ? "Mise à jour" : "Updated"}{" "}
            {lastUpdatedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
      {sorted.map((art, i) => (
        <div key={`${art.link}-${i}`} style={{ ...card, display: "block" }}>
          <a
            href={art.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              {art.imageUrl && !brokenImages.has(art.imageUrl) ? (
                <img
                  className="top-feed-thumb"
                  src={art.imageUrl}
                  alt=""
                  loading="lazy"
                  // `referrerPolicy="no-referrer"` is a small reliability
                  // win: some hot-linked CDNs (Cloudfront-backed
                  // newsroom assets in particular) 403 when the
                  // referrer doesn't match the publisher's own domain.
                  // Stripping it gets us a green light from most of
                  // those configs without losing anything we'd care
                  // about analytics-wise on an article thumbnail.
                  referrerPolicy="no-referrer"
                  onError={() => markImageBroken(art.imageUrl!)}
                  style={{
                    width: 104,
                    height: 72,
                    objectFit: "cover",
                    borderRadius: 8,
                    flexShrink: 0,
                    background: color.border,
                  }}
                />
              ) : null}
              <div style={{ display: "flex", flex: 1, minWidth: 0, justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {lang === "fr" && art.snippet ? (
                  <>
                    <span className="app-title-lg" style={{ color: color.text, fontWeight: 500, display: "block" }}>
                      {art.snippet}
                    </span>
                    <p
                      className="app-paragraph-sm"
                      style={{
                        color: color.articleSnippet,
                        marginTop: 6,
                        marginBottom: 0,
                      }}
                    >
                      {art.title}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="app-title-lg" style={{ color: color.text, fontWeight: 500, display: "block" }}>
                      {art.title}
                    </span>
                    {art.snippet ? (
                      <p className="app-paragraph" style={{ color: color.articleSnippet, marginTop: 6, marginBottom: 0 }}>
                        {art.snippet}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              <span style={{ marginLeft: 12, flexShrink: 0 }}>
                <ScoreMeter score={art.score} />
              </span>
              </div>
            </div>
          </a>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ color: color.gold, fontSize: 13 }}>
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
              {art.source} · {art.pubDate ? new Date(art.pubDate).toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <FavoriteButton
                url={art.link}
                title={art.title}
                source={art.source}
                pubDate={art.pubDate}
                isFavorite={favoriteUrls.has(art.link)}
                lang={lang}
                onToggle={onToggleFavorite}
                onRequestAuth={onRequestAuth}
                isAuthenticated={isAuthenticated}
              />
              <CopyLinkButton url={art.link} />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
