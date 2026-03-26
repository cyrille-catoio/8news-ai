"use client";

import { type CSSProperties, useState, useEffect, useCallback, useRef } from "react";
import type { SummaryResponse, ArticleSummary, Topic, StatsResponse } from "@/lib/types";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, font, sectionHeading, card } from "@/lib/theme";
import { getFeedsForTopic } from "@/lib/rss-feeds";
import { getSystemPrompt } from "@/lib/prompts";

// ── Constants ─────────────────────────────────────────────────────────

const APP_VERSION = "1.48";
const VERSION_CHECK_INTERVAL_MS = 60_000;

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

const TOPICS = [
  { value: "conflict",      labelKey: "topicConflict" },
  { value: "ai",             labelKey: "topicAi" },
  { value: "aiengineering",  labelKey: "topicAiengineering" },
  { value: "robotics",       labelKey: "topicRobotics" },
  { value: "crypto",         labelKey: "topicCrypto" },
  { value: "bitcoin",        labelKey: "topicBitcoin" },
  { value: "videogames",     labelKey: "topicVideogames" },
  { value: "elon",           labelKey: "topicElon" },
] as const;

const FEED_SITE_URL = new Map<string, string>();
for (const { value } of TOPICS) {
  for (const feed of getFeedsForTopic(value)) {
    try { FEED_SITE_URL.set(feed.name, new URL(feed.url).origin); } catch { /* skip */ }
  }
}

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
  topic,
  lang,
  disabled,
  onChange,
}: {
  topic: Topic | null;
  lang: Lang;
  disabled: boolean;
  onChange: (t: Topic) => void;
}) {
  const btnStyle = (value: Topic): CSSProperties => ({
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
          grid-template-columns: repeat(${Math.min(TOPICS.length, 9)}, 1fr);
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
        {TOPICS.map(({ value, labelKey }) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            disabled={disabled}
            style={btnStyle(value)}
          >
            {t(labelKey, lang)}
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

function ArticleCard({ article, locale }: { article: ArticleSummary; locale: string }) {
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...card, display: "block", textDecoration: "none", color: "inherit" }}
    >
      <span style={{ color: color.text, fontWeight: 500, fontSize: 17 }}>
        {article.title}
      </span>
      <p style={{ color: color.articleSnippet, fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
        {article.snippet}
      </p>
      <p style={{ color: color.gold, fontSize: 13, marginTop: 8 }}>
        {article.source} · {article.pubDate ? new Date(article.pubDate).toLocaleString(locale) : ""}
      </p>
    </a>
  );
}

function TopicTabBar({ activeTab, lang, onSelect }: { activeTab: Topic; lang: Lang; onSelect: (t: Topic) => void }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${color.border}`, flexWrap: "wrap" }}>
      {TOPICS.map(({ value, labelKey }) => (
        <button
          key={value}
          onClick={() => onSelect(value)}
          style={{
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderBottom: activeTab === value ? `2px solid ${color.gold}` : "2px solid transparent",
            background: "transparent",
            color: activeTab === value ? color.gold : color.textMuted,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {t(labelKey, lang)}
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
  topic,
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
  topic: Topic;
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
  const [activeTab, setActiveTab] = useState<Topic>(topic);
  const [voiceEnOpen, setVoiceEnOpen] = useState(false);
  const [voiceFrOpen, setVoiceFrOpen] = useState(false);
  const [rssOpen, setRssOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const feeds = getFeedsForTopic(activeTab);

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
                max={30}
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

          {/* ── RSS Sources section (accordion) ──────────── */}
          <div style={sectionStyle}>
            <button
              onClick={() => setRssOpen(!rssOpen)}
              style={{
                ...sectionTitle,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                marginBottom: rssOpen ? 14 : 0,
              }}
            >
              {t("rssSourcesSection", lang)}
              <span style={{ fontSize: 14, transition: "transform 0.2s", transform: rssOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
            </button>

            {rssOpen && (
              <>
                <TopicTabBar activeTab={activeTab} lang={lang} onSelect={setActiveTab} />
                <p style={{ color: color.textDim, fontSize: 12, margin: "0 0 8px" }}>
                  {feeds.length} sources
                </p>

                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {feeds.map((feed) => {
                    const domain = new URL(feed.url).hostname.replace("www.", "");
                    return (
                      <li key={feed.url} style={{ borderBottom: `1px solid ${color.border}` }}>
                        <a
                          href={feed.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: "9px 0",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            textDecoration: "none",
                            color: "inherit",
                          }}
                        >
                          <span style={{ color: color.text, fontSize: 14, fontWeight: 500 }}>
                            {feed.name}
                          </span>
                          <span style={{ color: color.textDim, fontSize: 12, flexShrink: 0 }}>
                            {domain} ↗
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {/* ── AI Prompt section (accordion) ─────────────── */}
          <div style={sectionStyle}>
            <button
              onClick={() => setPromptOpen(!promptOpen)}
              style={{
                ...sectionTitle,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                marginBottom: promptOpen ? 14 : 0,
              }}
            >
              {t("aiPromptSection", lang)}
              <span style={{ fontSize: 14, transition: "transform 0.2s", transform: promptOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
            </button>

            {promptOpen && (
              <>
                <TopicTabBar activeTab={activeTab} lang={lang} onSelect={setActiveTab} />
                <pre
                  style={{
                    color: color.textDim,
                    fontSize: 12,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                    padding: "10px 12px",
                    background: "#0a0a0a",
                    borderRadius: 6,
                    border: `1px solid ${color.border}`,
                    maxHeight: 280,
                    overflowY: "auto",
                  }}
                >
                  {getSystemPrompt(activeTab, lang, maxArticles)}
                </pre>
              </>
            )}
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

const TOPIC_TITLE_KEY = {
  conflict: "conflictTitle",
  ai: "aiTitle",
  crypto: "cryptoTitle",
  robotics: "roboticsTitle",
  bitcoin: "bitcoinTitle",
  videogames: "videogamesTitle",
  aiengineering: "aiengineeringTitle",
  elon: "elonTitle",
} as const satisfies Record<Topic, string>;

function ttsIntro(hours: number, lang: Lang, topic: Topic): string {
  const topicName = t(TOPIC_TITLE_KEY[topic], lang);
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

function SummaryBox({ data, locale, lang, hours, topic, speed, voice }: { data: SummaryResponse; locale: string; lang: Lang; hours: number; topic: Topic; speed: number; voice: string }) {
  const raw = typeof data.summary === "string" ? data.summary : String(data.summary ?? "");
  const ttsOutro = lang === "fr" ? "... ... Analyse terminée. Vous pouvez reprendre une activité normale." : "... ... That's all folks!";
  const ttsText = raw.trim().length > 0 ? `${ttsIntro(hours, lang, topic)} ${raw} ${ttsOutro}` : "";
  const bullets = data.bullets ?? [];
  const hasBullets = bullets.length > 0;

  return (
    <div style={{ ...card, borderRadius: 12, padding: 20, marginBottom: 28, position: "relative" }}>
      <h2 style={sectionHeading}>
        {t("summary", lang)}
        {data.allArticles?.length > 0 && (
          <span style={{ color: color.textMuted, fontWeight: 400, fontSize: 11, marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>
            ({data.allArticles.length} articles)
          </span>
        )}
      </h2>
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

function AllArticlesTab({ articles, locale }: { articles: ArticleSummary[]; locale: string }) {
  const grouped = articles.reduce<Record<string, ArticleSummary[]>>((acc, art) => {
    const key = art.source || "Unknown";
    (acc[key] ??= []).push(art);
    return acc;
  }, {});

  const sources = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  if (sources.length === 0) {
    return <p style={{ color: color.textDim, fontSize: 15 }}>No articles found.</p>;
  }

  return (
    <div>
      {sources.map((source) => (
        <div key={source} style={{ marginBottom: 28 }}>
          <h3 style={{ color: color.gold, fontSize: 16, fontWeight: 600, marginBottom: 12, borderBottom: `1px solid ${color.border}`, paddingBottom: 8 }}>
            {source} ({grouped[source].length})
          </h3>
          {grouped[source].map((art, i) => (
            <a
              key={`${art.link}-${i}`}
              href={art.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                padding: "10px 14px",
                marginBottom: 6,
                borderRadius: 8,
                background: color.surface,
                textDecoration: "none",
                color: "inherit",
                transition: "background 0.15s",
              }}
            >
              <span style={{ color: color.text, fontWeight: 500, fontSize: 15 }}>
                {art.title}
              </span>
              {art.snippet && (
                <p style={{ color: color.articleSnippet, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                  {art.snippet}
                </p>
              )}
              <p style={{ color: color.textDim, fontSize: 12, marginTop: 4 }}>
                {art.pubDate ? new Date(art.pubDate).toLocaleString(locale) : ""}
              </p>
            </a>
          ))}
        </div>
      ))}
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

function StatsPage({ lang }: { lang: Lang }) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statsTopic, setStatsTopic] = useState<"all" | Topic>("all");
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
    fetch(`/api/stats?topic=${statsTopic}&days=${days}`, { signal: ac.signal, cache: "no-store" })
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
    const found = TOPICS.find((item) => item.value === tp);
    return found ? t(found.labelKey, lang) : tp;
  };

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortArrow = (key: string) => (key === sortKey ? (sortDir === "desc" ? " ▼" : " ▲") : "");

  // ── Shared styles ──
  const kpiCard: CSSProperties = { background: color.surface, border: `1px solid ${color.border}`, borderRadius: 10, padding: "16px 20px", textAlign: "center" };
  const kpiVal: CSSProperties = { fontSize: 24, fontWeight: 700, color: color.gold };
  const kpiLbl: CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: color.textMuted, marginTop: 4 };
  const secStyle: CSSProperties = { background: color.surface, border: `1px solid ${color.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 16 };
  const secTitle: CSSProperties = { color: color.gold, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, marginTop: 0 };

  const periodOpts = [
    { label: t("allTime", lang), value: 0 },
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
        .s-kpi4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
        .s-kpi3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
        @media(max-width:640px){.s-kpi4,.s-kpi3{grid-template-columns:repeat(2,1fr)}}
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
        {TOPICS.map(({ value, labelKey }) => (
          <button
            key={value}
            onClick={() => setStatsTopic(value)}
            style={{
              padding: "7px 12px", fontSize: 12, fontWeight: 600, border: "none",
              borderBottom: statsTopic === value ? `2px solid ${color.gold}` : "2px solid transparent",
              background: "transparent", color: statsTopic === value ? color.gold : color.textMuted,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {t(labelKey, lang)}
          </button>
        ))}
      </div>

      {/* ── Period filter ────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {periodOpts.map((o) => (
          <button
            key={o.value}
            onClick={() => setDays(o.value)}
            style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
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
      <div className="s-kpi4">
        <div style={kpiCard}><div style={kpiVal}>{fmt(g.totalArticles)}</div><div style={kpiLbl}>{t("totalArticles", lang)}</div></div>
        <div style={kpiCard}><div style={kpiVal}>{fmt(g.scoredArticles)}</div><div style={kpiLbl}>{t("scoredArticles", lang)}</div></div>
        <div style={kpiCard}><div style={{ ...kpiVal, color: covClr(g.pctScored) }}>{g.pctScored}%</div><div style={kpiLbl}>{t("coverage", lang)}</div></div>
        <div style={kpiCard}><div style={{ ...kpiVal, color: scoreClr(g.avgScore) }}>{g.avgScore}</div><div style={kpiLbl}>{t("avgScore", lang)}</div></div>
      </div>
      <div className="s-kpi3">
        <div style={kpiCard}><div style={kpiVal}>{fmt(g.new24h)}</div><div style={kpiLbl}>{t("new24h", lang)}</div></div>
        <div style={kpiCard}><div style={kpiVal}>{fmt(g.new7d)}</div><div style={kpiLbl}>{t("new7d", lang)}</div></div>
        <div style={kpiCard}><div style={kpiVal}>{fmt(g.scored24h)}</div><div style={kpiLbl}>{t("scored24h", lang)}</div></div>
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
                  <th className="sc" onClick={() => handleSort("hitRate")}>Hit%{sortArrow("hitRate")}</th>
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
                      {FEED_SITE_URL.has(f.source) ? (
                        <a href={FEED_SITE_URL.get(f.source)} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{f.source}</a>
                      ) : f.source}
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
          <a
            key={`${a.link}-${i}`}
            href={a.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              padding: "10px 0",
              borderBottom: i < topArticles.length - 1 ? `1px solid ${color.border}` : "none",
              textDecoration: "none", color: "inherit",
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
              <div style={{ color: color.text, fontWeight: 500, fontSize: 14 }}>{a.title}</div>
              <div style={{ color: color.textMuted, fontSize: 12, marginTop: 3 }}>
                {a.source} · {new Date(a.pubDate).toLocaleDateString(locale)}
              </div>
              {a.reason && (
                <div style={{ color: color.textDim, fontSize: 12, marginTop: 2, whiteSpace: "normal" }}>
                  {a.reason.length > 80 ? `${a.reason.slice(0, 80)}…` : a.reason}
                </div>
              )}
            </div>
          </a>
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
                  <th>Hit%</th>
                  <th>{t("feeds", lang)}</th>
                  <th>{t("activeFeeds", lang)}</th>
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
  const [topic, setTopic] = useState<Topic | null>(null);
  const [maxArticles, setMaxArticles] = useState(() => {
    if (typeof document === "undefined") return 10;
    const match = document.cookie.match(/(?:^|; )maxArticles=(\d+)/);
    return match ? Math.min(30, Math.max(3, Number(match[1]))) : 10;
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
  const [currentPage, setCurrentPage] = useState<"home" | "stats" | "settings">("home");
  const [resultTab, setResultTab] = useState<"relevant" | "all">("relevant");

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`);
        if (!res.ok) return;
        const { version } = await res.json();
        if (version && version !== APP_VERSION) {
          window.location.reload();
        }
      } catch { /* ignore */ }
    };
    const id = setInterval(check, VERSION_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const locale = dateLocale(lang);
  const NO_ARTICLES_KEY = {
    conflict: "noArticlesConflict",
    ai: "noArticlesAi",
    crypto: "noArticlesCrypto",
    robotics: "noArticlesRobotics",
    bitcoin: "noArticlesBitcoin",
    videogames: "noArticlesVideogames",
    aiengineering: "noArticlesAiengineering",
    elon: "noArticlesElon",
  } as const satisfies Record<Topic, string>;
  const noArticlesKey = NO_ARTICLES_KEY[topic || "conflict"];

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
    setResultTab("relevant");
    startProgress();

    try {
      const res = await fetch(`/api/news?hours=${hours}&lang=${lang}&topic=${topic}&count=${maxArticles}`);
      if (!res.ok) throw new Error(await res.text().catch(() => "") || `HTTP ${res.status}`);
      setData(await res.json());
      playNotificationBeep();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("unknownError", lang);
      const isNetworkError =
        msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("Load failed");
      setError(isNetworkError ? t("connectionError", lang) : msg);
    } finally {
      stopProgress();
      setLoading(false);
    }
  }

  function handleTopicChange(newTopic: Topic) {
    if (newTopic === topic) return;
    setTopic(newTopic);
    setSelected(null);
    setData(null);
    setError(null);
  }

  function handleReset() {
    setSelected(null);
    setData(null);
    setError(null);
    setLoading(false);
    setResultTab("relevant");
  }

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 830, margin: "0 auto", padding: "40px 20px" }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <header style={{ paddingBottom: 12, marginBottom: 20, position: "relative" }}>
          <div style={{ position: "absolute", top: 0, right: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <LangToggle lang={lang} onChange={handleLangChange} />
            <button
              onClick={() => setCurrentPage("home")}
              aria-label="Home"
              style={{
                padding: 4,
                border: "none",
                background: "transparent",
                color: currentPage === "home" ? color.gold : color.textMuted,
                cursor: currentPage === "home" ? "default" : "pointer",
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
            style={{ height: "clamp(32px, 5vw, 48px)", width: "auto", display: "block" }}
          />
          <p style={{ color: color.textMuted, fontSize: 15, marginTop: 8 }}>
            {t("subtitle", lang)}
          </p>
        </header>

        {currentPage === "stats" ? (
          <StatsPage lang={lang} />
        ) : currentPage === "settings" ? (
          <SettingsPage
            topic={topic || "conflict"}
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
        ) : (
        <>
        {/* ── Topic selector ──────────────────────────────────── */}
        <section style={{ marginBottom: 24 }}>
          <TopicToggle topic={topic} lang={lang} disabled={loading} onChange={handleTopicChange} />
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
            <SummaryBox data={data} locale={locale} lang={lang} hours={selected ?? 24} topic={topic || "conflict"} speed={ttsSpeed} voice={lang === "fr" ? ttsVoiceFr : ttsVoice} />

            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: `1px solid ${color.border}`, marginBottom: 20, gap: 0 }}>
              {(["relevant", "all"] as const).map((tab) => {
                const active = resultTab === tab;
                const label = tab === "relevant"
                  ? `${t("relevantArticles", lang)} (${data.articles.length})`
                  : `${t("allArticles", lang)} (${data.allArticles?.length ?? 0})`;
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
                    {t(noArticlesKey, lang)}
                  </p>
                )}
              </>
            )}

            {/* All articles tab */}
            {resultTab === "all" && (
              <AllArticlesTab articles={data.allArticles ?? []} locale={locale} />
            )}
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────── */}
        {!loading && !data && !error && (
          <p style={{ color: color.textDim, padding: "32px 0", fontSize: 15, textAlign: "center" }}>
            {t("initialMessage", lang)}
          </p>
        )}
        </>
        )}
      </div>

      <footer style={{ position: "fixed", bottom: 8, right: 27, color: color.textDim, fontSize: 12 }}>
        v{APP_VERSION}
      </footer>
    </div>
  );
}
