"use client";

import { type CSSProperties, useState, useEffect, useCallback, useRef } from "react";
import { type Lang } from "@/lib/i18n";
import { color, spinnerStyle } from "@/lib/theme";

export function AudioPlayer({ text, lang, speed, voice }: { text: string; lang: Lang; speed: number; voice: string }) {
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
    setState("idle");
    setCurrentTime(0);
  }

  function handlePause() {
    if (audioRef.current) audioRef.current.pause();
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

  const btnBase: CSSProperties = {
    padding: "6px 10px",
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {state === "playing" ? (
          <button onClick={handlePause} style={{ ...btnBase, color: color.gold }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          </button>
        ) : (
          <button onClick={handlePlay} disabled={state === "loading"} style={{ ...btnBase, color: color.gold }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          </button>
        )}

        <button onClick={handleStop} disabled={!isActive} style={{ ...btnBase, opacity: isActive ? 1 : 0.35 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
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

      <div
        onClick={isActive ? seekTo : undefined}
        style={{
          width: "100%",
          height: 5,
          borderRadius: 3,
          background: color.border,
          cursor: isActive ? "pointer" : "default",
          position: "relative",
          opacity: isActive ? 1 : 0.3,
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 3,
            background: color.gold,
            width: `${pct}%`,
            transition: "width 0.15s linear",
          }}
        />
      </div>
    </div>
  );
}
