"use client";

import { type CSSProperties, useState, useEffect, useCallback, useRef } from "react";
import type { SummaryResponse, ArticleSummary, StatsResponse, TopicItem, TopicDetail, FeedItem, CronStatsResponse } from "@/lib/types";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, font, sectionHeading, card } from "@/lib/theme";

// ── Constants ─────────────────────────────────────────────────────────

const APP_VERSION = "1.65";
const VERSION_CHECK_INTERVAL_MS = 5 * 60_000;

const TTS_VOICES_EN = [
  { id: "sarah",   label: "Jade",    desc: "American · Soft",          gender: "F" },
  { id: "alice",   label: "Alice",   desc: "British · Confident",      gender: "F" },
  { id: "rachel",  label: "Rachel",  desc: "American · Calm",          gender: "F" },
  { id: "daniel",  label: "Nicolas", desc: "British · News presenter", gender: "M" },
  { id: "drew",    label: "Drew",    desc: "American · News",          gender: "M" },
  { id: "josh",    label: "Josh",    desc: "American · Deep",          gender: "M" },
] as const;

const TTS_VOICES_FR = [
  { id: "george",    label: "Tristan",   desc: "Chaleureux · Posé",     gender: "M" },
  { id: "charlotte", label: "Charlotte", desc: "Chaleureuse · Douce",   gender: "F" },
  { id: "lily",      label: "Lily",      desc: "Posée · Naturelle",     gender: "F" },
  { id: "nicole",    label: "Nicole",    desc: "Intime · Calme",        gender: "F" },
  { id: "thomas",    label: "Thomas",    desc: "Calme · Narrateur",     gender: "M" },
  { id: "callum",    label: "Callum",    desc: "Intense · Dynamique",   gender: "M" },
] as const;

const PERIODS = [
  { label: "30 m",  hours: 0.5 },
  { label: "1 h",   hours: 1 },
  { label: "3 h",   hours: 3 },
  { label: "6 h",   hours: 6 },
  { label: "12 h",  hours: 12 },
  { label: "24 h",  hours: 24 },
  { label: "48 h",  hours: 48 },
  { label: "3 d",   hours: 72 },
  { label: "7 d",   hours: 168 },
  { label: "14 d",  hours: 336 },
  { label: "30 d",  hours: 720 },
] as const;

interface TopicLabel { id: string; label: string }

// ── Sub-components ────────────────────────────────────────────────────

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const btn = (value: Lang, isLeft: boolean): CSSProperties => ({
    padding: "5px 12px",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    borderLeft: isLeft ? "none" : `1px solid ${color.gold}`,
    cursor: "pointer",
    background: lang === value ? color.gold : "transparent",
    color: lang === value ? "#000" : color.gold,
    transition: "all 0.15s",
  });

  return (
    <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${color.gold}` }}>
      <button onClick={() => onChange("en")} style={btn("en", true)}>EN</button>
      <button onClick={() => onChange("fr")} style={btn("fr", false)}>FR</button>
    </div>
  );
}

function TopicToggle({
  topics,
  topic,
  disabled,
  onChange,
}: {
  topics: TopicLabel[];
  topic: string | null;
  disabled: boolean;
  onChange: (t: string) => void;
}) {
  const btnStyle = (value: string): CSSProperties => ({
    padding: "8px 0",
    fontSize: 14,
    fontWeight: 600,
    border: `1px solid ${color.gold}`,
    cursor: disabled ? "wait" : "pointer",
    background: topic === value ? color.gold : "transparent",
    color: topic === value ? "#000" : color.gold,
    transition: "all 0.15s",
    opacity: disabled ? 0.6 : 1,
    borderRadius: 6,
    textAlign: "center",
  });

  return (
    <>
      <style>{`
        .topic-grid {
          display: grid;
          gap: 6px;
          grid-template-columns: repeat(${Math.min(topics.length || 8, 8)}, 1fr);
        }
        @media (max-width: 640px) {
          .topic-grid {
            grid-template-columns: repeat(4, 1fr);
            gap: 5px;
          }
          .topic-grid button {
            font-size: 13px !important;
            padding: 10px 2px !important;
          }
        }
      `}</style>
      <div className="topic-grid">
        {topics.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            disabled={disabled}
            style={btnStyle(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

const SpinKeyframes = () => (
  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
);

function PeriodButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <>
      <style>{`
        .period-btn {
          padding: 9px 0;
          width: 64px;
          text-align: center;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.02em;
          transition: all 0.15s;
        }
        @media (max-width: 640px) {
          .period-btn {
            width: 52px;
            padding: 7px 0;
            font-size: 13px;
          }
          .period-grid {
            gap: 6px !important;
          }
        }
      `}</style>
      <button
        className="period-btn"
        onClick={onClick}
        disabled={disabled}
        style={{
          border: `1px solid ${active ? color.gold : "#777"}`,
          background: active ? color.gold : "#222",
          color: active ? "#000" : "#e5e5e5",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {label}
      </button>
    </>
  );
}

function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      style={{
        position: "fixed",
        bottom: 32,
        left: 27,
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: `1px solid ${color.border}`,
        background: color.surface,
        color: color.gold,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
        transition: "opacity 0.2s",
        zIndex: 998,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title={copied ? "✓" : "Copy link"}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 4,
        color: copied ? "#22c55e" : color.textDim,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        transition: "color 0.15s",
      }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function ArticleCard({ article, locale }: { article: ArticleSummary; locale: string }) {
  return (
    <div style={{ ...card, display: "block", position: "relative" }}>
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
      >
        <span style={{ color: color.text, fontWeight: 500, fontSize: 17 }}>
          {article.title}
        </span>
        <p style={{ color: color.articleSnippet, fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
          {article.snippet}
        </p>
      </a>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <a href={article.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
          <span style={{ color: color.gold, fontSize: 13 }}>
            {article.source} · {article.pubDate ? new Date(article.pubDate).toLocaleString(locale) : ""}
          </span>
        </a>
        <CopyLinkButton url={article.link} />
      </div>
    </div>
  );
}

function TopicTabBar({ topics, activeTab, onSelect }: { topics: TopicLabel[]; activeTab: string; onSelect: (t: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${color.border}`, flexWrap: "wrap" }}>
      {topics.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          style={{
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderBottom: activeTab === id ? `2px solid ${color.gold}` : "2px solid transparent",
            background: "transparent",
            color: activeTab === id ? color.gold : color.textMuted,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function VoiceAccordion({
  label,
  voices,
  selected,
  onChange,
  open,
  onToggle,
}: {
  label: string;
  voices: readonly { id: string; label: string; desc: string; gender: string }[];
  selected: string;
  onChange: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={onToggle}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          color: color.textLabel,
          fontSize: 14,
          fontWeight: 500,
          marginBottom: open ? 8 : 0,
        }}
      >
        {label}
        <span style={{ fontSize: 14, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {voices.map((v) => (
            <button
              key={v.id}
              onClick={() => onChange(v.id)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${selected === v.id ? color.gold : color.borderLight}`,
                background: selected === v.id ? color.gold : "transparent",
                color: selected === v.id ? "#000" : color.text,
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13,
                lineHeight: 1.3,
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontWeight: 600 }}>{v.label}</span>
              <span style={{ opacity: 0.7, marginLeft: 4, fontSize: 11 }}>{v.gender}</span>
              <br />
              <span style={{ fontSize: 11, opacity: 0.65 }}>{v.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPage({
  lang,
  maxArticles,
  onMaxArticlesChange,
  ttsSpeed,
  onTtsSpeedChange,
  ttsVoice,
  onTtsVoiceChange,
  ttsVoiceFr,
  onTtsVoiceFrChange,
}: {
  lang: Lang;
  maxArticles: number;
  onMaxArticlesChange: (v: number) => void;
  ttsSpeed: number;
  onTtsSpeedChange: (v: number) => void;
  ttsVoice: string;
  onTtsVoiceChange: (v: string) => void;
  ttsVoiceFr: string;
  onTtsVoiceFrChange: (v: string) => void;
}) {
  const [voiceEnOpen, setVoiceEnOpen] = useState(false);
  const [voiceFrOpen, setVoiceFrOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const sectionStyle: CSSProperties = {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: 10,
    padding: "16px 20px",
    marginBottom: 16,
  };

  const sectionTitle: CSSProperties = {
    color: color.gold,
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 14,
    marginTop: 0,
  };

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 20, marginTop: 0 }}>
        {t("settingsTitle", lang)}
      </h2>
          {/* ── Preferences section ──────────────────────── */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>{t("preferencesSection", lang)}</h4>

            <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
              <label style={{ color: color.textLabel, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                {t("maxArticles", lang)}
                <button
                  onClick={() => setInfoOpen(!infoOpen)}
                  style={{
                    background: "none",
                    border: `1.5px solid ${color.gold}`,
                    borderRadius: "50%",
                    width: 18,
                    height: 18,
                    color: color.gold,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: "16px",
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                  aria-label="Info"
                >
                  i
                </button>
              </label>
              <input
                type="range"
                min={3}
                max={100}
                step={1}
                value={maxArticles}
                onChange={(e) => onMaxArticlesChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: color.gold, cursor: "pointer" }}
              />
              <span style={{ color: color.gold, fontSize: 15, fontWeight: 600, minWidth: 28, textAlign: "center" }}>
                {maxArticles}
              </span>
              {infoOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    right: 0,
                    background: color.surface,
                    border: `1px solid ${color.gold}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: color.text,
                    zIndex: 10,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  }}
                >
                  {t("maxArticlesInfo", lang)}
                </div>
              )}
            </div>

          </div>

          {/* ── Voice section ─────────────────────────────── */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>{lang === "fr" ? "Voix" : "Voice"}</h4>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ color: color.textLabel, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
                {lang === "fr" ? "Vitesse" : "Speed"}
              </label>
              <input
                type="range"
                min={0.7}
                max={1.2}
                step={0.05}
                value={ttsSpeed}
                onChange={(e) => onTtsSpeedChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: color.gold, cursor: "pointer" }}
              />
              <span style={{ color: color.gold, fontSize: 15, fontWeight: 600, minWidth: 40, textAlign: "center" }}>
                {ttsSpeed.toFixed(2)}x
              </span>
            </div>

            <VoiceAccordion
              label={lang === "fr" ? "Voix EN" : "Voice EN"}
              voices={TTS_VOICES_EN}
              selected={ttsVoice}
              onChange={onTtsVoiceChange}
              open={voiceEnOpen}
              onToggle={() => setVoiceEnOpen(!voiceEnOpen)}
            />
            <VoiceAccordion
              label={lang === "fr" ? "Voix FR" : "Voice FR"}
              voices={TTS_VOICES_FR}
              selected={ttsVoiceFr}
              onChange={onTtsVoiceFrChange}
              open={voiceFrOpen}
              onToggle={() => setVoiceFrOpen(!voiceFrOpen)}
            />
          </div>

    </div>
  );
}

function AudioPlayer({ text, lang, speed, voice }: { text: string; lang: Lang; speed: number; voice: string }) {
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
      <SpinKeyframes />
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
          <span
            style={{
              display: "inline-block",
              width: 18,
              height: 18,
              border: `2.5px solid ${color.gold}`,
              borderTop: "2.5px solid transparent",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              marginLeft: 6,
              flexShrink: 0,
            }}
          />
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

function RefIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", opacity: 0.6 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ttsIntro(hours: number, lang: Lang, topicName: string): string {
  if (lang === "fr") {
    const period =
      hours < 1 ? `les ${Math.round(hours * 60)} dernières minutes`
      : hours === 1 ? "la dernière heure"
      : hours < 24 ? `les ${hours} dernières heures`
      : hours === 24 ? "les dernières 24 heures"
      : `les ${Math.round(hours / 24)} derniers jours`;
    return `${topicName}. Voici l'actualité analysée pour ${period}.`;
  }
  const period =
    hours < 1 ? `the last ${Math.round(hours * 60)} minutes`
    : hours === 1 ? "the last hour"
    : hours < 24 ? `the last ${hours} hours`
    : hours === 24 ? "the last 24 hours"
    : `the last ${Math.round(hours / 24)} days`;
  return `${topicName}. Here is the news analyzed for ${period}.`;
}

function SummaryBox({ data, locale, lang, hours, topicName, speed, voice }: { data: SummaryResponse; locale: string; lang: Lang; hours: number; topicName: string; speed: number; voice: string }) {
  const raw = typeof data.summary === "string" ? data.summary : String(data.summary ?? "");
  const ttsOutro = lang === "fr" ? "... ... Analyse terminée. Vous pouvez reprendre une activité normale." : "... ... That's all folks!";
  const ttsText = raw.trim().length > 0 ? `${ttsIntro(hours, lang, topicName)} ${raw} ${ttsOutro}` : "";
  const bullets = data.bullets ?? [];
  const hasBullets = bullets.length > 0;

  return (
    <div style={{ ...card, borderRadius: 12, padding: 20, marginBottom: 28, position: "relative" }}>
      <h2 style={sectionHeading}>
        {t("summary", lang)}
        {topicName && (
          <span style={{ color: color.textMuted, fontWeight: 400 }}> | {topicName}</span>
        )}
      </h2>
      {data.meta && (
        <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12, color: color.textMuted }}>
          <span>{data.meta.totalArticles.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")} {lang === "fr" ? "articles sur la période" : "articles in period"}</span>
          <span style={{ color: color.border }}>|</span>
          <span>{data.meta.scoredArticles.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")} {lang === "fr" ? "scorés" : "scored"}</span>
          <span style={{ color: color.border }}>|</span>
          <span style={{ color: color.gold }}>{data.meta.analyzedArticles} {lang === "fr" ? "analysés par l'IA" : "analyzed by AI"}</span>
        </div>
      )}
      {ttsText.length > 0 && <div style={{ marginBottom: 12 }}><AudioPlayer text={ttsText} lang={lang} speed={speed} voice={voice} /></div>}
      {hasBullets ? (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {bullets.map((bullet, i) => (
            <li
              key={i}
              style={{
                color: color.textSecondary,
                lineHeight: 1.6,
                fontSize: 15,
                padding: "5px 0",
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: color.gold, flexShrink: 0 }}>•</span>
                <span>{bullet.text}</span>
              </div>
              {bullet.refs.length > 0 && (
                <div style={{ display: "flex", gap: 10, marginTop: 4, marginLeft: 18, flexWrap: "wrap" }}>
                  {bullet.refs.map((ref, j) => (
                    <a
                      key={j}
                      href={ref.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={ref.title}
                      style={{
                        color: color.textDim,
                        fontSize: 11,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = color.gold)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = color.textDim)}
                    >
                      {ref.source} <RefIcon />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: color.textSecondary, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0, fontSize: 15 }}>
          {raw}
        </p>
      )}
      <p style={{ color: color.textDim, fontSize: 13, marginTop: 12 }}>
        {new Date(data.period.from).toLocaleString(locale)} → {new Date(data.period.to).toLocaleString(locale)}
      </p>
    </div>
  );
}

const ALL_ARTICLES_PAGE_SIZE = 50;

type AllArticleEntry = ArticleSummary & { score?: number | null };

function AllArticlesTab({ articles, loading, locale, lang }: { articles: AllArticleEntry[]; loading: boolean; locale: string; lang: Lang }) {
  const [visible, setVisible] = useState(ALL_ARTICLES_PAGE_SIZE);

  useEffect(() => { setVisible(ALL_ARTICLES_PAGE_SIZE); }, [articles]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: color.textMuted, fontSize: 14 }}>
        <SpinKeyframes />
        <span style={{ display: "inline-block", width: 24, height: 24, border: `3px solid ${color.gold}`, borderTop: "3px solid transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 10, verticalAlign: "middle" }} />
        {lang === "fr" ? "Chargement des articles…" : "Loading articles…"}
      </div>
    );
  }

  const grouped = articles.reduce<Record<string, AllArticleEntry[]>>((acc, art) => {
    const key = art.source || "Unknown";
    (acc[key] ??= []).push(art);
    return acc;
  }, {});

  const sources = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  if (sources.length === 0) {
    return <p style={{ color: color.textDim, fontSize: 15 }}>No articles found.</p>;
  }

  let rendered = 0;
  const hasMore = visible < articles.length;

  return (
    <div>
      <p style={{ color: color.textMuted, fontSize: 12, marginBottom: 16 }}>
        {articles.length.toLocaleString(locale)} {lang === "fr" ? "articles triés par score" : "articles sorted by score"}
      </p>
      {sources.map((source) => {
        const sourceArticles = grouped[source];
        const toRender = sourceArticles.filter(() => {
          if (rendered >= visible) return false;
          rendered++;
          return true;
        });
        if (toRender.length === 0) return null;
        return (
          <div key={source} style={{ marginBottom: 28 }}>
            <h3 style={{ color: color.gold, fontSize: 16, fontWeight: 600, marginBottom: 12, borderBottom: `1px solid ${color.border}`, paddingBottom: 8 }}>
              {source} ({sourceArticles.length})
            </h3>
            {toRender.map((art, i) => (
              <div
                key={`${art.link}-${i}`}
                style={{
                  padding: "10px 14px",
                  marginBottom: 6,
                  borderRadius: 8,
                  background: color.surface,
                }}
              >
                <a
                  href={art.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "none", color: "inherit", display: "block" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ color: color.text, fontWeight: 500, fontSize: 15, flex: 1 }}>
                      {art.title}
                    </span>
                    {art.score != null && (
                      <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: art.score >= 7 ? "#22c55e" : art.score >= 5 ? color.gold : color.textMuted,
                        marginLeft: 8,
                        flexShrink: 0,
                      }}>
                        {art.score}/10
                      </span>
                    )}
                  </div>
                  {art.snippet && (
                    <p style={{ color: color.articleSnippet, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                      {art.snippet}
                    </p>
                  )}
                </a>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ color: color.textDim, fontSize: 12 }}>
                    {art.pubDate ? new Date(art.pubDate).toLocaleString(locale) : ""}
                  </span>
                  <CopyLinkButton url={art.link} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {hasMore && (
        <button
          onClick={() => setVisible((v) => v + ALL_ARTICLES_PAGE_SIZE)}
          style={{
            display: "block",
            width: "100%",
            padding: "12px 0",
            marginTop: 8,
            border: `1px solid ${color.border}`,
            borderRadius: 8,
            background: color.surface,
            color: color.gold,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          {lang === "fr"
            ? `Afficher plus (${Math.min(ALL_ARTICLES_PAGE_SIZE, articles.length - visible)} suivants)`
            : `Show more (${Math.min(ALL_ARTICLES_PAGE_SIZE, articles.length - visible)} next)`}
        </button>
      )}
    </div>
  );
}

let sharedAudioCtx: AudioContext | null = null;

function unlockAudioContext() {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AudioContext();
    }
    if (sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume();
    }
    const buf = sharedAudioCtx.createBuffer(1, 1, 22050);
    const src = sharedAudioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(sharedAudioCtx.destination);
    src.start(0);
  } catch { /* silent fail */ }
}

function playNotificationBeep() {
  try {
    const ctx = sharedAudioCtx;
    if (!ctx || ctx.state === "closed") return;
    if (ctx.state === "suspended") ctx.resume();

    const t0 = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.frequency.value = 880;
    osc1.type = "sine";
    osc1.connect(gain);
    osc1.start(t0);
    osc1.stop(t0 + 0.12);

    const osc2 = ctx.createOscillator();
    osc2.frequency.value = 1050;
    osc2.type = "sine";
    osc2.connect(gain);
    osc2.start(t0 + 0.18);
    osc2.stop(t0 + 0.30);

    gain.gain.setValueAtTime(0.08, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    gain.gain.setValueAtTime(0.08, t0 + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.30);
  } catch { /* silent fail */ }
}

// ── Stats page ────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  "9-10": "#22c55e",
  "7-8": "#c9a227",
  "5-6": "#eab308",
  "3-4": "#f97316",
  "1-2": "#ef4444",
};

function heatmapBg(pct: number, tier: string): string | undefined {
  if (pct <= 0) return undefined;
  const hex = TIER_COLORS[tier] || "#666";
  const r = parseInt(hex.slice(1, 3), 16);
  const gr = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Math.min(0.6, 0.1 + (pct / 100) * 0.5);
  return `rgba(${r},${gr},${b},${a})`;
}

const scoreClr = (s: number) =>
  s >= 7 ? "#4ade80" : s >= 5 ? "#c9a227" : s >= 3 ? "#f97316" : "#ff8888";

const hitClr = (r: number) =>
  r >= 50 ? "#4ade80" : r >= 30 ? "#c9a227" : "#ff8888";

const covClr = (p: number) =>
  p >= 90 ? "#4ade80" : p >= 70 ? "#c9a227" : "#ff8888";

function StatsPage({ lang, topics }: { lang: Lang; topics: TopicLabel[] }) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statsTopic, setStatsTopic] = useState<string>("all");
  const [days, setDays] = useState(0);
  const [sortKey, setSortKey] = useState("avgScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const cache = useRef<Record<string, StatsResponse>>({});
  const locale = dateLocale(lang);

  useEffect(() => {
    const key = `${statsTopic}:${days}`;
    if (cache.current[key]) {
      setData(cache.current[key]);
      setErr(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    const daysParam = days === -1 ? (Date.now() - new Date().setHours(0, 0, 0, 0)) / 86_400_000 : days;
    fetch(`/api/stats?topic=${statsTopic}&days=${daysParam}`, { signal: ac.signal, cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json: StatsResponse) => {
        if (ac.signal.aborted) return;
        cache.current[key] = json;
        setData(json);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!ac.signal.aborted) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [statsTopic, days]);

  const fmt = (n: number) => n.toLocaleString(locale);

  const topicLabel = (tp: string) => {
    const found = topics.find((item) => item.id === tp);
    return found ? found.label : tp;
  };

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortArrow = (key: string) => (key === sortKey ? (sortDir === "desc" ? " ▼" : " ▲") : "");

  // ── Shared styles ──
  const kpiCard: CSSProperties = { background: color.surface, border: `1px solid ${color.border}`, borderRadius: 8, padding: "10px 6px", textAlign: "center" };
  const kpiVal: CSSProperties = { fontSize: 17, fontWeight: 700, color: color.gold };
  const kpiLbl: CSSProperties = { fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: color.textMuted, marginTop: 2 };
  const secStyle: CSSProperties = { background: color.surface, border: `1px solid ${color.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 16 };
  const secTitle: CSSProperties = { color: color.gold, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, marginTop: 0 };

  const periodOpts = [
    { label: t("allTime", lang), value: 0 },
    { label: t("last1h", lang), value: 1 / 24 },
    { label: t("last3h", lang), value: 3 / 24 },
    { label: t("last6h", lang), value: 6 / 24 },
    { label: t("today", lang), value: -1 },
    { label: t("yesterday", lang), value: 1 },
    { label: t("last3d", lang), value: 3 },
    { label: t("last7d", lang), value: 7 },
    { label: t("last30d", lang), value: 30 },
  ];

  // ── Loading ──
  if (loading && !data) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <SpinKeyframes />
        <span style={{ display: "inline-block", width: 28, height: 28, border: `3px solid ${color.gold}`, borderTop: "3px solid transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ color: color.textMuted, fontSize: 14, marginTop: 12 }}>
          {lang === "fr" ? "Chargement des statistiques…" : "Loading statistics…"}
        </p>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <p style={{ color: color.errorText, fontSize: 15 }}>{err}</p>
      </div>
    );
  }

  if (!data) return null;

  const g = data.global;
  const { scoreDistribution, feedRanking, topArticles, topicComparison } = data;
  const maxPct = Math.max(...scoreDistribution.map((d) => d.pct), 1);

  const sorted = [...feedRanking].sort((a, b) => {
    const va = (a as Record<string, unknown>)[sortKey] as number;
    const vb = (b as Record<string, unknown>)[sortKey] as number;
    return sortDir === "desc" ? vb - va : va - vb;
  });

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 20, marginTop: 0 }}>
        {t("statsTitle", lang)}
      </h2>

      <style>{`
        .s-kpi5{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:20px}
        @media(max-width:640px){.s-kpi5{grid-template-columns:repeat(2,1fr)}}
        .s-tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
        .s-tb{width:100%;border-collapse:collapse;font-size:13px;min-width:700px}
        .s-tb th{position:sticky;top:0;background:#0d0d0d;padding:8px 6px;text-align:left;font-weight:600;color:${color.textMuted};border-bottom:1px solid ${color.border};white-space:nowrap;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
        .s-tb th.sc{cursor:pointer;user-select:none}
        .s-tb th.sc:hover{color:${color.gold}}
        .s-tb td{padding:7px 6px;border-bottom:1px solid ${color.border};white-space:nowrap}
        .s-tb tr:nth-child(odd) td{background:${color.surface}}
        .s-tb tr:nth-child(even) td{background:#0d0d0d}
        .s-tb tr:hover td{background:#1a1a1a}
        .s-tb .col-src{position:sticky;left:0;z-index:1}
        .s-tb tr:nth-child(odd) .col-src{background:${color.surface}}
        .s-tb tr:nth-child(even) .col-src{background:#0d0d0d}
        .s-tb tr:hover .col-src{background:#1a1a1a}
        .s-tb thead .col-src{background:#0d0d0d;z-index:2}
      `}</style>

      {/* ── Topic Selector ───────────────────────── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${color.border}`, flexWrap: "wrap" }}>
        <button
          onClick={() => setStatsTopic("all")}
          style={{
            padding: "7px 12px", fontSize: 12, fontWeight: 600, border: "none",
            borderBottom: statsTopic === "all" ? `2px solid ${color.gold}` : "2px solid transparent",
            background: "transparent", color: statsTopic === "all" ? color.gold : color.textMuted,
            cursor: "pointer", transition: "all 0.15s",
          }}
        >
          {t("allTopics", lang)}
        </button>
        {topics.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setStatsTopic(id)}
            style={{
              padding: "7px 12px", fontSize: 12, fontWeight: 600, border: "none",
              borderBottom: statsTopic === id ? `2px solid ${color.gold}` : "2px solid transparent",
              background: "transparent", color: statsTopic === id ? color.gold : color.textMuted,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Period filter ────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {periodOpts.map((o) => (
          <button
            key={o.value}
            onClick={() => setDays(o.value)}
            style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: `1px solid ${days === o.value ? color.gold : color.border}`,
              background: days === o.value ? color.gold : "transparent",
              color: days === o.value ? "#000" : color.textMuted,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* ── Data sections (dim when refreshing) ── */}
      <div style={{ position: "relative", transition: "opacity 0.25s", opacity: loading ? 0.3 : 1, pointerEvents: loading ? "none" : "auto" }}>

      {loading && (
        <div style={{ position: "absolute", top: 60, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 5 }}>
          <SpinKeyframes />
          <span style={{ display: "inline-block", width: 24, height: 24, border: `3px solid ${color.gold}`, borderTop: "3px solid transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────── */}
      <div className="s-kpi5">
        <div style={kpiCard}><div style={kpiVal}>{fmt(g.totalArticles)}</div><div style={kpiLbl}>{t("totalArticles", lang)}</div></div>
        <div style={kpiCard}><div style={kpiVal}>{fmt(g.scoredArticles)}</div><div style={kpiLbl}>{t("scoredArticles", lang)}</div></div>
        <div style={kpiCard}><div style={{ ...kpiVal, color: covClr(g.pctScored) }}>{g.pctScored}%</div><div style={kpiLbl}>{t("coverage", lang)}</div></div>
        <div style={kpiCard}><div style={{ ...kpiVal, color: scoreClr(g.avgScore) }}>{g.avgScore}</div><div style={kpiLbl}>{t("avgScore", lang)}</div></div>
        <div style={kpiCard}><div style={kpiVal}>{g.hitRate}%</div><div style={kpiLbl}>Score ≥ 7</div></div>
      </div>

      {/* ── Score Distribution ────────────────────── */}
      <div style={secStyle}>
        <h4 style={secTitle}>{t("scoreDistrib", lang)}</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scoreDistribution.map((d) => (
            <div key={d.tier} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 36, fontSize: 13, fontWeight: 600, color: TIER_COLORS[d.tier], textAlign: "right", flexShrink: 0 }}>{d.tier}</span>
              <div style={{ flex: 1, height: 24, background: color.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, background: TIER_COLORS[d.tier], width: `${(d.pct / maxPct) * 100}%`, transition: "width 0.4s ease-out" }} />
              </div>
              <span style={{ width: 44, fontSize: 12, color: color.textMuted, textAlign: "right", flexShrink: 0 }}>{d.pct}%</span>
              <span style={{ width: 60, fontSize: 11, color: color.textDim, textAlign: "right", flexShrink: 0 }}>({fmt(d.count)})</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feed Ranking Table ────────────────────── */}
      <div style={secStyle}>
        <h4 style={secTitle}>{t("feedRanking", lang)}</h4>
        {sorted.length === 0 ? (
          <p style={{ color: color.textDim, fontSize: 14, margin: 0 }}>—</p>
        ) : (
          <div className="s-tw">
            <table className="s-tb">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="col-src">{t("source", lang)}</th>
                  {statsTopic === "all" && <th>Topic</th>}
                  <th className="sc" onClick={() => handleSort("total")}>{t("total", lang)}{sortArrow("total")}</th>
                  <th className="sc" onClick={() => handleSort("scored")}>{t("scored", lang)}{sortArrow("scored")}</th>
                  <th className="sc" onClick={() => handleSort("avgScore")}>{t("average", lang)}{sortArrow("avgScore")}</th>
                  <th className="sc" onClick={() => handleSort("hitRate")}>≥ 7{sortArrow("hitRate")}</th>
                  <th className="sc" onClick={() => handleSort("pct9_10")}>9-10{sortArrow("pct9_10")}</th>
                  <th className="sc" onClick={() => handleSort("pct7_8")}>7-8{sortArrow("pct7_8")}</th>
                  <th>5-6</th>
                  <th>3-4</th>
                  <th>1-2</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => (
                  <tr key={`${f.source}\0${f.topic}`}>
                    <td style={{ color: color.textDim, fontSize: 11 }}>{i + 1}</td>
                    <td className="col-src" style={{ fontWeight: 500, color: color.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {f.sourceUrl ? (
                        <a
                          href={f.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: color.text, textDecoration: "none" }}
                        >
                          {f.source}
                        </a>
                      ) : (
                        f.source
                      )}
                    </td>
                    {statsTopic === "all" && <td style={{ color: color.textMuted, fontSize: 12 }}>{topicLabel(f.topic)}</td>}
                    <td>{fmt(f.total)}</td>
                    <td>{fmt(f.scored)}</td>
                    <td style={{ fontWeight: 700, color: scoreClr(f.avgScore) }}>
                      {f.avgScore}
                      <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: scoreClr(f.avgScore), width: `${(f.avgScore / 10) * 100}%`, opacity: 0.5 }} />
                    </td>
                    <td style={{ color: hitClr(f.hitRate), fontWeight: 600 }}>{f.hitRate}%</td>
                    <td style={{ background: heatmapBg(f.pct9_10, "9-10"), textAlign: "center", borderRadius: 3 }}>{f.pct9_10 > 0 ? `${f.pct9_10}%` : "—"}</td>
                    <td style={{ background: heatmapBg(f.pct7_8, "7-8"), textAlign: "center", borderRadius: 3 }}>{f.pct7_8 > 0 ? `${f.pct7_8}%` : "—"}</td>
                    <td style={{ background: heatmapBg(f.pct5_6, "5-6"), textAlign: "center", borderRadius: 3 }}>{f.pct5_6 > 0 ? `${f.pct5_6}%` : "—"}</td>
                    <td style={{ background: heatmapBg(f.pct3_4, "3-4"), textAlign: "center", borderRadius: 3 }}>{f.pct3_4 > 0 ? `${f.pct3_4}%` : "—"}</td>
                    <td style={{ background: heatmapBg(f.pct1_2, "1-2"), textAlign: "center", borderRadius: 3 }}>{f.pct1_2 > 0 ? `${f.pct1_2}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Top 10 Articles ──────────────────────── */}
      <div style={secStyle}>
        <h4 style={secTitle}>{t("topArticles", lang)}</h4>
        {topArticles.length === 0 ? (
          <p style={{ color: color.textDim, fontSize: 14, margin: 0 }}>—</p>
        ) : topArticles.map((a, i) => (
          <div
            key={`${a.link}-${i}`}
            style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              padding: "10px 0",
              borderBottom: i < topArticles.length - 1 ? `1px solid ${color.border}` : "none",
            }}
          >
            <span style={{
              display: "inline-block", padding: "2px 8px", borderRadius: 4,
              fontSize: 13, fontWeight: 700, color: "#000", flexShrink: 0,
              background: a.score >= 9 ? "#22c55e" : a.score >= 7 ? color.gold : a.score >= 5 ? "#eab308" : "#f97316",
            }}>
              {a.score}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={a.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ color: color.text, fontWeight: 500, fontSize: 14 }}>{a.title}</div>
              </a>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
                <span style={{ color: color.textMuted, fontSize: 12 }}>
                  {a.source} · {new Date(a.pubDate).toLocaleDateString(locale)}
                </span>
                <CopyLinkButton url={a.link} />
              </div>
              {a.reason && (
                <div style={{ color: color.textDim, fontSize: 12, marginTop: 2, whiteSpace: "normal" }}>
                  {a.reason.length > 80 ? `${a.reason.slice(0, 80)}…` : a.reason}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Topic Comparison (All only) ──────────── */}
      {statsTopic === "all" && topicComparison.length > 0 && (
        <div style={secStyle}>
          <h4 style={secTitle}>{t("topicComparison", lang)}</h4>
          <div className="s-tw">
            <table className="s-tb">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>{t("total", lang)}</th>
                  <th>{t("scored", lang)}</th>
                  <th>{t("coverage", lang)}</th>
                  <th>{t("avgScore", lang)}</th>
                  <th>Score ≥ 7</th>
                  <th>{t("feeds", lang)}</th>
                  <th>{t("activeFeeds", lang)} ({lang === "fr" ? "7j" : "7d"})</th>
                </tr>
              </thead>
              <tbody>
                {topicComparison.map((tc) => (
                  <tr key={tc.topic}>
                    <td style={{ fontWeight: 500, color: color.gold }}>{topicLabel(tc.topic)}</td>
                    <td>{fmt(tc.total)}</td>
                    <td>{fmt(tc.scored)}</td>
                    <td style={{ color: covClr(tc.pctScored) }}>{tc.pctScored}%</td>
                    <td style={{ fontWeight: 700, color: scoreClr(tc.avgScore) }}>{tc.avgScore}</td>
                    <td style={{ color: hitClr(tc.hitRate), fontWeight: 600 }}>{tc.hitRate}%</td>
                    <td>{tc.totalFeeds}</td>
                    <td>{tc.activeSources}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </div>{/* end filtered sections wrapper */}
    </div>
  );
}

// ── Cron Monitor page ─────────────────────────────────────────────────

function CronMonitorPage({ lang }: { lang: Lang }) {
  const [data, setData] = useState<CronStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const loadData = useCallback(() => {
    fetch("/api/cron-stats", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json: CronStatsResponse) => { setData(json); setErr(null); })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const id = setInterval(loadData, 60_000);
    return () => clearInterval(id);
  }, [loadData]);

  const fmt = (n: number) => n.toLocaleString(lang === "fr" ? "fr-FR" : "en-US");

  function timeAgo(iso: string | null): string {
    if (!iso) return "—";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return "< 1 " + t("minutesAgo", lang);
    if (mins < 60) return `${mins} ${t("minutesAgo", lang)}`;
    const hours = Math.floor(mins / 60);
    return `${hours} ${t("hoursAgo", lang)}`;
  }

  function statusIcon(s: "ok" | "slow" | "high"): string {
    if (s === "ok") return "✅";
    if (s === "slow") return "⚠️";
    return "🔴";
  }

  function statusLabel(s: "ok" | "slow" | "high"): string {
    if (s === "ok") return t("statusOk", lang);
    if (s === "slow") return t("statusSlow", lang);
    return t("statusHigh", lang);
  }

  function reasonLabel(status: string, reason: string | undefined): string {
    if (status === "ok" || !reason) return "";
    const threshold = status === "high" ? "30m" : "15m";
    if (reason === "backlog") return status === "high" ? "backlog > 200" : "backlog ≥ 50";
    if (reason === "fetch") return `fetch > ${threshold}`;
    return `score > ${threshold}`;
  }

  function kpiColor(val: number, thresholds: [number, number], invert = false): string {
    const [low, high] = thresholds;
    if (invert) {
      if (val <= low) return "#22c55e";
      if (val <= high) return color.gold;
      return "#ef4444";
    }
    if (val >= high) return "#22c55e";
    if (val >= low) return color.gold;
    return "#ef4444";
  }

  const kpiCard: CSSProperties = { background: color.surface, border: `1px solid ${color.border}`, borderRadius: 8, padding: "10px 6px", textAlign: "center" };
  const kpiVal: CSSProperties = { fontSize: 17, fontWeight: 700 };
  const kpiLbl: CSSProperties = { fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: color.textMuted, marginTop: 2 };
  const secStyle: CSSProperties = { background: color.surface, border: `1px solid ${color.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 16 };
  const secTitle: CSSProperties = { color: color.gold, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, marginTop: 0 };
  const thStyle: CSSProperties = { textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 600, color: color.textMuted, borderBottom: `1px solid ${color.border}`, whiteSpace: "nowrap" };
  const tdStyle: CSSProperties = { padding: "6px 10px", fontSize: 13, borderBottom: `1px solid ${color.border}`, whiteSpace: "nowrap" };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: color.textMuted }}>
        <SpinKeyframes />
        <span style={{ display: "inline-block", width: 24, height: 24, border: `3px solid ${color.gold}`, borderTop: "3px solid transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (err) {
    return <div style={{ background: color.errorBg, border: `1px solid ${color.errorBorder}`, borderRadius: 8, padding: "12px 16px", color: color.errorText, fontSize: 15 }}>{err}</div>;
  }

  if (!data) return null;

  const maxBar = Math.max(...data.timeline.map((h) => Math.max(h.fetched, h.scored)), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <h2 style={{ ...sectionHeading, marginBottom: 0 }}>{t("cronMonitor", lang)}</h2>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} title="Auto-refresh 60s" />
        <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 20 }}>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: kpiColor(data.global.backlog, [50, 200], true) }}>{fmt(data.global.backlog)}</div>
          <div style={kpiLbl}>{t("backlog", lang)}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: color.gold }}>{fmt(data.global.fetched24h)}</div>
          <div style={kpiLbl}>{t("fetched24h", lang)}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: color.gold }}>{fmt(data.global.scored24h)}</div>
          <div style={kpiLbl}>{t("scored24hCron", lang)}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: kpiColor(data.global.coverage24h, [70, 90]) }}>{data.global.coverage24h}%</div>
          <div style={kpiLbl}>{t("coverage24h", lang)}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ ...kpiVal, color: kpiColor(data.global.avgDelayMinutes, [15, 60], true) }}>{data.global.avgDelayMinutes} min</div>
          <div style={kpiLbl}>{t("avgDelay", lang)}</div>
        </div>
      </div>

      {/* ── Topic Status ── */}
      <div style={secStyle}>
        <h3 style={secTitle}>{t("topicStatus", lang)}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Topic</th>
                <th style={thStyle}>{t("lastFetch", lang)}</th>
                <th style={thStyle}>{t("lastScore", lang)}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("backlog", lang)}</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>{lang === "fr" ? "Raison" : "Reason"}</th>
              </tr>
            </thead>
            <tbody>
              {data.topics.map((tp) => (
                <tr key={tp.id}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{tp.label}</td>
                  <td style={tdStyle}>{timeAgo(tp.lastFetchedAt)}</td>
                  <td style={tdStyle}>{timeAgo(tp.lastScoredAt)}</td>
                  <td style={{
                    ...tdStyle,
                    textAlign: "right",
                    fontWeight: 600,
                    color: tp.backlog > 200 ? "#ef4444" : tp.backlog >= 50 ? color.gold : color.text,
                  }}>{fmt(tp.backlog)}</td>
                  <td style={tdStyle}>{statusIcon(tp.status)} {statusLabel(tp.status)}</td>
                  <td style={{ ...tdStyle, color: color.textDim, fontSize: 12 }}>{reasonLabel(tp.status, tp.statusReason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Activity Timeline ── */}
      <div style={secStyle}>
        <h3 style={secTitle}>{t("activityTimeline", lang)}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>{t("hourCol", lang)}</th>
                <th style={thStyle}>{t("fetchedCol", lang)}</th>
                <th style={thStyle}>{t("scoredCol", lang)}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("coverage", lang)}</th>
                <th style={{ ...thStyle, width: "40%" }}></th>
              </tr>
            </thead>
            <tbody>
              {data.timeline.filter((row) => new Date(row.hour).getTime() <= Date.now()).map((row) => {
                const hDate = new Date(row.hour);
                const hLabel = hDate.toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
                const cov = row.fetched > 0 ? Math.round((row.scored / row.fetched) * 100) : 0;
                const fetchW = Math.max(2, (row.fetched / maxBar) * 100);
                const scoreW = Math.max(2, (row.scored / maxBar) * 100);
                return (
                  <tr key={row.hour}>
                    <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{hLabel}</td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{fmt(row.fetched)}</td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{fmt(row.scored)}</td>
                    <td style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: cov >= 90 ? "#22c55e" : cov >= 70 ? color.gold : "#ef4444",
                    }}>{cov}%</td>
                    <td style={{ ...tdStyle, padding: "6px 10px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ height: 6, width: `${fetchW}%`, background: color.gold, borderRadius: 3 }} title={`Fetched: ${row.fetched}`} />
                        <div style={{ height: 6, width: `${scoreW}%`, background: "#22c55e", borderRadius: 3 }} title={`Scored: ${row.scored}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: color.textMuted }}>
          <span><span style={{ display: "inline-block", width: 10, height: 6, background: color.gold, borderRadius: 2, marginRight: 4 }} />{t("fetchedCol", lang)}</span>
          <span><span style={{ display: "inline-block", width: 10, height: 6, background: "#22c55e", borderRadius: 2, marginRight: 4 }} />{t("scoredCol", lang)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Topics page ───────────────────────────────────────────────────────

function TopicsPage({ lang }: { lang: Lang }) {
  const [view, setView] = useState<"list" | "detail" | "create">("list");
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicDetail, setTopicDetail] = useState<TopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formId, setFormId] = useState("");
  const [formLabelEn, setFormLabelEn] = useState("");
  const [formLabelFr, setFormLabelFr] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formT1, setFormT1] = useState("");
  const [formT2, setFormT2] = useState("");
  const [formT3, setFormT3] = useState("");
  const [formT4, setFormT4] = useState("");
  const [formT5, setFormT5] = useState("");

  const [feedName, setFeedName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [addingFeed, setAddingFeed] = useState(false);

  const [editingTopic, setEditingTopic] = useState(false);
  const [editLabelEn, setEditLabelEn] = useState("");
  const [editLabelFr, setEditLabelFr] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editT1, setEditT1] = useState("");
  const [editT2, setEditT2] = useState("");
  const [editT3, setEditT3] = useState("");
  const [editT4, setEditT4] = useState("");
  const [editT5, setEditT5] = useState("");

  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptLang, setPromptLang] = useState<"en" | "fr">("en");
  const [editPromptEn, setEditPromptEn] = useState("");
  const [editPromptFr, setEditPromptFr] = useState("");

  const [formPromptEn, setFormPromptEn] = useState("");
  const [formPromptFr, setFormPromptFr] = useState("");
  const [formPromptLang, setFormPromptLang] = useState<"en" | "fr">("en");
  const [generatingScoring, setGeneratingScoring] = useState(false);
  const [autoFeeds, setAutoFeeds] = useState(true);
  const [discoveringFeeds, setDiscoveringFeeds] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<{
    added: { name: string; url: string }[];
    rejected: { name: string; url: string; reason: string }[];
  } | null>(null);

  const secStyle: CSSProperties = { background: color.surface, border: `1px solid ${color.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 16 };
  const secTitle: CSSProperties = { color: color.gold, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, marginTop: 0 };
  const inputStyle: CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 6,
    border: `1px solid ${color.border}`, background: color.surface,
    color: color.text, fontSize: 13, boxSizing: "border-box",
  };
  const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 60, resize: "vertical" };
  const primaryBtn: CSSProperties = {
    padding: "8px 20px", borderRadius: 6, border: "none",
    background: color.gold, color: "#000", fontSize: 13, fontWeight: 600, cursor: "pointer",
  };
  const dangerBtn: CSSProperties = {
    padding: "6px 12px", borderRadius: 6, border: "none",
    background: "transparent", color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer",
  };
  const ghostBtn: CSSProperties = {
    padding: "6px 12px", borderRadius: 6, border: `1px solid ${color.border}`,
    background: "transparent", color: color.textMuted, fontSize: 13, fontWeight: 500, cursor: "pointer",
  };

  async function loadTopics() {
    setLoading(true);
    try {
      const res = await fetch("/api/topics?all=1", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      setTopics(await res.json());
      setError(null);
    } catch { setError("Failed to load topics"); }
    finally { setLoading(false); }
  }

  async function loadDetail(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/topics/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const d: TopicDetail = await res.json();
      setTopicDetail(d);
      setEditLabelEn(d.labelEn); setEditLabelFr(d.labelFr);
      setEditDomain(d.scoringDomain);
      setEditT1(d.scoringTier1); setEditT2(d.scoringTier2);
      setEditT3(d.scoringTier3); setEditT4(d.scoringTier4); setEditT5(d.scoringTier5);
      setEditPromptEn(d.promptEn); setEditPromptFr(d.promptFr);
      setEditingTopic(false); setEditingPrompt(false);
      setView("detail");
      setError(null);
    } catch { setError("Failed to load topic"); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    setSaving(true); setError(null);
    const wantFeeds = autoFeeds && !!formDomain.trim();
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: formId, labelEn: formLabelEn, labelFr: formLabelFr,
          scoringDomain: formDomain,
          scoringTier1: formT1, scoringTier2: formT2, scoringTier3: formT3,
          scoringTier4: formT4, scoringTier5: formT5,
          promptEn: formPromptEn || undefined,
          promptFr: formPromptFr || undefined,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      const created = await res.json();
      const createdId = created.id;
      setFormId(""); setFormLabelEn(""); setFormLabelFr(""); setFormDomain("");
      setFormT1(""); setFormT2(""); setFormT3(""); setFormT4(""); setFormT5("");
      setFormPromptEn(""); setFormPromptFr(""); setAutoFeeds(true);
      await loadDetail(createdId);
      setSaving(false);

      if (wantFeeds) {
        setDiscoveringFeeds(true); setDiscoverResult(null);
        try {
          const dr = await fetch(`/api/topics/${createdId}/discover-feeds`, { method: "POST" });
          if (dr.ok) {
            const data = await dr.json();
            setDiscoverResult(data);
          }
          await loadDetail(createdId);
        } catch { /* topic already created, feeds are optional */ }
        finally { setDiscoveringFeeds(false); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); setSaving(false); }
  }

  async function handleDeleteTopic(id: string) {
    if (!confirm(t("confirmDelete", lang))) return;
    try {
      await fetch(`/api/topics/${id}`, { method: "DELETE" });
      setView("list");
      await loadTopics();
    } catch { setError("Failed to delete"); }
  }

  async function handleSaveTopic() {
    if (!topicDetail) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/topics/${topicDetail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labelEn: editLabelEn, labelFr: editLabelFr,
          scoringDomain: editDomain,
          scoringTier1: editT1, scoringTier2: editT2, scoringTier3: editT3,
          scoringTier4: editT4, scoringTier5: editT5,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadDetail(topicDetail.id);
    } catch { setError("Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleSavePrompt() {
    if (!topicDetail) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/topics/${topicDetail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptEn: editPromptEn, promptFr: editPromptFr }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadDetail(topicDetail.id);
    } catch { setError("Failed to save prompt"); }
    finally { setSaving(false); }
  }

  async function handleToggleActive() {
    if (!topicDetail) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/topics/${topicDetail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !topicDetail.isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadDetail(topicDetail.id);
    } catch { setError("Failed to toggle status"); }
    finally { setSaving(false); }
  }

  async function handleGenerateScoring() {
    if (!formDomain.trim()) return;
    setGeneratingScoring(true); setError(null);
    try {
      const res = await fetch("/api/topics/generate-scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: formDomain.trim() }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      const data = await res.json();
      setFormT1(data.tier1); setFormT2(data.tier2); setFormT3(data.tier3);
      setFormT4(data.tier4); setFormT5(data.tier5);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to generate"); }
    finally { setGeneratingScoring(false); }
  }

  async function handleAddFeed() {
    if (!topicDetail || !feedName.trim() || !feedUrl.trim()) return;
    setAddingFeed(true); setError(null);
    try {
      const res = await fetch(`/api/topics/${topicDetail.id}/feeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: feedName.trim(), url: feedUrl.trim() }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      setFeedName(""); setFeedUrl("");
      await loadDetail(topicDetail.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setAddingFeed(false); }
  }

  async function handleDiscoverFeeds() {
    if (!topicDetail) return;
    setDiscoveringFeeds(true); setDiscoverResult(null); setError(null);
    try {
      const dr = await fetch(`/api/topics/${topicDetail.id}/discover-feeds`, { method: "POST" });
      if (dr.ok) setDiscoverResult(await dr.json());
      else { const e = await dr.json().catch(() => ({})); setError((e as { error?: string }).error || "Failed"); }
    } catch { setError("Failed to discover feeds"); }
    finally {
      await loadDetail(topicDetail.id);
      setDiscoveringFeeds(false);
    }
  }

  async function handleDeleteFeed(feedId: number) {
    if (!topicDetail) return;
    try {
      await fetch(`/api/topics/${topicDetail.id}/feeds/${feedId}`, { method: "DELETE" });
      await loadDetail(topicDetail.id);
    } catch { setError("Failed to delete feed"); }
  }

  async function handleReorder(idA: string, idB: string) {
    const newTopics = [...topics];
    const iA = newTopics.findIndex((tp) => tp.id === idA);
    const iB = newTopics.findIndex((tp) => tp.id === idB);
    if (iA === -1 || iB === -1) return;
    [newTopics[iA], newTopics[iB]] = [newTopics[iB], newTopics[iA]];
    setTopics(newTopics);
    try {
      const res = await fetch("/api/topics/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicA: idA, topicB: idB }),
      });
      if (!res.ok) throw new Error();
    } catch { loadTopics(); }
  }

  useEffect(() => { loadTopics(); }, []);

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  }

  // ── Create view ──
  if (view === "create") {
    return (
      <div>
        <button onClick={() => setView("list")} style={{ ...ghostBtn, marginBottom: 16 }}>
          ← {t("back", lang)}
        </button>
        <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 20, marginTop: 0 }}>
          {t("newTopic", lang)}
        </h2>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={secStyle}>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("topicSlug", lang)}</label>
              <input value={formId} onChange={(e) => setFormId(slugify(e.target.value))} placeholder="my-topic" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("labelEn", lang)}</label>
                <input value={formLabelEn} onChange={(e) => { setFormLabelEn(e.target.value); if (!formId || formId === slugify(formLabelEn)) setFormId(slugify(e.target.value)); }} placeholder="My Topic" style={inputStyle} />
              </div>
              <div>
                <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("labelFr", lang)}</label>
                <input value={formLabelFr} onChange={(e) => setFormLabelFr(e.target.value)} placeholder="Mon topic" style={inputStyle} />
              </div>
            </div>
          </div>
        </div>

        <div style={secStyle}>
          <h4 style={secTitle}>{t("scoringCriteria", lang)}</h4>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("scoringDomainLabel", lang)}</label>
              <textarea value={formDomain} onChange={(e) => setFormDomain(e.target.value)} style={textareaStyle} placeholder="Description of the domain..." />
              <button
                onClick={handleGenerateScoring}
                disabled={generatingScoring || !formDomain.trim()}
                style={{
                  marginTop: 8, padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${color.gold}`, background: "transparent", color: color.gold,
                  cursor: generatingScoring || !formDomain.trim() ? "not-allowed" : "pointer",
                  opacity: generatingScoring || !formDomain.trim() ? 0.5 : 1,
                  transition: "all 0.15s",
                }}
              >
                {generatingScoring ? `⏳ ${t("generatingAi", lang)}` : `✨ ${t("generateAi", lang)}`}
              </button>
            </div>
            {[["9-10", formT1, setFormT1], ["7-8", formT2, setFormT2], ["5-6", formT3, setFormT3], ["3-4", formT4, setFormT4], ["1-2", formT5, setFormT5]].map(([tier, val, setter]) => (
              <div key={tier as string}>
                <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{tier as string}</label>
                <textarea value={val as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} style={textareaStyle} />
              </div>
            ))}
          </div>
        </div>

        <div style={secStyle}>
          <h4 style={secTitle}>{t("analysisPrompt", lang)} ({lang === "fr" ? "optionnel" : "optional"})</h4>
          <div style={{ display: "flex", gap: 0, marginBottom: 10 }}>
            {(["en", "fr"] as const).map((pl) => (
              <button key={pl} onClick={() => setFormPromptLang(pl)} style={{
                padding: "6px 16px", fontSize: 12, fontWeight: 600, border: `1px solid ${color.border}`,
                borderBottom: formPromptLang === pl ? `2px solid ${color.gold}` : `1px solid ${color.border}`,
                background: formPromptLang === pl ? color.surface : "transparent",
                color: formPromptLang === pl ? color.gold : color.textMuted,
                cursor: "pointer", borderRadius: pl === "en" ? "6px 0 0 0" : "0 6px 0 0",
              }}>
                {pl.toUpperCase()}
              </button>
            ))}
          </div>
          <textarea
            value={formPromptLang === "en" ? formPromptEn : formPromptFr}
            onChange={(e) => formPromptLang === "en" ? setFormPromptEn(e.target.value) : setFormPromptFr(e.target.value)}
            placeholder={t("promptPlaceholder", lang)}
            style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}
          />
          <div style={{ color: color.textDim, fontSize: 11, marginTop: 4 }}>{t("promptMaxInfo", lang)}</div>
        </div>

        {/* Auto RSS feed discovery */}
        <div style={{ ...secStyle, cursor: formDomain.trim() ? "pointer" : "default", opacity: formDomain.trim() ? 1 : 0.5 }} onClick={() => { if (formDomain.trim()) setAutoFeeds(!autoFeeds); }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <input
              type="checkbox"
              checked={autoFeeds && !!formDomain.trim()}
              disabled={!formDomain.trim()}
              onChange={(e) => setAutoFeeds(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 20, height: 20, marginTop: 2, accentColor: color.gold, cursor: formDomain.trim() ? "pointer" : "not-allowed", flexShrink: 0 }}
            />
            <div>
              <div style={{ color: color.text, fontSize: 14, fontWeight: 600 }}>
                🔍 {t("autoFeedSearch", lang)}
              </div>
              <div style={{ color: color.textMuted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                {t("autoFeedSearchDesc", lang)}
              </div>
            </div>
          </div>
        </div>

        <button onClick={handleCreate} disabled={saving || !formId || !formLabelEn || !formLabelFr || !formDomain} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? "..." : t("createBtn", lang)}
        </button>
      </div>
    );
  }

  // ── Detail view ──
  if (view === "detail" && topicDetail) {
    const d = topicDetail;
    return (
      <div>
        <button onClick={() => { setView("list"); loadTopics(); setDiscoverResult(null); }} style={{ ...ghostBtn, marginBottom: 16 }}>
          ← {t("back", lang)}
        </button>
        <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 12, marginTop: 0 }}>
          {lang === "fr" ? d.labelFr : d.labelEn}
        </h2>

        {/* Active/Inactive toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: d.isActive ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${d.isActive ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: d.isActive ? "#22c55e" : "#ef4444", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ color: d.isActive ? "#22c55e" : "#ef4444", fontSize: 13, fontWeight: 600 }}>
              {d.isActive ? t("statusActive", lang) : t("statusInactive", lang)}
            </span>
            <span style={{ color: color.textDim, fontSize: 11, marginLeft: 8 }}>
              {d.isActive ? t("topicVisibleHome", lang) : t("topicHiddenHome", lang)}
            </span>
          </div>
          <button
            onClick={handleToggleActive}
            disabled={saving}
            style={{
              padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${d.isActive ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`,
              background: "transparent",
              color: d.isActive ? "#ef4444" : "#22c55e",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {d.isActive ? t("disableTopic", lang) : t("enableTopic", lang)}
          </button>
        </div>

        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {/* Topic info */}
        <div style={secStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ ...secTitle, marginBottom: 0 }}>{t("topicInfo", lang)}</h4>
            <button onClick={() => setEditingTopic(!editingTopic)} style={ghostBtn}>{editingTopic ? t("cancelBtn", lang) : t("editBtn", lang)}</button>
          </div>
          {editingTopic ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{t("labelEn", lang)}</label><input value={editLabelEn} onChange={(e) => setEditLabelEn(e.target.value)} style={inputStyle} /></div>
                <div><label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{t("labelFr", lang)}</label><input value={editLabelFr} onChange={(e) => setEditLabelFr(e.target.value)} style={inputStyle} /></div>
              </div>
              <div><label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{t("scoringDomainLabel", lang)}</label><textarea value={editDomain} onChange={(e) => setEditDomain(e.target.value)} style={textareaStyle} /></div>
              {[["9-10", editT1, setEditT1], ["7-8", editT2, setEditT2], ["5-6", editT3, setEditT3], ["3-4", editT4, setEditT4], ["1-2", editT5, setEditT5]].map(([tier, val, setter]) => (
                <div key={tier as string}><label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{tier as string}</label><textarea value={val as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} style={textareaStyle} /></div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleSaveTopic} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? "..." : t("saveBtn", lang)}</button>
                <button onClick={() => handleDeleteTopic(d.id)} style={dangerBtn}>{t("deleteBtn", lang)}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
              <div><span style={{ color: color.textMuted }}>EN:</span> <span style={{ color: color.text }}>{d.labelEn}</span></div>
              <div><span style={{ color: color.textMuted }}>FR:</span> <span style={{ color: color.text }}>{d.labelFr}</span></div>
              <div style={{ marginTop: 6 }}><span style={{ color: color.textMuted, fontWeight: 600 }}>{t("scoringDomainLabel", lang)}:</span> <span style={{ color: color.text }}>{d.scoringDomain}</span></div>
              <div style={{ marginTop: 8 }}><span style={{ color: color.textMuted, fontWeight: 600 }}>{t("scoringCriteria", lang)}:</span></div>
              {([["9-10", d.scoringTier1], ["7-8", d.scoringTier2], ["5-6", d.scoringTier3], ["3-4", d.scoringTier4], ["1-2", d.scoringTier5]] as [string, string][]).map(([tier, val]) => (
                <div key={tier} style={{ paddingLeft: 8, borderLeft: `2px solid ${color.border}` }}>
                  <span style={{ color: color.gold, fontSize: 11, fontWeight: 700 }}>{tier}</span>
                  <span style={{ color: color.textDim, marginLeft: 8 }}>{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Analysis Prompt */}
        <div style={secStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ ...secTitle, marginBottom: 0 }}>{t("analysisPrompt", lang)}</h4>
            <button onClick={() => { if (editingPrompt) { setEditPromptEn(d.promptEn); setEditPromptFr(d.promptFr); } setEditingPrompt(!editingPrompt); }} style={ghostBtn}>
              {editingPrompt ? t("cancelBtn", lang) : t("editBtn", lang)}
            </button>
          </div>

          <div style={{ display: "flex", gap: 0, marginBottom: 10 }}>
            {(["en", "fr"] as const).map((pl) => (
              <button key={pl} onClick={() => setPromptLang(pl)} style={{
                padding: "6px 16px", fontSize: 12, fontWeight: 600, border: `1px solid ${color.border}`,
                borderBottom: promptLang === pl ? `2px solid ${color.gold}` : `1px solid ${color.border}`,
                background: promptLang === pl ? color.surface : "transparent",
                color: promptLang === pl ? color.gold : color.textMuted,
                cursor: "pointer", borderRadius: pl === "en" ? "6px 0 0 0" : "0 6px 0 0",
              }}>
                {pl.toUpperCase()}
              </button>
            ))}
          </div>

          {editingPrompt ? (
            <>
              <textarea
                value={promptLang === "en" ? editPromptEn : editPromptFr}
                onChange={(e) => promptLang === "en" ? setEditPromptEn(e.target.value) : setEditPromptFr(e.target.value)}
                style={{ ...inputStyle, minHeight: 200, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}
              />
              {!(promptLang === "en" ? editPromptEn : editPromptFr).includes("{{max}}") && (
                <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 6 }}>{t("promptMissingMax", lang)}</div>
              )}
              <div style={{ color: color.textDim, fontSize: 11, marginTop: 4 }}>{t("promptMaxInfo", lang)}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={handleSavePrompt} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? "..." : t("saveBtn", lang)}</button>
              </div>
            </>
          ) : (
            <>
              <pre style={{
                color: color.textDim, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
                margin: 0, padding: "10px 12px", background: "#0a0a0a", borderRadius: 6,
                border: `1px solid ${color.border}`, maxHeight: 300, overflowY: "auto",
              }}>
                {promptLang === "en" ? d.promptEn : d.promptFr}
              </pre>
              {!(promptLang === "en" ? d.promptEn : d.promptFr).includes("{{max}}") && (d.promptEn || d.promptFr) && (
                <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 6 }}>{t("promptMissingMax", lang)}</div>
              )}
              <div style={{ color: color.textDim, fontSize: 11, marginTop: 4 }}>{t("promptMaxInfo", lang)}</div>
            </>
          )}
        </div>

        {/* Feeds */}
        <div style={secStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ ...secTitle, marginBottom: 0 }}>{t("feeds", lang)} ({d.feeds.length})</h4>
          </div>

          {discoveringFeeds && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", marginBottom: 8 }}>
              <SpinKeyframes />
              <span style={{ display: "inline-block", width: 18, height: 18, border: `2px solid ${color.gold}`, borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ color: color.gold, fontSize: 13, fontWeight: 500 }}>🔍 {t("discoveringFeeds", lang)}</span>
            </div>
          )}

          {discoverResult && !discoveringFeeds && (
            <div style={{ padding: "10px 12px", borderRadius: 6, background: "#0a0a0a", border: `1px solid ${color.border}`, marginBottom: 10, fontSize: 13 }}>
              {discoverResult.added.length > 0 && (
                <div style={{ color: "#22c55e" }}>✅ {discoverResult.added.length} {t("feedsAdded", lang)}</div>
              )}
              {discoverResult.rejected.length > 0 && (
                <div style={{ color: "#f59e0b", marginTop: discoverResult.added.length > 0 ? 4 : 0 }}>❌ {discoverResult.rejected.length} {t("feedsRejected", lang)}</div>
              )}
              {discoverResult.added.length === 0 && discoverResult.rejected.length === 0 && (
                <div style={{ color: color.textDim }}>{t("noFeedsFoundAi", lang)}</div>
              )}
            </div>
          )}

          {d.feeds.length === 0 && !discoveringFeeds ? (
            <p style={{ color: color.textDim, fontSize: 13, margin: 0 }}>{t("noFeeds", lang)}</p>
          ) : d.feeds.length > 0 ? (
            <div style={{ display: "grid", gap: 0 }}>
              {d.feeds.map((f, i) => {
                let domain = "";
                try { domain = new URL(f.url).hostname.replace("www.", ""); } catch { /* */ }
                return (
                  <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < d.feeds.length - 1 ? `1px solid ${color.border}` : "none" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: color.text, fontSize: 13, fontWeight: 500 }}>{f.name}</div>
                      <div style={{ color: color.textDim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: color.textDim, textDecoration: "none" }}>{domain} ↗</a>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteFeed(f.id)} style={{ ...dangerBtn, padding: "4px 8px", fontSize: 12 }}>✕</button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Add feed form */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input value={feedName} onChange={(e) => setFeedName(e.target.value)} placeholder={t("feedName", lang)} style={{ ...inputStyle, flex: "1 1 120px" }} />
              <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder={t("feedUrl", lang)} style={{ ...inputStyle, flex: "2 1 200px" }} />
              <button onClick={handleAddFeed} disabled={addingFeed || discoveringFeeds || !feedName.trim() || !feedUrl.trim()} style={{ ...primaryBtn, opacity: addingFeed ? 0.6 : 1, flexShrink: 0 }}>
                {addingFeed ? "..." : "+ " + t("addFeed", lang)}
              </button>
            </div>
            <button
              type="button"
              onClick={handleDiscoverFeeds}
              disabled={discoveringFeeds || addingFeed}
              style={{
                marginTop: 10, padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: `1px solid ${color.gold}`, background: "transparent", color: color.gold,
                cursor: discoveringFeeds || addingFeed ? "not-allowed" : "pointer",
                opacity: discoveringFeeds || addingFeed ? 0.5 : 1,
                transition: "all 0.15s",
              }}
            >
              {discoveringFeeds ? `⏳ ${t("discoveringFeeds", lang)}` : `✨ ${t("addFeedsByAi", lang)}`}
            </button>
            <div style={{ color: color.textDim, fontSize: 11, marginTop: 6, maxWidth: 420, lineHeight: 1.45 }}>
              {t("autoFeedSearchDesc", lang)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── List view (default) ──
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, margin: 0 }}>
          {t("topicsTitle", lang)}
        </h2>
        <button onClick={() => setView("create")} style={primaryBtn}>
          + {t("newTopic", lang)}
        </button>
      </div>

      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <SpinKeyframes />
          <span style={{ display: "inline-block", width: 24, height: 24, border: `3px solid ${color.gold}`, borderTop: "3px solid transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : topics.length === 0 ? (
        <p style={{ color: color.textDim, fontSize: 14, textAlign: "center", padding: "40px 0" }}>
          {lang === "fr" ? "Aucun topic" : "No topics"}
        </p>
      ) : (
        <div style={secStyle}>
          <style>{`
            .tp-tb{width:100%;border-collapse:collapse;font-size:13px}
            .tp-tb th{padding:8px 6px;text-align:left;font-weight:600;color:${color.textMuted};border-bottom:1px solid ${color.border};font-size:11px;text-transform:uppercase;letter-spacing:.05em}
            .tp-tb td{padding:8px 6px;border-bottom:1px solid ${color.border}}
            .tp-tb tr:hover td{background:#1a1a1a}
            @media(max-width:640px){.tp-tb .col-hide{display:none}}
          `}</style>
          <table className="tp-tb">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>#</th>
                <th>Topic</th>
                <th>{t("feeds", lang)}</th>
                <th className="col-hide">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {topics.map((tp, i) => (
                <tr key={tp.id}>
                  <td style={{ whiteSpace: "nowrap", padding: "4px 2px" }}>
                    {i > 0 && (
                      <button onClick={() => handleReorder(tp.id, topics[i - 1].id)} title={t("moveUp", lang)} style={{ background: "none", border: "none", color: color.textMuted, fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 5px", borderRadius: 4 }}>↑</button>
                    )}
                    {i < topics.length - 1 && (
                      <button onClick={() => handleReorder(tp.id, topics[i + 1].id)} title={t("moveDown", lang)} style={{ background: "none", border: "none", color: color.textMuted, fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 5px", borderRadius: 4 }}>↓</button>
                    )}
                  </td>
                  <td style={{ color: color.textDim, fontSize: 11 }}>{i + 1}</td>
                  <td>
                    <button onClick={() => loadDetail(tp.id)} style={{ background: "none", border: "none", color: tp.isActive ? color.gold : color.textDim, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0, textAlign: "left" }}>
                      {lang === "fr" ? tp.labelFr : tp.labelEn}
                    </button>
                  </td>
                  <td>{tp.feedCount}</td>
                  <td className="col-hide">
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: tp.isActive ? "#22c55e" : "#666", marginRight: 6 }} />
                    {tp.isActive ? t("statusActive", lang) : t("statusInactive", lang)}
                  </td>
                  <td>
                    <button onClick={() => loadDetail(tp.id)} style={ghostBtn}>{t("editBtn", lang)}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )lang=(en|fr)/);
    if (match && match[1] !== "en") setLang(match[1] as Lang);
  }, []);
  const handleLangChange = useCallback((newLang: Lang) => {
    document.cookie = `lang=${newLang};max-age=${365 * 86400};path=/;SameSite=Lax`;
    window.location.reload();
  }, []);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const topicLabels: TopicLabel[] = topics.map((tp) => ({ id: tp.id, label: lang === "fr" ? tp.labelFr : tp.labelEn }));
  const [topic, setTopic] = useState<string | null>(null);
  const [maxArticles, setMaxArticles] = useState(() => {
    if (typeof document === "undefined") return 20;
    const match = document.cookie.match(/(?:^|; )maxArticles=(\d+)/);
    return match ? Math.min(100, Math.max(3, Number(match[1]))) : 20;
  });

  const updateMaxArticles = useCallback((value: number) => {
    setMaxArticles(value);
    document.cookie = `maxArticles=${value};max-age=${365 * 86400};path=/;SameSite=Lax`;
  }, []);
  const [ttsSpeed, setTtsSpeed] = useState(() => {
    if (typeof document === "undefined") return 1.05;
    const match = document.cookie.match(/(?:^|; )ttsSpeed=([\d.]+)/);
    return match ? Math.min(1.2, Math.max(0.7, Number(match[1]))) : 1.05;
  });
  const updateTtsSpeed = useCallback((value: number) => {
    setTtsSpeed(value);
    document.cookie = `ttsSpeed=${value};max-age=${365 * 86400};path=/;SameSite=Lax`;
  }, []);
  const [ttsVoice, setTtsVoice] = useState(() => {
    if (typeof document === "undefined") return "sarah";
    const match = document.cookie.match(/(?:^|; )ttsVoice=(\w+)/);
    const v = match ? match[1] : "sarah";
    return TTS_VOICES_EN.some((voice) => voice.id === v) ? v : "sarah";
  });
  const updateTtsVoice = useCallback((value: string) => {
    setTtsVoice(value);
    document.cookie = `ttsVoice=${value};max-age=${365 * 86400};path=/;SameSite=Lax`;
  }, []);
  const [ttsVoiceFr, setTtsVoiceFr] = useState(() => {
    if (typeof document === "undefined") return "george";
    const match = document.cookie.match(/(?:^|; )ttsVoiceFr=(\w+)/);
    const v = match ? match[1] : "george";
    return TTS_VOICES_FR.some((voice) => voice.id === v) ? v : "george";
  });
  const updateTtsVoiceFr = useCallback((value: string) => {
    setTtsVoiceFr(value);
    document.cookie = `ttsVoiceFr=${value};max-age=${365 * 86400};path=/;SameSite=Lax`;
  }, []);
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<"home" | "stats" | "crons" | "topics" | "settings">("home");
  const [resultTab, setResultTab] = useState<"relevant" | "all">("relevant");
  const [allArticles, setAllArticles] = useState<AllArticleEntry[]>([]);
  const [allArticlesLoading, setAllArticlesLoading] = useState(false);
  const [topFeed, setTopFeed] = useState<Array<{ title: string; link: string; source: string; topic: string; pubDate: string; score: number }>>([]);
  const [topFeedLoading, setTopFeedLoading] = useState(true);
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`);
        if (!res.ok) return;
        const { version } = await res.json();
        if (version && version !== APP_VERSION) {
          setNewVersionAvailable(true);
        }
      } catch { /* ignore */ }
    };
    const id = setInterval(check, VERSION_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (currentPage !== "home") return;
    setTopicsLoading(true);
    fetch("/api/topics", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((list: TopicItem[]) => setTopics(list))
      .catch(() => {})
      .finally(() => setTopicsLoading(false));
  }, [currentPage]);

  useEffect(() => {
    fetch("/api/news/top?limit=20&days=1", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((json) => setTopFeed(json.articles ?? []))
      .catch(() => {})
      .finally(() => setTopFeedLoading(false));
  }, []);

  const locale = dateLocale(lang);
  const currentTopicLabel = topicLabels.find((tp) => tp.id === topic)?.label ?? topic ?? "";

  function startProgress() {
    setProgress(0);
    if (progressRef.current) clearInterval(progressRef.current);
    let current = 0;
    progressRef.current = setInterval(() => {
      if (current < 90) {
        current = Math.min(90, current + 3.5);
      } else {
        const remaining = 99 - current;
        current = Math.min(99, current + Math.max(0.1, remaining * 0.03));
      }
      setProgress(Math.round(current));
    }, 200);
  }

  function stopProgress() {
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
    setProgress(100);
  }

  async function fetchNews(hours: number) {
    if (!topic) return;
    unlockAudioContext();
    setSelected(hours);
    setLoading(true);
    setError(null);
    setData(null);
    setAllArticles([]);
    setAllArticlesLoading(true);
    setResultTab("relevant");
    startProgress();

    const sinceISO = new Date(Date.now() - hours * 3_600_000).toISOString();

    try {
      const res = await fetch(`/api/news?hours=${hours}&lang=${lang}&topic=${topic}&count=${maxArticles}`);
      if (!res.ok) throw new Error(await res.text().catch(() => "") || `HTTP ${res.status}`);
      setData(await res.json());
      playNotificationBeep();

      fetch(`/api/news/all?topic=${encodeURIComponent(topic)}&since=${encodeURIComponent(sinceISO)}&lang=${lang}`, { cache: "no-store" })
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((json) => setAllArticles(json.articles ?? []))
        .catch(() => {})
        .finally(() => setAllArticlesLoading(false));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("unknownError", lang);
      const isNetworkError =
        msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("Load failed");
      setError(isNetworkError ? t("connectionError", lang) : msg);
      setAllArticlesLoading(false);
    } finally {
      stopProgress();
      setLoading(false);
    }
  }

  function handleTopicChange(newTopic: string) {
    if (newTopic === topic) return;
    setTopic(newTopic);
    setSelected(null);
    setData(null);
    setError(null);
    setAllArticles([]);
    setAllArticlesLoading(false);
    setTopFeed([]);
  }

  function loadTopFeed() {
    setTopFeedLoading(true);
    fetch("/api/news/top?limit=20&days=1", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((json) => setTopFeed(json.articles ?? []))
      .catch(() => {})
      .finally(() => setTopFeedLoading(false));
  }

  function handleReset() {
    setTopic(null);
    setSelected(null);
    setData(null);
    setError(null);
    setLoading(false);
    setResultTab("relevant");
    setAllArticles([]);
    setAllArticlesLoading(false);
    loadTopFeed();
  }

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 830, margin: "0 auto", padding: "40px 20px" }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <header style={{ paddingBottom: 12, marginBottom: 20, position: "relative" }}>
          <div style={{ position: "absolute", top: 0, right: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <LangToggle lang={lang} onChange={handleLangChange} />
            <button
              onClick={() => { setCurrentPage("home"); handleReset(); }}
              aria-label="Home"
              style={{
                padding: 4,
                border: "none",
                background: "transparent",
                color: currentPage === "home" ? color.gold : color.textMuted,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
                <polyline points="9 21 9 14 15 14 15 21" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage("topics")}
              aria-label="Topics"
              style={{
                padding: 4,
                border: "none",
                background: "transparent",
                color: currentPage === "topics" ? color.gold : color.textMuted,
                cursor: currentPage === "topics" ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11a9 9 0 0 1 9 9" />
                <path d="M4 4a16 16 0 0 1 16 16" />
                <circle cx="5" cy="19" r="1" fill="currentColor" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage("stats")}
              aria-label="Stats"
              style={{
                padding: 4,
                border: "none",
                background: "transparent",
                color: currentPage === "stats" ? color.gold : color.textMuted,
                cursor: currentPage === "stats" ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="12" width="4" height="9" rx="1" />
                <rect x="10" y="7" width="4" height="14" rx="1" />
                <rect x="17" y="3" width="4" height="18" rx="1" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage("crons")}
              aria-label={t("cronMonitor", lang)}
              style={{
                padding: 4,
                border: "none",
                background: "transparent",
                color: currentPage === "crons" ? color.gold : color.textMuted,
                cursor: currentPage === "crons" ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage("settings")}
              aria-label={t("settings", lang)}
              style={{
                padding: 4,
                border: "none",
                background: "transparent",
                color: currentPage === "settings" ? color.gold : color.textMuted,
                cursor: currentPage === "settings" ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          <img
            src="/logo-8news.png"
            alt="8news"
            onClick={() => { setCurrentPage("home"); handleReset(); }}
            style={{ height: "clamp(32px, 5vw, 48px)", width: "auto", display: "block", cursor: "pointer" }}
          />
          <p style={{ color: color.textMuted, fontSize: 15, marginTop: 8 }}>
            {t("subtitle", lang)}
          </p>
        </header>

        {currentPage === "stats" ? (
          <StatsPage lang={lang} topics={topicLabels} />
        ) : currentPage === "crons" ? (
          <CronMonitorPage lang={lang} />
        ) : currentPage === "topics" ? (
          <TopicsPage lang={lang} />
        ) : currentPage === "settings" ? (
          <SettingsPage
            lang={lang}
            maxArticles={maxArticles}
            onMaxArticlesChange={updateMaxArticles}
            ttsSpeed={ttsSpeed}
            onTtsSpeedChange={updateTtsSpeed}
            ttsVoice={ttsVoice}
            onTtsVoiceChange={updateTtsVoice}
            ttsVoiceFr={ttsVoiceFr}
            onTtsVoiceFrChange={updateTtsVoiceFr}
          />
        ) : topicsLoading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
          <SpinKeyframes />
          <span style={{ display: "inline-block", width: 28, height: 28, border: `3px solid ${color.gold}`, borderTop: "3px solid transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
        ) : (
        <>
        {/* ── Topic selector ──────────────────────────────────── */}
        <section style={{ marginBottom: 24 }}>
          <TopicToggle topics={topicLabels} topic={topic} disabled={loading} onChange={handleTopicChange} />
        </section>

        {/* ── Period selector ────────────────────────────────── */}
        <section style={{ marginBottom: 24 }}>
          <div className="period-grid" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PERIODS.map(({ label, hours }) => (
              <PeriodButton
                key={hours}
                label={label}
                active={selected === hours}
                disabled={loading || !topic}
                onClick={() => fetchNews(hours)}
              />
            ))}
          </div>
        </section>

        {/* ── Loading ────────────────────────────────────────── */}
        {loading && (
          <div style={{ padding: "32px 0" }}>
            <p style={{ fontSize: 15, color: color.gold, marginBottom: 12 }}>
              {progress < 50
                ? (lang === "fr" ? "Lecture des articles..." : "Reading articles...")
                : (lang === "fr" ? "Analyse IA..." : "AI analysis...")}
            </p>
            <div style={{ position: "relative", height: 6, borderRadius: 3, background: color.border, overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: `${progress}%`,
                  background: color.gold,
                  borderRadius: 3,
                  transition: "width 0.3s ease-out",
                }}
              />
            </div>
            <p style={{ color: color.textMuted, fontSize: 13, marginTop: 8, textAlign: "right" }}>
              {progress}%
            </p>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────── */}
        {error && (
          <div style={{ background: color.errorBg, border: `1px solid ${color.errorBorder}`, borderRadius: 8, padding: "12px 16px", color: color.errorText, fontSize: 15 }}>
            {error}
          </div>
        )}

        {/* ── Results ────────────────────────────────────────── */}
        {!loading && data && (
          <div>
            <SummaryBox data={data} locale={locale} lang={lang} hours={selected ?? 24} topicName={currentTopicLabel} speed={ttsSpeed} voice={lang === "fr" ? ttsVoiceFr : ttsVoice} />

            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: `1px solid ${color.border}`, marginBottom: 20, gap: 0 }}>
              {(["relevant", "all"] as const).map((tab) => {
                const active = resultTab === tab;
                const allCount = allArticles.length > 0 ? allArticles.length : (data.meta?.totalArticles ?? 0);
                const label = tab === "relevant"
                  ? `${t("relevantArticles", lang)} (${data.articles.length})`
                  : `${t("allArticles", lang)} (${allCount > 0 ? allCount.toLocaleString(locale) : "…"})`;
                return (
                  <button
                    key={tab}
                    onClick={() => setResultTab(tab)}
                    style={{
                      padding: "10px 20px",
                      fontSize: 15,
                      fontWeight: 600,
                      border: "none",
                      borderBottom: active ? `2px solid ${color.gold}` : "2px solid transparent",
                      background: "transparent",
                      color: active ? color.gold : color.textMuted,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Relevant articles tab */}
            {resultTab === "relevant" && (
              <>
                {data.articles.length > 0 ? (
                  <div>
                    {data.articles.map((art, i) => (
                      <ArticleCard key={`${art.link}-${i}`} article={art} locale={locale} />
                    ))}
                  </div>
                ) : (
                  <p style={{ color: color.textDim, fontSize: 15 }}>
                    {t("noArticlesForPeriod", lang)}
                  </p>
                )}
              </>
            )}

            {/* All articles tab (preloaded in background) */}
            {resultTab === "all" && (
              <AllArticlesTab
                articles={allArticles}
                loading={allArticlesLoading}
                locale={locale}
                lang={lang}
              />
            )}
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────── */}
        {!loading && !data && !error && (
          <div>
            {topic ? (
              <p style={{ color: color.textDim, padding: "32px 0", fontSize: 15, textAlign: "center" }}>
                {lang === "fr"
                  ? "Sélectionnez une durée pour lancer l'analyse."
                  : "Select a time period to start the analysis."}
              </p>
            ) : topFeedLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <SpinKeyframes />
                <span style={{ display: "inline-block", width: 24, height: 24, border: `3px solid ${color.gold}`, borderTop: "3px solid transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
            ) : topFeed.length > 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <p style={{ color: color.textMuted, fontSize: 12, margin: 0 }}>
                    {lang === "fr" ? "Top 20 articles des dernières 24h" : "Top 20 articles from the last 24h"}
                  </p>
                  <button
                    onClick={loadTopFeed}
                    disabled={topFeedLoading}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      border: `1px solid ${color.border}`,
                      borderRadius: 6,
                      background: color.surface,
                      color: color.gold,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: topFeedLoading ? "default" : "pointer",
                      opacity: topFeedLoading ? 0.5 : 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    {lang === "fr" ? "Rafraîchir" : "Refresh"}
                  </button>
                </div>
                {[...topFeed].sort((a, b) => {
                  const aNew = a.pubDate && (Date.now() - new Date(a.pubDate).getTime()) < 3_600_000 ? 1 : 0;
                  const bNew = b.pubDate && (Date.now() - new Date(b.pubDate).getTime()) < 3_600_000 ? 1 : 0;
                  return bNew - aNew;
                }).map((art, i) => (
                  <div key={`${art.link}-${i}`} style={{ ...card, display: "block" }}>
                    <a
                      href={art.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "none", color: "inherit", display: "block" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ color: color.text, fontWeight: 500, fontSize: 17, flex: 1 }}>
                          {art.pubDate && (Date.now() - new Date(art.pubDate).getTime()) < 3_600_000 && (
                            <span style={{
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
                            }}>NEW</span>
                          )}
                          {art.title}
                        </span>
                        <span style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: art.score >= 7 ? "#22c55e" : art.score >= 5 ? color.gold : color.textMuted,
                          marginLeft: 8,
                          flexShrink: 0,
                        }}>
                          {art.score}/10
                        </span>
                      </div>
                    </a>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                      <a href={art.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                        <span style={{ color: color.gold, fontSize: 13 }}>
                          {art.source} · {art.pubDate ? new Date(art.pubDate).toLocaleString(locale) : ""}
                        </span>
                      </a>
                      <CopyLinkButton url={art.link} />
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p style={{ color: color.textDim, padding: "32px 0", fontSize: 15, textAlign: "center" }}>
                {t("initialMessage", lang)}
              </p>
            )}
          </div>
        )}
        </>
        )}
      </div>

      {newVersionAvailable && (
        <div
          onClick={() => window.location.reload()}
          style={{
            position: "fixed", top: 12, right: 12,
            background: color.gold, color: "#000", padding: "8px 20px", borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: "pointer", zIndex: 999,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          {lang === "fr" ? "Nouvelle version disponible — cliquer pour rafraîchir" : "New version available — click to refresh"}
        </div>
      )}

      <ScrollToTop />

      <footer style={{ position: "fixed", bottom: 8, right: 27, color: color.textDim, fontSize: 12 }}>
        v{APP_VERSION}
      </footer>
    </div>
  );
}
