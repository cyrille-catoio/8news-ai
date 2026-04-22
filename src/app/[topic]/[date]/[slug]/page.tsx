import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getDailySummaryBySlug, getDailySummary, getTopicById } from "@/lib/supabase";
import { color, font } from "@/lib/theme";
import type { ArticleSummary, SummaryBullet } from "@/lib/types";
import { DailySummaryArticles } from "@/app/components/DailySummaryArticles";
import { DailySummaryAudio } from "@/app/components/DailySummaryAudio";
import { SeoNavBar } from "@/app/components/SeoNavBar";
import { SeoGeneralMenu } from "@/app/components/GeneralMenu";
import type { Lang } from "@/lib/i18n";

interface PageProps {
  params: Promise<{ topic: string; date: string; slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

async function loadBySlug(topicId: string, date: string, slug: string) {
  const [topic, summary] = await Promise.all([
    getTopicById(topicId),
    getDailySummaryBySlug(topicId, date, slug),
  ]);
  return { topic, summary };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { topic: topicId, date, slug } = await params;
  const { topic, summary } = await loadBySlug(topicId, date, slug);

  if (!topic || !summary) return { title: "Not Found" };

  const lang = summary.lang as Lang;
  const topicLabel = lang === "fr" ? topic.label_fr : topic.label_en;
  const canonical = `https://8news.ai/${topicId}/${date}/${summary.slug_keywords}`;

  const altLang = lang === "fr" ? "en" : "fr";
  const altSummary = await getDailySummary(topicId, date, altLang);
  const altUrl = altSummary
    ? `https://8news.ai/${topicId}/${date}/${altSummary.slug_keywords}`
    : undefined;

  return {
    title: summary.seo_title,
    description: summary.seo_description,
    alternates: {
      canonical,
      languages: {
        [lang]: canonical,
        ...(altUrl ? { [altLang]: altUrl } : {}),
      },
    },
    openGraph: {
      title: summary.seo_title,
      description: summary.seo_description,
      type: "article",
      publishedTime: summary.period_to,
      section: topicLabel,
      siteName: "8news.ai",
    },
  };
}

export default async function DailySummaryPage({ params }: PageProps) {
  const { topic: topicId, date, slug } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const topic = await getTopicById(topicId);
  if (!topic) notFound();

  let summary = await getDailySummaryBySlug(topicId, date, slug);
  if (!summary) {
    // Fallback for stale/broken slugs: redirect to canonical slug for this topic/date.
    const [enSummary, frSummary] = await Promise.all([
      getDailySummary(topicId, date, "en"),
      getDailySummary(topicId, date, "fr"),
    ]);
    const canonical = enSummary ?? frSummary;
    if (canonical) {
      redirect(`/${topicId}/${date}/${canonical.slug_keywords}`);
    }
    notFound();
  }

  const lang = summary.lang as Lang;
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const topicLabel = lang === "fr" ? topic.label_fr : topic.label_en;
  const bullets = (summary.bullets as Array<{ text: string; refs: Array<{ title: string; link: string; source: string }> }>) ?? [];
  // The persisted JSON may carry a per-article `relevance_score` from the
  // articles table even though ArticleSummary's TS type doesn't expose it.
  // Surface it as `score` so DailySummaryArticles can render the ScoreMeter.
  const rawArticles = (summary.articles as Array<ArticleSummary & { relevance_score?: number | null; score?: number | null }>) ?? [];
  const articles = rawArticles.map((a) => ({ ...a, score: a.score ?? a.relevance_score ?? null }));
  const meta = summary.meta as { totalArticles?: number; scoredArticles?: number; analyzedArticles?: number } | null;

  const altLang = lang === "fr" ? "en" : "fr";
  const altSummary = await getDailySummary(topicId, date, altLang);

  const prevDate = new Date(new Date(date).getTime() - 86_400_000).toISOString().slice(0, 10);
  const nextDate = new Date(new Date(date).getTime() + 86_400_000).toISOString().slice(0, 10);
  const prevSummary = await getDailySummary(topicId, prevDate, lang);
  const nextSummary = await getDailySummary(topicId, nextDate, lang);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: summary.seo_h1 || summary.seo_title,
    description: summary.seo_description,
    datePublished: summary.period_to,
    dateModified: summary.created_at,
    author: { "@type": "Organization", name: "8news.ai" },
    publisher: { "@type": "Organization", name: "8news.ai", url: "https://8news.ai" },
    mainEntityOfPage: `https://8news.ai/${topicId}/${date}/${summary.slug_keywords}`,
  };

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <SeoNavBar
          lang={lang}
          altLangUrl={altSummary ? `/${topicId}/${date}/${altSummary.slug_keywords}` : undefined}
        />

        <SeoGeneralMenu lang={lang} />

        {/* Breadcrumb */}
        <nav style={{ display: "flex", gap: 16, fontSize: 13, marginBottom: 24, flexWrap: "wrap" }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
          <Link href="/summaries" style={{ color: color.gold, textDecoration: "none" }}>
            Summaries
          </Link>
          <a href={`/${topicId}`} style={{ color: color.gold, textDecoration: "none" }}>
            {topicLabel}
          </a>
          {prevSummary && (
            <a
              href={`/${topicId}/${prevDate}/${prevSummary.slug_keywords}`}
              style={{ color: color.textMuted, textDecoration: "none" }}
            >
              ← {lang === "fr" ? "Jour précédent" : "Previous day"}
            </a>
          )}
          {nextSummary && (
            <a
              href={`/${topicId}/${nextDate}/${nextSummary.slug_keywords}`}
              style={{ color: color.textMuted, textDecoration: "none" }}
            >
              {lang === "fr" ? "Jour suivant" : "Next day"} →
            </a>
          )}
        </nav>

        {/* Header */}
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ color: color.gold, fontSize: 24, fontWeight: 700, lineHeight: 1.3, marginBottom: 12, marginTop: 0 }}>
            {summary.seo_h1 || summary.seo_title}
          </h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: color.gold,
              border: `1px solid ${color.gold}`, borderRadius: 4,
              padding: "2px 8px", letterSpacing: "0.03em",
            }}>
              {topicLabel}
            </span>
            <span style={{ color: color.textMuted, fontSize: 13 }}>
              {new Date(date).toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>
          {meta && (
            <p style={{ color: color.textDim, fontSize: 12, marginTop: 8 }}>
              {meta.analyzedArticles ?? 0} {lang === "fr" ? "articles analysés par IA" : "articles analyzed by AI"}
              {meta.totalArticles ? ` / ${meta.totalArticles} total` : ""}
            </p>
          )}
        </header>

        {/* Bullets + Audio */}
        {bullets.length > 0 && (
          <section style={{
            background: color.surface, border: `1px solid ${color.border}`,
            borderRadius: 10, padding: "20px 24px", marginBottom: 24,
          }}>
            <h2 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 0, marginBottom: 16 }}>
              {lang === "fr" ? "Points clés" : "Key points"}
            </h2>
            <DailySummaryAudio bullets={bullets} lang={lang} topicName={topicLabel} date={date} />
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {bullets.map((b: SummaryBullet & { text: string; refs: Array<{ title: string; link: string; source: string }> }, i: number) => (
                <li key={i} style={{ marginBottom: 14, lineHeight: 1.55 }}>
                  <span style={{ color: color.gold, fontWeight: 700, marginRight: 8 }}>•</span>
                  <span style={{ color: color.text, fontSize: 15 }}>{b.text}</span>
                  {b.refs && b.refs.length > 0 && (
                    <span style={{ marginLeft: 6 }}>
                      {b.refs.map((ref, ri) => (
                        <a
                          key={ri}
                          href={ref.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={ref.title}
                          style={{ color: color.textDim, fontSize: 11, textDecoration: "none", marginLeft: 4 }}
                        >
                          [{ref.source}]
                        </a>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Relevant articles */}
        {articles.length > 0 && (
          <section>
            <h2 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
              {lang === "fr" ? "Articles pertinents" : "Relevant articles"}
            </h2>
            <DailySummaryArticles articles={articles} lang={lang} />
          </section>
        )}

        {/* Footer */}
        <footer style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${color.border}`, textAlign: "center" }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
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
