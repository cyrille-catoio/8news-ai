"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { color, spinnerStyle } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { trackEvent } from "@/lib/track";
import type { VideoItem } from "@/lib/types";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { formatViews, stripEmojis } from "@/app/components/video-card/VideoCardHelpers";
import {
  SHORTS_WINDOW_DAYS,
  buildShortsEmbedUrl,
  clampShortsIndex,
  formatShortDuration,
  shortsCounterLabel,
  shortsDayLabel,
  shortsWindowStartIso,
} from "@/app/components/shorts/ShortsHelpers";

/**
 * Fullscreen « Shorts » page (v2.20+) — the general-menu pill at
 * `/app/shorts`. A TikTok / YouTube-Shorts-style vertical feed of the
 * tracked channels' Shorts (< 180 s) over the last 5 days: one Short
 * per viewport slide inside a `scroll-snap-type: y mandatory` container.
 *
 * Same navigation model as `PodcastReader` (v2.19): native swipe on
 * touch devices, Previous / Next buttons + keyboard (arrows, PageUp /
 * PageDown, Space to pause, M to mute) on every form factor, one
 * IntersectionObserver tracking whichever slide is actually on screen.
 *
 * Player model — ONE persistent "hot" player, not one iframe per slide.
 * YouTube's mobile player deliberately ignores the `autoplay=1` URL
 * param (UA-sniffed data saving), so a fresh iframe per swipe would
 * demand a tap on every single Short. The workaround exploits two
 * player behaviors instead:
 *  - iframe-API commands (`playVideo`, `loadVideoById`) are honored
 *    where the autoplay param is not;
 *  - once a player instance has played ONCE, it keeps its playback
 *    allowance for the lifetime of the iframe — every later
 *    `loadVideoById` starts instantly, sound on, no further gesture,
 *    iOS included.
 * So a single iframe is booted with the first Short and never
 * unmounted while the feed is open; swiping just posts
 * `loadVideoById` to it. N autoplay gates collapse into (at most) one,
 * and that first gate normally passes because reaching the feed took a
 * click and `allow="autoplay"` delegates that activation.
 *
 * Layer trick that keeps the TikTok feel: the player lives in a
 * frame-level layer with `pointer-events: none`, so touches fall
 * THROUGH it onto the slide underneath — the scroll-snap swipe and the
 * per-slide transparent tap surface (tap = play/pause) keep working
 * natively. During a swipe the player fades out, revealing the
 * thumbnails sliding beneath; it fades back in when the next Short
 * reports playing. If playback is genuinely refused (iOS Low Power
 * Mode before any gesture), a gold play affordance appears — one tap
 * activates the player for the whole session.
 *
 * Sound is ON by default: the player boots muted (the embed's only
 * tolerated start) and is unmuted as soon as it answers the iframe-API
 * `listening` handshake; the rail button toggles the persistent
 * preference. `playing` mirrors the REAL player state streamed back
 * via `infoDelivery` messages, so the UI never lies about playback.
 */

/** Post a YouTube iframe-API command to the persistent player. */
function postToPlayer(
  iframe: HTMLIFrameElement | null,
  func:
    | "playVideo"
    | "pauseVideo"
    | "mute"
    | "unMute"
    | "setVolume"
    | "seekTo"
    | "loadVideoById",
  args: Array<string | number | boolean> = [],
) {
  iframe?.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "*",
  );
}

export function ShortsPage({
  lang,
  favoriteUrls,
  onToggleFavorite,
  isAuthenticated,
  onRequestAuth,
  onClose,
  suspendShortcuts = false,
}: {
  lang: Lang;
  favoriteUrls: Set<string>;
  onToggleFavorite: (article: {
    url: string;
    title: string;
    source: string;
    pubDate?: string;
    sourceType?: "article" | "video";
  }) => void;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
  onClose: () => void;
  /** True while a higher-z overlay (the auth modal) is open above the
   *  feed — suspends the document-level shortcuts so Escape/arrows
   *  drive that dialog, not the feed behind it. */
  suspendShortcuts?: boolean;
}) {
  const [shorts, setShorts] = useState<VideoItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  /** Sound ON by default — see the header comment for the activation story. */
  const [muted, setMuted] = useState(false);
  /** REAL playback state, reconciled from the player's infoDelivery stream. */
  const [playing, setPlaying] = useState(true);
  /** Video id the persistent player was booted with (frozen at first feed load). */
  const [bootVideoId, setBootVideoId] = useState<string | null>(null);
  /** Player fades in only while the ACTIVE Short is actually playing. */
  const [playerVisible, setPlayerVisible] = useState(false);
  /** True between a loadVideoById and the player's first stable state
   *  report — gates the gold play affordance so it never flashes
   *  mid-transition. */
  const [pendingLoad, setPendingLoad] = useState(true);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const playerRef = useRef<HTMLIFrameElement | null>(null);
  const bootTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const kickTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  /** Id the hot player SHOULD be playing — guards duplicate loads. */
  const lastLoadedIdRef = useRef<string | null>(null);
  /** Mirror of bootVideoId for the stable message listener. */
  const bootVideoIdRef = useRef<string | null>(null);
  /** Id the player last REPORTED (infoDelivery videoData). Diverges from
   *  `lastLoadedIdRef` when a loadVideoById was posted before the player
   *  was ready and silently dropped — the reconciliation paths below
   *  re-post the load whenever the two disagree. */
  const lastReportedIdRef = useRef<string | null>(null);
  /** User INTENT (autoplay-on-slide vs explicitly paused). `playing` is
   *  what the player reports; this is what we keep nudging it toward. */
  const wantPlayingRef = useRef(true);
  /** Timestamp of the last explicit unmute tap. WebKit pauses a video
   *  that gets unmuted without a fresh gesture; when the pause follows
   *  a real tap we resume unmuted, otherwise we fall back to muted
   *  playback (playback always wins over sound). */
  const lastUnmuteTapAtRef = useRef(0);
  /** True once UNMUTED playback has been OBSERVED working (state 1 with
   *  sound on). From then on the platform has proven it allows it, and
   *  the muted fallbacks must never fire again — reacting to the
   *  transient pause blips of every video switch was re-muting the
   *  feed on each swipe. */
  const unmutedPlaybackOkRef = useRef(false);
  /** Pending persistence check for a pause that contradicts the play
   *  intent — transient blips self-resolve before it fires. */
  const pauseRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Where a Prev/Next burst is heading. `currentIndex` only advances
   *  once the IntersectionObserver sees the slide, which lags the smooth
   *  scroll — chaining clicks from this ref keeps rapid inputs additive
   *  instead of swallowed. Cleared whenever the observer commits. */
  const navTargetRef = useRef<number | null>(null);
  /** Mirrors for the document-level keydown listener (stable binding). */
  const currentIndexRef = useRef(0);
  const mutedRef = useRef(false);
  const playingRef = useRef(true);
  const suspendShortcutsRef = useRef(suspendShortcuts);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    suspendShortcutsRef.current = suspendShortcuts;
  }, [suspendShortcuts]);

  const fetchShorts = useCallback(async () => {
    setShorts(null);
    setLoadError(false);
    try {
      const since = shortsWindowStartIso(new Date(), SHORTS_WINDOW_DAYS);
      const res = await fetch(
        `/api/videos/shorts?days=${SHORTS_WINDOW_DAYS}&since=${encodeURIComponent(since)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { shorts?: VideoItem[] };
      const list = json.shorts ?? [];
      setShorts(list);
      setCurrentIndex(0);
      navTargetRef.current = null;
      if (list.length > 0 && lastLoadedIdRef.current === null) {
        // First successful load: boot the persistent player on the
        // newest Short. Later refetches reuse the hot player via
        // loadVideoById (the [shorts, currentIndex] effect below).
        lastLoadedIdRef.current = list[0].videoId;
        bootVideoIdRef.current = list[0].videoId;
        setBootVideoId(list[0].videoId);
      }
    } catch (err) {
      console.warn("[ShortsPage] feed fetch failed", err);
      setLoadError(true);
      setShorts([]);
    }
  }, []);

  useEffect(() => {
    fetchShorts();
  }, [fetchShorts]);

  // Lock the page scroll behind the overlay while the feed is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Move focus into the dialog on mount and hand it back on close, so
  // keyboard / screen-reader users don't stay parked on the invisible
  // page behind the aria-modal overlay.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  // Clear pending timers on unmount (arrays are read at cleanup time —
  // both are replaced on every boot/load).
  useEffect(() => {
    return () => {
      for (const timer of bootTimersRef.current) clearTimeout(timer);
      for (const timer of kickTimersRef.current) clearTimeout(timer);
      if (pauseRecoveryTimerRef.current) clearTimeout(pauseRecoveryTimerRef.current);
    };
  }, []);

  /** Re-apply the persistent sound preference to the player. */
  const applySoundPref = useCallback((iframe: HTMLIFrameElement | null) => {
    if (mutedRef.current) {
      postToPlayer(iframe, "mute");
    } else {
      postToPlayer(iframe, "unMute");
      postToPlayer(iframe, "setVolume", [100]);
    }
  }, []);

  /**
   * Boot sequence for the freshly mounted persistent iframe. Posts the
   * iframe-API `listening` handshake (repeated — the player ignores
   * messages sent before it is initialized): from then on the player
   * streams `onReady` / `infoDelivery` back to the window listener.
   * Each attempt also nudges playback explicitly, because the mobile
   * player ignores the `autoplay=1` URL param but honors the command.
   */
  const bootPlayer = useCallback(
    (iframe: HTMLIFrameElement) => {
      for (const timer of bootTimersRef.current) clearTimeout(timer);
      bootTimersRef.current = [0, 350, 900, 2000].map((delay) =>
        setTimeout(() => {
          if (playerRef.current !== iframe) return;
          iframe.contentWindow?.postMessage(
            JSON.stringify({ event: "listening", id: "shorts", channel: "widget" }),
            "*",
          );
          if (wantPlayingRef.current && !playingRef.current) {
            if (delay >= 900 && !mutedRef.current && !unmutedPlaybackOkRef.current) {
              // Still stalled with sound on and unmuted playback never
              // proven — trade audio for motion (the sound chip flips
              // so one tap brings audio back).
              mutedRef.current = true;
              setMuted(true);
            }
            applySoundPref(iframe);
            postToPlayer(iframe, "playVideo");
          } else {
            applySoundPref(iframe);
          }
        }, delay),
      );
    },
    [applySoundPref],
  );

  /**
   * Point the hot player at a Short. The fade-out hands the stage to
   * the thumbnails while the player switches; bounded `playVideo`
   * kicks cover players that ignore the load's implicit autoplay
   * (they stop as soon as `infoDelivery` reports actual playback).
   */
  const loadActive = useCallback(
    (videoId: string) => {
      const iframe = playerRef.current;
      if (!iframe || lastLoadedIdRef.current === videoId) return;
      lastLoadedIdRef.current = videoId;
      wantPlayingRef.current = true;
      // A pending stall-recovery belongs to the previous video.
      if (pauseRecoveryTimerRef.current) {
        clearTimeout(pauseRecoveryTimerRef.current);
        pauseRecoveryTimerRef.current = null;
      }
      setPendingLoad(true);
      setPlayerVisible(false);
      postToPlayer(iframe, "loadVideoById", [videoId]);
      applySoundPref(iframe);
      for (const timer of kickTimersRef.current) clearTimeout(timer);
      kickTimersRef.current = [350, 1000, 2200].map((delay) =>
        setTimeout(() => {
          if (playerRef.current !== iframe || lastLoadedIdRef.current !== videoId) return;
          if (lastReportedIdRef.current && lastReportedIdRef.current !== videoId) {
            // The load command was dropped (player still reporting the
            // previous Short) — re-post it before nudging playback.
            postToPlayer(iframe, "loadVideoById", [videoId]);
          }
          if (wantPlayingRef.current && !playingRef.current) {
            if (delay >= 1000 && !mutedRef.current && !unmutedPlaybackOkRef.current) {
              // Still stalled with sound on and unmuted playback never
              // proven — trade audio for motion (the sound chip flips
              // so one tap brings audio back).
              mutedRef.current = true;
              setMuted(true);
            }
            applySoundPref(iframe);
            postToPlayer(iframe, "playVideo");
          }
        }, delay),
      );
    },
    [applySoundPref],
  );

  // Whatever slide is on screen is what the hot player should be
  // playing — covers swipes, buttons, keyboard AND feed refetches.
  useEffect(() => {
    const active = shorts?.[currentIndex];
    if (active) loadActive(active.videoId);
  }, [shorts, currentIndex, loadActive]);

  // Reconcile UI state with the real player. playerState 1/3 =
  // playing/buffering, 2 = paused, 5 = cued (autoplay refused),
  // 0 = ended (we re-arm the loop), -1 = unstarted (transient).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (
        e.origin !== "https://www.youtube.com" &&
        e.origin !== "https://www.youtube-nocookie.com"
      ) {
        return;
      }
      const iframe = playerRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;
      let data: {
        event?: string;
        info?: { playerState?: number; muted?: boolean; videoData?: { video_id?: string } };
      };
      try {
        data = JSON.parse(typeof e.data === "string" ? e.data : "");
      } catch {
        return;
      }
      const reportedId = data.info?.videoData?.video_id;
      if (typeof reportedId === "string" && reportedId.length > 0) {
        lastReportedIdRef.current = reportedId;
      }
      if (data.event === "onReady") {
        applySoundPref(iframe);
        // The iframe (re)loaded on the frozen boot src: if a swipe
        // happened before the player was ready (its loadVideoById was
        // silently dropped) or the browser evicted/reloaded the iframe,
        // re-assert whatever Short the feed is actually on.
        if (lastLoadedIdRef.current && lastLoadedIdRef.current !== bootVideoIdRef.current) {
          postToPlayer(iframe, "loadVideoById", [lastLoadedIdRef.current]);
        }
        if (wantPlayingRef.current) postToPlayer(iframe, "playVideo");
      }
      if (data.event === "onError") {
        // Unplayable Short (deleted, embedding disabled): land on the
        // honest play affordance instead of a stuck pending state —
        // the rail's YouTube link stays as the escape hatch.
        setPlaying(false);
        setPendingLoad(false);
        setPlayerVisible(false);
        return;
      }
      const playerState = data.info?.playerState;
      if (typeof playerState !== "number") return;
      if (playerState === 0) {
        // Ended: the boot URL's loop param only covers the boot video —
        // replaying by command loops every Short the same way.
        if (wantPlayingRef.current) {
          postToPlayer(iframe, "seekTo", [0, true]);
          postToPlayer(iframe, "playVideo");
        } else {
          setPlaying(false);
        }
        return;
      }
      if (playerState === 1 || playerState === 3) {
        if (
          lastReportedIdRef.current &&
          lastLoadedIdRef.current &&
          lastReportedIdRef.current !== lastLoadedIdRef.current
        ) {
          // The WRONG Short is playing (a dropped load) — reconcile
          // instead of unveiling the stale video over the new slide.
          postToPlayer(iframe, "loadVideoById", [lastLoadedIdRef.current]);
          return;
        }
        // Playback is live: any pending stall-recovery is obsolete.
        if (pauseRecoveryTimerRef.current) {
          clearTimeout(pauseRecoveryTimerRef.current);
          pauseRecoveryTimerRef.current = null;
        }
        if (
          playerState === 1 &&
          (data.info?.muted === false || (data.info?.muted === undefined && !mutedRef.current))
        ) {
          // Unmuted playback proven — lock the muted fallbacks out.
          unmutedPlaybackOkRef.current = true;
        }
        if (!wantPlayingRef.current) {
          // The user paused before the player was ready and the embed
          // started anyway — intent wins, re-assert the pause.
          postToPlayer(iframe, "pauseVideo");
        } else {
          setPlaying(true);
          setPlayerVisible(true);
          setPendingLoad(false);
        }
      } else if (playerState === 2 || playerState === 5) {
        if (playerState === 2 && wantPlayingRef.current && !pauseRecoveryTimerRef.current) {
          // Paused AGAINST our intent. Either a transient blip of a
          // video switch (self-resolves) or the WebKit sound trap
          // (unmuting an autoplaying video without a fresh gesture
          // pauses it). React only if the stall PERSISTS: resume
          // unmuted when the pause follows a real unmute tap or when
          // unmuted playback has already been proven to work, else
          // trade audio for motion and flip the sound chip so a single
          // tap restores it.
          pauseRecoveryTimerRef.current = setTimeout(() => {
            pauseRecoveryTimerRef.current = null;
            const player = playerRef.current;
            if (!player || !wantPlayingRef.current || playingRef.current) return;
            const gestureFresh = Date.now() - lastUnmuteTapAtRef.current < 1500;
            if (!gestureFresh && !mutedRef.current && !unmutedPlaybackOkRef.current) {
              mutedRef.current = true;
              setMuted(true);
              postToPlayer(player, "mute");
            }
            postToPlayer(player, "playVideo");
          }, 700);
        }
        setPlaying(false);
        setPendingLoad(false);
      }
      // -1 (unstarted) is a transient blip between load and buffering —
      // ignored so the play affordance doesn't flash mid-transition.
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applySoundPref]);

  const total = shorts?.length ?? 0;

  const navigateBy = useCallback(
    (delta: number) => {
      const base = navTargetRef.current ?? currentIndexRef.current;
      const target = clampShortsIndex(base + delta, total);
      if (target === base) return;
      navTargetRef.current = target;
      // scrollIntoView instead of index*clientHeight math: exact per-slide
      // geometry (no fractional-height drift), and the CSS `scroll-behavior`
      // on `.shorts-scroll` still decides smooth vs instant
      // (prefers-reduced-motion).
      slideRefs.current[target]?.scrollIntoView({ block: "start" });
    },
    [total],
  );

  const togglePlay = useCallback(() => {
    // Toggle from EFFECTIVE playback (intent AND reported state), not
    // intent alone: when autoplay was refused, intent says playing but
    // nothing moves — the tap must then play, not post a useless pause.
    const next = !(wantPlayingRef.current && playingRef.current);
    wantPlayingRef.current = next;
    postToPlayer(playerRef.current, next ? "playVideo" : "pauseVideo");
    // Optimistic — the infoDelivery stream corrects it if the command
    // was refused (e.g. play blocked before any activation).
    setPlaying(next);
    trackEvent("shorts.play_toggle", { action: next ? "play" : "pause", lang });
  }, [lang]);

  const toggleMute = useCallback(() => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) {
      lastUnmuteTapAtRef.current = Date.now();
    }
    applySoundPref(playerRef.current);
    // Unmuting while stalled: the tap IS the fresh gesture — resume
    // playback in the same handler so audio and motion return together.
    if (!nextMuted && wantPlayingRef.current && !playingRef.current) {
      postToPlayer(playerRef.current, "playVideo");
    }
    trackEvent("shorts.mute", { action: nextMuted ? "on" : "off", lang });
  }, [applySoundPref, lang]);

  // Track the visible slide — swipes AND programmatic scrolls both land
  // here, so counter / progress / hot-player target follow what is on
  // screen.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || total === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const raw = (entry.target as HTMLElement).dataset.shortsIndex;
          const idx = raw === undefined ? NaN : Number(raw);
          if (Number.isNaN(idx) || idx === currentIndexRef.current) continue;
          // Any commit clears the pending nav target — including a
          // touch-interrupted programmatic scroll that settled elsewhere
          // (a stale target would skew the next Prev/Next's base).
          navTargetRef.current = null;
          setCurrentIndex(idx);
          const videoId = shorts?.[idx]?.videoId;
          if (videoId) {
            trackEvent("shorts.slide", { target_id: videoId, lang, meta: { index: idx } });
          }
        }
      },
      { root: container, threshold: 0.6 },
    );
    for (const el of slideRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [total, shorts, lang]);

  // Hand the stage to the thumbnails as soon as a swipe drags the feed
  // meaningfully away from the settled slide — without waiting for the
  // IntersectionObserver's 60% threshold, so the static video frame
  // doesn't linger over the moving slides.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || total === 0) return;
    const onScroll = () => {
      const settled = slideRefs.current[currentIndexRef.current];
      if (!settled) return;
      if (Math.abs(container.scrollTop - settled.offsetTop) > 40) {
        setPlayerVisible(false);
      } else if (playingRef.current && wantPlayingRef.current) {
        // Aborted swipe / overscroll bounce that snapped back to the
        // SAME slide: no index change and no player-state change ever
        // arrives, so restore symmetrically — otherwise the audio keeps
        // playing under a frozen thumbnail.
        setPlayerVisible(true);
      }
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [total]);

  // Keyboard driving: arrows / PageUp / PageDown navigate, Space
  // pauses, M mutes, Escape closes. Document-level, like PodcastReader.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Whole layers first: nothing while the auth modal owns the
      // keyboard, and never swallow browser/OS chords (Alt+Left = back,
      // Cmd+Arrow = document start/end...).
      if (suspendShortcutsRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isFormControl = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (isFormControl && e.key !== "Escape") return;
      // A focused button/link keeps its native Space/Enter activation —
      // Space must re-trigger Next, not toggle playback underneath.
      const isButtonLike = tag === "BUTTON" || tag === "A";
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          navigateBy(1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          navigateBy(-1);
          break;
        case " ":
        case "k":
          if (isButtonLike) return;
          e.preventDefault();
          togglePlay();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigateBy, togglePlay, toggleMute, onClose]);

  const loading = shorts === null;
  const activeVideo = shorts?.[currentIndex] ?? null;
  const atFirst = currentIndex === 0;
  const atLast = total > 0 && currentIndex === total - 1;
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const origin = typeof window !== "undefined" ? window.location.origin : null;
  const now = new Date();
  const activeTitle = activeVideo ? stripEmojis(activeVideo.title) : "";

  const navChevron = (up: boolean) => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {up ? <polyline points="6 15 12 9 18 15" /> : <polyline points="6 9 12 15 18 9" />}
    </svg>
  );

  return (
    <div
      className="shorts-root"
      role="dialog"
      aria-modal="true"
      aria-label={t("shortsFeedAria", lang)}
      ref={rootRef}
      tabIndex={-1}
    >
      {/* Desktop backdrop — the active Short's thumbnail, heavily blurred. */}
      {activeVideo?.thumbnail && (
        <img className="shorts-backdrop" src={activeVideo.thumbnail} alt="" aria-hidden />
      )}

      {/* Thin gold progress bar pinned at the very top. */}
      <div className="shorts-progress" aria-hidden>
        <div
          className="shorts-progress-fill"
          style={{ width: total > 0 ? `${((currentIndex + 1) / total) * 100}%` : 0 }}
        />
      </div>

      <button
        type="button"
        className="shorts-close"
        onClick={onClose}
        aria-label={t("shortsClose", lang)}
        title={t("shortsClose", lang)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="shorts-stage">
        <div className="shorts-frame">
          {/* Kicker + day chip + counter, floating over the top of the frame. */}
          <div className="shorts-topbar">
            <span className="shorts-kicker" style={{ color: color.gold }}>
              {t("shortsBtn", lang)}
            </span>
            {activeVideo && (
              <span className="shorts-day-chip">
                {shortsDayLabel(activeVideo.published, now, lang)}
              </span>
            )}
            {total > 0 && (
              <span className="shorts-counter" aria-live="polite">
                {shortsCounterLabel(currentIndex + 1, total)}
              </span>
            )}
          </div>

          {loading ? (
            <div className="shorts-status">
              <span style={spinnerStyle(30)} />
            </div>
          ) : loadError ? (
            <div className="shorts-status">
              <p style={{ color: color.textSecondary, margin: 0 }}>{t("shortsLoadError", lang)}</p>
              <button type="button" className="shorts-retry" onClick={fetchShorts}>
                {t("shortsRetry", lang)}
              </button>
            </div>
          ) : total === 0 ? (
            <div className="shorts-status">
              <p style={{ color: color.textSecondary, margin: 0 }}>{t("shortsEmpty", lang)}</p>
            </div>
          ) : (
            <>
              {/* Thumbnail slides — the actual scroll/snap surface. The
                  per-slide transparent button is the touch target for
                  both the swipe (native scroll chaining) and the tap
                  (play/pause), since the player layer above lets
                  pointer events fall through. */}
              <div className="shorts-scroll" ref={scrollRef}>
                {(shorts ?? []).map((v, i) => {
                  const title = stripEmojis(v.title);
                  const views = formatViews(v.viewCount);
                  return (
                    <div
                      key={v.videoId}
                      className="shorts-slide"
                      data-shorts-index={i}
                      ref={(el) => {
                        slideRefs.current[i] = el;
                      }}
                    >
                      {v.thumbnail ? (
                        <img className="shorts-slide-thumb" src={v.thumbnail} alt="" aria-hidden />
                      ) : (
                        <div className="shorts-slide-thumb shorts-slide-thumb-empty" aria-hidden />
                      )}
                      <button
                        type="button"
                        className="shorts-tap"
                        onClick={togglePlay}
                        aria-label={playing ? t("shortsPauseAria", lang) : t("shortsPlayAria", lang)}
                        tabIndex={-1}
                      />

                      {/* Per-slide chrome — kept INSIDE the slide so a swipe
                          starting on a chip still chain-scrolls the feed
                          (the slides carry no z-index, so this z3/z4 chrome
                          paints above the z2 hot-player layer). */}
                      <div className="shorts-rail">
                        <span className="shorts-chip">
                          <FavoriteButton
                            url={v.link}
                            title={title}
                            source={v.channelTitle}
                            pubDate={v.published}
                            sourceType="video"
                            isFavorite={favoriteUrls.has(v.link)}
                            lang={lang}
                            onToggle={onToggleFavorite}
                            onRequestAuth={onRequestAuth}
                            isAuthenticated={isAuthenticated}
                            size={20}
                          />
                        </span>
                        <button
                          type="button"
                          className="shorts-chip shorts-chip-btn"
                          onClick={toggleMute}
                          aria-label={muted ? t("shortsUnmute", lang) : t("shortsMute", lang)}
                          title={muted ? t("shortsUnmute", lang) : t("shortsMute", lang)}
                        >
                          {muted ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                              <line x1="23" y1="9" x2="17" y2="15" />
                              <line x1="17" y1="9" x2="23" y2="15" />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            </svg>
                          )}
                        </button>
                        <a
                          className="shorts-chip shorts-chip-btn"
                          href={v.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("shortsOpenYouTube", lang)}
                          title={t("shortsOpenYouTube", lang)}
                          onClick={() =>
                            trackEvent("shorts.open_youtube", { target_id: v.videoId, lang })
                          }
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      </div>

                      <div className="shorts-info">
                        <h2 className="shorts-title">{title}</h2>
                        <div className="shorts-meta">
                          <span className="shorts-channel">{v.channelTitle}</span>
                          {views && (
                            <span className="shorts-meta-item">
                              {views} {lang === "fr" ? "vues" : "views"}
                            </span>
                          )}
                          {v.durationSec != null && (
                            <span className="shorts-meta-item">
                              {formatShortDuration(v.durationSec)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* One-time swipe hint on the first slide (touch only). */}
                      {i === 0 && total > 1 && (
                        <div className="shorts-hint" aria-hidden>
                          {t("shortsSwipeHint", lang)}
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 15 12 9 18 15" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Hot-player layer — pointer-transparent except its chips,
                  so swipes/taps reach the slides underneath. */}
              <div className="shorts-hotlayer">
                {bootVideoId && (
                  <iframe
                    className="shorts-player"
                    data-visible={playerVisible}
                    src={buildShortsEmbedUrl(bootVideoId, { isLocal, origin })}
                    title={activeTitle || t("shortsFeedAria", lang)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    ref={(el) => {
                      playerRef.current = el;
                    }}
                    onLoad={(e) => bootPlayer(e.currentTarget)}
                  />
                )}

                {/* Honest play affordance — only over the thumbnail: when
                    the paused VIDEO frame is visible, YouTube's own
                    center icon already reads as « paused » and doubling
                    it up confused users into thinking two players. */}
                {!playing && !pendingLoad && !playerVisible && (
                  <span className="shorts-bigplay" aria-hidden>
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      fill={color.gold}
                      stroke="none"
                      style={{ marginLeft: 3 }}
                    >
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Previous / Next — beside the frame on desktop, overlaid above
            the rail on phones. Explicitly wanted on mobile too. */}
        {total > 1 && (
          <div className="shorts-sidenav">
            <button
              type="button"
              className="shorts-navbtn"
              onClick={() => navigateBy(-1)}
              disabled={atFirst}
              aria-label={t("shortsPrev", lang)}
              title={t("shortsPrev", lang)}
            >
              {navChevron(true)}
            </button>
            <button
              type="button"
              className="shorts-navbtn"
              onClick={() => navigateBy(1)}
              disabled={atLast}
              aria-label={t("shortsNext", lang)}
              title={t("shortsNext", lang)}
            >
              {navChevron(false)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
