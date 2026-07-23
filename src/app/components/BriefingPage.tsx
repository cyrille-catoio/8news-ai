"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { dateLocale, t } from "@/lib/i18n";
import { color } from "@/lib/theme";
import { HomeTop24hHero } from "@/app/components/HomeTop24hHero";
import type { TopicLabel } from "@/lib/types";
import type { AppNavPage } from "@/app/components/AppHeader";
import { SectionSpinner } from "@/app/components/briefing/SectionSpinner";
import { kicker } from "@/app/components/briefing/styles";
import { FooterCTAs } from "@/app/components/briefing/FooterCTAs";
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
  topicLabels,
  preferredTopicIds,
  preferredTopicId,
  onOpenChat,
}: {
  lang: Lang;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
  onNavigate: (page: AppNavPage) => void;
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

          {/* ─── 2 · Résumé quotidien topic (teaser) — moved up right
              below the Daily Podcast (v2.20.6+, was the second-to-last
              section) with a 2× longer excerpt (~10 lines). ──────────── */}
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

          {/* ─── Newsletter CTA — placed after the podcast + daily summary
              teaser so we ask for the email only once the reader has seen
              the day's value, not before. Self-hides for owners and
              already-subscribed users. (The « Today's Briefing · Top 5 »
              section that used to sit here was removed in v2.20.6+ along
              with its « N new since your visit » badge machinery — the
              full ranking lives on `/app/top-articles`.) */}
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

