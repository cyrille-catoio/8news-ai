"use client";

import { type CSSProperties, useState, useEffect, useCallback, useRef } from "react";
import { type Lang, t } from "@/lib/i18n";
import { color, spinnerStyle } from "@/lib/theme";
import { trackEvent } from "@/lib/track";

/**
 * Optional `context` + `contextId` props power per-surface analytics
 * via `trackEvent("audio.play|pause|stop")`. Pass them in from each
 * consumer (e.g. `context="top24h_podcast"`, `contextId=summaryDate`)
 * so the « Top played audio » dashboard chart can group by source.
 * When omitted, the events still fire with a generic `unknown` context
 * so total volume is still measurable.
 */
export function AudioPlayer({
  text,
  lang,
  speed,
  voice,
  context,
  contextId,
}: {
  text: string;
  lang: Lang;
  speed: number;
  voice: string;
  context?: string;
  contextId?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [spinner, setSpinner] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const blobUrlRef = useRef<string | null>(null);
  const genId = useRef(0);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    genId.current++;
    cleanup();
    setState("idle");
    setSpinner(false);
    setCurrentTime(0);
    setDuration(0);
  }, [text, cleanup]);

  useEffect(() => {
    if (spinner && currentTime >= 2) setSpinner(false);
  }, [spinner, currentTime]);

  function ensureAudioContext() {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  }

  async function handlePlay() {
    setSpinner(true);
    ensureAudioContext();

    if (audioRef.current) {
      const a = audioRef.current;
      if (a.currentTime >= (a.duration || 0) - 0.5) a.currentTime = 0;
      try {
        await a.play();
        setState("playing");
      } catch {
        setState("idle");
      }
      return;
    }

    const id = ++genId.current;
    setState("loading");

    const audio = new Audio();
    audio.setAttribute("playsinline", "");
    audio.preload = "auto";
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
    audio.addEventListener("ended", () => {
      setTimeout(() => {
        audio.currentTime = 0;
        setCurrentTime(0);
        setState("idle");
      }, 2000);
    });

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang, speed, voice }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`TTS ${res.status}: ${errText.slice(0, 100)}`);
      }
      if (id !== genId.current) return;

      const blob = await res.blob();
      if (id !== genId.current) return;

      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      audio.src = url;
      audio.load();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 8000);
        const done = () => { clearTimeout(timeout); resolve(); };
        audio.addEventListener("canplaythrough", done, { once: true });
        audio.addEventListener("loadeddata", done, { once: true });
        audio.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Audio load error")); }, { once: true });
      });
      if (id !== genId.current) { audio.pause(); return; }

      await audio.play();
      trackEvent("audio.play", {
        target_id: contextId,
        lang,
        meta: { context: context ?? "unknown", duration: audio.duration ?? null },
      });
      setState("playing");
    } catch {
      if (id === genId.current) {
        if (audioRef.current === audio) audioRef.current = null;
        setState("idle");
        setSpinner(false);
      }
    }
  }

  function handleStop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    trackEvent("audio.stop", {
      target_id: contextId,
      lang,
      meta: { context: context ?? "unknown", positionSec: currentTime },
    });
    setState("idle");
    setCurrentTime(0);
  }

  function handlePause() {
    if (audioRef.current) audioRef.current.pause();
    trackEvent("audio.pause", {
      target_id: contextId,
      lang,
      meta: { context: context ?? "unknown", positionSec: currentTime },
    });
    setState("paused");
  }

  function skip(seconds: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + seconds));
  }

  function seekTo(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  // v2.12.1+: vertical padding tightened from 6px → 2px so the player
  // ribbon takes ~12 px less height across every surface (Top 24h
  // podcast, daily summary, video page, video card, favorites). SVG
  // glyphs were also resized below from 30-32 to 24-26 — the controls
  // are still well above the WCAG 24 × 24 target floor with the 8 px
  // horizontal padding kept intact.
  const btnBase: CSSProperties = {
    padding: "2px 10px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: color.textMuted,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 0.15s",
  };

  const isActive = state === "playing" || state === "paused";

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Mono uppercase « LECTEUR AUDIO » kicker pinned above every audio
  // player instance. v2.10.2+ — rendered here at the shared component
  // level rather than in each consumer (DailySummaryAudio, Top24hAudio,
  // VideoPageAudio, VideoRoundupAudio, VideoCard, SummaryBox,
  // FavoritesPage) so the affordance is identical everywhere it
  // appears. Uses the same `kicker` register as the section titles
  // (gold mono, 11 px, letter-spaced) without being intrusive — only
  // marginBottom: 8 above the transport row.
  const kickerStyle: CSSProperties = {
    color: color.gold,
    fontFamily: "ui-monospace, Menlo, monospace",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };

  // v2.18+ — single-line transport: the « LECTEUR AUDIO » label sits on
  // the left with every control (play/pause, stop, ±15s, timecode) packed
  // right next to it on the same row, so the player ribbon is one line
  // shorter on every surface. The thin progress bar stays below,
  // full-width.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, flexWrap: "wrap" }}>
      <div style={kickerStyle}>{t("audioPlayerKicker", lang)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {state === "playing" ? (
          <button onClick={handlePause} style={{ ...btnBase, color: color.gold }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          </button>
        ) : (
          <button onClick={handlePlay} disabled={state === "loading"} style={{ ...btnBase, color: color.gold }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          </button>
        )}

        <button onClick={handleStop} disabled={!isActive} style={{ ...btnBase, opacity: isActive ? 1 : 0.35 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
        </button>

        <button onClick={() => skip(-15)} disabled={!isActive} style={{ ...btnBase, opacity: isActive ? 1 : 0.35 }}>
          -15s
        </button>

        <button onClick={() => skip(15)} disabled={!isActive} style={{ ...btnBase, opacity: isActive ? 1 : 0.35 }}>
          +15s
        </button>

        <span style={{ color: isActive && duration > 0 ? color.textDim : "transparent", fontSize: 11, marginLeft: 4, minWidth: 72, textAlign: "center" }}>
          {isActive && duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : "0:00 / 0:00"}
        </span>

        {spinner && (
          <span style={spinnerStyle(18, { borderWidth: 2.5, marginLeft: 6, flexShrink: 0 })} />
        )}
      </div>
      </div>

      <div
        onClick={isActive ? seekTo : undefined}
        style={{
          width: "100%",
          height: 4,
          borderRadius: 2,
          background: color.border,
          cursor: isActive ? "pointer" : "default",
          position: "relative",
          opacity: isActive ? 1 : 0.3,
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 2,
            background: color.gold,
            width: `${pct}%`,
            transition: "width 0.15s linear",
          }}
        />
      </div>
    </div>
  );
}
