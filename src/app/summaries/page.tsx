import type { Metadata } from "next";
import Link from "next/link";
import { getActiveTopics, getAllSummaryRoutes } from "@/lib/supabase";
import { color, font } from "@/lib/theme";
import { SummaryExplorer } from "@/app/components/SummaryExplorer";
import type { Lang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Daily AI News Summaries — 8news.ai",
  description:
    "Browse AI-generated daily news summaries by topic. Bitcoin, AI, crypto, conflict, robotics and more — analyzed by artificial intelligence every day.",
};

export default async function SummariesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang: Lang = rawLang === "fr" ? "fr" : "en";

  const [topics, routes] = await Promise.all([
    getActiveTopics(false),
    getAllSummaryRoutes(),
  ]);

  const enRoutes = routes.filter((r) => r.lang === (lang === "fr" ? "fr" : "en"));

  const recentByTopic = new Map<string, typeof enRoutes>();
  for (const r of enRoutes) {
    const arr = recentByTopic.get(r.topic_id) ?? [];
    if (arr.length < 5) arr.push(r);
    recentByTopic.set(r.topic_id, arr);
  }

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>
        <Link href="/" style={{ textDecoration: "none", display: "block", marginBottom: 20 }}>
          <img src="/logo-8news.png" alt="8news" style={{ height: 40, width: "auto", display: "block" }} />
          <p style={{ color: color.textMuted, fontSize: 14, marginTop: 6, marginBottom: 0 }}>
            {lang === "fr" ? "La tech décodée par l'IA" : "Tech decoded by AI"}
          </p>
        </Link>

        <nav style={{ fontSize: 13, marginBottom: 24 }}>
          <Link href="/" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
          <span style={{ color: color.textDim, margin: "0 8px" }}>/</span>
          <span style={{ color: color.textMuted }}>
            {lang === "fr" ? "Résumés quotidiens" : "Daily Summaries"}
          </span>
        </nav>

        <h1 style={{ color: color.gold, fontSize: 24, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
          {lang === "fr" ? "Résumés quotidiens IA" : "Daily AI News Summaries"}
        </h1>
        <p style={{ color: color.textMuted, fontSize: 15, marginTop: 0, marginBottom: 32, lineHeight: 1.5 }}>
          {lang === "fr"
            ? "Chaque jour, l'IA analyse les dernières actualités par sujet et génère un résumé avec les points clés et les articles pertinents."
            : "Every day, AI analyzes the latest news by topic and generates a summary with key points and relevant articles."}
        </p>

        {/* SSR topic grid with links — crawlable by Google */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
            {lang === "fr" ? "Topics" : "Topics"}
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
                  {recent.length > 0 && (
                    <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 0" }}>
                      {recent.map((r) => (
                        <li key={`${r.summary_date}-${r.lang}`} style={{ marginBottom: 4 }}>
                          <Link
                            href={`/${r.topic_id}/${r.summary_date}/${r.slug_keywords}?lang=${lang}`}
                            style={{ color: color.textSecondary, textDecoration: "none", fontSize: 13 }}
                          >
                            {r.summary_date}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {recent.length === 0 && (
                    <p style={{ color: color.textDim, fontSize: 12, margin: "6px 0 0 0" }}>
                      {lang === "fr" ? "Aucun résumé" : "No summaries yet"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Interactive explorer for users */}
        <section>
          <h2 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
            {lang === "fr" ? "Explorer un résumé" : "Browse a summary"}
          </h2>
          <SummaryExplorer lang={lang} />
        </section>

        <footer style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${color.border}`, textAlign: "center" }}>
          <Link href="/" style={{ color: color.gold, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            8news.ai
          </Link>
          <p style={{ color: color.textDim, fontSize: 12, marginTop: 4 }}>
            AI-powered daily news summaries
          </p>
        </footer>
      </div>
    </div>
  );
}
