import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getTopicById,
  listDailySummaries,
  getRecentVideoPagesForTopic,
  getRecentVideoRoundups,
  type DailySummaryRow,
} from "@/lib/supabase";
import { color, font } from "@/lib/theme";
import { SeoNavBar } from "@/app/components/SeoNavBar";
import { SeoGeneralMenu } from "@/app/components/GeneralMenu";
import { TopDayPage } from "@/app/components/TopDayPage";
import { resolveServerLang } from "@/lib/server-lang";
import { summaryPath } from "@/lib/summary-routes";

const PAGE_SIZE = 30;

/**
 * Date fork (v2.7.1+) — Next.js can't have two `/[seg]/` dynamic
 * routes at the same level, so URLs like `/2026-05-10` are routed
 * through the topic catch-all and intercepted here. When `params.topic`
 * matches `^\d{4}-\d{2}-\d{2}$` we hand off to `<TopDayPage>` (the
 * cross-topic Top 24h archive at the unified `/archives` hub). The
 * trade-off: a topic ID that happened to look like a date would be
 * shadowed — we reject those at create time in
 * [src/app/api/topics/route.ts](src/app/api/topics/route.ts) so this
 * is a hypothetical concern rather than an actual one.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface PageProps {
  params: Promise<{ topic: string }>;
  searchParams: Promise<{ lang?: string; page?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { topic: topicId } = await params;
  const { lang: rawLang } = await searchParams;
  const lang = await resolveServerLang(rawLang);

  // Top day archive metadata (date URL). We don't need to confirm
  // the snapshot exists here; the page itself 404s when missing.
  if (DATE_RE.test(topicId)) {
    const dateLabel = new Date(`${topicId}T00:00:00`).toLocaleDateString(
      lang === "fr" ? "fr-FR" : "en-US",
      { day: "numeric", month: "long", year: "numeric" },
    );
    const title =
      lang === "fr"
        ? `Top articles 24h · ${dateLabel} — 8news.ai`
        : `Top 24h articles · ${dateLabel} — 8news.ai`;
    const description =
      lang === "fr"
        ? `Résumé IA cross-topic du top 50 articles tech, IA, crypto pour le ${dateLabel}.`
        : `Cross-topic AI summary of the top 50 tech, AI, crypto articles for ${dateLabel}.`;
    return {
      title,
      description,
      alternates: {
        canonical: `https://8news.ai/${topicId}?lang=${lang}`,
        languages: {
          en: `https://8news.ai/${topicId}?lang=en`,
          fr: `https://8news.ai/${topicId}?lang=fr`,
        },
      },
    };
  }

  const topic = await getTopicById(topicId);
  if (!topic) return { title: "Not Found" };

  const topicLabel = lang === "fr" ? topic.label_fr : topic.label_en;
  return {
    title: `${topicLabel} — ${lang === "fr" ? "Résumés quotidiens IA" : "Daily AI News Summaries"} | 8news.ai`,
    description:
      lang === "fr"
        ? `Tous les résumés quotidiens IA pour ${topicLabel}. Actualités analysées par intelligence artificielle.`
        : `All daily AI news summaries for ${topicLabel}. News analyzed by artificial intelligence.`,
    alternates: {
      canonical: `https://8news.ai/${topicId}`,
      languages: {
        en: `https://8news.ai/${topicId}?lang=en`,
        fr: `https://8news.ai/${topicId}?lang=fr`,
      },
    },
  };
}

export default async function TopicHubPage({ params, searchParams }: PageProps) {
  const { topic: topicId } = await params;
  const { lang: rawLang, page: rawPage } = await searchParams;
  const lang = await resolveServerLang(rawLang);
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const page = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);

  // Date fork — see comment on DATE_RE above.
  if (DATE_RE.test(topicId)) {
    return <TopDayPage date={topicId} lang={lang} />;
  }

  const topic = await getTopicById(topicId);
  if (!topic) notFound();

  const topicLabel = lang === "fr" ? topic.label_fr : topic.label_en;
  const [{ rows, total }, recentVideos, recentRoundups] = await Promise.all([
    listDailySummaries(topicId, lang, page, PAGE_SIZE),
    // Show video coverage only on page 1 — keeps the rest of the
    // pagination clean and SEO-focused on article daily summaries.
    page === 1 ? getRecentVideoPagesForTopic(topicId, lang, 5) : Promise.resolve([]),
    page === 1 ? getRecentVideoRoundups(topicId, lang, 3) : Promise.resolve([]),
  ]);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>
        <SeoNavBar
          lang={lang}
          altLangUrl={`/${topicId}?lang=${lang === "fr" ? "en" : "fr"}`}
        />

        <SeoGeneralMenu lang={lang} />

        <nav style={{ fontSize: 13, marginBottom: 24 }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
          <span style={{ color: color.textDim, margin: "0 8px" }}>/</span>
          <Link href="/archives" style={{ color: color.gold, textDecoration: "none" }}>
            Archives
          </Link>
          <span style={{ color: color.textDim, margin: "0 8px" }}>/</span>
          <span style={{ color: color.textMuted }}>{topicLabel}</span>
        </nav>

        <h1 style={{ color: color.gold, fontSize: 22, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
          {topicLabel}
        </h1>
        <p style={{ color: color.textMuted, fontSize: 14, marginTop: 0, marginBottom: 24 }}>
          {lang === "fr" ? "Résumés quotidiens IA" : "Daily AI News Summaries"}
        </p>

        {/* Video coverage section — only on page 1. Lists the latest
            transcribed videos + briefings for this topic so SEO crawlers
            see the cross-links from the topic hub into both /v/ and /r/
            content. Anchor `#video-coverage` for cross-linking from
            the per-video pages' "Voir tous les briefings" CTA. */}
        {page === 1 && (recentVideos.length > 0 || recentRoundups.length > 0) && (
          <section
            id="video-coverage"
            style={{
              background: color.surface,
              border: `1px solid ${color.border}`,
              borderRadius: 10,
              padding: "16px 20px",
              marginBottom: 28,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                {lang === "fr" ? "Couverture vidéo" : "Video coverage"}
              </h2>
              <Link
                href={`/briefings?lang=${lang}`}
                style={{ color: color.gold, fontSize: 12, fontWeight: 500, textDecoration: "none" }}
              >
                {lang === "fr" ? "Tous les briefings →" : "All briefings →"}
              </Link>
            </div>

            {recentRoundups.length > 0 && (
              <div style={{ marginBottom: recentVideos.length > 0 ? 14 : 0 }}>
                <div style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  {lang === "fr" ? "Derniers briefings" : "Latest briefings"}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {recentRoundups.map((r) => (
                    <li key={`${r.roundup_date}-roundup`} style={{ marginBottom: 4 }}>
                      <a
                        href={`/${topicId}/r/${r.roundup_date}/${r.slug_keywords}`}
                        style={{ color: color.text, textDecoration: "none", fontSize: 14 }}
                      >
                        <span style={{ color: color.gold, marginRight: 6 }}>→</span>
                        {r.seo_title}
                        <span style={{ color: color.textMuted, fontSize: 12, marginLeft: 8 }}>
                          · {new Date(`${r.roundup_date}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recentVideos.length > 0 && (
              <div>
                <div style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  {lang === "fr" ? "Dernières vidéos transcrites" : "Latest transcribed videos"}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {recentVideos.map((v) => (
                    <li key={v.video_id} style={{ marginBottom: 4 }}>
                      <a
                        href={`/${topicId}/v/${v.published_date}/${v.slug_keywords}`}
                        style={{ color: color.text, textDecoration: "none", fontSize: 14 }}
                      >
                        <span style={{ color: color.gold, marginRight: 6 }}>→</span>
                        {v.title}
                        <span style={{ color: color.textMuted, fontSize: 12, marginLeft: 8 }}>
                          · {new Date(`${v.published_date}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {rows.length === 0 ? (
          <p style={{ color: color.textDim, fontSize: 15, textAlign: "center", padding: "40px 0" }}>
            {lang === "fr" ? "Aucun résumé disponible pour le moment." : "No summaries available yet."}
          </p>
        ) : (
          <div>
            {rows.map((row: DailySummaryRow) => {
              const bulletsArr = (row.bullets as Array<{ text: string }>) ?? [];
              const articlesArr = (row.articles as unknown[]) ?? [];
              return (
                <a
                  key={row.id}
                  href={summaryPath(row)}
                  style={{
                    display: "block",
                    background: color.surface,
                    border: `1px solid ${color.border}`,
                    borderRadius: 10,
                    padding: "16px 20px",
                    marginBottom: 12,
                    textDecoration: "none",
                    color: "inherit",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                    <h2 style={{ color: color.text, fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>
                      {row.seo_title}
                    </h2>
                    <span style={{ color: color.textDim, fontSize: 12, flexShrink: 0 }}>
                      {new Date(row.summary_date).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <p style={{ color: color.textMuted, fontSize: 13, marginTop: 6, marginBottom: 0 }}>
                    {bulletsArr.length} {lang === "fr" ? "points clés" : "key points"} · {articlesArr.length} articles
                  </p>
                </a>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 20 }}>
                {page > 1 && (
                  <a
                    href={`/${topicId}?lang=${lang}&page=${page - 1}`}
                    style={{ color: color.gold, textDecoration: "none", fontSize: 14, fontWeight: 600 }}
                  >
                    ← {lang === "fr" ? "Précédent" : "Previous"}
                  </a>
                )}
                <span style={{ color: color.textMuted, fontSize: 13 }}>
                  {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <a
                    href={`/${topicId}?lang=${lang}&page=${page + 1}`}
                    style={{ color: color.gold, textDecoration: "none", fontSize: 14, fontWeight: 600 }}
                  >
                    {lang === "fr" ? "Suivant" : "Next"} →
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        <footer style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${color.border}`, textAlign: "center" }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            8news.ai
          </Link>
        </footer>
      </div>
    </div>
  );
}
