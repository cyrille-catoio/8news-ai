import type { Metadata } from "next";
import Link from "next/link";
import { getActiveTopics, getArchives } from "@/lib/supabase";
import { color, font } from "@/lib/theme";
import { SeoNavBar } from "@/app/components/SeoNavBar";
import { SeoGeneralMenu } from "@/app/components/GeneralMenu";
import { ArchivesPage } from "@/app/components/ArchivesPage";
import { resolveServerLang } from "@/lib/server-lang";
import type { TopicItem } from "@/lib/types";

/**
 * /archives — unified hub (v2.7.0+) that supersedes the previously
 * parallel /summaries (article daily summaries) and /briefings (video
 * roundups) hubs. The single timeline groups everything by date,
 * descending, so a visitor can answer « what happened on this day? »
 * in one place across topics and media.
 *
 * Why merge:
 *  - Two parallel hubs ("/summaries", "/briefings") had identical
 *    structure (per-topic per-day) but answered the same product
 *    question with two different navigations.
 *  - SEO authority was diluted across two URLs that crawled the same
 *    90-day window of dated content.
 *  - The product owner wanted "which topic had what coverage on day X"
 *    answered in a single mental model.
 *
 * The legacy /summaries and /briefings routes 308-redirect here (see
 * `src/app/summaries/page.tsx` and `src/app/briefings/page.tsx`) — the
 * sitemap is updated to advertise /archives only, but every per-item
 * SSR URL (/en|fr/[topic]/[date]/[slug] for articles,
 * /[topic]/r/[date]/[slug] for video roundups, /[topic]/v/... for
 * per-video pages) is preserved as-is.
 */

export const metadata: Metadata = {
  title: "Archives — 8news.ai",
  description:
    "Daily AI-powered archives: every article daily summary, every video roundup, every transcribed video, grouped by date and by topic. Bitcoin, AI, crypto, robotics and more.",
};

const PAGE_DAYS = 7;
const DAY_MS = 86_400_000;

export default async function ArchivesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = await resolveServerLang(rawLang);
  const safeLang = lang === "fr" ? "fr" : "en";

  // Default window for the SSR pre-render: last 7 days ending today.
  // The client hydrates and the user can shift via the [Older|Newer]
  // pager — that round-trips back to the API, the SSR snapshot is
  // only the initial paint.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = new Date(today.getTime() - (PAGE_DAYS - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  const [topicsRaw, initialData] = await Promise.all([
    getActiveTopics(false),
    getArchives({ from, to, lang: safeLang, type: "all" }),
  ]);

  // Map TopicRow → TopicItem so the props match the SPA `<ArchivesPage>`
  // signature (the SPA already consumes the camelCase shape).
  const topics: TopicItem[] = topicsRaw.map((tp, i) => ({
    id: tp.id,
    labelEn: tp.label_en,
    labelFr: tp.label_fr,
    feedCount: tp.feed_count ?? 0,
    isActive: tp.is_active,
    isDisplayed: tp.is_displayed ?? true,
    sortOrder: tp.sort_order ?? i,
    categoryId: tp.category_id ?? null,
    categoryLabel:
      (lang === "fr" ? tp.category_label_fr : tp.category_label_en) ?? undefined,
  }));

  return (
    <div
      style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}
    >
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>
        <SeoNavBar
          lang={safeLang}
          altLangUrl={`/archives?lang=${safeLang === "fr" ? "en" : "fr"}`}
        />

        <SeoGeneralMenu lang={safeLang} activePage="summaries" />

        <nav style={{ fontSize: 13, marginBottom: 24 }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
          <span style={{ color: color.textDim, margin: "0 8px" }}>/</span>
          <span style={{ color: color.textMuted }}>
            {lang === "fr" ? "Archives" : "Archives"}
          </span>
        </nav>

        <h1
          style={{
            color: color.gold,
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 8,
            marginTop: 0,
          }}
        >
          {lang === "fr" ? "Archives" : "Archives"}
        </h1>
        <p
          style={{
            color: color.textMuted,
            fontSize: 15,
            marginTop: 0,
            marginBottom: 32,
            lineHeight: 1.5,
          }}
        >
          {lang === "fr"
            ? "Toutes les couvertures du jour par topic — résumé articles, recap vidéo et vidéos transcrites — réunies sur une seule chronologie."
            : "Every day's coverage per topic — article summary, video recap and transcribed videos — gathered on a single timeline."}
        </p>

        <ArchivesPage lang={safeLang} topics={topics} initialData={initialData} />

        <footer
          style={{
            marginTop: 40,
            paddingTop: 20,
            borderTop: `1px solid ${color.border}`,
            textAlign: "center",
          }}
        >
          <Link
            href="/app"
            style={{ color: color.gold, textDecoration: "none", fontSize: 14, fontWeight: 600 }}
          >
            8news.ai
          </Link>
          <p style={{ color: color.textDim, fontSize: 12, marginTop: 4 }}>
            {lang === "fr" ? "Veille tech décodée par IA" : "Tech intelligence decoded by AI"}
          </p>
        </footer>
      </div>
    </div>
  );
}
