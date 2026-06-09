"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { color, card, spinnerStyle } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { relativeTime, scoreTierColor } from "@/app/components/briefing/utils";
import { formatScore } from "@/lib/score-format";
import { trackEvent } from "@/lib/track";

/**
 * « Chaînes YouTube » browse page (v2.13+). Lists every registered
 * channel; clicking one drills into that channel's videos (most recent
 * first) with offset/limit pagination that lazy-loads 10 more at a time
 * (a sentinel auto-loads on scroll, with a « Load more » fallback).
 *
 * Public surface — reads go through `/api/youtube-channels/list` and
 * `/api/youtube-channels/by-channel` (service-key backed). No transcribe
 * controls here; each video links out to YouTube.
 */

interface ChannelListItem {
  channelId: string;
  handle: string | null;
  title: string;
  thumbnailUrl: string | null;
}

interface ChannelVideoItem {
  videoId: string;
  title: string;
  thumbnail: string | null;
  published: string;
  link: string;
  durationSec: number | null;
  viewCount: string | null;
  channelTitle: string;
  summaryScore: number | null;
  appUrl: string | null;
}

const PAGE_SIZE = 10;

function formatDuration(sec: number | null): string {
  if (sec == null || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ChannelsPage({ lang }: { lang: Lang }) {
  const [channels, setChannels] = useState<ChannelListItem[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  const [selected, setSelected] = useState<ChannelListItem | null>(null);
  const [videos, setVideos] = useState<ChannelVideoItem[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [videosLoading, setVideosLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load the channel list once on mount.
  useEffect(() => {
    let cancelled = false;
    setChannelsLoading(true);
    fetch("/api/youtube-channels/list", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { channels: [] }))
      .then((json: { channels?: ChannelListItem[] }) => {
        if (!cancelled) setChannels(json.channels ?? []);
      })
      .catch(() => {
        if (!cancelled) setChannels([]);
      })
      .finally(() => {
        if (!cancelled) setChannelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasMore = page > 0 && page < totalPages;

  const fetchVideos = useCallback(
    async (channelId: string, pageToLoad: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setVideosLoading(true);
      try {
        const res = await fetch(
          `/api/youtube-channels/by-channel?channelId=${encodeURIComponent(channelId)}&page=${pageToLoad}&pageSize=${PAGE_SIZE}&lang=${lang}`,
          { cache: "no-store" },
        );
        const json: {
          items?: ChannelVideoItem[];
          page?: number;
          totalPages?: number;
        } = res.ok ? await res.json() : {};
        const items = json.items ?? [];
        setVideos((prev) => (append ? [...prev, ...items] : items));
        setPage(json.page ?? pageToLoad);
        setTotalPages(json.totalPages ?? 0);
      } catch {
        if (!append) setVideos([]);
      } finally {
        setVideosLoading(false);
        setLoadingMore(false);
      }
    },
    [lang],
  );

  const openChannel = useCallback(
    (ch: ChannelListItem) => {
      trackEvent("channels.open_channel", { target_id: ch.channelId, lang });
      setSelected(ch);
      setVideos([]);
      setPage(0);
      setTotalPages(0);
      void fetchVideos(ch.channelId, 1, false);
    },
    [fetchVideos, lang],
  );

  const back = useCallback(() => {
    setSelected(null);
    setVideos([]);
    setPage(0);
    setTotalPages(0);
  }, []);

  const loadMore = useCallback(() => {
    if (!selected || !hasMore || loadingMore || videosLoading) return;
    void fetchVideos(selected.channelId, page + 1, true);
  }, [selected, hasMore, loadingMore, videosLoading, page, fetchVideos]);

  // Lazy load: auto-fetch the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selected) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [selected, loadMore]);

  // ── Channel list view ──────────────────────────────────────────────
  if (!selected) {
    return (
      <section style={{ marginBottom: 36 }}>
        <h1
          style={{
            color: color.text,
            fontFamily: "ui-serif, Georgia, serif",
            fontSize: 30,
            fontWeight: 400,
            margin: "0 0 8px",
          }}
        >
          {t("channelsTitle", lang)}
        </h1>
        <p style={{ color: color.textMuted, fontSize: 14, marginTop: 0, marginBottom: 22 }}>
          {t("channelsSubtitle", lang)}
        </p>

        {channelsLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <span style={spinnerStyle(26)} />
          </div>
        ) : channels.length === 0 ? (
          <p style={{ color: color.textMuted, fontSize: 14 }}>{t("channelsEmpty", lang)}</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {channels.map((ch) => (
              <button
                key={ch.channelId}
                type="button"
                onClick={() => openChannel(ch)}
                style={{
                  ...card,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "left",
                  cursor: "pointer",
                  marginBottom: 0,
                  borderColor: color.border,
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = color.gold;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = color.border;
                }}
              >
                {ch.thumbnailUrl ? (
                  <img
                    src={ch.thumbnailUrl}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                    style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: color.surfaceHover,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: color.gold,
                      fontWeight: 700,
                    }}
                  >
                    {ch.title.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      color: color.text,
                      fontWeight: 600,
                      fontSize: 14,
                      lineHeight: 1.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ch.title}
                  </span>
                  {ch.handle && (
                    <span
                      style={{
                        display: "block",
                        color: color.textMuted,
                        fontSize: 12,
                        fontFamily: "ui-monospace, Menlo, monospace",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ch.handle.startsWith("@") ? ch.handle : `@${ch.handle}`}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  // ── Single-channel video list view ─────────────────────────────────
  return (
    <section style={{ marginBottom: 36 }}>
      <button
        type="button"
        onClick={back}
        style={{
          background: "transparent",
          border: "none",
          color: color.gold,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: "inherit",
          padding: 0,
          marginBottom: 14,
        }}
      >
        {t("channelsBack", lang)}
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        {selected.thumbnailUrl && (
          <img
            src={selected.thumbnailUrl}
            alt=""
            width={48}
            height={48}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        )}
        <h1
          style={{
            color: color.text,
            fontFamily: "ui-serif, Georgia, serif",
            fontSize: 26,
            fontWeight: 400,
            margin: 0,
          }}
        >
          {selected.title}
        </h1>
      </div>

      {videosLoading && videos.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <span style={spinnerStyle(26)} />
        </div>
      ) : videos.length === 0 ? (
        <p style={{ color: color.textMuted, fontSize: 14 }}>{t("channelsNoVideos", lang)}</p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {videos.map((v) => {
              const duration = formatDuration(v.durationSec);
              const hasScore =
                typeof v.summaryScore === "number" &&
                v.summaryScore >= 1 &&
                v.summaryScore <= 10;
              // Prefer the on-site 8news per-video page; only fall back to
              // YouTube (new tab) when the video has no on-site page yet.
              const internal = Boolean(v.appUrl);
              const href = v.appUrl ?? v.link;
              return (
                <a
                  key={v.videoId}
                  href={href}
                  {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                  onClick={() =>
                    trackEvent("channels.video_click", {
                      target_id: v.videoId,
                      lang,
                      meta: { dest: internal ? "app" : "youtube" },
                    })
                  }
                  style={{ textDecoration: "none", color: "inherit", display: "block" }}
                >
                  <div style={{ position: "relative", aspectRatio: "16 / 9", marginBottom: 8 }}>
                    {v.thumbnail ? (
                      <img
                        src={v.thumbnail}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: 8,
                          border: `1px solid ${color.border}`,
                          display: "block",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: 8,
                          background: color.surfaceHover,
                          border: `1px solid ${color.border}`,
                        }}
                      />
                    )}
                    {duration && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 6,
                          right: 6,
                          background: "rgba(0,0,0,0.82)",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: 4,
                          fontFamily: "ui-monospace, Menlo, monospace",
                        }}
                      >
                        {duration}
                      </span>
                    )}
                    {hasScore && (
                      <span
                        aria-label={`Score ${v.summaryScore}/10`}
                        style={{
                          position: "absolute",
                          top: 6,
                          left: 6,
                          background: "rgba(0,0,0,0.82)",
                          color: scoreTierColor(v.summaryScore as number),
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          fontFamily: "ui-monospace, Menlo, monospace",
                          border: `1px solid ${scoreTierColor(v.summaryScore as number)}`,
                        }}
                      >
                        {formatScore(v.summaryScore as number)}/10
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      color: color.text,
                      fontSize: 14,
                      fontWeight: 500,
                      lineHeight: 1.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {v.title}
                  </div>
                  <div
                    style={{
                      color: color.textMuted,
                      fontSize: 12,
                      marginTop: 4,
                      fontFamily: "ui-monospace, Menlo, monospace",
                    }}
                  >
                    {relativeTime(v.published, lang)}
                    {v.viewCount ? ` · ${v.viewCount}` : ""}
                  </div>
                </a>
              );
            })}
          </div>

          {/* Lazy-load sentinel + manual fallback. */}
          <div ref={sentinelRef} style={{ height: 1 }} />
          {(hasMore || loadingMore) && (
            <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
              {loadingMore ? (
                <span style={spinnerStyle(22)} />
              ) : (
                <button
                  type="button"
                  onClick={loadMore}
                  style={{
                    background: "transparent",
                    color: color.gold,
                    border: `1px solid ${color.gold}`,
                    borderRadius: 999,
                    padding: "8px 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t("channelsLoadMore", lang)}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
