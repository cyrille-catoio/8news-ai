"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Lang } from "@/lib/i18n";
import { dateLocale } from "@/lib/i18n";
import { color, card, spinnerStyle } from "@/lib/theme";
import { useTopFeed, type TopFeedArticle } from "@/hooks/useTopFeed";
import { ScoreMeter } from "@/app/components/ScoreMeter";
import { CopyLinkButton } from "@/app/components/CopyLinkButton";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { VideoCard, type VideoItem } from "@/app/components/VideoCard";
import type { TopicLabel } from "@/lib/types";
import type { AppNavPage } from "@/app/components/AppHeader";

interface SummaryRoute {
  topic_id: string;
  summary_date: string;
  slug_keywords: string;
  lang: string;
}

interface MiniArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet?: string | null;
  score?: number | null;
}

interface TrendingTopic {
  id: string;
  label: string;
  count: number;
}

/** A SSR per-video page surfaced in the bottom "Toutes les vidéos
 *  transcrites" list. Same shape as the items in the response of
 *  GET /api/video-pages/recent. */
interface RecentVideoPage {
  videoId: string;
  title: string;
  topicId: string;
  publishedDate: string;
  slug: string;
  lang: string;
}

/** Server response shape — items + pagination metadata. */
interface RecentVideoPagesResponse {
  items: RecentVideoPage[];
  page: number;
  pageSizeDays: number;
  fromDate: string;
  toDate: string;
  hasMore: boolean;
}

function relativeTime(pubDate: string, lang: Lang): string {
  const ms = Date.now() - new Date(pubDate).getTime();
  if (ms < 0 || isNaN(ms)) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return lang === "fr" ? "à l'instant" : "just now";
  if (minutes < 60) return lang === "fr" ? `il y a ${minutes} min` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === "fr" ? `il y a ${hours} h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === "fr" ? `il y a ${days} j` : `${days}d ago`;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Browser IANA timezone (e.g. "Europe/Paris"). Empty string in non-browser env. */
function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}

export function BriefingPage({
  lang,
  isAuthenticated,
  favoriteUrls,
  onToggleFavorite,
  onRequestAuth,
  onNavigate,
  topicLabels,
  preferredTopicIds,
  ttsSpeed,
  ttsVoice,
}: {
  lang: Lang;
  isAuthenticated: boolean;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string; sourceType?: "article" | "video" }) => void;
  onRequestAuth: () => void;
  onNavigate: (page: AppNavPage) => void;
  topicLabels: TopicLabel[];
  /** User's preferred topic IDs. null when not configured / anonymous. */
  preferredTopicIds: string[] | null;
  /** TTS settings forwarded to the VideoCard's audio player. */
  ttsSpeed: number;
  ttsVoice: string;
}) {
  const locale = dateLocale(lang);

  // ─── Top feed (powers Top 5; the hero gets its own freshness-priority
  //      query — see heroStory below) ───────────────────────────────────
  const { articles: topFeed, loading: topFeedLoading } = useTopFeed({
    poll: false,
    lang,
    preferredTopics: null,
    enabled: true,
  });

  // ─── Top story (Hero) ────────────────────────────────────────────────
  // Dedicated /api/news/top-story query. The hero is **synchronized
  // across all visitors** of the same language: every user hitting the
  // page within the same 10-minute wall-clock bucket sees the exact
  // same article in their language (FR → FR top story, EN → EN top
  // story). Endpoint returns null when nothing matches, in which case
  // we fall back to topFeed[0] so the hero never goes empty.
  //
  // The endpoint serves CDN-cacheable responses keyed by `?lang=` and
  // bucketed on 10-minute boundaries (`s-maxage=<remaining>`), so by
  // default the browser hits the Netlify edge cache and gets the same
  // payload as everyone else.
  //
  // Refresh triggers (only this card refreshes, the rest of the
  // briefing is left untouched):
  //   - On mount + on `lang` change.
  //   - Aligned to the next wall-clock 10-min boundary, then every
  //     10 minutes — so all clients flip together.
  //   - When the tab becomes visible after being hidden — fixes the
  //     case where the user comes back after lunch and sees a stale
  //     hero (background tabs throttle setInterval to once per minute,
  //     but visibilitychange fires immediately on focus).
  const [heroStory, setHeroStory] = useState<TopFeedArticle | null>(null);
  const [heroLoading, setHeroLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;

    async function fetchTopStory(showLoading: boolean) {
      if (showLoading) setHeroLoading(true);
      try {
        // No `cache: "no-store"` — we want the browser to honor
        // `Cache-Control: max-age=0, s-maxage=<remaining>, must-revalidate`
        // from the server: revalidate every time, but let the CDN serve
        // the same shared payload to every visitor of this lang in
        // this bucket. That's what guarantees synchronization.
        const r = await fetch(`/api/news/top-story?lang=${lang}`);
        const json: { article: TopFeedArticle | null } = r.ok ? await r.json() : { article: null };
        if (!cancelled) setHeroStory(json.article ?? null);
      } catch {
        // Silent fail — keep the previous hero on screen rather than
        // wiping it on a transient network blip.
      } finally {
        if (!cancelled && showLoading) setHeroLoading(false);
      }
    }

    fetchTopStory(true);

    const HERO_REFRESH_MS = 10 * 60 * 1000;
    // Align the first interval refresh to the next wall-clock 10-min
    // boundary (+200ms safety) so every browser flips into the new
    // bucket at roughly the same moment. After the first aligned
    // refresh we settle into a plain `setInterval(10 min)`.
    const msToBoundary = HERO_REFRESH_MS - (Date.now() % HERO_REFRESH_MS) + 200;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      fetchTopStory(false);
      intervalId = setInterval(() => fetchTopStory(false), HERO_REFRESH_MS);
    }, msToBoundary);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Tab just got refocused — refresh immediately so the user
        // doesn't stare at a stale hero from before they switched away.
        fetchTopStory(false);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [lang]);

  // ─── Latest daily summary (today or yesterday fallback) ─────────────
  const [summaryRoutes, setSummaryRoutes] = useState<SummaryRoute[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  useEffect(() => {
    setSummaryLoading(true);
    fetch("/api/summaries/routes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: SummaryRoute[]) => setSummaryRoutes(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, []);

  const latestSummary = useMemo(() => {
    return summaryRoutes.find((r) => r.lang === lang) ?? null;
  }, [summaryRoutes, lang]);

  // ─── Trending topics (powered by /api/topics/trending) ──────────────
  const [trending, setTrending] = useState<TrendingTopic[]>([]);
  useEffect(() => {
    fetch(`/api/topics/trending?since=6h&lang=${lang}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: TrendingTopic[]) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setTrending(rows);
        } else {
          // Fallback to a wider window if the last 6 hours are empty.
          fetch(`/api/topics/trending?since=24h&lang=${lang}`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : []))
            .then((rows24: TrendingTopic[]) => setTrending(Array.isArray(rows24) ? rows24 : []))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [lang]);

  // ─── Recent SSR per-video pages ─────────────────────────────────────
  // The list itself owns its pagination state — see
  // `RecentVideoPagesSection`. Page size = 1 calendar day (today by
  // default), with « Plus ancien / Plus récent » buttons to walk
  // through history one day at a time.

  // ─── Per-preferred-topic mini strips (logged-in users) ──────────────
  const [yourTopicArticles, setYourTopicArticles] = useState<Record<string, MiniArticle[]>>({});
  useEffect(() => {
    if (!isAuthenticated || !preferredTopicIds || preferredTopicIds.length === 0) {
      setYourTopicArticles({});
      return;
    }
    let cancelled = false;
    const ids = preferredTopicIds.slice(0, 4); // cap at 4 strips
    Promise.all(
      ids.map((id) =>
        fetch(`/api/news?topic=${encodeURIComponent(id)}&hours=24&lang=${lang}&count=3`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data: { articles?: MiniArticle[] } | null) => ({ id, articles: data?.articles ?? [] }))
          .catch(() => ({ id, articles: [] as MiniArticle[] })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, MiniArticle[]> = {};
      for (const { id, articles } of results) {
        if (articles.length > 0) map[id] = articles.slice(0, 3);
      }
      setYourTopicArticles(map);
    });
    return () => { cancelled = true; };
  }, [isAuthenticated, preferredTopicIds, lang]);

  // ─── Recent transcribed videos (today + yesterday) ──────────────────
  // Same data shape as VideosPage: split between video metadata
  // (VideoItem) and per-video transcription summaries / loading state.
  // The VideoCard component drives the Play / Summary / Audio player UI;
  // we just provide the data and the transcribe handler.
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoSummaries, setVideoSummaries] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});
  const [videosLoading, setVideosLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setVideosLoading(true);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    const tz = browserTimeZone();
    const tzQs = tz ? `&tz=${encodeURIComponent(tz)}` : "";
    Promise.all([
      fetch(`/api/youtube-channels/videos?date=${toISODate(today)}&lang=${lang}${tzQs}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/youtube-channels/videos?date=${toISODate(yesterday)}&lang=${lang}${tzQs}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        type ApiVideo = VideoItem & { summaryMd?: string | null; published: string };
        const merged = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
          .filter((v: ApiVideo) => v.summaryMd && v.summaryMd.length > 0)
          .sort((x: ApiVideo, y: ApiVideo) => new Date(y.published).getTime() - new Date(x.published).getTime())
          .slice(0, 3);
        const items: VideoItem[] = merged.map((m: ApiVideo) => {
          const { summaryMd: _summary, ...rest } = m;
          return rest;
        });
        const summaries: Record<string, string> = {};
        for (const m of merged as ApiVideo[]) {
          if (m.summaryMd) summaries[m.videoId] = m.summaryMd;
        }
        setVideos(items);
        setVideoSummaries(summaries);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setVideosLoading(false);
      });
    return () => { cancelled = true; };
  }, [lang]);

  // Same logic as VideosPage.handleTranscribe — POSTs the video to the
  // transcribe endpoint and writes the resulting summaryMd into local
  // state so the VideoCard can re-render with it.
  const handleTranscribe = useCallback(async (v: VideoItem) => {
    setTranscribing((prev) => ({ ...prev, [v.videoId]: true }));
    try {
      const res = await fetch("/api/youtube-channels/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: v.videoId, title: v.title, channelId: v.channelId, lang }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const { summaryMd } = await res.json();
      setVideoSummaries((prev) => ({ ...prev, [v.videoId]: summaryMd }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setVideoSummaries((prev) => ({ ...prev, [v.videoId]: `> **Error:** ${msg}` }));
    } finally {
      setTranscribing((prev) => ({ ...prev, [v.videoId]: false }));
    }
  }, [lang]);

  // Prefer the dedicated /api/news/top-story result for the hero; fall
  // back to the highest-scored item in the top feed if the dedicated
  // endpoint returned null (e.g. nothing scored ≥ 9 in the last 24 h).
  // While both queries are still in flight, drop into a plain spinner
  // — the hero is the page's anchor so we'd rather wait than flash.
  const heroArticle = heroStory ?? topFeed[0] ?? null;
  const heroBlocked = heroLoading && topFeedLoading && !heroArticle;
  // Top 5 excludes whatever is currently in the hero so the same
  // article never shows up twice on the page.
  const heroLink = heroArticle?.link ?? null;
  const top5 = topFeed.filter((a) => a.link !== heroLink).slice(0, 5);

  return (
    <div>
      {heroBlocked ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <span style={spinnerStyle(28)} />
        </div>
      ) : (
        <>
          {heroArticle && (
            <HeroStory
              article={heroArticle}
              lang={lang}
              isFavorite={favoriteUrls.has(heroArticle.link)}
              isAuthenticated={isAuthenticated}
              onToggleFavorite={onToggleFavorite}
              onRequestAuth={onRequestAuth}
            />
          )}

          {trending.length > 0 && (
            <TrendingStrip
              topics={trending}
              lang={lang}
              onTopicClick={() => onNavigate("home")}
            />
          )}

          {/* Order under Trending: recent transcribed videos, then the
              latest daily summary right below them, then Top 5. While
              the videos / summary fetches are pending we render a tiny
              skeleton (kicker + spinner card) so the layout doesn't
              jump when data arrives a few seconds later. */}
          {videosLoading ? (
            <SectionSpinner
              label={lang === "fr" ? "Vidéos transcrites · récentes" : "Recent transcribed videos"}
            />
          ) : (
            videos.length > 0 && (
              <VideosBriefingSection
                videos={videos}
                videoSummaries={videoSummaries}
                transcribing={transcribing}
                onTranscribe={handleTranscribe}
                lang={lang}
                ttsSpeed={ttsSpeed}
                ttsVoice={ttsVoice}
                favoriteUrls={favoriteUrls}
                onToggleFavorite={onToggleFavorite}
                isAuthenticated={isAuthenticated}
                onRequestAuth={onRequestAuth}
                onSeeAll={() => onNavigate("videos")}
              />
            )
          )}

          {summaryLoading ? (
            <SectionSpinner
              label={
                lang === "fr"
                  ? "Résumé du jour · chargement"
                  : "Daily summary · loading"
              }
            />
          ) : (
            latestSummary && (
              <DailySummaryTeaser
                route={latestSummary}
                lang={lang}
                locale={locale}
                topicLabels={topicLabels}
              />
            )
          )}

          {top5.length > 0 && (
            <Top5Section
              articles={top5}
              lang={lang}
              locale={locale}
              favoriteUrls={favoriteUrls}
              onToggleFavorite={onToggleFavorite}
              isAuthenticated={isAuthenticated}
              onRequestAuth={onRequestAuth}
              onSeeAll={() => onNavigate("topArticles")}
            />
          )}

          {Object.keys(yourTopicArticles).length > 0 && (
            <YourTopicsSection
              articlesByTopic={yourTopicArticles}
              topicLabels={topicLabels}
              lang={lang}
              favoriteUrls={favoriteUrls}
              onToggleFavorite={onToggleFavorite}
              isAuthenticated={isAuthenticated}
              onRequestAuth={onRequestAuth}
              onSeeAllForTopic={() => onNavigate("home")}
            />
          )}

          <RecentVideoPagesSection
            topicLabels={topicLabels}
            lang={lang}
          />

          <FooterCTAs
            lang={lang}
            isAuthenticated={isAuthenticated}
            onPersonalize={() => onNavigate("home")}
            onSummaries={() => onNavigate("summaries")}
            onVideos={() => onNavigate("videos")}
          />
        </>
      )}
    </div>
  );
}

/* ────────────────── Hero Story ─────────────────────── */

/**
 * Hero card on the briefing — wraps the headline link with a separate
 * favorite icon pinned to the bottom-right. The icon sits *outside*
 * the `<a>` (so a click on the star never triggers article navigation)
 * but inside the bordered card so it visually belongs to the story.
 */
function HeroStory({
  article,
  lang,
  isFavorite,
  isAuthenticated,
  onToggleFavorite,
  onRequestAuth,
}: {
  article: TopFeedArticle;
  lang: Lang;
  isFavorite: boolean;
  isAuthenticated: boolean;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string; sourceType?: "article" | "video" }) => void;
  onRequestAuth: () => void;
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold) }}>
        {lang === "fr" ? "Top story · maintenant" : "Top story · now"}
      </div>
      <div
        style={{
          ...card,
          display: "block",
          padding: "24px 24px 22px",
          borderColor: color.gold,
          background: "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
        }}
      >
        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", color: "inherit", display: "block" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <h2
              style={{
                fontFamily: "ui-serif, Georgia, serif",
                fontSize: "clamp(22px, 3.2vw, 32px)",
                lineHeight: 1.18,
                color: color.text,
                margin: 0,
                flex: 1,
                minWidth: 0,
                fontWeight: 400,
                letterSpacing: "-0.01em",
              }}
            >
              {article.title}
            </h2>
            <span style={{ flexShrink: 0 }}>
              <ScoreMeter score={article.score} width={72} />
            </span>
          </div>
          {article.snippet && (
            <p style={{ color: color.articleSnippet, fontSize: 15, marginTop: 12, marginBottom: 14, lineHeight: 1.55 }}>
              {article.snippet}
            </p>
          )}
        </a>
        {/* Action row. Source pill on the left, then a primary
            « Lire l'article / Read article » CTA grouped with the
            favorite star on the right. The CTA exists even though the
            whole title block above is already a clickable `<a>` —
            many users don't realize a borderless serif headline is
            tappable, and a borderless gold rectangle is a much louder
            « click here » affordance for the page's anchor card.
            `target="_blank"` matches the title link so both routes
            land in a new tab and never blow away the briefing. The
            CTA + favorite are wrapped in their own flex group with
            `flexShrink: 0` so the source pill (left, `flex: 1`)
            absorbs all the available width and ellipses gracefully on
            narrow viewports without ever pushing the CTA off-screen. */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginTop: article.snippet ? 0 : 14,
            flexWrap: "wrap",
          }}
        >
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: color.gold,
              fontSize: 13,
              fontFamily: "ui-monospace, Menlo, monospace",
              letterSpacing: "0.04em",
              textDecoration: "none",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {article.source.toUpperCase()}
            <span style={{ color: color.textMuted, marginLeft: 8 }}>· {relativeTime(article.pubDate, lang)}</span>
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={lang === "fr" ? "Lire l'article (nouvel onglet)" : "Read the article (new tab)"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                border: `1px solid ${color.gold}`,
                borderRadius: 6,
                background: "transparent",
                color: color.gold,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
                textDecoration: "none",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {lang === "fr" ? "Lire l'article →" : "Read article →"}
            </a>
            <FavoriteButton
              url={article.link}
              title={article.title}
              source={article.source}
              pubDate={article.pubDate}
              sourceType="article"
              isFavorite={isFavorite}
              lang={lang}
              onToggle={onToggleFavorite}
              onRequestAuth={onRequestAuth}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────── Top 5 Section ───────────────────── */

function Top5Section({
  articles,
  lang,
  locale,
  favoriteUrls,
  onToggleFavorite,
  isAuthenticated,
  onRequestAuth,
  onSeeAll,
}: {
  articles: TopFeedArticle[];
  lang: Lang;
  locale: string;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string }) => void;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
  onSeeAll: () => void;
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
        {lang === "fr" ? "Briefing du jour · top 5" : "Today's briefing · top 5"}
      </div>
      {articles.map((art, i) => (
        <div key={`${art.link}-${i}`} style={{ ...card, display: "block", padding: 16, marginBottom: 10 }}>
          <a href={art.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <span style={{ color: color.text, fontWeight: 500, fontSize: 16, lineHeight: 1.35, flex: 1, minWidth: 0 }}>
                {art.title}
              </span>
              <span style={{ flexShrink: 0 }}>
                <ScoreMeter score={art.score} />
              </span>
            </div>
            {art.snippet && (
              <p style={{ color: color.articleSnippet, fontSize: 13.5, marginTop: 6, marginBottom: 0, lineHeight: 1.5 }}>
                {art.snippet}
              </p>
            )}
          </a>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ color: color.gold, fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.04em" }}>
              {art.source.toUpperCase()}
              <span style={{ color: color.textMuted, marginLeft: 8 }}>· {relativeTime(art.pubDate, lang)}</span>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <FavoriteButton
                url={art.link}
                title={art.title}
                source={art.source}
                pubDate={art.pubDate}
                isFavorite={favoriteUrls.has(art.link)}
                lang={lang}
                onToggle={onToggleFavorite}
                onRequestAuth={onRequestAuth}
                isAuthenticated={isAuthenticated}
              />
              <CopyLinkButton url={art.link} />
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={onSeeAll} style={ctaLink}>
        {lang === "fr" ? "Voir le top 50 →" : "See the full top 50 →"}
      </button>
      {/* locale prop reserved for future timestamp formatting */}
      <span style={{ display: "none" }} aria-hidden>{locale}</span>
    </section>
  );
}

/* ────────────────── Daily Summary Teaser ────────────── */

function DailySummaryTeaser({
  route,
  lang,
  locale,
  topicLabels,
}: {
  route: SummaryRoute;
  lang: Lang;
  locale: string;
  topicLabels: TopicLabel[];
}) {
  const today = toISODate(new Date());
  const isToday = route.summary_date === today;
  const topic = topicLabels.find((tl) => tl.id === route.topic_id);
  const dateLabel = new Date(route.summary_date + "T00:00:00").toLocaleDateString(locale, {
    day: "numeric", month: "short", year: "numeric",
  });
  const href = `/${route.topic_id}/${route.summary_date}/${route.slug_keywords}`;

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
        {isToday
          ? (lang === "fr" ? "Résumé du jour" : "Today's daily summary")
          : (lang === "fr" ? "Résumé d'hier" : "Yesterday's daily summary")}
      </div>
      <a href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        <div style={{ ...card, display: "block", padding: 20 }}>
          <h3 style={{ color: color.text, margin: 0, fontSize: 20, fontFamily: "ui-serif, Georgia, serif", fontWeight: 400 }}>
            {topic?.label ?? route.topic_id}
            <span style={{ color: color.textMuted, fontSize: 14, marginLeft: 10, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.04em" }}>
              · {dateLabel}
            </span>
          </h3>
          <p style={{ color: color.articleSnippet, fontSize: 14, marginTop: 10, marginBottom: 14, lineHeight: 1.55 }}>
            {lang === "fr"
              ? "Résumé IA en bullet points avec sources, scoré sur les meilleurs articles du jour."
              : "AI bullet-point summary with sources, scored on the day's top articles."}
          </p>
          <span style={{ color: color.gold, fontSize: 13, fontWeight: 500 }}>
            {lang === "fr" ? "Lire le résumé complet →" : "Read full summary →"}
          </span>
        </div>
      </a>
    </section>
  );
}

/* ────────────────── Videos section ───────────────────── */

/**
 * Renders the briefing's transcribed-videos block using the same VideoCard
 * component as `/app/videos`, so the play button, summary toggle, audio
 * player and download menu behave identically across the two pages.
 */
function VideosBriefingSection({
  videos,
  videoSummaries,
  transcribing,
  onTranscribe,
  lang,
  ttsSpeed,
  ttsVoice,
  favoriteUrls,
  onToggleFavorite,
  isAuthenticated,
  onRequestAuth,
  onSeeAll,
}: {
  videos: VideoItem[];
  videoSummaries: Record<string, string>;
  transcribing: Record<string, boolean>;
  onTranscribe: (v: VideoItem) => void;
  lang: Lang;
  ttsSpeed: number;
  ttsVoice: string;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string; sourceType?: "article" | "video" }) => void;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
  onSeeAll: () => void;
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
        {lang === "fr" ? "Vidéos transcrites · récentes" : "Recent transcribed videos"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {videos.map((v) => (
          <VideoCard
            key={v.videoId}
            v={v}
            lang={lang}
            summaryMd={videoSummaries[v.videoId] ?? null}
            transcribing={!!transcribing[v.videoId]}
            onTranscribe={() => onTranscribe(v)}
            speed={ttsSpeed}
            voice={ttsVoice}
            isFavorite={favoriteUrls.has(v.link)}
            isAuthenticated={isAuthenticated}
            onToggleFavorite={onToggleFavorite}
            onRequestAuth={onRequestAuth}
          />
        ))}
      </div>
      <button type="button" onClick={onSeeAll} style={{ ...ctaLink, marginTop: 14 }}>
        {lang === "fr" ? "Toutes les vidéos →" : "All videos →"}
      </button>
    </section>
  );
}

/* ────────────────── Trending strip ──────────────────── */

function TrendingStrip({
  topics,
  lang,
  onTopicClick,
}: {
  topics: TrendingTopic[];
  lang: Lang;
  onTopicClick: (id: string) => void;
}) {
  const labelArticles = lang === "fr" ? "articles" : "articles";
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 10 }}>
        {lang === "fr" ? "Tendances · 6 dernières heures" : "Trending · last 6 hours"}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          // On narrow screens flex-wrap turns into a tidy stack of pills.
        }}
      >
        {topics.map((tp) => (
          <button
            key={tp.id}
            type="button"
            onClick={() => onTopicClick(tp.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${color.border}`,
              background: color.surface,
              color: color.text,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <span>{tp.label}</span>
            <span style={{ color: color.gold, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, fontWeight: 700 }}>
              {tp.count}
              <span style={{ color: color.textMuted, marginLeft: 4, fontWeight: 400 }}>
                {labelArticles}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ────────────────── Your Topics (logged-in) ─────────── */

function YourTopicsSection({
  articlesByTopic,
  topicLabels,
  lang,
  favoriteUrls,
  onToggleFavorite,
  isAuthenticated,
  onRequestAuth,
  onSeeAllForTopic,
}: {
  articlesByTopic: Record<string, MiniArticle[]>;
  topicLabels: TopicLabel[];
  lang: Lang;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string }) => void;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
  onSeeAllForTopic: (id: string) => void;
}) {
  const orderedIds = Object.keys(articlesByTopic);

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
        {lang === "fr" ? "Vos topics · 24 dernières heures" : "Your topics · last 24 hours"}
      </div>
      {orderedIds.map((tid) => {
        const articles = articlesByTopic[tid];
        if (!articles || articles.length === 0) return null;
        const topic = topicLabels.find((tl) => tl.id === tid);
        return (
          <div key={tid} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 12 }}>
              <h3 style={{ color: color.text, fontSize: 16, fontWeight: 600, margin: 0 }}>
                {topic?.label ?? tid}
              </h3>
              <button
                type="button"
                onClick={() => onSeeAllForTopic(tid)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: color.gold,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "inherit",
                }}
              >
                {lang === "fr" ? "Voir tous →" : "See all →"}
              </button>
            </div>
            {articles.map((art, i) => (
              <div key={`${art.link}-${i}`} style={{ ...card, display: "block", padding: 12, marginBottom: 8 }}>
                <a href={art.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ color: color.text, fontWeight: 500, fontSize: 14, lineHeight: 1.35, flex: 1, minWidth: 0 }}>
                      {art.title}
                    </span>
                    {art.score != null && (
                      <span style={{ flexShrink: 0 }}>
                        <ScoreMeter score={art.score} />
                      </span>
                    )}
                  </div>
                </a>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <span style={{ color: color.gold, fontSize: 11, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.04em" }}>
                    {art.source.toUpperCase()}
                    <span style={{ color: color.textMuted, marginLeft: 6 }}>· {relativeTime(art.pubDate, lang)}</span>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <FavoriteButton
                      url={art.link}
                      title={art.title}
                      source={art.source}
                      pubDate={art.pubDate}
                      isFavorite={favoriteUrls.has(art.link)}
                      lang={lang}
                      onToggle={onToggleFavorite}
                      onRequestAuth={onRequestAuth}
                      isAuthenticated={isAuthenticated}
                    />
                    <CopyLinkButton url={art.link} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

/* ────────────────── Recent video pages list ────────── */

/**
 * Bottom-of-page list of every transcribed video that has an SSR page.
 * Paginated one calendar day at a time (`?page=N`) — page 0 = today,
 * page 1 = yesterday, page 2 = the day before, etc. « Plus ancien »
 * walks backwards in time, « Plus récent » brings the user back
 * towards today. The « Plus ancien » button is disabled when the
 * server response says `hasMore: false`.
 *
 * On the first render we always render the section (even if today has
 * zero transcribed videos yet) as long as the server reports older
 * days exist — that way the user can still navigate back through the
 * archive. Only when both today AND the archive are empty do we hide
 * the section completely.
 *
 * Drives traffic to `/v/` pages from inside the SPA. Compact format:
 * date · topic pill · title link. Topic labels are looked up locally
 * from `topicLabels` so we don't add a second API roundtrip just to
 * humanize a slug.
 */
function RecentVideoPagesSection({
  topicLabels,
  lang,
}: {
  topicLabels: TopicLabel[];
  lang: Lang;
}) {
  const labelById = useMemo(
    () => new Map(topicLabels.map((t) => [t.id, t.label])),
    [topicLabels],
  );
  const locale = dateLocale(lang);

  const [page, setPage] = useState(0);
  const [data, setData] = useState<RecentVideoPagesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Refetch whenever page or lang changes. The `lang` reset to page=0
  // is handled by the `lang` reset effect below — preserving the page
  // when toggling FR ↔ EN feels surprising.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/video-pages/recent?page=${page}&lang=${lang}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: RecentVideoPagesResponse | null) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, lang]);

  // Reset to page 0 on lang switch — otherwise toggling EN/FR could
  // land the user on an empty page (different content cadence per lang).
  useEffect(() => {
    setPage(0);
  }, [lang]);

  // Group items by date for visual rhythm — same as the /briefings hub.
  const byDate = useMemo(() => {
    const map = new Map<string, RecentVideoPage[]>();
    for (const p of data?.items ?? []) {
      const arr = map.get(p.publishedDate) ?? [];
      arr.push(p);
      map.set(p.publishedDate, arr);
    }
    return map;
  }, [data]);
  const sortedDates = useMemo(
    () => [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1)),
    [byDate],
  );

  const items = data?.items ?? [];
  const hasMore = data?.hasMore ?? false;
  const fromDate = data?.fromDate;
  const toDate = data?.toDate;

  // Hide the section entirely only when we're on page 0, today has no
  // transcribed videos AND there's nothing in the archive either —
  // otherwise we keep the section rendered so the user can still walk
  // backwards through previous days using « Plus ancien ».
  if (page === 0 && !loading && items.length === 0 && !hasMore) return null;

  // Subtitle: a single day label (« 24 avr. ») since each page is
  // exactly one calendar day. We still call formatDateRange in case
  // PAGE_SIZE_DAYS is widened again in the future — it gracefully
  // collapses identical bounds to a single date.
  const subtitle = fromDate && toDate
    ? formatDateRange(fromDate, toDate, locale, lang)
    : "";

  const btnBase: CSSProperties = {
    background: "transparent",
    color: color.gold,
    border: `1px solid ${color.gold}`,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
  const btnDisabled: CSSProperties = {
    ...btnBase,
    opacity: 0.35,
    cursor: "not-allowed",
  };

  const onPrev = useCallback(() => {
    if (hasMore && !loading) setPage((p) => p + 1);
  }, [hasMore, loading]);
  const onNext = useCallback(() => {
    if (page > 0 && !loading) setPage((p) => Math.max(0, p - 1));
  }, [page, loading]);

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 12, flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ ...kicker(color.gold) }}>
          {lang === "fr" ? "Toutes les vidéos transcrites" : "All transcribed videos"}
        </div>
        {subtitle && (
          <div style={{ color: color.textMuted, fontSize: 12 }}>{subtitle}</div>
        )}
      </div>

      <div style={{ ...card, display: "block", padding: "12px 16px" }}>
        {loading ? (
          <div style={{ color: color.textMuted, fontSize: 13, textAlign: "center", padding: "16px 0" }}>
            {lang === "fr" ? "Chargement…" : "Loading…"}
          </div>
        ) : items.length === 0 ? (
          <div style={{ color: color.textMuted, fontSize: 13, textAlign: "center", padding: "16px 0" }}>
            {page === 0
              ? (lang === "fr"
                  ? "Aucune vidéo transcrite aujourd'hui pour le moment."
                  : "No transcribed videos yet today.")
              : (lang === "fr"
                  ? "Aucune vidéo transcrite ce jour-là."
                  : "No transcribed videos for this day.")}
          </div>
        ) : (
          sortedDates.map((date) => {
            const dayItems = byDate.get(date) ?? [];
            return (
              <div key={date} style={{ marginBottom: 12 }}>
                <div style={{
                  color: color.textMuted,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}>
                  {new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
                    weekday: "short", day: "numeric", month: "short",
                  })}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {dayItems.map((p) => (
                    <li key={p.videoId} style={{ marginBottom: 4 }}>
                      <a
                        href={`/${p.topicId}/v/${p.publishedDate}/${p.slug}`}
                        style={{ color: color.text, textDecoration: "none", fontSize: 14, lineHeight: 1.4 }}
                      >
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: color.gold,
                          border: `1px solid ${color.gold}`, borderRadius: 3,
                          padding: "1px 5px", marginRight: 8, letterSpacing: "0.03em",
                          textTransform: "uppercase",
                        }}>
                          {labelById.get(p.topicId) ?? p.topicId}
                        </span>
                        <span style={{ color: color.gold, marginRight: 6 }}>→</span>
                        {p.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination controls — always rendered (even at page 0 with one
          button disabled) so the user has a clear next step. */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 10,
      }}>
        <button
          type="button"
          onClick={onNext}
          disabled={page === 0 || loading}
          aria-label={lang === "fr" ? "Jours plus récents" : "More recent days"}
          style={page === 0 || loading ? btnDisabled : btnBase}
        >
          {lang === "fr" ? "← Plus récent" : "← Newer"}
        </button>
        <div style={{ color: color.textDim, fontSize: 11 }}>
          {lang === "fr" ? `Page ${page + 1}` : `Page ${page + 1}`}
        </div>
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasMore || loading}
          aria-label={lang === "fr" ? "Jours plus anciens" : "Older days"}
          style={!hasMore || loading ? btnDisabled : btnBase}
        >
          {lang === "fr" ? "Plus ancien →" : "Older →"}
        </button>
      </div>
    </section>
  );
}

/**
 * Format a [from, to] inclusive date range as a short, locale-aware
 * subtitle: « 23 – 24 avr. », « Apr 23 – 24 », or just « 24 avr. »
 * when both bounds collapse to the same day.
 */
function formatDateRange(fromDate: string, toDate: string, locale: string, lang: Lang): string {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const fmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (fromDate === toDate) {
    return to.toLocaleDateString(locale, fmt);
  }
  const fromStr = from.toLocaleDateString(locale, fmt);
  const toStr = to.toLocaleDateString(locale, fmt);
  return lang === "fr" ? `${fromStr} – ${toStr}` : `${fromStr} – ${toStr}`;
}

/* ────────────────── Footer CTA strip ────────────────── */

function FooterCTAs({
  lang,
  isAuthenticated,
  onPersonalize,
  onSummaries,
  onVideos,
}: {
  lang: Lang;
  isAuthenticated: boolean;
  onPersonalize: () => void;
  onSummaries: () => void;
  onVideos: () => void;
}) {
  const ctaBtn: CSSProperties = {
    padding: "10px 16px",
    border: `1px solid ${color.border}`,
    borderRadius: 6,
    background: "transparent",
    color: color.gold,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  };
  return (
    <section
      style={{
        marginTop: 16,
        paddingTop: 20,
        borderTop: `1px solid ${color.border}`,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      {isAuthenticated && (
        <button type="button" onClick={onPersonalize} style={ctaBtn}>
          {lang === "fr" ? "Personnaliser mes topics" : "Customize my topics"}
        </button>
      )}
      <button type="button" onClick={onSummaries} style={ctaBtn}>
        {lang === "fr" ? "Résumés quotidiens" : "Daily summaries"}
      </button>
      <button type="button" onClick={onVideos} style={ctaBtn}>
        {lang === "fr" ? "Toutes les vidéos" : "All videos"}
      </button>
    </section>
  );
}

/* ────────────────── Section spinner placeholder ──────
 *
 * Shown while a section's data is still being fetched. Keeps the kicker
 * (so the user can already see what's coming) and renders a small
 * centered spinner card underneath. Same outer marginBottom as the
 * other sections so the layout doesn't jump when the real content
 * replaces the placeholder.
 */
function SectionSpinner({ label }: { label: string }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>{label}</div>
      <div
        style={{
          ...card,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 16px",
          minHeight: 92,
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <span style={spinnerStyle(22)} aria-hidden />
      </div>
    </section>
  );
}

/* ────────────────── helpers ─────────────────────────── */

function kicker(c: string): CSSProperties {
  return {
    color: c,
    fontFamily: "ui-monospace, Menlo, monospace",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: 8,
  };
}

const ctaLink: CSSProperties = {
  background: "transparent",
  border: "none",
  color: color.gold,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
  textDecoration: "underline",
  marginTop: 6,
};

