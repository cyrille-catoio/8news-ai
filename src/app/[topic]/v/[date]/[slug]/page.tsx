import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  getVideoPageBySlug,
  getRecentVideoPagesForTopic,
  getVideoPageAltLang,
  getTopicById,
} from "@/lib/supabase";
import { color, font } from "@/lib/theme";
import { normalizeSummaryHeadings } from "@/lib/summary-headings";
import { SeoNavBar } from "@/app/components/SeoNavBar";
import { SeoGeneralMenu } from "@/app/components/GeneralMenu";
import { VideoPageAudio } from "@/app/components/VideoPageAudio";
import type { Lang } from "@/lib/i18n";

// react-markdown is imported directly for SSR — the SPA's VideosPage uses
// next/dynamic with ssr:false because it lives inside a Client Component,
// but here we want the Markdown rendered into the HTML the crawler sees.

interface PageProps {
  params: Promise<{ topic: string; date: string; slug: string }>;
}

/**
 * Markdown renderer overrides that match the dark-theme typography used
 * by the SPA's `VideosPage`. Same hierarchy + colors so the SSR page
 * feels native, not a separate experience.
 */
const mdComponents = {
  h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
    <h2 style={{ color: color.gold, fontSize: 18, fontWeight: 700, margin: "24px 0 10px" }} {...props}>{children}</h2>
  ),
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p style={{ color: color.textSecondary, fontSize: 15, lineHeight: 1.6, margin: "8px 0" }} {...props}>{children}</p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
    <ul style={{ paddingLeft: 22, margin: "8px 0" }} {...props}>{children}</ul>
  ),
  li: ({ children, ...props }: React.ComponentProps<"li">) => (
    <li style={{ color: color.textSecondary, fontSize: 15, lineHeight: 1.6, marginBottom: 10 }} {...props}>{children}</li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
    <strong style={{ color: color.text, fontWeight: 700 }} {...props}>{children}</strong>
  ),
};

/**
 * Strip Markdown markup down to a one-sentence description for the
 * `<meta name="description">` and OG description. Picks the first non-
 * heading sentence after the INTRO header.
 *
 * Caps at 160 chars (Google's effective description limit).
 */
function descriptionFromSummary(summaryMd: string): string {
  const stripped = summaryMd
    .replace(/^##\s+.+$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  const firstSentenceMatch = stripped.match(/^(.+?[.!?])(\s|$)/);
  const first = firstSentenceMatch ? firstSentenceMatch[1] : stripped;
  return first.length > 160 ? first.slice(0, 157).trimEnd() + "…" : first;
}

/** Format video duration `1234s` → `20:34`, single-digit minutes OK. */
function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** ISO 8601 duration for JSON-LD VideoObject (`PT1H2M3S`). */
function isoDuration(sec: number | null): string | undefined {
  if (!sec || sec <= 0) return undefined;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s ? `${s}S` : ""}` || `PT${sec}S`;
}

/**
 * Validate the date fragment of the URL. Same shape as the article
 * daily summary route — keeps invalid `/v/foo/bar/baz` from hitting
 * the DB.
 */
function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { topic, date, slug } = await params;
  if (!isValidDate(date)) return { title: "Not Found" };

  // Promise.all on the 3 reads we need for the head: topic label,
  // joined video+summary row, alt-lang slug for hreflang. Default #7.
  const [topicRow, page] = await Promise.all([
    getTopicById(topic),
    getVideoPageBySlug(topic, date, slug),
  ]);
  if (!topicRow || !page) return { title: "Not Found" };

  const lang = (page.lang === "fr" ? "fr" : "en") as Lang;
  const altLang = await getVideoPageAltLang(page.video_id, lang);
  const topicLabel = lang === "fr" ? topicRow.label_fr : topicRow.label_en;
  const canonical = `https://8news.ai/${topic}/v/${date}/${slug}`;
  const altUrl = altLang
    ? `https://8news.ai/${altLang.topic_id}/v/${altLang.published_date}/${altLang.slug_keywords}`
    : undefined;

  // À la volée title (default #5): "{Video title} · {Topic} · 8news.ai".
  const title = `${page.video?.title ?? page.title} · ${topicLabel} · 8news.ai`;
  const description = descriptionFromSummary(normalizeSummaryHeadings(page.summary_md, lang));

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        [lang]: canonical,
        ...(altUrl && altLang ? { [altLang.lang]: altUrl } : {}),
      },
    },
    openGraph: {
      title,
      description,
      type: "video.other",
      url: canonical,
      siteName: "8news.ai",
      ...(page.video?.thumbnail ? { images: [{ url: page.video.thumbnail }] } : {}),
      ...(page.video?.published ? { publishedTime: page.video.published } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(page.video?.thumbnail ? { images: [page.video.thumbnail] } : {}),
    },
  };
}

export default async function VideoSeoPage({ params }: PageProps) {
  const { topic: topicId, date, slug } = await params;
  if (!isValidDate(date)) notFound();

  // 4 parallel reads (default #7): topic, video+summary, recent same-
  // topic videos for the sidebar, alt-lang for hreflang.
  const [topicRow, page, recentRaw] = await Promise.all([
    getTopicById(topicId),
    getVideoPageBySlug(topicId, date, slug),
    // We don't know the lang yet; default to `en` for the recent list
    // and re-fetch in the matching lang if needed below. Cheaper than
    // doing two sequential round-trips (lang lookup → recent lookup).
    getRecentVideoPagesForTopic(topicId, "en", 3),
  ]);

  if (!topicRow || !page) notFound();

  const lang = (page.lang === "fr" ? "fr" : "en") as Lang;
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const topicLabel = lang === "fr" ? topicRow.label_fr : topicRow.label_en;

  // If the page lang is FR, swap the recent list for the FR version
  // (the parallel default fetched EN to overlap I/O with the main read).
  const recent = lang === "en"
    ? recentRaw.filter((r) => r.video_id !== page.video_id)
    : (await getRecentVideoPagesForTopic(topicId, "fr", 3, page.video_id));

  const altLang = await getVideoPageAltLang(page.video_id, lang);
  const altUrl = altLang
    ? `/${altLang.topic_id}/v/${altLang.published_date}/${altLang.slug_keywords}`
    : undefined;

  const summaryMd = normalizeSummaryHeadings(page.summary_md, lang);
  const transcript = (page.transcript ?? "").trim();
  const durationLabel = formatDuration(page.video?.duration_sec ?? null);

  // JSON-LD: VideoObject (rich snippet on Google) + Article (so the page
  // qualifies for News-style boxes too). Both schemas reference the
  // canonical URL, never YouTube — see default #4.
  const canonical = `https://8news.ai/${topicId}/v/${date}/${slug}`;
  const jsonLdVideo: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: page.video?.title ?? page.title,
    description: descriptionFromSummary(summaryMd),
    uploadDate: page.video?.published ?? `${date}T00:00:00Z`,
    contentUrl: page.video?.link ?? `https://www.youtube.com/watch?v=${page.video_id}`,
    embedUrl: `https://www.youtube.com/embed/${page.video_id}`,
    ...(page.video?.thumbnail ? { thumbnailUrl: page.video.thumbnail } : {}),
    ...(isoDuration(page.video?.duration_sec ?? null) ? { duration: isoDuration(page.video?.duration_sec ?? null) } : {}),
    publisher: { "@type": "Organization", name: "8news.ai", url: "https://8news.ai" },
  };
  const jsonLdArticle = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.video?.title ?? page.title,
    datePublished: page.video?.published ?? `${date}T00:00:00Z`,
    dateModified: page.created_at,
    author: { "@type": "Organization", name: "8news.ai" },
    publisher: { "@type": "Organization", name: "8news.ai", url: "https://8news.ai" },
    mainEntityOfPage: canonical,
  };

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdVideo) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdArticle) }}
        />

        <SeoNavBar lang={lang} altLangUrl={altUrl} />
        <SeoGeneralMenu lang={lang} />

        {/* Breadcrumb */}
        <nav style={{ display: "flex", gap: 16, fontSize: 13, marginBottom: 24, flexWrap: "wrap" }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
          <a href={`/${topicId}`} style={{ color: color.gold, textDecoration: "none" }}>
            {topicLabel}
          </a>
          <span style={{ color: color.textMuted }}>{lang === "fr" ? "Vidéos" : "Videos"}</span>
        </nav>

        {/* Header */}
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ color: color.gold, fontSize: 26, fontWeight: 700, lineHeight: 1.3, marginBottom: 12, marginTop: 0 }}>
            {page.video?.title ?? page.title}
          </h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: color.gold,
              border: `1px solid ${color.gold}`, borderRadius: 4,
              padding: "2px 8px", letterSpacing: "0.03em",
            }}>
              {topicLabel}
            </span>
            {page.video?.channel_title && (
              <span style={{ color: color.textSecondary, fontSize: 13, fontWeight: 500 }}>
                {page.video.channel_title}
              </span>
            )}
            <span style={{ color: color.textMuted, fontSize: 13 }}>
              {new Date(page.video?.published ?? `${date}T00:00:00Z`).toLocaleDateString(locale, {
                day: "numeric", month: "long", year: "numeric",
              })}
            </span>
            {durationLabel && (
              <span style={{ color: color.textMuted, fontSize: 13 }}>
                {durationLabel}
              </span>
            )}
          </div>
        </header>

        {/* YouTube embed (16:9) */}
        <div style={{
          aspectRatio: "16 / 9",
          background: "#0a0a0a",
          borderRadius: 10,
          overflow: "hidden",
          border: `1px solid ${color.border}`,
          marginBottom: 24,
        }}>
          <iframe
            src={`https://www.youtube.com/embed/${page.video_id}?rel=0&modestbranding=1`}
            title={page.video?.title ?? page.title}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* TTS audio player */}
        <VideoPageAudio
          summaryMd={summaryMd}
          videoTitle={page.video?.title ?? page.title}
          lang={lang}
        />

        {/* AI Summary (Markdown) */}
        <section style={{
          background: color.surface, border: `1px solid ${color.border}`,
          borderRadius: 10, padding: "20px 24px", marginBottom: 24,
        }}>
          <h2 style={{ color: color.gold, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 0, marginBottom: 8 }}>
            {lang === "fr" ? "Résumé IA" : "AI summary"}
          </h2>
          <ReactMarkdown components={mdComponents}>{summaryMd}</ReactMarkdown>
        </section>

        {/* Full transcript (collapsed by default — heavy in chars but
            keyword-rich for SEO crawlers, which see the content even
            inside <details>). */}
        {transcript && (
          <details style={{
            background: color.surface, border: `1px solid ${color.border}`,
            borderRadius: 10, padding: "16px 24px", marginBottom: 24,
          }}>
            <summary style={{
              color: color.gold, fontSize: 13, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.08em",
              cursor: "pointer", outline: "none",
            }}>
              {lang === "fr" ? "Transcription complète" : "Full transcript"}
            </summary>
            <p style={{
              color: color.textSecondary, fontSize: 14, lineHeight: 1.6,
              marginTop: 16, whiteSpace: "pre-wrap",
            }}>
              {transcript}
            </p>
          </details>
        )}

        {/* "Same topic" sidebar (rendered as a full block below the
            transcript on this layout — the maxWidth 916 column is too
            narrow for a true sidebar). */}
        {recent.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={{
              color: color.gold, fontSize: 13, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.08em",
              marginBottom: 12,
            }}>
              {lang === "fr" ? `Sur le même sujet : ${topicLabel}` : `More from ${topicLabel}`}
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recent.map((r) => (
                <li key={r.video_id} style={{ marginBottom: 10 }}>
                  <a
                    href={`/${topicId}/v/${r.published_date}/${r.slug_keywords}`}
                    style={{ color: color.text, textDecoration: "none", fontSize: 15 }}
                  >
                    <span style={{ color: color.gold, marginRight: 8 }}>→</span>
                    {r.title}
                    <span style={{ color: color.textMuted, fontSize: 12, marginLeft: 8 }}>
                      · {new Date(r.published_date).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer (inherits the layout's footer — this one is just a
            small wordmark like the other SSR pages). */}
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
