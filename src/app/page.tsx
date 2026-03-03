"use client";

import { type CSSProperties, useState } from "react";
import type { SummaryResponse, ArticleSummary } from "@/lib/types";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, font, sectionHeading, card } from "@/lib/theme";
import { RSS_FEEDS } from "@/lib/rss-feeds";

// ── Constants ─────────────────────────────────────────────────────────

const PERIODS = [
  { label: "15 m", hours: 0.25 },
  { label: "30 m", hours: 0.5 },
  { label: "1 h",  hours: 1 },
  { label: "6 h",  hours: 6 },
  { label: "12 h", hours: 12 },
  { label: "24 h", hours: 24 },
  { label: "48 h", hours: 48 },
] as const;

// ── Sub-components ────────────────────────────────────────────────────

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const btn = (value: Lang, label: string, isLeft: boolean): CSSProperties => ({
    padding: "5px 12px",
    fontSize: 12,
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
      <button onClick={() => onChange("en")} style={btn("en", "EN", true)}>EN</button>
      <button onClick={() => onChange("fr")} style={btn("fr", "FR", false)}>FR</button>
    </div>
  );
}

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
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
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
        padding: "8px 18px",
        borderRadius: 8,
        border: `1px solid ${active ? color.gold : color.borderLight}`,
        background: active ? color.gold : "#141414",
        color: active ? "#000" : "#ccc",
        fontSize: 14,
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
      <span style={{ color: color.text, fontWeight: 500, fontSize: 15 }}>
        {article.title}
      </span>
      <p style={{ color: color.textMuted, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
        {article.snippet}
      </p>
      <p style={{ color: color.gold, fontSize: 12, marginTop: 8 }}>
        {article.source} · {article.pubDate ? new Date(article.pubDate).toLocaleString(locale) : ""}
      </p>
    </a>
  );
}

function SettingsModal({ lang, onClose }: { lang: Lang; onClose: () => void }) {
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
          maxWidth: 480,
          maxHeight: "80vh",
          overflowY: "auto",
          margin: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ color: color.gold, fontSize: 16, fontWeight: 600, margin: 0 }}>
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
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t("settingsClose", lang)}
          </button>
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {RSS_FEEDS.map((feed) => {
            const domain = new URL(feed.url).hostname.replace("www.", "");
            return (
              <li
                key={feed.url}
                style={{
                  padding: "10px 0",
                  borderBottom: `1px solid ${color.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ color: color.text, fontSize: 14, fontWeight: 500 }}>
                  {feed.name}
                </span>
                <span style={{ color: color.textDim, fontSize: 12, flexShrink: 0 }}>
                  {domain}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SummaryBox({ data, locale, lang }: { data: SummaryResponse; locale: string; lang: Lang }) {
  return (
    <div style={{ ...card, borderRadius: 12, padding: 20, marginBottom: 28 }}>
      <h2 style={sectionHeading}>{t("summary", lang)}</h2>
      <p style={{ color: color.textSecondary, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>
        {data.summary}
      </p>
      <p style={{ color: color.textDim, fontSize: 12, marginTop: 12 }}>
        {new Date(data.period.from).toLocaleString(locale)} → {new Date(data.period.to).toLocaleString(locale)}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const locale = dateLocale(lang);

  async function fetchNews(hours: number) {
    setSelected(hours);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`/api/news?hours=${hours}&lang=${lang}`);
      if (!res.ok) throw new Error(await res.text().catch(() => "") || `HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("unknownError", lang);
      const isNetworkError =
        msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("Load failed");
      setError(isNetworkError ? t("connectionError", lang) : msg);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSelected(null);
    setData(null);
    setError(null);
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <header style={{ borderBottom: `1px solid ${color.border}`, paddingBottom: 24, marginBottom: 32, position: "relative" }}>
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

          <h1 style={{ color: color.gold, fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", paddingRight: 180 }}>
            {t("appName", lang)}
          </h1>
          <h2 style={{ color: color.text, fontSize: 18, fontWeight: 500, margin: "6px 0 0", paddingRight: 180 }}>
            {t("conflictTitle", lang)}
          </h2>
          <p style={{ color: color.textMuted, fontSize: 14, marginTop: 8 }}>
            {t("subtitle", lang)}
          </p>
        </header>

        {/* ── Period selector ────────────────────────────────── */}
        <section style={{ marginBottom: 32 }}>
          <p style={{ color: color.textLabel, fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
            {t("selectPeriod", lang)}
          </p>
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
          <div style={{ color: color.gold, padding: "32px 0", display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
            <Spinner />
            {t("loading", lang)}
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────── */}
        {error && (
          <div style={{ background: color.errorBg, border: `1px solid ${color.errorBorder}`, borderRadius: 8, padding: "12px 16px", color: color.errorText, fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* ── Results ────────────────────────────────────────── */}
        {!loading && data && (
          <div>
            <SummaryBox data={data} locale={locale} lang={lang} />

            {data.articles.length > 0 && (
              <div>
                <h2 style={{ ...sectionHeading, marginBottom: 16 }}>
                  {t("relevantArticles", lang)} ({data.articles.length})
                </h2>
                {data.articles.map((art, i) => (
                  <ArticleCard key={`${art.link}-${i}`} article={art} locale={locale} />
                ))}
              </div>
            )}

            {data.articles.length === 0 && (
              <p style={{ color: color.textDim, fontSize: 14 }}>
                {t("noArticles", lang)}
              </p>
            )}
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────── */}
        {!loading && !data && !error && (
          <p style={{ color: color.textDim, padding: "32px 0", fontSize: 14 }}>
            {t("initialMessage", lang)}
          </p>
        )}
      </div>

      {showSettings && <SettingsModal lang={lang} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
