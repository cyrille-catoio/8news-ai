"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { dateLocale, t } from "@/lib/i18n";
import { color } from "@/lib/theme";
import { useTopFeed } from "@/hooks/useTopFeed";
import { HomeTop24hHero } from "@/app/components/HomeTop24hHero";
import type { TopicLabel } from "@/lib/types";
import type { AppNavPage } from "@/app/components/AppHeader";
import { SectionSpinner } from "@/app/components/briefing/SectionSpinner";
import { kicker } from "@/app/components/briefing/styles";
import { TrendingStrip, type TrendingTopic } from "@/app/components/briefing/TrendingStrip";
import { FooterCTAs } from "@/app/components/briefing/FooterCTAs";
import { Top5Section } from "@/app/components/briefing/Top5Section";
import { YourTopicsSection, type MiniArticle } from "@/app/components/briefing/YourTopicsSection";
import { selectTopicStrips } from "@/app/components/briefing/select-topic-strips";
import { NewsletterSignupPrompt } from "@/app/components/briefing/NewsletterSignupPrompt";
import { DailySummaryTeaser, type SummaryRoute } from "@/app/components/briefing/DailySummaryTeaser";
import { selectPreferredSummaryRoute } from "@/app/components/briefing/utils";
import { RecentVideoPagesSection } from "@/app/components/briefing/RecentVideoPagesSection";

export function BriefingPage({
  lang,
  isAuthenticated,
  onRequestAuth,
  onNavigate,
  onOpenTopicArticles,
  topicLabels,
  preferredTopicIds,
  preferredTopicId,
  onOpenChat,
}: {
  lang: Lang;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
  onNavigate: (page: AppNavPage) => void;
  onOpenTopicArticles: (topicId: string) => void;
  topicLabels: TopicLabel[];
  /** User's preferred topic IDs. null when not configured / anonymous. */
  preferredTopicIds: string[] | null;
  /** Single topic whose daily summary is surfaced on the home. null =
   *  automatic (most recent summary across topics). */
  preferredTopicId: string | null;
  /** Opens the Daily Podcast chat side panel (owned by the SPA shell).
   *  Used by the discovery hint under the podcast hero. */
  onOpenChat?: () => void;
}) {
  const locale = dateLocale(lang);

  // ─── « New since your last visit » ──────────────────────────────────
  // previousVisitAt = the most recent prior visit timestamp (ms).
  // Sourced from localStorage (per-device) and, for signed-in users,
  // from `user_activity` (cross-device) — we keep the most RECENT of the
  // two as the cutoff so we never over-count. On mount we read the prior
  // value, then bump it to now for the next visit. `null` on a first-ever
  // visit (no badge shown).
  const [previousVisitAt, setPreviousVisitAt] = useState<number | null>(null);
  useEffect(() => {
    let localPrev: number | null = null;
    try {
      const raw = window.localStorage.getItem("homeLastVisitAt");
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n)) localPrev = n;
      window.localStorage.setItem("homeLastVisitAt", String(Date.now()));
    } catch {
      /* storage disabled — DB path (if signed in) still works */
    }
    setPreviousVisitAt(localPrev);

    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/activity?type=home_visit", { cache: "no-store" });
        if (res.ok && !cancelled) {
          const json: { entries?: Array<{ last_clicked_at?: string }> } = await res.json();
          const iso = json.entries?.[0]?.last_clicked_at;
          const t = iso ? new Date(iso).getTime() : NaN;
          if (Number.isFinite(t)) {
            setPreviousVisitAt((cur) => (cur == null ? t : Math.max(cur, t)));
          }
        }
        // Bump the cross-device marker for next time (after reading it).
        await fetch("/api/user/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity_type: "home_visit", target_id: "home", action: "visit", value: 1 }),
        });
      } catch {
        /* best-effort — local cutoff already applies */
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // ─── Top feed (powers the Top 5 + the « N nouveaux » badge) ─────────
  // The TOP STORY / TOP VIDEO cards moved to the dedicated
  // `/app/top-stories` page (`TopStoriesPage.tsx`) along with their
  // fetch logic — the home only keeps this list-shaped feed.
  const { articles: topFeed } = useTopFeed({
    poll: false,
    lang,
    preferredTopics: null,
    enabled: true,
  });

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

  // Surface the user's preferred topic's daily summary when set; otherwise
  // fall back to the most recent summary across topics (guests / no pref /
  // preferred topic without a fresh summary).
  const latestSummary = useMemo(() => {
    return selectPreferredSummaryRoute(summaryRoutes, lang, preferredTopicId);
  }, [summaryRoutes, lang, preferredTopicId]);

  // ─── Trending topics (powered by /api/topics/trending) ──────────────
  const [trending, setTrending] = useState<TrendingTopic[]>([]);
  useEffect(() => {
    const params = new URLSearchParams({ since: "24h", lang, limit: "10" });
    if (preferredTopicIds && preferredTopicIds.length > 0) {
      params.set("topics", preferredTopicIds.join(","));
    }
    fetch(`/api/topics/trending?${params}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: TrendingTopic[]) => {
        setTrending(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setTrending([]));
  }, [lang, preferredTopicIds]);

  // ─── Recent SSR per-video pages ─────────────────────────────────────
  // The list itself owns its pagination state — see
  // `RecentVideoPagesSection`. Page size = 1 calendar day (today by
  // default), with « Plus ancien / Plus récent » buttons to walk
  // through history one day at a time.

  // ─── Per-preferred-topic mini strips (logged-in users) ──────────────
  // Selection (incl. cross-topic dedup by link, first-selected-wins) is
  // the pure `selectTopicStrips()` — see its header comment. The section
  // targets a stable 4 blocks: every preferred topic is a candidate (not
  // just the first 4), and when fewer than 4 blocks survive — a topic
  // with no article ≥ min-score in 24 h, or emptied by dedup — the
  // site's other topics serve as fill candidates, ranked by best
  // article score. Data comes from ONE call to `/api/news/strips`
  // covering preferred + fill topics (a single Supabase batch read, no
  // LLM) — the previous one-`/api/news`-call-per-topic pattern re-ran a
  // gpt-4.1-nano analysis per cold topic and took ~30 s to fill.
  const [yourTopicArticles, setYourTopicArticles] = useState<Record<string, MiniArticle[]>>({});
  useEffect(() => {
    if (!isAuthenticated || !preferredTopicIds || preferredTopicIds.length === 0) {
      setYourTopicArticles({});
      return;
    }
    let cancelled = false;
    const fillIds = topicLabels
      .map((tl) => tl.id)
      .filter((id) => !preferredTopicIds.includes(id));
    const allIds = [...preferredTopicIds, ...fillIds];

    fetch(`/api/news/strips?topics=${encodeURIComponent(allIds.join(","))}&lang=${lang}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { strips?: Record<string, MiniArticle[]> } | null) => {
        if (cancelled) return;
        setYourTopicArticles(
          selectTopicStrips({
            preferredIds: preferredTopicIds,
            fillIds,
            articlesByTopic: data?.strips ?? {},
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setYourTopicArticles({});
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, preferredTopicIds, lang, topicLabels]);

  // Top 5 — since the TOP STORY hero moved to `/app/top-stories`, there
  // is no hero on the home to dedup against anymore.
  const top5 = topFeed.slice(0, 5);

  // Count of top-feed stories published since the user's last visit —
  // drives the « N nouveaux » badge on the « À lire maintenant » header.
  const newSinceVisit =
    previousVisitAt == null
      ? 0
      : topFeed.filter((a) => {
          const t = new Date(a.pubDate).getTime();
          return Number.isFinite(t) && t > previousVisitAt;
        }).length;

  const showChooseTopics =
    isAuthenticated &&
    (!preferredTopicIds || preferredTopicIds.length === 0) &&
    Object.keys(yourTopicArticles).length === 0;

  return (
    <div>
      {/* Progressive render: every section below self-fetches and shows
          as soon as its own data lands — no full-page spinner gating the
          briefing on a secondary request. The TOP VIDEO / TOP STORY
          cards moved to `/app/top-stories` (TopStoriesPage). */}
      <>
          {/* ─── 1 · Podcast du jour (flagship) ──────────────────────
              Pre-computed daily AI briefing pinned at the very top.
              Self-fetches the latest snapshot so its loading / 404
              states stay isolated (a missing snapshot just hides the
              card). The « Lu » state is owned internally by the hero
              (DB-backed for authenticated users via `user_activity`,
              cookie list for anonymous visitors). */}
          <HomeTop24hHero lang={lang} onOpenChat={onOpenChat} />

          {/* ─── 2 · À lire maintenant : Top 5 puis Tendances 24h, empilés
              dans le flux de la page (plus de rail latéral). Les deux
              blocs partagent la présentation compacte « recent-video ». ─ */}
          {(top5.length > 0 || trending.length > 0) && (
            <section style={{ marginBottom: 36 }}>
              {top5.length > 0 && (
                <Top5Section
                  articles={top5}
                  lang={lang}
                  topicLabels={topicLabels}
                  newSinceVisit={newSinceVisit}
                  onSeeAll={() => onNavigate("topArticles")}
                />
              )}

              {trending.length > 0 && (
                <TrendingStrip
                  topics={trending}
                  lang={lang}
                  onTopicClick={onOpenTopicArticles}
                />
              )}
            </section>
          )}

          {/* ─── Newsletter CTA — placed after the Top 5 so we ask for the
              email only once the reader has seen the day's value (podcast,
              top 5, trending), not before. Self-hides for owners and
              already-subscribed users. */}
          <NewsletterSignupPrompt lang={lang} onRequestAuth={onRequestAuth} />

          {/* ─── 6 · Vos topics (personnalisé, remonté) ──────────────── */}
          {Object.keys(yourTopicArticles).length > 0 ? (
            <YourTopicsSection
              articlesByTopic={yourTopicArticles}
              topicLabels={topicLabels}
              lang={lang}
            />
          ) : (
            showChooseTopics && (
              <section style={{ marginBottom: 36 }}>
                <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
                  {t("homeChooseTopicsKicker", lang)}
                </div>
                <div
                  style={{
                    background: color.surface,
                    border: `1px solid ${color.border}`,
                    borderRadius: 10,
                    padding: 20,
                  }}
                >
                  <h3
                    style={{
                      color: color.text,
                      margin: 0,
                      fontSize: 20,
                      fontFamily: "ui-serif, Georgia, serif",
                      fontWeight: 400,
                    }}
                  >
                    {t("homeChooseTopicsTitle", lang)}
                  </h3>
                  <p
                    className="app-paragraph-lg"
                    style={{ color: color.articleSnippet, marginTop: 10, marginBottom: 16 }}
                  >
                    {t("homeChooseTopicsBody", lang)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate("settings")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: `1px solid ${color.gold}`,
                      background: "rgba(201,162,39,0.10)",
                      color: color.gold,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {t("homeChooseTopicsButton", lang)}
                  </button>
                </div>
              </section>
            )
          )}

          {/* ─── 7 · Toutes les vidéos transcrites (zone browse) ─────── */}
          <RecentVideoPagesSection
            topicLabels={topicLabels}
            lang={lang}
          />

          {/* ─── 8 · Résumé quotidien topic (teaser) ─────────────────── */}
          {summaryLoading ? (
            <SectionSpinner
              label={
                lang === "fr"
                  ? "Résumé quotidien topic · chargement"
                  : "Daily topic summary · loading"
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

          {/* ─── 9 · Footer CTAs ─────────────────────────────────────── */}
          <FooterCTAs
            lang={lang}
            isAuthenticated={isAuthenticated}
            onPersonalize={() => onNavigate("settings")}
            onSummaries={() => onNavigate("summaries")}
            onVideos={() => onNavigate("videos")}
          />
      </>
    </div>
  );
}

