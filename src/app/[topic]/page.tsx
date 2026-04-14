import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getTopicById, listDailySummaries, type DailySummaryRow } from "@/lib/supabase";
import { color, font } from "@/lib/theme";

const PAGE_SIZE = 30;

interface PageProps {
  params: Promise<{ topic: string }>;
  searchParams: Promise<{ lang?: string; page?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { topic: topicId } = await params;
  const { lang: rawLang } = await searchParams;
  const lang = rawLang === "fr" ? "fr" : "en";
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
  const lang = rawLang === "fr" ? "fr" : "en";
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const page = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);

  const topic = await getTopicById(topicId);
  if (!topic) notFound();

  const topicLabel = lang === "fr" ? topic.label_fr : topic.label_en;
  const { rows, total } = await listDailySummaries(topicId, lang, page, PAGE_SIZE);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>
        <nav style={{ fontSize: 13, marginBottom: 24 }}>
          <Link href="/" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
          <span style={{ color: color.textDim, margin: "0 8px" }}>/</span>
          <span style={{ color: color.textMuted }}>{topicLabel}</span>
          {lang === "en" ? (
            <a href={`/${topicId}?lang=fr`} style={{ color: color.textDim, textDecoration: "none", marginLeft: "auto", float: "right" }}>FR</a>
          ) : (
            <a href={`/${topicId}?lang=en`} style={{ color: color.textDim, textDecoration: "none", marginLeft: "auto", float: "right" }}>EN</a>
          )}
        </nav>

        <h1 style={{ color: color.gold, fontSize: 22, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
          {topicLabel}
        </h1>
        <p style={{ color: color.textMuted, fontSize: 14, marginTop: 0, marginBottom: 24 }}>
          {lang === "fr" ? "Résumés quotidiens IA" : "Daily AI News Summaries"}
        </p>

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
                  href={`/${topicId}/${row.summary_date}/${row.slug_keywords}?lang=${lang}`}
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
          <Link href="/" style={{ color: color.gold, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            8news.ai
          </Link>
        </footer>
      </div>
    </div>
  );
}
