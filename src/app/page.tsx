"use client";

import { type CSSProperties, useState, useEffect, useCallback, useRef } from "react";
import type { SummaryResponse, ArticleSummary, Topic } from "@/lib/types";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, font, sectionHeading, card } from "@/lib/theme";
import { getFeedsForTopic } from "@/lib/rss-feeds";
import { getSystemPrompt } from "@/lib/prompts";

// ── Constants ─────────────────────────────────────────────────────────

const APP_VERSION = "1.41";
const VERSION_CHECK_INTERVAL_MS = 60_000;

const TTS_VOICES_EN = [
  { id: "sarah",   label: "Jade",    desc: "American · Soft",          gender: "F" },
  { id: "alice",   label: "Alice",   desc: "British · Confident",      gender: "F" },
  { id: "rachel",  label: "Rachel",  desc: "American · Calm",          gender: "F" },
  { id: "daniel",  label: "Tristan", desc: "British · News presenter", gender: "M" },
  { id: "drew",    label: "Drew",    desc: "American · News",          gender: "M" },
  { id: "josh",    label: "Josh",    desc: "American · Deep",          gender: "M" },
] as const;

const TTS_VOICES_FR = [
  { id: "george",    label: "Nicolas",   desc: "Chaleureux · Posé",     gender: "M" },
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

const TOPICS: { value: Topic; labelKey: "topicConflict" | "topicAi" | "topicRobotics" | "topicCrypto" | "topicBitcoin" | "topicVideogames" | "topicAiengineering" }[] = [
  { value: "conflict", labelKey: "topicConflict" },
  { value: "ai", labelKey: "topicAi" },
  { value: "aiengineering", labelKey: "topicAiengineering" },
  { value: "robotics", labelKey: "topicRobotics" },
  { value: "crypto", labelKey: "topicCrypto" },
  { value: "bitcoin", labelKey: "topicBitcoin" },
  { value: "videogames", labelKey: "topicVideogames" },
];

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

const PulseKeyframes = () => (
  <style>{`@keyframes pulse-play { 0% { transform: scale(1) } 30% { transform: scale(1.35) } 100% { transform: scale(1) } }`}</style>
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

function SettingsModal({
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
  onClose,
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
  onClose: () => void;
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
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#141414",
          border: `1px solid ${color.border}`,
          borderRadius: 12,
          padding: "24px 28px",
          width: "100%",
          maxWidth: 560,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          margin: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ color: color.gold, fontSize: 18, fontWeight: 600, margin: 0 }}>
            {t("settingsTitle", lang)}
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: `1px solid ${color.borderLight}`,
              background: "transparent",
              color: color.textMuted,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t("settingsClose", lang)}
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
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

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
              <label style={{ color: color.textLabel, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
                {lang === "fr" ? "Vitesse voix" : "Voice speed"}
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

            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => setVoiceEnOpen(!voiceEnOpen)}
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
                  marginBottom: voiceEnOpen ? 8 : 0,
                }}
              >
                {lang === "fr" ? "Voix EN" : "Voice EN"}
                <span style={{ fontSize: 14, transition: "transform 0.2s", transform: voiceEnOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
              </button>
              {voiceEnOpen && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {TTS_VOICES_EN.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => onTtsVoiceChange(v.id)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${ttsVoice === v.id ? color.gold : color.borderLight}`,
                        background: ttsVoice === v.id ? color.gold : "transparent",
                        color: ttsVoice === v.id ? "#000" : color.text,
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

            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => setVoiceFrOpen(!voiceFrOpen)}
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
                  marginBottom: voiceFrOpen ? 8 : 0,
                }}
              >
                {lang === "fr" ? "Voix FR" : "Voice FR"}
                <span style={{ fontSize: 14, transition: "transform 0.2s", transform: voiceFrOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
              </button>
              {voiceFrOpen && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {TTS_VOICES_FR.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => onTtsVoiceFrChange(v.id)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${ttsVoiceFr === v.id ? color.gold : color.borderLight}`,
                        background: ttsVoiceFr === v.id ? color.gold : "transparent",
                        color: ttsVoiceFr === v.id ? "#000" : color.text,
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
                <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${color.border}`, flexWrap: "wrap" }}>
                  {TOPICS.map(({ value, labelKey }) => (
                    <button
                      key={value}
                      onClick={() => setActiveTab(value)}
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
                <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${color.border}`, flexWrap: "wrap" }}>
                  {TOPICS.map(({ value, labelKey }) => (
                    <button
                      key={value}
                      onClick={() => setActiveTab(value)}
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
      </div>
    </div>
  );
}

function AudioPlayer({ text, lang, speed, voice }: { text: string; lang: Lang; speed: number; voice: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [pressed, setPressed] = useState(false);
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
    setCurrentTime(0);
    setDuration(0);
  }, [text, cleanup]);

  async function handlePlay() {
    setPressed(true);
    await new Promise((r) => setTimeout(r, 450));
    setPressed(false);

    if (audioRef.current) {
      const a = audioRef.current;
      if (a.currentTime >= (a.duration || 0) - 0.5) a.currentTime = 0;
      try {
        await a.play();
        setState("playing");
      } catch (e) {
        console.error("[AudioPlayer] resume failed:", e);
        setState("idle");
      }
      return;
    }

    const id = ++genId.current;
    setState("loading");

    const audio = new Audio();
    audioRef.current = audio;

    // Play a tiny silent WAV immediately to unlock audio in user-gesture context
    const silentWav = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    audio.src = silentWav;
    await audio.play().catch(() => {});
    audio.pause();

    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
    audio.addEventListener("ended", () => {
      audio.currentTime = 0;
      setCurrentTime(0);
      setState("idle");
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
        const timeout = setTimeout(() => resolve(), 5000);
        audio.addEventListener("canplaythrough", () => { clearTimeout(timeout); resolve(); }, { once: true });
        audio.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Audio load error")); }, { once: true });
      });
      if (id !== genId.current) { audio.pause(); return; }

      await audio.play();
      setState("playing");
    } catch (e) {
      console.error("[AudioPlayer] play failed:", e);
      if (id === genId.current) {
        if (audioRef.current === audio) audioRef.current = null;
        setState("idle");
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
        <div style={{ position: "relative", width: 44, height: 44 }}>
          <PulseKeyframes />
          <button
            onClick={handlePlay}
            disabled={state === "loading" || state === "playing"}
            style={{
              ...btnBase,
              color: color.gold,
              position: "absolute",
              inset: 0,
              opacity: state === "idle" || state === "paused" ? 1 : 0,
              transition: "opacity 1.5s ease",
              pointerEvents: state === "idle" || state === "paused" ? "auto" : "none",
              animation: pressed ? "pulse-play 0.45s ease-out" : "none",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          </button>
          <button
            onClick={handlePause}
            disabled={state !== "playing"}
            style={{
              ...btnBase,
              color: color.gold,
              position: "absolute",
              inset: 0,
              opacity: state === "playing" ? 1 : 0,
              transition: "opacity 1.5s ease",
              pointerEvents: state === "playing" ? "auto" : "none",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          </button>
        </div>

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

const TOPIC_TITLE_KEY: Record<Topic, "conflictTitle" | "aiTitle" | "cryptoTitle" | "roboticsTitle" | "bitcoinTitle" | "videogamesTitle" | "aiengineeringTitle"> = {
  conflict: "conflictTitle",
  ai: "aiTitle",
  crypto: "cryptoTitle",
  robotics: "roboticsTitle",
  bitcoin: "bitcoinTitle",
  videogames: "videogamesTitle",
  aiengineering: "aiengineeringTitle",
};

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
  const ttsText = raw.trim().length > 0 ? `${ttsIntro(hours, lang, topic)} ${raw}` : "";
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
  const [showSettings, setShowSettings] = useState(false);
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
  const noArticlesKey = !topic ? "noArticlesConflict"
    : topic === "conflict"
      ? "noArticlesConflict"
      : topic === "ai"
        ? "noArticlesAi"
        : topic === "crypto"
          ? "noArticlesCrypto"
          : topic === "bitcoin"
            ? "noArticlesBitcoin"
            : topic === "videogames"
              ? "noArticlesVideogames"
              : topic === "aiengineering"
                ? "noArticlesAiengineering"
                : "noArticlesRobotics";

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
    setTopic(newTopic as Topic);
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
              onClick={() => setShowSettings(true)}
              aria-label={t("settings", lang)}
              style={{
                padding: 4,
                border: "none",
                background: "transparent",
                color: color.textMuted,
                cursor: "pointer",
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
              {t("loading", lang)}
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
      </div>

      {showSettings && (
        <SettingsModal
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
          onClose={() => setShowSettings(false)}
        />
      )}

      <footer style={{ position: "fixed", bottom: 8, right: 27, color: color.textDim, fontSize: 12 }}>
        v{APP_VERSION}
      </footer>
    </div>
  );
}
