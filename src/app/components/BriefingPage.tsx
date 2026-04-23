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
  // Dedicated /api/news/top-story query so the hero shows the freshest
  // 10/10 article from the last hour (with a built-in fallback ladder:
  // score=10/1h → ≥9/1h → 10/24h → ≥9/24h). The endpoint returns null
  // when nothing matches, in which case we fall back to topFeed[0] so
  // the hero never goes empty.
  const [heroStory, setHeroStory] = useState<TopFeedArticle | null>(null);
  const [heroLoading, setHeroLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setHeroLoading(true);
    fetch(`/api/news/top-story?lang=${lang}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { article: null }))
      .then((json: { article: TopFeedArticle | null }) => {
        if (!cancelled) setHeroStory(json.article ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHeroLoading(false);
      });
    return () => {
      cancelled = true;
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
          {heroArticle && <HeroStory article={heroArticle} lang={lang} />}

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

function HeroStory({ article, lang }: { article: TopFeedArticle; lang: Lang }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold) }}>
        {lang === "fr" ? "Top story · maintenant" : "Top story · now"}
      </div>
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
      >
        <div
          style={{
            ...card,
            display: "block",
            padding: "24px 24px 22px",
            borderColor: color.gold,
            background: "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
          }}
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
          <div style={{ color: color.gold, fontSize: 13, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.04em" }}>
            {article.source.toUpperCase()}
            <span style={{ color: color.textMuted, marginLeft: 8 }}>· {relativeTime(article.pubDate, lang)}</span>
          </div>
        </div>
      </a>
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

