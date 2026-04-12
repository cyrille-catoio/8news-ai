"use client";

import { type CSSProperties, useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import type {
  SummaryResponse,
  ArticleSummary,
  TopicItem,
  TopicLabel,
} from "@/lib/types";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { getCookie, setCookie } from "@/lib/cookies";
import {
  color,
  font,
  card,
  spinnerStyle,
} from "@/lib/theme";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { ChangelogPage } from "@/app/components/ChangelogPage";
import { FeedsAdminPage } from "@/app/components/FeedsAdminPage";
import { SettingsPage } from "@/app/components/SettingsPage";
import { SummaryBox } from "@/app/components/SummaryBox";
import { AllArticlesTab, type AllArticleEntry } from "@/app/components/AllArticlesTab";
import { StatsPage } from "@/app/components/StatsPage";
import { CronMonitorPage } from "@/app/components/CronMonitorPage";
import { TopicsPage } from "@/app/components/TopicsPage";
import { TTS_VOICES_EN, TTS_VOICES_FR } from "@/app/components/VoiceAccordion";
import { AppHeader, type AppNavPage } from "@/app/components/AppHeader";
import { TopFeedSection } from "@/app/components/TopFeedSection";
import { TopicPersonalizationBar } from "@/app/components/TopicPersonalizationBar";
import { TopicOnboardingModal } from "@/app/components/TopicOnboardingModal";
import { useTopFeed } from "@/hooks/useTopFeed";
import { useUserTopics } from "@/hooks/useUserTopics";
import { useAuth } from "@/app/providers";
import { isOwnerUser } from "@/lib/user-type";

// ── Constants ─────────────────────────────────────────────────────────

const APP_VERSION = "1.90";
const VERSION_CHECK_INTERVAL_MS = 5 * 60_000;


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

// ── Sub-components ────────────────────────────────────────────────────

function TopicToggle({
  topics,
  topic,
  disabled,
  onChange,
  personalizationMode = false,
  preferredTopicIds,
  onTogglePreference,
}: {
  topics: TopicLabel[];
  topic: string | null;
  disabled: boolean;
  onChange: (t: string) => void;
  personalizationMode?: boolean;
  preferredTopicIds: string[] | null;
  onTogglePreference: (id: string) => void;
}) {
  const btnStyle = (value: string): CSSProperties => {
    if (personalizationMode) {
      const inPrefs = preferredTopicIds === null || preferredTopicIds.includes(value);
      return {
        padding: "8px 0",
        fontSize: 14,
        fontWeight: 600,
        border: `1px solid ${color.gold}`,
        cursor: "pointer",
        background: inPrefs ? color.gold : "transparent",
        color: inPrefs ? "#000" : color.gold,
        transition: "all 0.15s",
        opacity: inPrefs ? 1 : 0.45,
        borderRadius: 6,
        textAlign: "center",
      };
    }
    return {
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
    };
  };

  return (
    <div
      className="topic-grid"
      style={{ ["--topic-grid-cols" as string]: Math.min(topics.length || 8, 8) } as CSSProperties}
    >
      {topics.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => personalizationMode ? onTogglePreference(id) : onChange(id)}
            disabled={!personalizationMode && disabled}
            style={btnStyle(id)}
          >
            {label}
          </button>
        ))}
    </div>
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
  );
}

function RevealBox({ children, active }: { children: React.ReactNode; active: boolean }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = contentRef.current;
    if (!outer || !inner) return;

    if (active) {
      const h = inner.scrollHeight;
      outer.style.maxHeight = `${h}px`;
      outer.style.opacity = "1";

      const onEnd = () => {
        outer.style.overflow = "visible";
        outer.style.maxHeight = "none";
      };
      outer.addEventListener("transitionend", onEnd, { once: true });
      return () => outer.removeEventListener("transitionend", onEnd);
    } else {
      outer.style.overflow = "hidden";
      outer.style.maxHeight = "0";
      outer.style.opacity = "0";
    }
  }, [active]);

  return (
    <div
      ref={outerRef}
      style={{
        overflow: "hidden",
        maxHeight: 0,
        opacity: 0,
        transition: "max-height 6.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 3s ease-out",
      }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

function ScrollToTop({ lang }: { lang: Lang }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={t("scrollToTopAria", lang)}
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

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const l = getCookie("lang");
    if (l === "fr") setLang("fr");
  }, []);
  const handleLangChange = useCallback((newLang: Lang) => {
    setCookie("lang", newLang);
    window.location.reload();
  }, []);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const topicLabels: TopicLabel[] = topics.map((tp) => ({ id: tp.id, label: lang === "fr" ? tp.labelFr : tp.labelEn }));
  const [topic, setTopic] = useState<string | null>(null);
  const [maxArticles, setMaxArticles] = useState(() => {
    if (typeof document === "undefined") return 20;
    const raw = getCookie("maxArticles");
    if (raw && /^\d+$/.test(raw)) return Math.min(100, Math.max(3, Number(raw)));
    return 20;
  });

  const updateMaxArticles = useCallback((value: number) => {
    setMaxArticles(value);
    setCookie("maxArticles", String(value));
  }, []);
  const [ttsSpeed, setTtsSpeed] = useState(() => {
    if (typeof document === "undefined") return 1.05;
    const raw = getCookie("ttsSpeed");
    if (raw && /^[\d.]+$/.test(raw)) return Math.min(1.2, Math.max(0.7, Number(raw)));
    return 1.05;
  });
  const updateTtsSpeed = useCallback((value: number) => {
    setTtsSpeed(value);
    setCookie("ttsSpeed", String(value));
  }, []);
  const [ttsVoice, setTtsVoice] = useState(() => {
    if (typeof document === "undefined") return "sarah";
    const raw = getCookie("ttsVoice");
    const v = raw && /^\w+$/.test(raw) ? raw : "sarah";
    return TTS_VOICES_EN.some((voice) => voice.id === v) ? v : "sarah";
  });
  const updateTtsVoice = useCallback((value: string) => {
    setTtsVoice(value);
    setCookie("ttsVoice", value);
  }, []);
  const [ttsVoiceFr, setTtsVoiceFr] = useState(() => {
    if (typeof document === "undefined") return "george";
    const raw = getCookie("ttsVoiceFr");
    const v = raw && /^\w+$/.test(raw) ? raw : "george";
    return TTS_VOICES_FR.some((voice) => voice.id === v) ? v : "george";
  });
  const updateTtsVoiceFr = useCallback((value: string) => {
    setTtsVoiceFr(value);
    setCookie("ttsVoiceFr", value);
  }, []);
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<AppNavPage>("home");
  const [topicsStartInCreate, setTopicsStartInCreate] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { session, loading: authLoading } = useAuth();
  const authUser = session?.user ?? null;
  const authOwner = Boolean(authUser && isOwnerUser(authUser));
  const isAuthenticated = Boolean(authUser);

  const {
    preferredTopicIds,
    draftTopicIds,
    onboardingNeeded,
    isPersonalizationMode,
    saveStatus,
    enterPersonalizationMode,
    exitPersonalizationMode,
    toggleTopicPreference,
    completeOnboarding,
  } = useUserTopics(isAuthenticated);

  useEffect(() => {
    if (authLoading) return;
    if (!authOwner && currentPage === "feeds") {
      setCurrentPage("home");
    }
    if (!isAuthenticated && currentPage === "topics") {
      setCurrentPage("home");
    }
  }, [authLoading, authOwner, isAuthenticated, currentPage]);

  // Guard: if the selected topic is removed from user's preferred topics, reset
  useEffect(() => {
    if (
      topic &&
      !isPersonalizationMode &&
      preferredTopicIds !== null &&
      preferredTopicIds.length > 0 &&
      !preferredTopicIds.includes(topic)
    ) {
      handleReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredTopicIds, isPersonalizationMode]);

  const [resultTab, setResultTab] = useState<"relevant" | "all">("relevant");
  const [allArticles, setAllArticles] = useState<AllArticleEntry[]>([]);
  const [allArticlesLoading, setAllArticlesLoading] = useState(false);
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  const [periodToast, setPeriodToast] = useState<string | null>(null);
  const periodToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [topSummary, setTopSummary] = useState<SummaryResponse | null>(null);
  const [topSummaryLoading, setTopSummaryLoading] = useState(false);
  const topSummaryKeyRef = useRef<string>("");
  const [topAnalysisEnabled, setTopAnalysisEnabled] = useState(false);

  // Topics to display: all in personalization mode (so user can toggle any),
  // filtered by committed prefs otherwise (no change until "Done" is clicked)
  const displayedTopicLabels: TopicLabel[] = isPersonalizationMode
    ? topicLabels
    : (preferredTopicIds?.length ?? 0) > 0
    ? topicLabels.filter((tp) => preferredTopicIds!.includes(tp.id))
    : topicLabels;

  const topFeedPoll = currentPage === "home" && topic === null && topAnalysisEnabled;
  const {
    articles: topFeed,
    loading: topFeedLoading,
    clear: clearTopFeed,
    lastUpdatedAt: topFeedUpdatedAt,
  } = useTopFeed({
    poll: topFeedPoll,
    lang,
    preferredTopics: preferredTopicIds,
    enabled: topAnalysisEnabled && currentPage === "home" && topic === null,
  });

  useEffect(() => {
    if (currentPage !== "home" || topic !== null || topFeed.length === 0) return;
    const key = topFeed.map((a) => a.link).join("|");
    if (key === topSummaryKeyRef.current) return;
    topSummaryKeyRef.current = key;
    setTopSummaryLoading(true);
    setTopSummary(null);
    fetch("/api/news/top-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articles: topFeed.map((a) => ({
          title: a.title,
          snippet: a.snippet,
          link: a.link,
          source: a.source,
          pubDate: a.pubDate,
        })),
        lang,
      }),
    })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((json: SummaryResponse) => setTopSummary(json))
      .catch(() => {})
      .finally(() => setTopSummaryLoading(false));
  }, [currentPage, topic, topFeed, lang]);

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
    return () => {
      if (periodToastTimerRef.current) clearTimeout(periodToastTimerRef.current);
    };
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
    setPeriodToast(t("homeSelectPeriodAfterTopicToast", lang));
    if (periodToastTimerRef.current) clearTimeout(periodToastTimerRef.current);
    periodToastTimerRef.current = setTimeout(() => {
      setPeriodToast(null);
      periodToastTimerRef.current = null;
    }, 2200);
    setSelected(null);
    setData(null);
    setError(null);
    setAllArticles([]);
    setAllArticlesLoading(false);
    setTopSummary(null);
    setTopSummaryLoading(false);
    setTopAnalysisEnabled(false);
    topSummaryKeyRef.current = "";
    clearTopFeed();
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
    setTopSummary(null);
    setTopSummaryLoading(false);
    setTopAnalysisEnabled(false);
    topSummaryKeyRef.current = "";
    clearTopFeed();
  }

  function showSelectTopicToast() {
    setPeriodToast(t("homeSelectTopicFirstToast", lang));
    if (periodToastTimerRef.current) clearTimeout(periodToastTimerRef.current);
    periodToastTimerRef.current = setTimeout(() => {
      setPeriodToast(null);
      periodToastTimerRef.current = null;
    }, 2200);
  }

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>

        <AppHeader
          currentPage={currentPage}
          lang={lang}
          onNavigate={(page) => {
            setTopicsStartInCreate(false);
            setCurrentPage(page);
          }}
          onHomeReset={() => {
            setCurrentPage("home");
            handleReset();
          }}
          onLangChange={handleLangChange}
          authModalOpen={authModalOpen}
          onAuthModalChange={setAuthModalOpen}
        />

        {currentPage === "stats" ? (
          <StatsPage lang={lang} topics={topicLabels} />
        ) : currentPage === "crons" ? (
          <CronMonitorPage lang={lang} />
        ) : currentPage === "topics" ? (
          authLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
              <span style={spinnerStyle(28)} />
            </div>
          ) : isAuthenticated ? (
            <TopicsPage
              lang={lang}
              canManage={authOwner}
              startInCreate={topicsStartInCreate}
              onExit={() => {
                setCurrentPage("home");
                setTopicsStartInCreate(false);
              }}
            />
          ) : null
        ) : currentPage === "changelog" ? (
          <ChangelogPage lang={lang} />
        ) : currentPage === "feeds" ? (
          authLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
              <span style={spinnerStyle(28)} />
            </div>
          ) : authOwner ? (
            <FeedsAdminPage lang={lang} topics={topicLabels} />
          ) : null
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
          <span style={spinnerStyle(28)} />
        </div>
        ) : (
        <>
        {/* ── Topic selector ──────────────────────────────────── */}
        <section style={{ marginBottom: 24 }}>
          <TopicToggle
            topics={displayedTopicLabels}
            topic={topic}
            disabled={loading}
            onChange={handleTopicChange}
            personalizationMode={isPersonalizationMode}
            preferredTopicIds={isPersonalizationMode ? draftTopicIds : preferredTopicIds}
            onTogglePreference={(id) => toggleTopicPreference(id, topics)}
          />
          <TopicPersonalizationBar
            lang={lang}
            isAuthenticated={isAuthenticated}
            hasPreferences={(preferredTopicIds?.length ?? 0) > 0}
            preferenceCount={
              isPersonalizationMode
                ? (draftTopicIds?.length ?? 0)
                : (preferredTopicIds?.length ?? 0)
            }
            isPersonalizationMode={isPersonalizationMode}
            saveStatus={saveStatus}
            onEnterEdit={enterPersonalizationMode}
            onExitEdit={exitPersonalizationMode}
            onCreateTopic={() => {
              setTopicsStartInCreate(true);
              setCurrentPage("topics");
            }}
            showAnalyzeTopButton={true}
            analyzeTopLoading={topFeedLoading || topSummaryLoading}
            onAnalyzeTop={() => {
              handleReset();
              setTopAnalysisEnabled(true);
            }}
            onRequestAuth={() => setAuthModalOpen(true)}
          />
        </section>

        {/* ── Period selector ────────────────────────────────── */}
        <section style={{ marginBottom: 24 }}>
          <div className="period-grid" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PERIODS.map(({ label, hours }) => (
              <PeriodButton
                key={hours}
                label={label}
                active={selected === hours}
                disabled={loading}
                onClick={() => {
                  if (!topic) {
                    showSelectTopicToast();
                    return;
                  }
                  fetchNews(hours);
                }}
              />
            ))}
          </div>
        </section>

        {/* ── Loading ────────────────────────────────────────── */}
        {loading && (
          <div style={{ padding: "32px 0" }}>
            <p style={{ fontSize: 15, color: color.gold, marginBottom: 12 }}>
              {progress < 50 ? t("homeLoadingReading", lang) : t("homeLoadingAi", lang)}
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
            <SummaryBox data={data} locale={locale} lang={lang} hours={selected ?? 24} topicName={currentTopicLabel} speed={ttsSpeed} voice={lang === "fr" ? ttsVoiceFr : ttsVoice} showAnalyzedCount={true} />

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
              null
            ) : topFeedLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <span style={spinnerStyle(24)} />
              </div>
            ) : topFeed.length > 0 ? (
              <>
                {topSummaryLoading && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "24px 0" }}>
                    <span style={spinnerStyle(24)} />
                    <span style={{ color: color.gold, fontSize: 14, fontWeight: 600 }}>
                      {lang === "fr" ? "Analyse IA" : "AI Analysis"}
                    </span>
                  </div>
                )}
                <RevealBox active={!!topSummary && !topSummaryLoading}>
                  {topSummary && (
                    <SummaryBox
                      data={topSummary}
                      locale={locale}
                      lang={lang}
                      hours={24}
                      topicName="Top Articles"
                      speed={ttsSpeed}
                      voice={lang === "fr" ? ttsVoiceFr : ttsVoice}
                    />
                  )}
                </RevealBox>
                <TopFeedSection
                  articles={topFeed}
                  loading={topFeedLoading}
                  lang={lang}
                  locale={locale}
                  lastUpdatedAt={topFeedUpdatedAt}
                />
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
          {t("homeNewVersionBanner", lang)}
        </div>
      )}

      {periodToast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: 20,
            transform: "translateX(-50%)",
            background: color.surface,
            color: color.textSecondary,
            border: `1px solid ${color.border}`,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            zIndex: 1000,
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
          }}
        >
          {periodToast}
        </div>
      )}

      <TopicOnboardingModal
        open={onboardingNeeded && !topicsLoading && topics.length > 0}
        topics={topics}
        lang={lang}
        onComplete={completeOnboarding}
      />

      <ScrollToTop lang={lang} />

      <footer style={{ position: "fixed", bottom: 8, right: 27, color: color.textDim, fontSize: 12 }}>
        v{APP_VERSION}
      </footer>
    </div>
  );
}
