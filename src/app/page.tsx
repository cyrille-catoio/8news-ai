"use client";

import { type CSSProperties, useState, useEffect, useCallback, useRef } from "react";
import type { SummaryResponse, ArticleSummary, Topic } from "@/lib/types";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, font, sectionHeading, card } from "@/lib/theme";
import { getFeedsForTopic } from "@/lib/rss-feeds";
import { getSystemPrompt } from "@/lib/prompts";

// ── Constants ─────────────────────────────────────────────────────────

const PERIODS = [
  { label: "15 m", hours: 0.25 },
  { label: "30 m", hours: 0.5 },
  { label: "1 h",  hours: 1 },
  { label: "3 h",  hours: 3 },
  { label: "6 h",  hours: 6 },
  { label: "12 h", hours: 12 },
  { label: "24 h", hours: 24 },
  { label: "48 h", hours: 48 },
  { label: "3 d",  hours: 72 },
  { label: "7 d",  hours: 168 },
] as const;

const TOPICS: { value: Topic; labelKey: "topicConflict" | "topicAi" | "topicRobotics" | "topicCrypto" | "topicBitcoin" }[] = [
  { value: "conflict", labelKey: "topicConflict" },
  { value: "ai", labelKey: "topicAi" },
  { value: "robotics", labelKey: "topicRobotics" },
  { value: "crypto", labelKey: "topicCrypto" },
  { value: "bitcoin", labelKey: "topicBitcoin" },
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
  topic: Topic;
  lang: Lang;
  disabled: boolean;
  onChange: (t: Topic) => void;
}) {
  const btn = (value: Topic, isLeft: boolean): CSSProperties => ({
    padding: "8px 18px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderLeft: isLeft ? "none" : `1px solid ${color.gold}`,
    cursor: disabled ? "wait" : "pointer",
    background: topic === value ? color.gold : "transparent",
    color: topic === value ? "#000" : color.gold,
    transition: "all 0.15s",
    opacity: disabled ? 0.6 : 1,
  });

  return (
    <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${color.gold}` }}>
      {TOPICS.map(({ value, labelKey }, i) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          disabled={disabled}
          style={btn(value, i === 0)}
        >
          {t(labelKey, lang)}
        </button>
      ))}
    </div>
  );
}

const SpinKeyframes = () => (
  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
);

function Spinner() {
  return (
    <>
      <span
        style={{
          display: "inline-block",
          width: 16,
          height: 16,
          border: `2px solid ${color.gold}`,
          borderTop: "2px solid transparent",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <SpinKeyframes />
    </>
  );
}

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
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "9px 20px",
        borderRadius: 8,
        border: `1px solid ${active ? color.gold : color.borderLight}`,
        background: active ? color.gold : "#141414",
        color: active ? "#000" : "#ccc",
        fontSize: 15,
        fontWeight: 500,
        cursor: disabled ? "wait" : "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
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
  onClose,
}: {
  topic: Topic;
  lang: Lang;
  maxArticles: number;
  onMaxArticlesChange: (v: number) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Topic>(topic);
  const feeds = getFeedsForTopic(activeTab);

  const TABS: { value: Topic; labelKey: "topicConflict" | "topicAi" | "topicRobotics" | "topicCrypto" | "topicBitcoin" }[] = [
    { value: "conflict", labelKey: "topicConflict" },
    { value: "ai", labelKey: "topicAi" },
    { value: "robotics", labelKey: "topicRobotics" },
    { value: "crypto", labelKey: "topicCrypto" },
    { value: "bitcoin", labelKey: "topicBitcoin" },
  ];

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

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ color: color.textLabel, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
                {t("maxArticles", lang)}
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
            </div>
          </div>

          {/* ── RSS Sources section ──────────────────────── */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>{t("rssSourcesSection", lang)}</h4>

            <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${color.border}` }}>
              {TABS.map(({ value, labelKey }) => (
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
          </div>

          {/* ── AI Prompt section ──────────────────────── */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>{t("aiPromptSection", lang)}</h4>

            <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${color.border}` }}>
              {TABS.map(({ value, labelKey }) => (
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
          </div>
        </div>
      </div>
    </div>
  );
}

function AudioPlayer({ text }: { text: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const blobUrlRef = useRef<string | null>(null);

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

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  useEffect(() => {
    cleanup();
    setState("idle");
    setCurrentTime(0);
    setDuration(0);
  }, [text, cleanup]);

  async function handlePlay() {
    if (audioRef.current) {
      audioRef.current.play();
      setState("playing");
      return;
    }

    setState("loading");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("TTS failed");

      const blob = await res.blob();
      cleanup();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
      audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
      audio.addEventListener("ended", () => setState("idle"));

      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
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
    <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap", flexShrink: 0 }}>
      <button onClick={() => skip(-15)} disabled={!isActive} style={{ ...btnBase, opacity: isActive ? 1 : 0.35 }}>
        -15s
      </button>

      {state === "playing" ? (
        <button onClick={handlePause} style={{ ...btnBase, color: color.gold }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
        </button>
      ) : (
        <button onClick={handlePlay} disabled={state === "loading"} style={{ ...btnBase, color: state === "loading" ? color.textDim : color.gold }}>
          {state === "loading" ? (
            <>
              <SpinKeyframes />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            </>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          )}
        </button>
      )}

      <button onClick={handleStop} disabled={!isActive} style={{ ...btnBase, opacity: isActive ? 1 : 0.35 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
      </button>

      <button onClick={() => skip(15)} disabled={!isActive} style={{ ...btnBase, opacity: isActive ? 1 : 0.35 }}>
        +15s
      </button>

      <div
        onClick={isActive ? seekTo : undefined}
        style={{
          flex: "0 0 80px",
          height: 4,
          borderRadius: 2,
          background: color.border,
          marginLeft: 6,
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

      <span style={{ color: isActive && duration > 0 ? color.textDim : "transparent", fontSize: 11, marginLeft: 4, minWidth: 72, textAlign: "center" }}>
        {isActive && duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : "0:00 / 0:00"}
      </span>
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

const TOPIC_TITLE_KEY: Record<Topic, "conflictTitle" | "aiTitle" | "cryptoTitle" | "roboticsTitle" | "bitcoinTitle"> = {
  conflict: "conflictTitle",
  ai: "aiTitle",
  crypto: "cryptoTitle",
  robotics: "roboticsTitle",
  bitcoin: "bitcoinTitle",
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

function SummaryBox({ data, locale, lang, hours, topic }: { data: SummaryResponse; locale: string; lang: Lang; hours: number; topic: Topic }) {
  const raw = typeof data.summary === "string" ? data.summary : String(data.summary ?? "");
  const ttsText = raw.trim().length > 0 ? `${ttsIntro(hours, lang, topic)} ${raw}` : "";
  const bullets = data.bullets ?? [];
  const hasBullets = bullets.length > 0;

  return (
    <div style={{ ...card, borderRadius: 12, padding: 20, marginBottom: 28, position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h2 style={sectionHeading}>{t("summary", lang)}</h2>
        {ttsText.length > 0 && <AudioPlayer text={ttsText} />}
      </div>
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

function playNotificationBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.value = 0.08;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  } catch { /* silent fail */ }
}

// ── Main page ─────────────────────────────────────────────────────────

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [topic, setTopic] = useState<Topic>("conflict");
  const [maxArticles, setMaxArticles] = useState(() => {
    if (typeof document === "undefined") return 10;
    const match = document.cookie.match(/(?:^|; )maxArticles=(\d+)/);
    return match ? Math.min(30, Math.max(3, Number(match[1]))) : 10;
  });

  const updateMaxArticles = useCallback((value: number) => {
    setMaxArticles(value);
    document.cookie = `maxArticles=${value};max-age=${365 * 86400};path=/;SameSite=Lax`;
  }, []);
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [resultTab, setResultTab] = useState<"relevant" | "all">("relevant");

  const locale = dateLocale(lang);
  const noArticlesKey = topic === "conflict"
    ? "noArticlesConflict"
    : topic === "ai"
      ? "noArticlesAi"
      : topic === "crypto"
        ? "noArticlesCrypto"
        : topic === "bitcoin"
          ? "noArticlesBitcoin"
          : "noArticlesRobotics";

  function startProgress() {
    setProgress(0);
    if (progressRef.current) clearInterval(progressRef.current);
    let current = 0;
    progressRef.current = setInterval(() => {
      if (current < 70) {
        current = Math.min(70, current + 3.5);
      } else {
        const remaining = 95 - current;
        current = Math.min(95, current + Math.max(0.15, remaining * 0.04));
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
            <LangToggle lang={lang} onChange={setLang} />
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
            <button
              onClick={handleReset}
              aria-label={t("reset", lang)}
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
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PERIODS.map(({ label, hours }) => (
              <PeriodButton
                key={hours}
                label={label}
                active={selected === hours}
                disabled={loading}
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
            <SummaryBox data={data} locale={locale} lang={lang} hours={selected ?? 24} topic={topic} />

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
          <p style={{ color: color.textDim, padding: "32px 0", fontSize: 15 }}>
            {t("initialMessage", lang)}
          </p>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          topic={topic}
          lang={lang}
          maxArticles={maxArticles}
          onMaxArticlesChange={updateMaxArticles}
          onClose={() => setShowSettings(false)}
        />
      )}

      <footer style={{ position: "fixed", bottom: 8, right: 17, color: color.textDim, fontSize: 12 }}>
        v1.16
      </footer>
    </div>
  );
}
