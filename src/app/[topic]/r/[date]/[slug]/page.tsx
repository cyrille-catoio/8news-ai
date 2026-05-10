import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  getVideoRoundupBySlug,
  getVideoRoundupAltLang,
  getRecentVideoRoundups,
  getVideoTranscriptionsByIds,
  getTopicById,
} from "@/lib/supabase";
import { color, font } from "@/lib/theme";
import { normalizeSummaryHeadings } from "@/lib/summary-headings";
import { SeoNavBar } from "@/app/components/SeoNavBar";
import { SeoGeneralMenu } from "@/app/components/GeneralMenu";
import { VideoRoundupAudio } from "@/app/components/VideoRoundupAudio";
import type { Lang } from "@/lib/i18n";

interface PageProps {
  params: Promise<{ topic: string; date: string; slug: string }>;
}

const mdComponents = {
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p style={{ color: color.textSecondary, fontSize: 16, lineHeight: 1.65, margin: "8px 0 18px" }} {...props}>{children}</p>
  ),
  strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
    <strong style={{ color: color.text, fontWeight: 700 }} {...props}>{children}</strong>
  ),
  // The briefing is serialized as a sequence of `### Title` blocks
  // followed by a body paragraph (see `bulletsToMarkdown` in
  // generate-video-roundup.ts). Style h3 as the bullet title — gold,
  // tight to the body that follows.
  h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
    <h3 style={{
      color: color.gold,
      fontSize: 17,
      fontWeight: 700,
      lineHeight: 1.35,
      margin: "20px 0 4px",
    }} {...props}>{children}</h3>
  ),
};

function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

/**
 * Strip the AI INTRO heading + bold/bullet markup down to a plain
 * 3-bullet preview for each video card. ~3 lines per card keeps the
 * page scannable.
 *
 * Post-`normalizeSummaryHeadings`, key-point titles are `### Title`
 * lines (promoted from the legacy `- **Title**` bullets — see the
 * `promoteBulletTitlesToHeadings` doc in `src/lib/summary-headings.ts`).
 * We also tolerate the legacy bullet form for older rows that haven't
 * been re-served through the promotion path (defensive, idempotent).
 */
function bulletsFromSummary(summaryMd: string, lang: Lang, count: number): string[] {
  const normalized = normalizeSummaryHeadings(summaryMd, lang);
  const lines = normalized.split("\n");
  const bullets: string[] = [];
  let inKeyPoints = false;
  for (const raw of lines) {
    if (/^##\s+(Points?\s+cl|Key\s+Points)/i.test(raw)) {
      inKeyPoints = true;
      continue;
    }
    if (inKeyPoints && /^##\s/.test(raw)) break;
    if (!inKeyPoints) continue;

    // Promoted form: `### Title`.
    const headingMatch = raw.match(/^###\s+(.+)$/);
    if (headingMatch) {
      const text = headingMatch[1].replace(/\*\*/g, "").trim();
      if (text) bullets.push(text);
      if (bullets.length >= count) break;
      continue;
    }

    // Legacy form: `- **Title** …` — kept for defense in depth.
    const bulletMatch = raw.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      const text = bulletMatch[1].replace(/\*\*/g, "").trim();
      if (text) bullets.push(text);
      if (bullets.length >= count) break;
    }
  }
  return bullets;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { topic, date, slug } = await params;
  if (!isValidDate(date)) return { title: "Not Found" };

  const [topicRow, roundup] = await Promise.all([
    getTopicById(topic),
    getVideoRoundupBySlug(topic, date, slug),
  ]);
  if (!topicRow || !roundup) return { title: "Not Found" };

  const lang = (roundup.lang === "fr" ? "fr" : "en") as Lang;
  const altLang = await getVideoRoundupAltLang(topic, date, lang);
  const canonical = `https://8news.ai/${topic}/r/${date}/${slug}`;
  const altUrl = altLang
    ? `https://8news.ai/${topic}/r/${date}/${altLang.slug_keywords}`
    : undefined;

  return {
    title: `${roundup.seo_title} · 8news.ai`,
    description: roundup.seo_description ?? undefined,
    alternates: {
      canonical,
      languages: {
        [lang]: canonical,
        ...(altUrl && altLang ? { [altLang.lang]: altUrl } : {}),
      },
    },
    openGraph: {
      title: roundup.seo_title,
      description: roundup.seo_description ?? undefined,
      type: "article",
      url: canonical,
      siteName: "8news.ai",
      publishedTime: `${date}T00:00:00Z`,
    },
    twitter: {
      card: "summary_large_image",
      title: roundup.seo_title,
      description: roundup.seo_description ?? undefined,
    },
  };
}

export default async function VideoRoundupPage({ params }: PageProps) {
  const { topic: topicId, date, slug } = await params;
  if (!isValidDate(date)) notFound();

  // 3 parallel reads: topic, roundup row, the matching transcribed
  // videos (the order in `video_ids` is editorial — we re-sort after
  // the SELECT to preserve it).
  const [topicRow, roundup] = await Promise.all([
    getTopicById(topicId),
    getVideoRoundupBySlug(topicId, date, slug),
  ]);
  if (!topicRow || !roundup) notFound();

  const lang = (roundup.lang === "fr" ? "fr" : "en") as Lang;
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const topicLabel = lang === "fr" ? topicRow.label_fr : topicRow.label_en;

  // Fetch videos by the EXACT id list persisted in the roundup, not by
  // (topic, date, lang) — the cron pulls a 48 h window so a roundup
  // keyed to date X may bundle videos with published_date = X-1.
  // Going through the IDs is the only way to faithfully render every
  // video the briefing references, regardless of window.
  const [videosRaw, recent, altLang] = await Promise.all([
    getVideoTranscriptionsByIds(roundup.video_ids, lang),
    getRecentVideoRoundups(topicId, lang, 3, date),
    getVideoRoundupAltLang(topicId, date, lang),
  ]);

  // Re-order videos to match the editorial order persisted in
  // roundup.video_ids. Items missing from the list (deleted upstream?)
  // are appended at the end as a defensive fallback.
  const orderIndex = new Map(roundup.video_ids.map((id, i) => [id, i]));
  const videos = [...videosRaw].sort((a, b) => {
    const ia = orderIndex.get(a.video_id) ?? 999;
    const ib = orderIndex.get(b.video_id) ?? 999;
    return ia - ib;
  });

  const altUrl = altLang ? `/${topicId}/r/${date}/${altLang.slug_keywords}` : undefined;
  const canonical = `https://8news.ai/${topicId}/r/${date}/${slug}`;

  // JSON-LD: CollectionPage describes the page itself, ItemList enumerates
  // the videos with their per-video SSR URLs (gives Google strong internal
  // signal between the roundup and its `/v/` children).
  const jsonLdCollection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: roundup.seo_title,
    description: roundup.seo_description ?? undefined,
    url: canonical,
    inLanguage: lang,
    publisher: { "@type": "Organization", name: "8news.ai", url: "https://8news.ai" },
  };
  const jsonLdItemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: videos.length,
    itemListElement: videos.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      // Per-video SSR page route is keyed on the video's own
      // published_date, not the roundup_date — the two diverge for
      // videos pulled from the previous calendar day.
      url: `https://8news.ai/${topicId}/v/${v.published_date ?? date}/${v.slug_keywords}`,
      name: v.title,
    })),
  };

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdCollection) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdItemList) }}
        />

        <SeoNavBar lang={lang} altLangUrl={altUrl} />
        <SeoGeneralMenu lang={lang} />

        <nav style={{ display: "flex", gap: 16, fontSize: 13, marginBottom: 24, flexWrap: "wrap" }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
          <Link href="/archives?type=videos" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Archives" : "Archives"}
          </Link>
          <a href={`/${topicId}`} style={{ color: color.gold, textDecoration: "none" }}>
            {topicLabel}
          </a>
        </nav>

        <header style={{ marginBottom: 24 }}>
          <h1 style={{ color: color.gold, fontSize: 26, fontWeight: 700, lineHeight: 1.3, marginBottom: 12, marginTop: 0 }}>
            {roundup.seo_title}
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
              {new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </span>
            <span style={{ color: color.textDim, fontSize: 12 }}>
              · {videos.length} {lang === "fr" ? "vidéos" : "videos"}
            </span>
          </div>
        </header>

        {/* AI-generated structured briefing (8 bullets, 3-5 sentences each).
            Stored as Markdown with ### headings — see `bulletsToMarkdown`
            in src/lib/generate-video-roundup.ts. */}
        <section style={{
          background: color.surface, border: `1px solid ${color.border}`,
          borderRadius: 10, padding: "20px 24px 24px", marginBottom: 28,
        }}>
          <h2 style={{
            color: color.gold, fontSize: 13, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginTop: 0, marginBottom: 8,
          }}>
            {lang === "fr" ? "Briefing" : "Briefing"}
          </h2>
          <VideoRoundupAudio
            introMd={roundup.intro_md}
            roundupTitle={roundup.seo_title}
            topicName={topicLabel}
            date={date}
            lang={lang}
          />
          <ReactMarkdown components={mdComponents}>{roundup.intro_md}</ReactMarkdown>
        </section>

        {/* Video cards: title + 3 bullets + link to per-video SSR page */}
        <section>
          <h2 style={{
            color: color.gold, fontSize: 13, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: 16,
          }}>
            {lang === "fr" ? "Vidéos couvertes" : "Videos covered"}
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {videos.map((v) => {
              const bullets = bulletsFromSummary(v.summary_md, lang, 3);
              const videoUrl = `/${topicId}/v/${v.published_date ?? date}/${v.slug_keywords}`;
              return (
                <li
                  key={v.video_id}
                  style={{
                    background: color.surface, border: `1px solid ${color.border}`,
                    borderRadius: 10, padding: "18px 20px", marginBottom: 14,
                  }}
                >
                  <a
                    href={videoUrl}
                    style={{ textDecoration: "none", color: "inherit", display: "block" }}
                  >
                    <h3 style={{ color: color.text, fontSize: 17, fontWeight: 600, lineHeight: 1.35, margin: 0 }}>
                      {v.title}
                    </h3>
                  </a>
                  {bullets.length > 0 && (
                    <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 12px" }}>
                      {bullets.map((b, i) => (
                        <li key={i} style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.5, marginBottom: 6 }}>
                          <span style={{ color: color.gold, fontWeight: 700, marginRight: 8 }}>•</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  <a
                    href={videoUrl}
                    style={{ color: color.gold, fontSize: 13, fontWeight: 500, textDecoration: "none" }}
                  >
                    {lang === "fr" ? "Lire l'article complet →" : "Read full article →"}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Previous roundups for the same topic */}
        {recent.length > 0 && (
          <section style={{ marginTop: 36 }}>
            <h2 style={{
              color: color.gold, fontSize: 13, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.08em",
              marginBottom: 12,
            }}>
              {lang === "fr" ? `Briefings précédents · ${topicLabel}` : `Previous briefings · ${topicLabel}`}
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recent.map((r) => (
                <li key={r.roundup_date} style={{ marginBottom: 10 }}>
                  <a
                    href={`/${topicId}/r/${r.roundup_date}/${r.slug_keywords}`}
                    style={{ color: color.text, textDecoration: "none", fontSize: 15 }}
                  >
                    <span style={{ color: color.gold, marginRight: 8 }}>→</span>
                    {r.seo_title}
                    <span style={{ color: color.textMuted, fontSize: 12, marginLeft: 8 }}>
                      · {new Date(`${r.roundup_date}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
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
