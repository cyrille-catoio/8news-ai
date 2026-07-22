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
 * active channels' Shorts (< 180 s) over the last 5 days: one Short per
 * viewport slide inside a `scroll-snap-type: y mandatory` container.
 *
 * Same navigation model as `PodcastReader` (v2.19): native swipe on
 * touch devices, Previous / Next buttons + keyboard (arrows, PageUp /
 * PageDown, Space to pause, M to mute) on every form factor, one
 * IntersectionObserver tracking whichever slide is actually on screen.
 *
 * Player model — reliability first:
 *  - Only the ACTIVE slide mounts its YouTube iframe (`autoplay=1&mute=1`,
 *    the only autoplay browsers reliably allow). Leaving a slide
 *    unmounts its iframe, which is also what guarantees the audio stops.
 *  - Every slide keeps its thumbnail as a full-bleed backdrop, so the
 *    snap lands on an image instantly and the iframe fades in over it.
 *  - A transparent tap layer covers the iframe: swipes over the video
 *    keep scrolling the snap container (touches inside a bare iframe
 *    would be swallowed by YouTube), and a tap toggles play / pause via
 *    the iframe JS API (`postMessage` commands). Sound is ON by
 *    default: every slide is unmuted as soon as its player answers the
 *    handshake, and the rail button toggles the persistent preference.
 *
 * Desktop is a « phone on stage »: a 9:16 gold-rimmed frame centered on
 * a dark backdrop built from the active Short's blurred thumbnail, with
 * the Previous / Next controls beside the frame. On phones the frame is
 * simply the full viewport. Look-and-feel details live in the
 * `.shorts-*` block of `globals.css`.
 */

/** Post a YouTube iframe-API command to an embedded player. */
function postToPlayer(
  iframe: HTMLIFrameElement | null,
  func: "playVideo" | "pauseVideo" | "mute" | "unMute" | "setVolume",
  args: Array<string | number> = [],
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
  /** Sound ON by default. Each embed still mounts muted (the only
   *  autoplay browsers reliably allow) and is unmuted as soon as its
   *  player answers the handshake — reaching the feed took a click on
   *  the menu pill, and `allow="autoplay"` delegates that activation
   *  to the iframe. Browsers that still refuse (e.g. iOS before any
   *  in-page gesture) simply stay muted until a tap on the rail. */
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(true);
  /** Transient center play/pause glyph after a tap; keyed to retrigger the pop animation. */
  const [glyph, setGlyph] = useState<{ kind: "play" | "pause"; key: number } | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const activeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const glyphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmuteTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
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
      setShorts(json.shorts ?? []);
      setCurrentIndex(0);
      setPlaying(true);
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

  // Clear pending glyph / unmute timers on unmount. The timer arrays are
  // read at cleanup time (not captured at mount) because `syncNewPlayer`
  // replaces `unmuteTimersRef.current` on every new player.
  useEffect(() => {
    return () => {
      if (glyphTimerRef.current) clearTimeout(glyphTimerRef.current);
      for (const timer of unmuteTimersRef.current) clearTimeout(timer);
    };
  }, []);

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

  const showGlyph = useCallback((kind: "play" | "pause") => {
    setGlyph({ kind, key: Date.now() });
    if (glyphTimerRef.current) clearTimeout(glyphTimerRef.current);
    glyphTimerRef.current = setTimeout(() => setGlyph(null), 650);
  }, []);

  const togglePlay = useCallback(() => {
    const next = !playingRef.current;
    postToPlayer(activeIframeRef.current, next ? "playVideo" : "pauseVideo");
    setPlaying(next);
    showGlyph(next ? "play" : "pause");
    trackEvent("shorts.play_toggle", { action: next ? "play" : "pause", lang });
  }, [lang, showGlyph]);

  const toggleMute = useCallback(() => {
    const nextMuted = !mutedRef.current;
    if (nextMuted) {
      postToPlayer(activeIframeRef.current, "mute");
    } else {
      postToPlayer(activeIframeRef.current, "unMute");
      postToPlayer(activeIframeRef.current, "setVolume", [100]);
    }
    setMuted(nextMuted);
    trackEvent("shorts.mute", { action: nextMuted ? "on" : "off", lang });
  }, [lang]);

  /**
   * Called when a freshly mounted embed finishes loading. Posts the
   * iframe-API `listening` handshake (repeated, because the player
   * ignores messages sent before it is initialized) — from then on the
   * player streams `onReady` / `infoDelivery` messages back to the
   * window listener below, which re-applies the sound preference and
   * keeps `playing` truthful. The blind unmute retries stay as backup
   * for players that come up between two handshakes.
   */
  const syncNewPlayer = useCallback((iframe: HTMLIFrameElement) => {
    for (const timer of unmuteTimersRef.current) clearTimeout(timer);
    unmuteTimersRef.current = [0, 350, 900, 2000].map((delay) =>
      setTimeout(() => {
        if (activeIframeRef.current !== iframe) return;
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: "listening", id: "shorts", channel: "widget" }),
          "*",
        );
        if (!mutedRef.current) {
          postToPlayer(iframe, "unMute");
          postToPlayer(iframe, "setVolume", [100]);
        }
      }, delay),
    );
  }, []);

  // Reconcile UI state with the real player. Autoplay can be refused
  // outright (iOS Low Power Mode, data-saver) — without this listener
  // the feed would claim « playing » over a frozen thumbnail and the
  // first tap would post a useless pauseVideo. playerState 1/3 =
  // playing/buffering; -1/0/2/5 = not playing.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (
        e.origin !== "https://www.youtube.com" &&
        e.origin !== "https://www.youtube-nocookie.com"
      ) {
        return;
      }
      const iframe = activeIframeRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;
      let data: { event?: string; info?: { playerState?: number } };
      try {
        data = JSON.parse(typeof e.data === "string" ? e.data : "");
      } catch {
        return;
      }
      if (data.event === "onReady" && !mutedRef.current) {
        postToPlayer(iframe, "unMute");
        postToPlayer(iframe, "setVolume", [100]);
      }
      const playerState = data.info?.playerState;
      if (typeof playerState === "number") {
        setPlaying(playerState === 1 || playerState === 3);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Track the visible slide — swipes AND programmatic scrolls both land
  // here, so counter / progress / mounted-player follow what is on screen.
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
          if (idx === navTargetRef.current) navTargetRef.current = null;
          setCurrentIndex(idx);
          setPlaying(true);
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
            <div className="shorts-scroll" ref={scrollRef}>
              {(shorts ?? []).map((v, i) => {
                const isActive = i === currentIndex;
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
                    {/* Thumbnail backdrop: instant image on snap, iframe fades in over it. */}
                    {v.thumbnail ? (
                      <img className="shorts-slide-thumb" src={v.thumbnail} alt="" aria-hidden />
                    ) : (
                      <div className="shorts-slide-thumb shorts-slide-thumb-empty" aria-hidden />
                    )}

                    {isActive && (
                      <iframe
                        key={v.videoId}
                        className="shorts-player"
                        src={buildShortsEmbedUrl(v.videoId, { isLocal, origin })}
                        title={title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        ref={(el) => {
                          activeIframeRef.current = el;
                        }}
                        onLoad={(e) => syncNewPlayer(e.currentTarget)}
                      />
                    )}

                    {/* Transparent tap layer: keeps swipes scrolling the feed
                        (touches on a bare iframe are swallowed by YouTube)
                        and toggles play / pause on tap. */}
                    <button
                      type="button"
                      className="shorts-tap"
                      onClick={togglePlay}
                      aria-label={playing ? t("shortsPauseAria", lang) : t("shortsPlayAria", lang)}
                      tabIndex={-1}
                    />

                    {isActive && glyph && (
                      <span className="shorts-glyph" key={glyph.key} aria-hidden>
                        {glyph.kind === "play" ? (
                          <svg width="26" height="26" viewBox="0 0 24 24" fill={color.gold} stroke="none" style={{ marginLeft: 3 }}>
                            <polygon points="5,3 19,12 5,21" />
                          </svg>
                        ) : (
                          <svg width="26" height="26" viewBox="0 0 24 24" fill={color.gold} stroke="none">
                            <rect x="5" y="3" width="5" height="18" rx="1" />
                            <rect x="14" y="3" width="5" height="18" rx="1" />
                          </svg>
                        )}
                      </span>
                    )}

                    {/* Right action rail — favorite, sound, YouTube. */}
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

                    {/* Bottom info panel — title, channel, meta. */}
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
                          <span className="shorts-meta-item">{formatShortDuration(v.durationSec)}</span>
                        )}
                      </div>
                    </div>

                    {/* One-time swipe hint on the first slide (touch devices only). */}
                    {i === 0 && currentIndex === 0 && total > 1 && (
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
          )}
        </div>

        {/* Previous / Next — beside the frame on desktop, overlaid
            center-right on phones. Explicitly wanted on mobile too. */}
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
