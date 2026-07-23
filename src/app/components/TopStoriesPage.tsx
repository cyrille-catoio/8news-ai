"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { useTopFeed, type TopFeedArticle } from "@/hooks/useTopFeed";
import { type VideoItem } from "@/app/components/VideoCard";
import type { TopicLabel } from "@/lib/types";
import type { AppNavPage } from "@/app/components/AppHeader";
import { trackEvent } from "@/lib/track";
import { SectionSpinner } from "@/app/components/briefing/SectionSpinner";
import { HeroStory } from "@/app/components/briefing/HeroStory";
import { VideosBriefingSection } from "@/app/components/briefing/VideosBriefingSection";

/**
 * Dedicated « Top Stories » page (v2.20.x) — hosts the TOP VIDEO and
 * TOP STORY cards that used to sit at the top of the home briefing.
 * The two blocks were moved here verbatim (fetch logic included) to
 * declutter the home; they keep their contract:
 *   - both are **synchronized across visitors** of the same language
 *     on 10-minute wall-clock buckets (`/api/videos/top` and
 *     `/api/news/top-story`),
 *   - the ‹ › chevrons browse past picks from `home_surface_queue`,
 *   - the article side falls back to the live top feed's best item
 *     when the dedicated endpoint returns nothing.
 */
export function TopStoriesPage({
  lang,
  isAuthenticated,
  favoriteUrls,
  onToggleFavorite,
  onRequestAuth,
  onNavigate,
  topicLabels,
  ttsSpeed,
  ttsVoice,
}: {
  lang: Lang;
  isAuthenticated: boolean;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string; sourceType?: "article" | "video" }) => void;
  onRequestAuth: () => void;
  onNavigate: (page: AppNavPage) => void;
  topicLabels: TopicLabel[];
  /** TTS settings forwarded to the VideoCard's audio player. */
  ttsSpeed: number;
  ttsVoice: string;
}) {
  // ─── Top feed (hero fallback only on this page) ──────────────────────
  const { articles: topFeed, loading: topFeedLoading } = useTopFeed({
    poll: false,
    lang,
    preferredTopics: null,
    enabled: true,
  });

  // ─── Top story ───────────────────────────────────────────────────────
  // Dedicated /api/news/top-story query. The card is **synchronized
  // across all visitors** of the same language: every user hitting the
  // page within the same 10-minute wall-clock bucket sees the exact
  // same article in their language (FR → FR top story, EN → EN top
  // story). Endpoint returns null when nothing matches, in which case
  // we fall back to topFeed[0] so the card never goes empty.
  //
  // Refresh triggers (only this card refreshes):
  //   - On mount + on `lang` change.
  //   - Aligned to the next wall-clock 10-min boundary, then every
  //     10 minutes — so all clients flip together.
  //   - When the tab becomes visible after being hidden — fixes the
  //     case where the user comes back after lunch and sees a stale
  //     card (background tabs throttle setInterval to once per minute,
  //     but visibilitychange fires immediately on focus).
  const [heroStory, setHeroStory] = useState<TopFeedArticle | null>(null);
  const [heroLoading, setHeroLoading] = useState(true);
  // History navigation state — `0` means live (auto-refreshing on the
  // 10-min bucket); any positive value freezes the auto-refresh and
  // shows the row at that offset in `home_surface_queue` ordered by
  // `last_displayed_at DESC`. Driven by the discreet ‹ › chevrons in
  // the hero card header.
  const [articleHistoryOffset, setArticleHistoryOffset] = useState(0);
  const [articleHasOlder, setArticleHasOlder] = useState(false);
  useEffect(() => {
    let cancelled = false;

    async function fetchTopStory(showLoading: boolean) {
      if (showLoading) setHeroLoading(true);
      try {
        // `cache: "no-store"` — Netlify's edge cache was collapsing
        // distinct `?offset=N` URLs onto one entry by hashing the path
        // only, which made the « previous » chevrons return the same
        // article every time. The endpoint also sends no-store
        // headers; the explicit option here makes the browser /
        // service worker layer can't sneak in a cached response. The
        // server still dedups within a bucket via its module cache.
        const r = await fetch(
          `/api/news/top-story?lang=${lang}&offset=${articleHistoryOffset}`,
          { cache: "no-store" },
        );
        const json: {
          article: TopFeedArticle | null;
          hasOlder?: boolean;
        } = r.ok ? await r.json() : { article: null };
        if (cancelled) return;
        setHeroStory(json.article ?? null);
        setArticleHasOlder(Boolean(json.hasOlder));
      } catch {
        // Silent fail — keep the previous hero on screen rather than
        // wiping it on a transient network blip.
      } finally {
        if (!cancelled && showLoading) setHeroLoading(false);
      }
    }

    fetchTopStory(true);

    const HERO_REFRESH_MS = 10 * 60 * 1000;
    // Auto-refresh only in live mode. When the user is browsing past
    // picks (offset > 0), suspend the timer + visibility refetch so the
    // hero doesn't snap back to live unprompted.
    const liveMode = articleHistoryOffset === 0;
    if (!liveMode) {
      return () => {
        cancelled = true;
      };
    }

    // Align the first interval refresh to the next wall-clock 10-min
    // boundary (+200ms safety) so every browser flips into the new
    // bucket at roughly the same moment. After the first aligned
    // refresh we settle into a plain `setInterval(10 min)`.
    const msToBoundary = HERO_REFRESH_MS - (Date.now() % HERO_REFRESH_MS) + 200;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      fetchTopStory(false);
      intervalId = setInterval(() => fetchTopStory(false), HERO_REFRESH_MS);
    }, msToBoundary);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Tab just got refocused — refresh immediately so the user
        // doesn't stare at a stale hero from before they switched away.
        fetchTopStory(false);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [lang, articleHistoryOffset]);

  // Reset to live mode on lang switch so a user toggling FR↔EN doesn't
  // stay stuck on a frozen historical pick from the other queue.
  useEffect(() => {
    setArticleHistoryOffset(0);
  }, [lang]);

  const onArticleHistoryPrev = useCallback(() => {
    if (!articleHasOlder) return;
    trackEvent("top_story.history_older", { lang, meta: { fromOffset: articleHistoryOffset } });
    setArticleHistoryOffset((o) => o + 1);
  }, [articleHasOlder, articleHistoryOffset, lang]);
  const onArticleHistoryNext = useCallback(() => {
    if (articleHistoryOffset === 0) return;
    trackEvent("top_story.history_newer", { lang, meta: { fromOffset: articleHistoryOffset } });
    setArticleHistoryOffset((o) => Math.max(0, o - 1));
  }, [articleHistoryOffset, lang]);

  // ─── TOP VIDEO · MAINTENANT ─────────────────────────────────────────
  // Single transcribed YouTube recap, scored ≥ 8/10 by the AI cron.
  // Picked + cached server-side by `/api/videos/top?lang=...` on the
  // same 10-minute wall-clock bucket as `/api/news/top-story`, so all
  // visitors of a given language see the exact same video in a window
  // and the CDN serves a shared payload (no Supabase round-trip per
  // visitor). When no recap meets the bar, the endpoint returns
  // `{ video: null }` and the section hides itself.
  //
  // The render pipeline still expects `videos: VideoItem[]` +
  // `videoSummaries: Record<string, string>` (so VideosBriefingSection
  // and VideoCard work unchanged), so we just adapt-and-set on each
  // refresh from the single-item endpoint response.
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoSummaries, setVideoSummaries] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});
  const [videosLoading, setVideosLoading] = useState(true);
  // History navigation state for the TOP VIDEO card — same semantics
  // as the article side. `0` = live, positive = past pick at that
  // offset in home_surface_queue (kind=video), driven by the chevrons.
  const [videoHistoryOffset, setVideoHistoryOffset] = useState(0);
  const [videoHasOlder, setVideoHasOlder] = useState(false);
  /** While true, skip TOP VIDEO interval + visibility refetch so iframe playback is not torn down. */
  const topVideoPlaybackRef = useRef(false);
  const topVideoId = videos[0]?.videoId;
  const onTopVideoPlaybackChange = useCallback((playing: boolean) => {
    topVideoPlaybackRef.current = playing;
  }, []);

  useEffect(() => {
    topVideoPlaybackRef.current = false;
  }, [topVideoId]);

  useEffect(() => {
    let cancelled = false;

    type TopVideoApiPayload = {
      video: (VideoItem & { summaryMd: string | null }) | null;
      hasOlder?: boolean;
    };

    async function fetchTopVideo(showLoading: boolean) {
      if (showLoading) setVideosLoading(true);
      try {
        // `cache: "no-store"` — see /api/news/top-story fetch comment.
        // The server is no-store across all CDN layers; the explicit
        // option here makes sure the browser can't replay a cached
        // response when only the offset changes between clicks.
        const r = await fetch(
          `/api/videos/top?lang=${lang}&offset=${videoHistoryOffset}`,
          { cache: "no-store" },
        );
        const json: TopVideoApiPayload = r.ok
          ? await r.json()
          : { video: null };
        if (cancelled) return;
        if (json.video) {
          const { summaryMd, ...rest } = json.video;
          setVideos([rest]);
          setVideoSummaries(summaryMd ? { [rest.videoId]: summaryMd } : {});
          setVideoHasOlder(Boolean(json.hasOlder));
        } else if (showLoading) {
          // Explicit load (initial mount, lang switch, history chevron):
          // honor the empty pick and hide the section.
          setVideos([]);
          setVideoSummaries({});
          setVideoHasOlder(Boolean(json.hasOlder));
        }
        // Silent background refresh (interval / visibilitychange) that
        // returned no video: KEEP the one already on screen instead of
        // blanking it out. A transient empty pick — a bucket flip, a
        // cross-instance cache miss, or the rotation landing on a row
        // whose backing video just aged past the 24h window — must not
        // make the TOP VIDEO card appear then vanish under the user.
      } catch {
        // Silent refresh: keep the current top video on transient failures.
      } finally {
        if (!cancelled && showLoading) setVideosLoading(false);
      }
    }

    fetchTopVideo(true);

    const VIDEO_REFRESH_MS = 10 * 60 * 1000;
    const liveMode = videoHistoryOffset === 0;
    if (!liveMode) {
      return () => {
        cancelled = true;
      };
    }

    const msToBoundary = VIDEO_REFRESH_MS - (Date.now() % VIDEO_REFRESH_MS) + 500;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      if (!topVideoPlaybackRef.current) {
        fetchTopVideo(false);
      }
      intervalId = setInterval(() => {
        if (cancelled || topVideoPlaybackRef.current) return;
        fetchTopVideo(false);
      }, VIDEO_REFRESH_MS);
    }, msToBoundary);

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (topVideoPlaybackRef.current) return;
      fetchTopVideo(false);
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [lang, videoHistoryOffset]);

  useEffect(() => {
    setVideoHistoryOffset(0);
  }, [lang]);

  const onVideoHistoryPrev = useCallback(() => {
    if (!videoHasOlder) return;
    trackEvent("top_video.history_older", { lang, meta: { fromOffset: videoHistoryOffset } });
    setVideoHistoryOffset((o) => o + 1);
  }, [videoHasOlder, videoHistoryOffset, lang]);
  const onVideoHistoryNext = useCallback(() => {
    if (videoHistoryOffset === 0) return;
    trackEvent("top_video.history_newer", { lang, meta: { fromOffset: videoHistoryOffset } });
    setVideoHistoryOffset((o) => Math.max(0, o - 1));
  }, [videoHistoryOffset, lang]);

  // Same logic as VideosPage.handleTranscribe — POSTs the video to the
  // transcribe endpoint and writes the resulting summaryMd into local
  // state so the VideoCard can re-render with it.
  const handleTranscribe = useCallback(async (v: VideoItem) => {
    setTranscribing((prev) => ({ ...prev, [v.videoId]: true }));
    try {
      const res = await fetch("/api/youtube-channels/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: v.videoId, title: v.title, channelId: v.channelId, lang }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const { summaryMd } = await res.json();
      setVideoSummaries((prev) => ({ ...prev, [v.videoId]: summaryMd }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setVideoSummaries((prev) => ({ ...prev, [v.videoId]: `> **Error:** ${msg}` }));
    } finally {
      setTranscribing((prev) => ({ ...prev, [v.videoId]: false }));
    }
  }, [lang]);

  // Prefer the dedicated /api/news/top-story result for the card; fall
  // back to the highest-scored item in the top feed only in **live**
  // mode (offset === 0) — in history mode we want to faithfully show
  // exactly what the queue returned (or null), never a different
  // article from the live top-feed.
  const heroArticle =
    articleHistoryOffset === 0
      ? (heroStory ?? topFeed[0] ?? null)
      : heroStory;
  const heroBlocked = heroLoading && topFeedLoading && !heroArticle;

  return (
    <div>
      {/* ─── 1 · TOP VIDEO · maintenant ─────────────────────────────── */}
      {videosLoading ? (
        <SectionSpinner
          label={lang === "fr" ? "TOP VIDEO · MAINTENANT" : "TOP VIDEO · NOW"}
          goldBorder
        />
      ) : (
        videos.length > 0 && (
          <VideosBriefingSection
            videos={videos}
            videoSummaries={videoSummaries}
            transcribing={transcribing}
            onTranscribe={handleTranscribe}
            lang={lang}
            ttsSpeed={ttsSpeed}
            ttsVoice={ttsVoice}
            favoriteUrls={favoriteUrls}
            onToggleFavorite={onToggleFavorite}
            isAuthenticated={isAuthenticated}
            onRequestAuth={onRequestAuth}
            onSeeAll={() => onNavigate("videos")}
            historyOffset={videoHistoryOffset}
            canGoOlder={videoHasOlder}
            onHistoryPrev={onVideoHistoryPrev}
            onHistoryNext={onVideoHistoryNext}
            topicLabels={topicLabels}
            onPlaybackChange={onTopVideoPlaybackChange}
          />
        )
      )}

      {/* ─── 2 · Top story ──────────────────────────────────────────── */}
      {heroArticle ? (
        <HeroStory
          article={heroArticle}
          lang={lang}
          isFavorite={favoriteUrls.has(heroArticle.link)}
          isAuthenticated={isAuthenticated}
          onToggleFavorite={onToggleFavorite}
          onRequestAuth={onRequestAuth}
          historyOffset={articleHistoryOffset}
          canGoOlder={articleHasOlder}
          onHistoryPrev={onArticleHistoryPrev}
          onHistoryNext={onArticleHistoryNext}
          topicLabels={topicLabels}
        />
      ) : heroBlocked ? (
        <SectionSpinner
          label={lang === "fr" ? "TOP STORY · MAINTENANT" : "TOP STORY · NOW"}
          goldBorder
        />
      ) : null}
    </div>
  );
}
