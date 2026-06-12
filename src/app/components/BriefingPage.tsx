"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { dateLocale, t } from "@/lib/i18n";
import { color, spinnerStyle } from "@/lib/theme";
import { useTopFeed, type TopFeedArticle } from "@/hooks/useTopFeed";
import { type VideoItem } from "@/app/components/VideoCard";
import { HomeTop24hHero } from "@/app/components/HomeTop24hHero";
import type { TopicLabel } from "@/lib/types";
import type { AppNavPage } from "@/app/components/AppHeader";
import { trackEvent } from "@/lib/track";
import { SectionSpinner } from "@/app/components/briefing/SectionSpinner";
import { kicker, ctaLink } from "@/app/components/briefing/styles";
import { TrendingStrip, type TrendingTopic } from "@/app/components/briefing/TrendingStrip";
import { FooterCTAs } from "@/app/components/briefing/FooterCTAs";
import { HeroStory } from "@/app/components/briefing/HeroStory";
import { Top5Section } from "@/app/components/briefing/Top5Section";
import { VideosBriefingSection } from "@/app/components/briefing/VideosBriefingSection";
import { YourTopicsSection, type MiniArticle } from "@/app/components/briefing/YourTopicsSection";
import { selectTopicStrips, MAX_TOPIC_STRIPS } from "@/app/components/briefing/select-topic-strips";
import { NewsletterSignupPrompt } from "@/app/components/briefing/NewsletterSignupPrompt";
import { DailySummaryTeaser, type SummaryRoute } from "@/app/components/briefing/DailySummaryTeaser";
import { RecentVideoPagesSection } from "@/app/components/briefing/RecentVideoPagesSection";

// v2.8.2+ — the home Top 24h podcast « Lu / Read » state moved from a
// single cookie keyed to today's UTC date to a per-snapshot-date store
// owned by `<HomeTop24hHero>` itself (DB-backed via
// /api/user/activity for authenticated users, comma-separated cookie
// list for anonymous visitors). The `BriefingPage` no longer plumbs
// `isRead` / `onToggleRead` down to the hero — the hero collapses in
// place when checked, and the slot in the page stays unchanged.


export function BriefingPage({
  lang,
  isAuthenticated,
  favoriteUrls,
  onToggleFavorite,
  onRequestAuth,
  onNavigate,
  onOpenTopicArticles,
  topicLabels,
  preferredTopicIds,
  ttsSpeed,
  ttsVoice,
  onOpenChat,
}: {
  lang: Lang;
  isAuthenticated: boolean;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string; sourceType?: "article" | "video" }) => void;
  onRequestAuth: () => void;
  onNavigate: (page: AppNavPage) => void;
  onOpenTopicArticles: (topicId: string) => void;
  topicLabels: TopicLabel[];
  /** User's preferred topic IDs. null when not configured / anonymous. */
  preferredTopicIds: string[] | null;
  /** TTS settings forwarded to the VideoCard's audio player. */
  ttsSpeed: number;
  ttsVoice: string;
  /** Opens the Daily Podcast chat side panel (owned by the SPA shell).
   *  Used by the discovery hint under the podcast hero. */
  onOpenChat?: () => void;
}) {
  const locale = dateLocale(lang);

  // ─── « New since your last visit » ──────────────────────────────────
  // previousVisitAt = the most recent prior visit timestamp (ms).
  // Sourced from localStorage (per-device) and, for signed-in users,
  // from `user_activity` (cross-device) — we keep the most RECENT of the
  // two as the cutoff so we never over-count. On mount we read the prior
  // value, then bump it to now for the next visit. `null` on a first-ever
  // visit (no badge shown).
  const [previousVisitAt, setPreviousVisitAt] = useState<number | null>(null);
  useEffect(() => {
    let localPrev: number | null = null;
    try {
      const raw = window.localStorage.getItem("homeLastVisitAt");
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n)) localPrev = n;
      window.localStorage.setItem("homeLastVisitAt", String(Date.now()));
    } catch {
      /* storage disabled — DB path (if signed in) still works */
    }
    setPreviousVisitAt(localPrev);

    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/activity?type=home_visit", { cache: "no-store" });
        if (res.ok && !cancelled) {
          const json: { entries?: Array<{ last_clicked_at?: string }> } = await res.json();
          const iso = json.entries?.[0]?.last_clicked_at;
          const t = iso ? new Date(iso).getTime() : NaN;
          if (Number.isFinite(t)) {
            setPreviousVisitAt((cur) => (cur == null ? t : Math.max(cur, t)));
          }
        }
        // Bump the cross-device marker for next time (after reading it).
        await fetch("/api/user/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity_type: "home_visit", target_id: "home", action: "visit", value: 1 }),
        });
      } catch {
        /* best-effort — local cutoff already applies */
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // ─── Top feed (powers Top 5; the hero gets its own freshness-priority
  //      query — see heroStory below) ───────────────────────────────────
  const { articles: topFeed, loading: topFeedLoading } = useTopFeed({
    poll: false,
    lang,
    preferredTopics: null,
    enabled: true,
  });

  // ─── Top story (Hero) ────────────────────────────────────────────────
  // Dedicated /api/news/top-story query. The hero is **synchronized
  // across all visitors** of the same language: every user hitting the
  // page within the same 10-minute wall-clock bucket sees the exact
  // same article in their language (FR → FR top story, EN → EN top
  // story). Endpoint returns null when nothing matches, in which case
  // we fall back to topFeed[0] so the hero never goes empty.
  //
  // The endpoint serves CDN-cacheable responses keyed by `?lang=` and
  // bucketed on 10-minute boundaries (`s-maxage=<remaining>`), so by
  // default the browser hits the Netlify edge cache and gets the same
  // payload as everyone else.
  //
  // Refresh triggers (only this card refreshes, the rest of the
  // briefing is left untouched):
  //   - On mount + on `lang` change.
  //   - Aligned to the next wall-clock 10-min boundary, then every
  //     10 minutes — so all clients flip together.
  //   - When the tab becomes visible after being hidden — fixes the
  //     case where the user comes back after lunch and sees a stale
  //     hero (background tabs throttle setInterval to once per minute,
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

  // ─── Latest daily summary (today or yesterday fallback) ─────────────
  const [summaryRoutes, setSummaryRoutes] = useState<SummaryRoute[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  useEffect(() => {
    setSummaryLoading(true);
    fetch("/api/summaries/routes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: SummaryRoute[]) => setSummaryRoutes(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, []);

  const latestSummary = useMemo(() => {
    return summaryRoutes.find((r) => r.lang === lang) ?? null;
  }, [summaryRoutes, lang]);

  // ─── Trending topics (powered by /api/topics/trending) ──────────────
  const [trending, setTrending] = useState<TrendingTopic[]>([]);
  useEffect(() => {
    const params = new URLSearchParams({ since: "24h", lang, limit: "10" });
    if (preferredTopicIds && preferredTopicIds.length > 0) {
      params.set("topics", preferredTopicIds.join(","));
    }
    fetch(`/api/topics/trending?${params}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: TrendingTopic[]) => {
        setTrending(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setTrending([]));
  }, [lang, preferredTopicIds]);

  // ─── Recent SSR per-video pages ─────────────────────────────────────
  // The list itself owns its pagination state — see
  // `RecentVideoPagesSection`. Page size = 1 calendar day (today by
  // default), with « Plus ancien / Plus récent » buttons to walk
  // through history one day at a time.

  // ─── Per-preferred-topic mini strips (logged-in users) ──────────────
  // Selection (incl. cross-topic dedup by link, first-selected-wins) is
  // the pure `selectTopicStrips()` — see its header comment. The section
  // targets a stable 4 blocks: every preferred topic is a candidate (not
  // just the first 4), and when fewer than 4 blocks survive — a topic
  // with no article ≥ min-score in 24 h, or emptied by dedup — a second
  // fetch round pulls the site's other topics as fill candidates, ranked
  // by best article score. State is set once per round, so the section
  // never renders a partial set that later shrinks.
  const [yourTopicArticles, setYourTopicArticles] = useState<Record<string, MiniArticle[]>>({});
  useEffect(() => {
    if (!isAuthenticated || !preferredTopicIds || preferredTopicIds.length === 0) {
      setYourTopicArticles({});
      return;
    }
    let cancelled = false;
    const fetchStrip = (id: string) =>
      fetch(`/api/news?topic=${encodeURIComponent(id)}&hours=24&lang=${lang}&count=3`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { articles?: MiniArticle[] } | null) => ({ id, articles: data?.articles ?? [] }))
        .catch(() => ({ id, articles: [] as MiniArticle[] }));

    (async () => {
      const byTopic: Record<string, MiniArticle[]> = {};
      const prefResults = await Promise.all(preferredTopicIds.map(fetchStrip));
      for (const r of prefResults) byTopic[r.id] = r.articles;

      let strips = selectTopicStrips({ preferredIds: preferredTopicIds, articlesByTopic: byTopic });

      if (Object.keys(strips).length < MAX_TOPIC_STRIPS) {
        const fillIds = topicLabels
          .map((tl) => tl.id)
          .filter((id) => !preferredTopicIds.includes(id));
        const fillResults = await Promise.all(fillIds.map(fetchStrip));
        if (cancelled) return;
        for (const r of fillResults) byTopic[r.id] = r.articles;
        strips = selectTopicStrips({
          preferredIds: preferredTopicIds,
          fillIds,
          articlesByTopic: byTopic,
        });
      }

      if (cancelled) return;
      setYourTopicArticles(strips);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, preferredTopicIds, lang, topicLabels]);

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
        setVideoHasOlder(Boolean(json.hasOlder));
        if (json.video) {
          const { summaryMd, ...rest } = json.video;
          setVideos([rest]);
          setVideoSummaries(summaryMd ? { [rest.videoId]: summaryMd } : {});
        } else {
          setVideos([]);
          setVideoSummaries({});
        }
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

  // Prefer the dedicated /api/news/top-story result for the hero; fall
  // back to the highest-scored item in the top feed only in **live**
  // mode (offset === 0) — in history mode we want to faithfully show
  // exactly what the queue returned (or null), never a different
  // article from the live top-feed.
  const heroArticle =
    articleHistoryOffset === 0
      ? (heroStory ?? topFeed[0] ?? null)
      : heroStory;
  const heroBlocked = heroLoading && topFeedLoading && !heroArticle;
  // Top 5 excludes whatever is currently in the hero so the same
  // article never shows up twice on the page.
  const heroLink = heroArticle?.link ?? null;
  const top5 = topFeed.filter((a) => a.link !== heroLink).slice(0, 5);

  // Count of top-feed stories published since the user's last visit —
  // drives the « N nouveaux » badge on the « À lire maintenant » header.
  const newSinceVisit =
    previousVisitAt == null
      ? 0
      : topFeed.filter((a) => {
          const t = new Date(a.pubDate).getTime();
          return Number.isFinite(t) && t > previousVisitAt;
        }).length;

  const showChooseTopics =
    isAuthenticated &&
    (!preferredTopicIds || preferredTopicIds.length === 0) &&
    Object.keys(yourTopicArticles).length === 0;

  return (
    <div>
      {heroBlocked ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <span style={spinnerStyle(28)} />
        </div>
      ) : (
        <>
          {/* ─── 1 · Podcast du jour (flagship) ──────────────────────
              Pre-computed daily AI briefing pinned at the very top.
              Self-fetches the latest snapshot so its loading / 404
              states stay isolated (a missing snapshot just hides the
              card). The « Lu » state is owned internally by the hero
              (DB-backed for authenticated users via `user_activity`,
              cookie list for anonymous visitors). */}
          <HomeTop24hHero lang={lang} onNavigate={onNavigate} />

          {/* Chat discovery hint — opens the Daily Podcast chat grounded
              in today's briefing. */}
          {onOpenChat && (
            <div style={{ marginTop: -20, marginBottom: 28 }}>
              <button
                type="button"
                onClick={onOpenChat}
                style={{
                  ...ctaLink,
                  marginTop: 0,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {t("homeAskAiHint", lang)}
              </button>
            </div>
          )}

          {/* ─── 2 · TOP VIDEO · maintenant ───────────────────────────
              Kept at the top AND distinct from the Top story below
              (deliberate separation). */}
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

          {/* ─── 3 · Top story ───────────────────────────────────────── */}
          {heroArticle && (
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
          )}

          {/* ─── 4 · Newsletter CTA (single placement) ────────────────
              The component self-hides for owners and already-subscribed
              users, so a single render covers anonymous + members. */}
          <NewsletterSignupPrompt lang={lang} onRequestAuth={onRequestAuth} />

          {/* ─── 5 · À lire maintenant : Top 5 (col. principale) +
              Tendances 24h (rail). Two-column grid driven by a container
              query so it collapses to one column on phones AND whenever
              the chat panel narrows the content area (the section's
              inline size already reflects the `--chat-width` push). ─── */}
          {(top5.length > 0 || trending.length > 0) && (
            <section className="briefing-readnow" style={{ marginBottom: 36 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    ...kicker(color.gold),
                    fontSize: 12,
                    letterSpacing: "0.14em",
                    marginBottom: 0,
                  }}
                >
                  {lang === "fr" ? "À lire maintenant" : "Read now"}
                </span>
                {newSinceVisit > 0 && (
                  <span
                    style={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#000",
                      background: color.gold,
                      borderRadius: 999,
                      padding: "2px 9px",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {t("homeNewSinceVisit", lang).replace("{n}", String(newSinceVisit))}
                  </span>
                )}
              </div>
              <div className="briefing-readnow-grid">
                {top5.length > 0 && (
                  <div className="briefing-readnow-main">
                    <Top5Section
                      articles={top5}
                      lang={lang}
                      locale={locale}
                      topicLabels={topicLabels}
                      favoriteUrls={favoriteUrls}
                      onToggleFavorite={onToggleFavorite}
                      isAuthenticated={isAuthenticated}
                      onRequestAuth={onRequestAuth}
                      onSeeAll={() => onNavigate("topArticles")}
                    />
                  </div>
                )}

                {trending.length > 0 && (
                  <div className="briefing-readnow-rail">
                    <TrendingStrip
                      topics={trending}
                      lang={lang}
                      onTopicClick={onOpenTopicArticles}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ─── 6 · Vos topics (personnalisé, remonté) ──────────────── */}
          {Object.keys(yourTopicArticles).length > 0 ? (
            <YourTopicsSection
              articlesByTopic={yourTopicArticles}
              topicLabels={topicLabels}
              lang={lang}
              favoriteUrls={favoriteUrls}
              onToggleFavorite={onToggleFavorite}
              isAuthenticated={isAuthenticated}
              onRequestAuth={onRequestAuth}
              onSeeAllForTopic={onOpenTopicArticles}
            />
          ) : (
            showChooseTopics && (
              <section style={{ marginBottom: 36 }}>
                <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
                  {t("homeChooseTopicsKicker", lang)}
                </div>
                <div
                  style={{
                    background: color.surface,
                    border: `1px solid ${color.border}`,
                    borderRadius: 10,
                    padding: 20,
                  }}
                >
                  <h3
                    style={{
                      color: color.text,
                      margin: 0,
                      fontSize: 20,
                      fontFamily: "ui-serif, Georgia, serif",
                      fontWeight: 400,
                    }}
                  >
                    {t("homeChooseTopicsTitle", lang)}
                  </h3>
                  <p
                    className="app-paragraph-lg"
                    style={{ color: color.articleSnippet, marginTop: 10, marginBottom: 16 }}
                  >
                    {t("homeChooseTopicsBody", lang)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate("myTopics")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: `1px solid ${color.gold}`,
                      background: "rgba(201,162,39,0.10)",
                      color: color.gold,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {t("homeChooseTopicsButton", lang)}
                  </button>
                </div>
              </section>
            )
          )}

          {/* ─── 7 · Toutes les vidéos transcrites (zone browse) ─────── */}
          <RecentVideoPagesSection
            topicLabels={topicLabels}
            lang={lang}
          />

          {/* ─── 8 · Résumé quotidien topic (teaser) ─────────────────── */}
          {summaryLoading ? (
            <SectionSpinner
              label={
                lang === "fr"
                  ? "Résumé quotidien topic · chargement"
                  : "Daily topic summary · loading"
              }
            />
          ) : (
            latestSummary && (
              <DailySummaryTeaser
                route={latestSummary}
                lang={lang}
                locale={locale}
                topicLabels={topicLabels}
              />
            )
          )}

          {/* ─── 9 · Footer CTAs ─────────────────────────────────────── */}
          <FooterCTAs
            lang={lang}
            isAuthenticated={isAuthenticated}
            onPersonalize={() => onNavigate("myTopics")}
            onSummaries={() => onNavigate("summaries")}
            onVideos={() => onNavigate("videos")}
          />
        </>
      )}
    </div>
  );
}

