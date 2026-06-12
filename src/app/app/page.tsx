"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CSSProperties } from "react";
import type {
  SummaryResponse,
  TopicItem,
  TopicLabel,
} from "@/lib/types";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { getCookie, setCookie } from "@/lib/cookies";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  color,
  font,
  spinnerStyle,
} from "@/lib/theme";
import { ChangelogPage } from "@/app/components/ChangelogPage";
import { FeedsAdminPage } from "@/app/components/FeedsAdminPage";
import { CategoriesPage } from "@/app/components/CategoriesPage";
import { SettingsPage } from "@/app/components/SettingsPage";
import { UsersSection } from "@/app/components/UsersSection";
import { UserActivityStatsPage } from "@/app/components/UserActivityStatsPage";
import { SummaryBox } from "@/app/components/SummaryBox";
import { AllArticlesTab, type AllArticleEntry } from "@/app/components/AllArticlesTab";
import { StatsPage } from "@/app/components/StatsPage";
import { CronMonitorPage } from "@/app/components/CronMonitorPage";
import { TopicsPage } from "@/app/components/TopicsPage";
import { TTS_VOICES_EN, TTS_VOICES_FR } from "@/app/components/VoiceAccordion";
import { AppHeader } from "@/app/components/AppHeader";
import { TopFeedSection } from "@/app/components/TopFeedSection";
import { GeneralMenu } from "@/app/components/GeneralMenu";
import { TopicOnboardingModal } from "@/app/components/TopicOnboardingModal";
import { useTopFeed } from "@/hooks/useTopFeed";
import { useUserTopics } from "@/hooks/useUserTopics";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/app/providers";
import { isOwnerUser } from "@/lib/user-type";
import { FavoritesPage } from "@/app/components/FavoritesPage";
import { DailySummariesPage } from "@/app/components/DailySummariesPage";
import { ArchivesBrowsePage } from "@/app/components/ArchivesBrowsePage";
import { VideosPage } from "@/app/components/VideosPage";
import { YouTubeChannelsPage } from "@/app/components/YouTubeChannelsPage";
import { BriefingPage } from "@/app/components/BriefingPage";
import { ChannelsPage } from "@/app/components/ChannelsPage";
import { useSpaNavigation } from "@/lib/spa-navigation";
import { fetchNewsApi, PERIODS } from "@/lib/news-fetch";
import { unlockAudioContext, playNotificationBeep } from "@/lib/notification-sound";
import { TopicToggle } from "@/app/components/app-shell/TopicToggle";
import { MyTopicsPage } from "@/app/components/app-shell/MyTopicsPage";
import { ScrollToTop } from "@/app/components/app-shell/ScrollToTop";
import { ArticleCard } from "@/app/components/app-shell/ArticleCard";
import { DailyPodcastChatPanel } from "@/app/components/podcast-chat/DailyPodcastChatPanel";

// ── Constants ─────────────────────────────────────────────────────────

const APP_VERSION = "2.13.6";
const VERSION_CHECK_INTERVAL_MS = 5 * 60_000;

// Daily Podcast chat panel width bounds (desktop). The panel is
// drag-resizable from its left edge between these values; the layout
// push mirrors the chosen width via the `--chat-width` CSS variable.
const PODCAST_CHAT_MIN_WIDTH = 320;
const PODCAST_CHAT_MAX_WIDTH = 640;
const PODCAST_CHAT_DEFAULT_WIDTH = 400;


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





export default function Home() {
  // Lang resolution order:
  //   1. Logged-in user's `user_metadata.preferred_lang` (BDD-backed)
  //   2. Cookie `lang` (anonymous visitors)
  //   3. Default "en"
  // The query string `?lang=` is not consulted on this client SPA — it
  // is purely a SSR-page concern (see resolveServerLang). The auth
  // session arrives async, so we initialize from the cookie and then
  // upgrade to the user's preference once the session is known. If the
  // user is signed in but has no preferred_lang in their metadata yet,
  // we lazily seed it with whatever cookie value is currently in use,
  // so subsequent visits across browsers stay consistent.
  const [lang, setLang] = useState<Lang>("en");
  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null);
  if (supabaseRef.current === null && typeof window !== "undefined") {
    supabaseRef.current = createBrowserSupabaseClient();
  }

  useEffect(() => {
    const l = getCookie("lang");
    if (l === "fr") setLang("fr");
    else if (l === "en") setLang("en");
  }, []);

  // Pulled up from below: we need `session` to drive the lang sync /
  // persistence below.
  const { session, loading: authLoading } = useAuth();
  const authUser = session?.user ?? null;
  const authOwner = Boolean(authUser && isOwnerUser(authUser));
  const isAuthenticated = Boolean(authUser);

  // Whenever the auth session changes, prefer the user's stored
  // preferred_lang (BDD) over the cookie. If the user is signed in but
  // has no preferred_lang yet (legacy accounts), seed it with the
  // current cookie / lang so future visits stay coherent.
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) return;
    const meta = (authUser.user_metadata ?? {}) as { preferred_lang?: unknown };
    const userLang = meta.preferred_lang;
    if (userLang === "fr" || userLang === "en") {
      setLang(userLang);
      setCookie("lang", userLang);
      return;
    }
    const supa = supabaseRef.current;
    if (!supa) return;
    void supa.auth.updateUser({
      data: { ...authUser.user_metadata, preferred_lang: lang },
    });
  // We intentionally do NOT depend on `lang` — that would re-run this
  // effect every time the user changes the language and overwrite their
  // choice with the seed value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, authLoading]);

  // Same dual-store reconciliation for the home min-score thresholds.
  // On session arrival: prefer values stored in user_metadata; if
  // missing, seed user_metadata from the current cookie / state. We
  // intentionally don't depend on the local state vars to avoid
  // re-running and overwriting fresh user input.
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) return;
    const meta = (authUser.user_metadata ?? {}) as {
      home_min_score_article?: unknown;
      home_min_score_video?: unknown;
    };

    const metaArticleRaw = meta.home_min_score_article;
    const metaArticle =
      typeof metaArticleRaw === "number" && metaArticleRaw >= 1 && metaArticleRaw <= 10
        ? Math.round(metaArticleRaw)
        : null;
    const metaVideoRaw = meta.home_min_score_video;
    const metaVideo =
      typeof metaVideoRaw === "number" && metaVideoRaw >= 1 && metaVideoRaw <= 10
        ? Math.round(metaVideoRaw)
        : null;

    if (metaArticle != null) {
      setHomeMinScoreArticle(metaArticle);
      setCookie("homeMinScoreArticle", String(metaArticle));
    }
    if (metaVideo != null) {
      setHomeMinScoreVideo(metaVideo);
      setCookie("homeMinScoreVideo", String(metaVideo));
    }

    if (metaArticle != null && metaVideo != null) return;

    const supa = supabaseRef.current;
    if (!supa) return;
    void supa.auth.updateUser({
      data: {
        ...authUser.user_metadata,
        home_min_score_article: metaArticle ?? homeMinScoreArticle,
        home_min_score_video: metaVideo ?? homeMinScoreVideo,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, authLoading]);

  const handleLangChange = useCallback((newLang: Lang) => {
    setCookie("lang", newLang);
    setLang(newLang);
    // Persist the choice for signed-in users so it follows them across
    // browsers / devices. Unauthenticated visitors only get the cookie.
    const supa = supabaseRef.current;
    if (authUser && supa) {
      void supa.auth.updateUser({
        data: { ...authUser.user_metadata, preferred_lang: newLang },
      });
    }
  }, [authUser]);

  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const topicLabels: TopicLabel[] = topics.map((tp) => ({ id: tp.id, label: lang === "fr" ? tp.labelFr : tp.labelEn }));
  const [topic, setTopic] = useState<string | null>(null);
  const [externalArticleTopicId, setExternalArticleTopicId] = useState<string | null>(null);
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

  // Per-user thresholds for the home page TOP STORY / TOP VIDEO blocks.
  // Stored in a cookie (works for anon + auth) and mirrored into
  // `user_metadata.home_min_score_*` for signed-in users so the choice
  // follows them across browsers — same dual-store pattern as
  // `preferred_lang` above. Default 9 (article) / 8 (video). Clamp 1..10.
  const [homeMinScoreArticle, setHomeMinScoreArticle] = useState(() => {
    if (typeof document === "undefined") return 9;
    const raw = getCookie("homeMinScoreArticle");
    if (raw && /^\d+$/.test(raw)) return Math.min(10, Math.max(1, Number(raw)));
    return 9;
  });
  const updateHomeMinScoreArticle = useCallback(
    (value: number) => {
      const clamped = Math.min(10, Math.max(1, Math.round(value)));
      setHomeMinScoreArticle(clamped);
      setCookie("homeMinScoreArticle", String(clamped));
      const supa = supabaseRef.current;
      if (authUser && supa) {
        void supa.auth.updateUser({
          data: { ...authUser.user_metadata, home_min_score_article: clamped },
        });
      }
    },
    [authUser],
  );
  const [homeMinScoreVideo, setHomeMinScoreVideo] = useState(() => {
    if (typeof document === "undefined") return 8;
    const raw = getCookie("homeMinScoreVideo");
    if (raw && /^\d+$/.test(raw)) return Math.min(10, Math.max(1, Number(raw)));
    return 8;
  });
  const updateHomeMinScoreVideo = useCallback(
    (value: number) => {
      const clamped = Math.min(10, Math.max(1, Math.round(value)));
      setHomeMinScoreVideo(clamped);
      setCookie("homeMinScoreVideo", String(clamped));
      const supa = supabaseRef.current;
      if (authUser && supa) {
        void supa.auth.updateUser({
          data: { ...authUser.user_metadata, home_min_score_video: clamped },
        });
      }
    },
    [authUser],
  );
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
  // v2.12+ — SPA navigation machine extracted to `src/lib/spa-navigation.ts`.
  // The hook owns the URL ↔ AppNavPage mapping, History API plumbing,
  // popstate listener and `page.view` analytics. Auth redirects and
  // page-specific UX (scroll-to-top on /top-articles) stay in `Home`
  // below because they read auth state / lifecycle other than `currentPage`.
  const { currentPage, setCurrentPage } = useSpaNavigation();

  const [topicsStartInCreate, setTopicsStartInCreate] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Daily Podcast chat side panel open/closed. Persisted to localStorage
  // so an expanded panel stays expanded across reloads and on every page
  // of the SPA. Hydrated after mount to avoid an SSR mismatch. With no
  // stored preference, the panel defaults OPEN on desktop (incl. anonymous
  // visitors) and closed on small screens (where it overlays full-width).
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("podcastChatOpen");
    if (stored === "1") setChatOpen(true);
    else if (stored === "0") setChatOpen(false);
    else setChatOpen(window.innerWidth >= 761);
  }, []);
  const handleChatOpenChange = useCallback((next: boolean) => {
    setChatOpen(next);
    try {
      window.localStorage.setItem("podcastChatOpen", next ? "1" : "0");
    } catch {
      /* storage disabled — in-memory state still works for the session */
    }
  }, []);

  // User-resizable chat width (drag the panel's left edge). Shared with
  // the layout push via a `--chat-width` CSS variable on the root so the
  // interface shift always matches the panel. Clamped to a coherent
  // min/max (and never wider than the viewport minus a content margin).
  const [chatWidth, setChatWidth] = useState(PODCAST_CHAT_DEFAULT_WIDTH);
  const clampChatWidth = useCallback((raw: number) => {
    const viewportCap =
      typeof window !== "undefined"
        ? Math.max(PODCAST_CHAT_MIN_WIDTH, window.innerWidth - 320)
        : PODCAST_CHAT_MAX_WIDTH;
    const max = Math.min(PODCAST_CHAT_MAX_WIDTH, viewportCap);
    return Math.round(Math.max(PODCAST_CHAT_MIN_WIDTH, Math.min(max, raw)));
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = Number.parseInt(
      window.localStorage.getItem("podcastChatWidth") ?? "",
      10,
    );
    if (Number.isFinite(stored)) setChatWidth(clampChatWidth(stored));
  }, [clampChatWidth]);
  const handleChatWidthChange = useCallback(
    (raw: number) => {
      const w = clampChatWidth(raw);
      setChatWidth(w);
      try {
        window.localStorage.setItem("podcastChatWidth", String(w));
      } catch {
        /* storage disabled — width still applies for the session */
      }
    },
    [clampChatWidth],
  );

  const {
    preferredTopicIds,
    draftTopicIds,
    onboardingNeeded,
    saveStatus,
    toggleTopicPreference,
    completeOnboarding,
  } = useUserTopics(isAuthenticated);

  const { favoriteUrls, toggleFavorite } = useFavorites(isAuthenticated);

  useEffect(() => {
    if (authLoading) return;
    if (!authOwner && (currentPage === "feeds" || currentPage === "categories" || currentPage === "dailySummaries" || currentPage === "youtubeChannels" || currentPage === "users" || currentPage === "stats" || currentPage === "userActivity")) {
      setCurrentPage("briefing", true);
    }
    if (!isAuthenticated && currentPage === "topics") {
      setCurrentPage("briefing", true);
    }
    if (!isAuthenticated && currentPage === "favorites") {
      setCurrentPage("briefing", true);
      setAuthModalOpen(true);
    }
  }, [authLoading, authOwner, isAuthenticated, currentPage, setCurrentPage]);

  // UX: entering the Top 50 page from the home briefing should always
  // start at the top of the document; otherwise users can land mid-page
  // if they clicked "Voir le top 50" after scrolling deep on /app.
  useEffect(() => {
    if (currentPage !== "topArticles") return;
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [currentPage]);

  // Guard: if the selected topic is removed from user's preferred topics, reset
  useEffect(() => {
    if (
      topic &&
      preferredTopicIds !== null &&
      preferredTopicIds.length > 0 &&
      !preferredTopicIds.includes(topic) &&
      topic !== externalArticleTopicId
    ) {
      handleReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredTopicIds, externalArticleTopicId]);

  const [resultTab, setResultTab] = useState<"relevant" | "all">("relevant");
  const [allArticles, setAllArticles] = useState<AllArticleEntry[]>([]);
  const [allArticlesLoading, setAllArticlesLoading] = useState(false);
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  const [periodToast, setPeriodToast] = useState<string | null>(null);
  const periodToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Ma veille" always shows committed preferences only. Topic editing
  // lives on the dedicated "Mes topics" page.
  const displayedTopicLabels: TopicLabel[] = (preferredTopicIds?.length ?? 0) > 0
    ? topicLabels.filter((tp) => preferredTopicIds!.includes(tp.id) || tp.id === externalArticleTopicId)
    : topicLabels;

  const isTopArticlesPage = currentPage === "topArticles";

  // v2.6.15+ — `/top-articles` is now a live « top 50, last 24 h » feed.
  // The page used to render the cron-frozen snapshot from `top_summaries`
  // (paired with an accordion AI briefing), but once the briefing moved
  // exclusively to the home `Top24hHero`, the only content left here is
  // the article list itself — so we drive it from the live
  // `useTopFeed` hook instead of a stale daily snapshot. Background
  // poll runs every 5 min while the page is mounted; toggling lang
  // refetches immediately. The hook self-disables when the user is on
  // any other SPA page (`enabled: isTopArticlesPage`), so no waste on
  // the rest of the app.
  const {
    articles: topFeed,
    loading: topFeedLoading,
    lastUpdatedAt: topFeedUpdatedAt,
  } = useTopFeed({
    poll: true,
    lang,
    preferredTopics: preferredTopicIds,
    enabled: isTopArticlesPage,
  });

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
    // Topics power not just the home grid but also the admin pages
    // (daily-summaries, feeds, youtube-channels, stats), the personalization
    // bar, and the per-topic article navigation. Load them once on mount so
    // any page reached via direct URL or menu click has the data ready.
    setTopicsLoading(true);
    fetch("/api/topics", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((list: TopicItem[]) => setTopics(list))
      .catch(() => {})
      .finally(() => setTopicsLoading(false));
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

  async function fetchNews(hours: number, topicOverride?: string) {
    const targetTopic = topicOverride ?? topic;
    if (!targetTopic) return;
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
      const data = await fetchNewsApi(`/api/news?hours=${hours}&lang=${lang}&topic=${encodeURIComponent(targetTopic)}&count=${maxArticles}`, lang);
      setData(data);
      playNotificationBeep();

      fetch(`/api/news/all?topic=${encodeURIComponent(targetTopic)}&since=${encodeURIComponent(sinceISO)}&lang=${lang}`, { cache: "no-store" })
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
    setExternalArticleTopicId(null);
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
  }

  function handleReset() {
    setExternalArticleTopicId(null);
    setTopic(null);
    setSelected(null);
    setData(null);
    setError(null);
    setLoading(false);
    setResultTab("relevant");
    setAllArticles([]);
    setAllArticlesLoading(false);
  }

  function showSelectTopicToast() {
    setPeriodToast(t("homeSelectTopicFirstToast", lang));
    if (periodToastTimerRef.current) clearTimeout(periodToastTimerRef.current);
    periodToastTimerRef.current = setTimeout(() => {
      setPeriodToast(null);
      periodToastTimerRef.current = null;
    }, 2200);
  }

  function showHomeToast(message: string, durationMs = 5000) {
    setPeriodToast(message);
    if (periodToastTimerRef.current) clearTimeout(periodToastTimerRef.current);
    periodToastTimerRef.current = setTimeout(() => {
      setPeriodToast(null);
      periodToastTimerRef.current = null;
    }, durationMs);
  }

  function openArticlesForTopic(topicId: string) {
    setExternalArticleTopicId(topicId);
    setTopic(topicId);
    setCurrentPage("home");
    setPeriodToast(null);
    fetchNews(24, topicId);
  }

  return (
    <div
      className={`app-shell-root${chatOpen ? " chat-open" : ""}`}
      style={{
        minHeight: "100vh",
        background: color.bg,
        color: color.text,
        fontFamily: font.base,
        ["--chat-width" as string]: `${chatWidth}px`,
      } as CSSProperties}
    >
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>

        <AppHeader
          currentPage={currentPage}
          lang={lang}
          onNavigate={(page) => {
            setTopicsStartInCreate(false);
            setCurrentPage(page);
          }}
          onHomeReset={() => {
            setCurrentPage("briefing");
            handleReset();
          }}
          onLangChange={handleLangChange}
          authModalOpen={authModalOpen}
          onAuthModalChange={setAuthModalOpen}
        />

        {/* ── General menu (visible on all pages) ─────────────── */}
        <GeneralMenu
          lang={lang}
          currentPage={currentPage}
          isAuthenticated={isAuthenticated}
          analyzeTopLoading={isTopArticlesPage && topFeedLoading && topFeed.length === 0}
          onNavigateBriefing={() => { setCurrentPage("briefing"); handleReset(); }}
          onNavigateHome={() => { setCurrentPage("home"); handleReset(); }}
          onNavigateFavorites={() => setCurrentPage("favorites")}
          onAnalyzeTop={() => setCurrentPage("topArticles")}
          onNavigateSummaries={() => setCurrentPage("summaries")}
          onNavigateVideos={() => setCurrentPage("videos")}
          onNavigateChannels={() => setCurrentPage("channels")}
          onNavigateMyTopics={() => {
            setCurrentPage("myTopics");
          }}
          onRequestAuth={() => setAuthModalOpen(true)}
        />

        {currentPage === "briefing" ? (
          <BriefingPage
            lang={lang}
            isAuthenticated={isAuthenticated}
            favoriteUrls={favoriteUrls}
            onToggleFavorite={toggleFavorite}
            onRequestAuth={() => setAuthModalOpen(true)}
            onNavigate={(page) => setCurrentPage(page)}
            onOpenTopicArticles={openArticlesForTopic}
            topicLabels={topicLabels}
            preferredTopicIds={preferredTopicIds}
            ttsSpeed={ttsSpeed}
            ttsVoice={lang === "fr" ? ttsVoiceFr : ttsVoice}
            onOpenChat={() => handleChatOpenChange(true)}
          />
        ) : currentPage === "stats" ? (
          <StatsPage
            lang={lang}
            topics={topicLabels}
            favoriteUrls={favoriteUrls}
            onToggleFavorite={toggleFavorite}
            isAuthenticated={isAuthenticated}
            onRequestAuth={() => setAuthModalOpen(true)}
          />
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
                setCurrentPage("briefing");
                setTopicsStartInCreate(false);
              }}
              onMemberCreatedTopic={(message) => {
                setCurrentPage("briefing");
                setTopicsStartInCreate(false);
                showHomeToast(message, 5000);
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
        ) : currentPage === "categories" ? (
          authLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
              <span style={spinnerStyle(28)} />
            </div>
          ) : authOwner ? (
            <CategoriesPage lang={lang} />
          ) : null
        ) : currentPage === "dailySummaries" ? (
          authLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
              <span style={spinnerStyle(28)} />
            </div>
          ) : authOwner ? (
            <DailySummariesPage lang={lang} topics={topicLabels} />
          ) : null
        ) : currentPage === "videos" ? (
          <VideosPage
            lang={lang}
            speed={ttsSpeed}
            voice={lang === "fr" ? ttsVoiceFr : ttsVoice}
            favoriteUrls={favoriteUrls}
            onToggleFavorite={toggleFavorite}
            isAuthenticated={isAuthenticated}
            onRequestAuth={() => setAuthModalOpen(true)}
          />
        ) : currentPage === "channels" ? (
          <ChannelsPage lang={lang} />
        ) : currentPage === "youtubeChannels" ? (
          authLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
              <span style={spinnerStyle(28)} />
            </div>
          ) : authOwner ? (
            <YouTubeChannelsPage lang={lang} />
          ) : null
        ) : currentPage === "users" ? (
          // Owner-only admin page. Moved out of SettingsPage in v2.7.x —
          // Settings is now strictly per-account preferences, while the
          // multi-user management lives in the AppHeader's user-menu
          // dropdown alongside Topics / Feeds / Categories / Daily
          // Summaries / YouTube Channels. Same auth-loading + owner
          // gate as the other admin routes so a non-owner hitting
          // /app/users directly via URL sees a no-op render (the menu
          // itself won't surface the link for them).
          authLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
              <span style={spinnerStyle(28)} />
            </div>
          ) : authOwner ? (
            <UsersSection lang={lang} />
          ) : null
        ) : currentPage === "userActivity" ? (
          // Owner-only behavioral analytics dashboard (v2.10+). Same
          // auth pattern as `users`: render spinner while session is
          // resolving, no-op for non-owners (the menu hides the link
          // for them anyway, this is the URL-typed-directly fallback).
          authLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
              <span style={spinnerStyle(28)} />
            </div>
          ) : authOwner ? (
            <UserActivityStatsPage lang={lang} />
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
            homeMinScoreArticle={homeMinScoreArticle}
            onHomeMinScoreArticleChange={updateHomeMinScoreArticle}
            homeMinScoreVideo={homeMinScoreVideo}
            onHomeMinScoreVideoChange={updateHomeMinScoreVideo}
            onRequestAuth={() => setAuthModalOpen(true)}
          />
        ) : currentPage === "favorites" ? (
          authLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
              <span style={spinnerStyle(28)} />
            </div>
          ) : isAuthenticated ? (
            <FavoritesPage
              lang={lang}
              favoriteUrls={favoriteUrls}
              onToggleFavorite={toggleFavorite}
              speed={ttsSpeed}
              voice={lang === "fr" ? ttsVoiceFr : ttsVoice}
            />
          ) : null
        ) : currentPage === "topArticles" ? (
          <div>
            {topFeedLoading && topFeed.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <span style={spinnerStyle(24)} />
              </div>
            ) : topFeed.length > 0 ? (
              // v2.6.15+ — live « top 50 / 24 h » feed (was a cron-frozen
              // snapshot from `top_summaries`). The `lastUpdatedAt` chip
              // in TopFeedSection now reflects the actual most-recent
              // pull, not yesterday's cron tick.
              <TopFeedSection
                articles={topFeed}
                loading={topFeedLoading}
                lang={lang}
                locale={locale}
                lastUpdatedAt={topFeedUpdatedAt}
                favoriteUrls={favoriteUrls}
                onToggleFavorite={toggleFavorite}
                isAuthenticated={isAuthenticated}
                onRequestAuth={() => setAuthModalOpen(true)}
              />
            ) : (
              // Empty state: hook returned an empty array (no scored
              // articles in the rolling 24 h window). Rare in steady
              // state — happens mostly on a fresh deploy before the
              // first scoring cron tick has caught up.
              <div
                style={{
                  border: `1px solid ${color.border}`,
                  borderRadius: 12,
                  padding: "32px 22px",
                  margin: "16px 0 24px",
                  textAlign: "center",
                  color: color.textSecondary,
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {t("topArticlesEmpty", lang)}
              </div>
            )}
          </div>
        ) : currentPage === "myTopics" ? (
          topicsLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
              <span style={spinnerStyle(28)} />
            </div>
          ) : (
            <MyTopicsPage
              lang={lang}
              isAuthenticated={isAuthenticated}
              topics={topicLabels}
              draftTopicIds={draftTopicIds}
              saveStatus={saveStatus}
              onTogglePreference={(id) => toggleTopicPreference(id, topics)}
              onCreateTopic={() => {
                setTopicsStartInCreate(true);
                setCurrentPage("topics");
              }}
              onRequestAuth={() => setAuthModalOpen(true)}
            />
          )
        ) : currentPage === "summaries" ? (
          <ArchivesBrowsePage lang={lang} />
        ) : topicsLoading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px 0" }}>
          <span style={spinnerStyle(28)} />
        </div>
        ) : (
        <>
        {/* ── My briefing title + Topic selector ───────────────── */}
        <section style={{ marginBottom: 24 }}>
          <h1
            style={{
              color: color.text,
              fontFamily: "ui-serif, Georgia, serif",
              fontSize: 30,
              fontWeight: 400,
              lineHeight: 1.14,
              marginBottom: 8,
              marginTop: 0,
            }}
          >
            {t("myBriefingTitle", lang)}
          </h1>
          <p
            style={{
              color: color.textMuted,
              fontSize: 14,
              marginTop: 0,
              marginBottom: 18,
              lineHeight: 1.6,
              maxWidth: 680,
            }}
          >
            {t("myBriefingSubtitle", lang)}
          </p>
          <TopicToggle
            topics={displayedTopicLabels}
            topic={topic}
            lang={lang}
            disabled={loading}
            onChange={handleTopicChange}
            preferredTopicIds={preferredTopicIds}
            onTogglePreference={() => {}}
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
                      <ArticleCard
                        key={`${art.link}-${i}`}
                        article={art}
                        locale={locale}
                        lang={lang}
                        isFavorite={favoriteUrls.has(art.link)}
                        isAuthenticated={isAuthenticated}
                        onToggleFavorite={toggleFavorite}
                        onRequestAuth={() => setAuthModalOpen(true)}
                      />
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
                favoriteUrls={favoriteUrls}
                onToggleFavorite={toggleFavorite}
                isAuthenticated={isAuthenticated}
                onRequestAuth={() => setAuthModalOpen(true)}
              />
            )}
          </div>
        )}

        </>
        )}
      </div>

      {/* Daily Podcast chat — collapsible side panel, available to
          everyone (anonymous visitors can type; submitting routes them to
          sign-in). Square open/close toggle pinned top-right; the panel
          pushes the interface left (no backdrop) so the app stays usable. */}
      {
        <>
          <button
            type="button"
            onClick={() => handleChatOpenChange(!chatOpen)}
            aria-label={chatOpen ? t("podcastChatClose", lang) : t("podcastChatOpen", lang)}
            aria-expanded={chatOpen}
            title={chatOpen ? t("podcastChatClose", lang) : t("podcastChatOpen", lang)}
            style={{
              position: "fixed",
              top: 12,
              right: 12,
              zIndex: 80,
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: `1px solid ${color.border}`,
              background: color.surface,
              color: chatOpen ? color.textMuted : color.gold,
              cursor: "pointer",
              boxShadow: "0 4px 18px rgba(0,0,0,0.4)",
              transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
            }}
          >
            {chatOpen ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.38 8.38 0 0 1 8.5-8.5 8.5 8.5 0 0 1 8.5 8.5z" />
              </svg>
            )}
          </button>
          <DailyPodcastChatPanel
            lang={lang}
            open={chatOpen}
            onOpenChange={handleChatOpenChange}
            isAuthenticated={isAuthenticated}
            onRequestAuth={() => setAuthModalOpen(true)}
            onWidthChange={handleChatWidthChange}
          />
        </>
      }

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
