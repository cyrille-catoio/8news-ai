import type { Metadata } from "next";
import Link from "next/link";
import { getActiveTopics, getAllVideoRoundupRoutes } from "@/lib/supabase";
import { color, font } from "@/lib/theme";
import { SeoNavBar } from "@/app/components/SeoNavBar";
import { SeoGeneralMenu } from "@/app/components/GeneralMenu";
import type { Lang } from "@/lib/i18n";

/**
 * /briefings — public SSR hub that lists every video roundup grouped
 * by date desc. Pattern aligned with /summaries.
 *
 * URL is intentionally `/briefings` (no "video" — see plan "Décisions
 * actées"). Forward-compatible if we add other types of briefings later.
 */

export const metadata: Metadata = {
  title: "Video Briefings — 8news.ai",
  description:
    "Daily video roundups: every YouTube channel transcribed and summarized by AI, regrouped per topic and per day. Bitcoin, AI, crypto, robotics and more.",
};

interface PageProps {
  searchParams: Promise<{ lang?: string }>;
}

export default async function BriefingsPage({ searchParams }: PageProps) {
  const { lang: rawLang } = await searchParams;
  const lang: Lang = rawLang === "fr" ? "fr" : "en";

  // Two parallel reads: active topic labels + all roundup routes from
  // the last 90 days (capped by SITEMAP_RECENT_DAYS in supabase.ts).
  const [topics, allRoutes] = await Promise.all([
    getActiveTopics(false),
    getAllVideoRoundupRoutes(),
  ]);

  // Filter to the visitor's lang and group by date for the chronological
  // hero list. Topic labels are looked up per-row.
  const langRoutes = allRoutes.filter((r) => r.lang === lang);
  const topicLabel = new Map(topics.map((t) => [t.id, lang === "fr" ? t.label_fr : t.label_en]));

  const byDate = new Map<string, typeof langRoutes>();
  for (const r of langRoutes) {
    const arr = byDate.get(r.roundup_date) ?? [];
    arr.push(r);
    byDate.set(r.roundup_date, arr);
  }
  const sortedDates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1));

  // Per-topic grouping for the topic grid below ("how many roundups per
  // topic + last date").
  const recentByTopic = new Map<string, typeof langRoutes>();
  for (const r of langRoutes) {
    const arr = recentByTopic.get(r.topic_id) ?? [];
    if (arr.length < 5) arr.push(r);
    recentByTopic.set(r.topic_id, arr);
  }

  const locale = lang === "fr" ? "fr-FR" : "en-US";

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>
        <SeoNavBar
          lang={lang}
          altLangUrl={`/briefings?lang=${lang === "fr" ? "en" : "fr"}`}
        />

        <SeoGeneralMenu lang={lang} activePage="videoBriefings" />

        <nav style={{ fontSize: 13, marginBottom: 24 }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
          <span style={{ color: color.textDim, margin: "0 8px" }}>/</span>
          <span style={{ color: color.textMuted }}>
            {lang === "fr" ? "Briefings vidéo" : "Video briefings"}
          </span>
        </nav>

        <h1 style={{ color: color.gold, fontSize: 24, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
          {lang === "fr" ? "Briefings vidéo quotidiens" : "Daily Video Briefings"}
        </h1>
        <p style={{ color: color.textMuted, fontSize: 15, marginTop: 0, marginBottom: 32, lineHeight: 1.5 }}>
          {lang === "fr"
            ? "Chaque jour, l'IA agrège les vidéos YouTube transcrites par topic et publie un briefing avec les points clés — Bitcoin, IA, crypto, robotique, etc."
            : "Every day, AI aggregates the YouTube videos transcribed per topic and publishes a briefing with the key points — Bitcoin, AI, crypto, robotics, and more."}
        </p>

        {/* Chronological feed */}
        {sortedDates.length === 0 ? (
          <p style={{ color: color.textMuted, fontSize: 14, padding: "24px 0" }}>
            {lang === "fr"
              ? "Aucun briefing pour l'instant — revenez bientôt."
              : "No briefings yet — check back soon."}
          </p>
        ) : (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
              {lang === "fr" ? "Derniers briefings" : "Latest briefings"}
            </h2>
            {sortedDates.map((date) => {
              const dayItems = byDate.get(date) ?? [];
              return (
                <div key={date} style={{ marginBottom: 24 }}>
                  <h3 style={{ color: color.text, fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>
                    {new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
                      weekday: "long", day: "numeric", month: "long", year: "numeric",
                    })}
                  </h3>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {dayItems.map((r) => (
                      <li key={`${r.topic_id}-${r.lang}`} style={{ marginBottom: 6 }}>
                        <Link
                          href={`/${r.topic_id}/r/${r.roundup_date}/${r.slug_keywords}`}
                          style={{ color: color.text, textDecoration: "none", fontSize: 14 }}
                        >
                          <span style={{ color: color.gold, marginRight: 8 }}>→</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: color.gold,
                            border: `1px solid ${color.gold}`, borderRadius: 3,
                            padding: "1px 6px", marginRight: 8, letterSpacing: "0.03em",
                          }}>
                            {topicLabel.get(r.topic_id) ?? r.topic_id}
                          </span>
                          {r.slug_keywords.replace(/-/g, " ")}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        )}

        {/* Per-topic grid for browsing */}
        {topics.length > 0 && (
          <section>
            <h2 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
              {lang === "fr" ? "Par sujet" : "By topic"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {topics.map((tp) => {
                const label = lang === "fr" ? tp.label_fr : tp.label_en;
                const recent = recentByTopic.get(tp.id) ?? [];
                return (
                  <div
                    key={tp.id}
                    style={{
                      background: color.surface,
                      border: `1px solid ${color.border}`,
                      borderRadius: 10,
                      padding: "16px 20px",
                    }}
                  >
                    <Link
                      href={`/${tp.id}?lang=${lang}`}
                      style={{ color: color.gold, textDecoration: "none", fontSize: 16, fontWeight: 600 }}
                    >
                      {label}
                    </Link>
                    {recent.length > 0 ? (
                      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 0" }}>
                        {recent.map((r) => (
                          <li key={`${r.roundup_date}-${r.lang}`} style={{ marginBottom: 4 }}>
                            <Link
                              href={`/${r.topic_id}/r/${r.roundup_date}/${r.slug_keywords}`}
                              style={{ color: color.textSecondary, textDecoration: "none", fontSize: 13 }}
                            >
                              {r.roundup_date}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ color: color.textDim, fontSize: 12, margin: "6px 0 0 0" }}>
                        {lang === "fr" ? "Aucun briefing" : "No briefings yet"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${color.border}`, textAlign: "center" }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
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
