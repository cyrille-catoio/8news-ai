"use client";

import React, { useState, useEffect, useCallback, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, sectionCard, spinnerStyle } from "@/lib/theme";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { AudioPlayer } from "@/app/components/AudioPlayer";
import { TTS_TEXT_MAX_CHARS } from "@/lib/tts";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

const mdComponents = {
  h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
    <h2 style={{ color: color.gold, fontSize: 15, fontWeight: 700, margin: "14px 0 6px" }} {...props}>{children}</h2>
  ),
  // h3 is the per-key-point title promoted from `- **Title**` bullets by
  // `promoteBulletTitlesToHeadings`. Gold to match the rest of the brand
  // and the roundup briefings.
  h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
    <h3 style={{ color: color.gold, fontSize: 14, fontWeight: 700, lineHeight: 1.35, margin: "10px 0 4px" }} {...props}>{children}</h3>
  ),
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p style={{ color: color.textSecondary, fontSize: 13, lineHeight: 1.6, margin: "4px 0" }} {...props}>{children}</p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
    <ul style={{ paddingLeft: 18, margin: "4px 0" }} {...props}>{children}</ul>
  ),
  li: ({ children, ...props }: React.ComponentProps<"li">) => (
    <li style={{ color: color.textSecondary, fontSize: 13, lineHeight: 1.6, marginBottom: 6 }} {...props}>{children}</li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
    <strong style={{ color: color.text, fontWeight: 700 }} {...props}>{children}</strong>
  ),
};

interface FavoriteItem {
  id: number;
  url: string;
  title: string;
  source: string;
  sourceType: string;
  pubDate: string | null;
  createdAt: string;
  videoId: string | null;
  hasTranscription: boolean;
  internalPath: string | null;
}

type FilterType = "all" | "article" | "video";

const pillBase: CSSProperties = {
  border: `1px solid ${color.borderLight}`,
  background: "rgba(255,255,255,0.05)",
  color: color.textSecondary,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: "5px 14px",
  borderRadius: 999,
  fontFamily: "inherit",
};

const pillActive: CSSProperties = {
  ...pillBase,
  border: `1px solid ${color.gold}`,
  background: "rgba(201,162,39,0.15)",
  color: color.gold,
};

function summaryMdToTtsText(summaryMd: string, videoTitle: string, lang: Lang): string {
  const plain = summaryMd
    // h2 = section markers (drop). h3 = per-key-point title (keep text,
    // drop just the `### ` prefix) so TTS speaks them as body content.
    .replace(/^##\s+.+$/gm, "")
    .replace(/^###\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const intro =
    lang === "fr" ? `Résumé de la vidéo ${videoTitle}.` : `Summary of the video ${videoTitle}.`;
  const maxBody = TTS_TEXT_MAX_CHARS - intro.length;
  const body = plain.length > maxBody ? plain.slice(0, maxBody) + "…" : plain;
  return body.length > 0 ? `${intro} ${body}` : "";
}

function isYouTubeFavoriteUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

function favoriteVideoHref(fav: FavoriteItem, lang: Lang): string {
  if (fav.internalPath) {
    return lang === "fr" ? `${fav.internalPath}?lang=fr` : fav.internalPath;
  }
  return "/app/videos";
}

export function FavoritesPage({
  lang,
  favoriteUrls,
  onToggleFavorite,
  speed,
  voice,
}: {
  lang: Lang;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string }) => void;
  speed: number;
  voice: string;
}) {
  const [favorites, setFavorites] = useState<FavoriteItem[] | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [expandedTranscriptions, setExpandedTranscriptions] = useState<Record<string, string | null>>({});
  const [loadingTranscription, setLoadingTranscription] = useState<Record<string, boolean>>({});
  const locale = dateLocale(lang);
  const loading = favorites === null;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/user/favorites?lang=${lang}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((json: { favorites: FavoriteItem[] }) => {
        if (!cancelled) setFavorites(json.favorites);
      })
      .catch(() => {
        if (!cancelled) setFavorites([]);
      });
    return () => { cancelled = true; };
  }, [lang]);

  const toggleTranscription = useCallback(async (fav: FavoriteItem) => {
    const key = fav.videoId!;
    if (expandedTranscriptions[key] !== undefined) {
      setExpandedTranscriptions((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    setLoadingTranscription((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`/api/video-transcription?videoId=${encodeURIComponent(key)}&lang=${lang}`);
      if (!res.ok) throw new Error();
      const { summaryMd } = await res.json();
      setExpandedTranscriptions((prev) => ({ ...prev, [key]: summaryMd }));
    } catch {
      setExpandedTranscriptions((prev) => ({ ...prev, [key]: null }));
    } finally {
      setLoadingTranscription((prev) => ({ ...prev, [key]: false }));
    }
  }, [expandedTranscriptions, lang]);

  const handleRemove = (fav: FavoriteItem) => {
    onToggleFavorite({ url: fav.url, title: fav.title, source: fav.source, pubDate: fav.pubDate ?? undefined });
    setFavorites((prev) => (prev ?? []).filter((f) => f.url !== fav.url));
  };

  const all = favorites ?? [];
  const filtered = filter === "all" ? all : all.filter((f) => (f.sourceType || "article") === filter);

  const articleCount = all.filter((f) => (f.sourceType || "article") === "article").length;
  const videoCount = all.filter((f) => (f.sourceType || "article") === "video").length;

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>
        {t("favoritesTitle", lang)}
      </h2>

      {/* Filter pills */}
      {!loading && all.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button type="button" onClick={() => setFilter("all")} style={filter === "all" ? pillActive : pillBase}>
            {lang === "fr" ? "Tous" : "All"} ({all.length})
          </button>
          <button type="button" onClick={() => setFilter("article")} style={filter === "article" ? pillActive : pillBase}>
            Articles ({articleCount})
          </button>
          <button type="button" onClick={() => setFilter("video")} style={filter === "video" ? pillActive : pillBase}>
            {lang === "fr" ? "Vidéos" : "Videos"} ({videoCount})
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <span style={spinnerStyle(24)} />
          <p style={{ color: color.textMuted, fontSize: 13, marginTop: 12 }}>{t("favoritesLoading", lang)}</p>
        </div>
      ) : all.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color.textDim}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.5, marginBottom: 16 }}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <p style={{ color: color.textMuted, fontSize: 16, fontWeight: 600, margin: 0 }}>
            {t("favoritesEmpty", lang)}
          </p>
          <p style={{ color: color.textDim, fontSize: 13, marginTop: 8, maxWidth: 320, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
            {t("favoritesEmptyHint", lang)}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ color: color.textMuted, fontSize: 14, textAlign: "center", padding: "40px 0" }}>
          {lang === "fr" ? "Aucun favori dans cette catégorie" : "No favorites in this category"}
        </p>
      ) : (
        <div style={sectionCard}>
          {filtered.map((fav, i) => {
            let domain = "";
            try { domain = new URL(fav.url).hostname.replace("www.", ""); } catch { /* */ }
            const isVideo =
              (fav.sourceType || "article") === "video" || isYouTubeFavoriteUrl(fav.url);
            const titleHref = isVideo ? favoriteVideoHref(fav, lang) : fav.url;
            const openTitleExternally = !isVideo;
            const titleStyle = {
              textDecoration: "none",
              color: color.text,
              fontWeight: 500,
              fontSize: 14,
              lineHeight: 1.4,
            } as const;

            return (
              <div
                key={fav.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 0",
                  borderBottom: i < filtered.length - 1 ? `1px solid ${color.border}` : "none",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleRemove(fav)}
                  title={t("removeFromFavorites", lang)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    color: favoriteUrls.has(fav.url) ? color.gold : color.textDim,
                    marginTop: 2,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {openTitleExternally ? (
                    <a
                      href={titleHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={titleStyle}
                    >
                      {fav.title}
                    </a>
                  ) : (
                    <Link href={titleHref} style={titleStyle}>
                      {fav.title}
                    </Link>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ color: color.textDim, fontSize: 12 }}>
                      <span style={{ color: color.gold, fontWeight: 600, marginRight: 4 }}>{isVideo ? "VIDEO" : "ARTICLE"}</span>
                      {fav.source || domain}
                      {fav.pubDate ? ` · ${new Date(fav.pubDate).toLocaleDateString(locale)}` : ""}
                      {isVideo && fav.hasTranscription && fav.videoId && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            onClick={() => toggleTranscription(fav)}
                            style={{
                              background: "none",
                              border: "none",
                              color: color.textMuted,
                              fontSize: 11,
                              cursor: "pointer",
                              padding: 0,
                              fontFamily: "inherit",
                              textDecoration: "underline",
                              textUnderlineOffset: 2,
                            }}
                          >
                            {loadingTranscription[fav.videoId]
                              ? "..."
                              : expandedTranscriptions[fav.videoId] !== undefined
                                ? (lang === "fr" ? "masquer" : "hide")
                                : "transcription"}
                          </button>
                        </>
                      )}
                    </span>
                    <CopyLinkButton url={fav.url} />
                  </div>
                  {isVideo && fav.videoId && expandedTranscriptions[fav.videoId] !== undefined && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "12px 14px",
                        background: "rgba(255,255,255,0.03)",
                        border: `1px solid ${color.border}`,
                        borderRadius: 8,
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: color.textSecondary,
                      }}
                    >
                      {expandedTranscriptions[fav.videoId] ? (
                        <>
                          {(() => {
                            const tts = summaryMdToTtsText(
                              expandedTranscriptions[fav.videoId]!,
                              fav.title,
                              lang,
                            );
                            return tts ? (
                              <div style={{ marginBottom: 12 }}>
                                <AudioPlayer text={tts} lang={lang} speed={speed} voice={voice} context="favorites" />
                              </div>
                            ) : null;
                          })()}
                          <ReactMarkdown components={mdComponents}>{expandedTranscriptions[fav.videoId]!}</ReactMarkdown>
                        </>
                      ) : (
                        <span style={{ color: color.textDim, fontStyle: "italic" }}>
                          {lang === "fr" ? "Transcription indisponible" : "Transcription unavailable"}
                        </span>
                      )}
                      <div style={{ textAlign: "right", marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => toggleTranscription(fav)}
                          style={{
                            background: "none",
                            border: "none",
                            color: color.textDim,
                            fontSize: 11,
                            cursor: "pointer",
                            padding: 0,
                            fontFamily: "inherit",
                            textDecoration: "underline",
                            textUnderlineOffset: 2,
                          }}
                        >
                          {lang === "fr" ? "replier" : "collapse"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
