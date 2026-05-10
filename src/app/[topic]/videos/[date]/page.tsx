import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getActiveTopics,
  getTopicById,
  getVideoPagesForTopicDate,
} from "@/lib/supabase";
import { color, font } from "@/lib/theme";
import { SeoNavBar } from "@/app/components/SeoNavBar";
import { SeoGeneralMenu } from "@/app/components/GeneralMenu";
import { ScoreMeter } from "@/app/components/ScoreMeter";
import { resolveServerLang } from "@/lib/server-lang";
import { dateLocale } from "@/lib/i18n";

/**
 * /[topic]/videos/[date] — drill-down from the unified `/archives` hub
 * (v2.7.0+). Lists every transcribed video for one (topic, date)
 * tuple, in the visitor's lang. Reached when the archives timeline
 * shows « N transcribed videos » under a topic row and the visitor
 * clicks through.
 *
 * Why this page exists
 * --------------------
 * The archives timeline collapses every transcribed video to a single
 * counter per (topic, date) — the cardinality (often 5-15 videos per
 * topic per day) would otherwise drown the editorial signal of the
 * daily summary + roundup slots. This drill-down is the only place
 * where the full per-day list lives, ordered by `created_at desc`
 * (i.e. transcription order, which roughly matches publication time).
 *
 * SSR-only, deterministic — no client interactivity, the AI summary
 * lives one click away on the existing `/[topic]/v/[date]/[slug]`
 * route. Each row links there.
 */

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface PageProps {
  params: Promise<{ topic: string; date: string }>;
  searchParams: Promise<{ lang?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { topic, date } = await params;
  const { lang: rawLang } = await searchParams;
  const lang = await resolveServerLang(rawLang);
  const safeLang = lang === "fr" ? "fr" : "en";

  if (!VALID_DATE.test(date)) return { title: "Not Found" };

  const topicRow = await getTopicById(topic);
  if (!topicRow) return { title: "Not Found" };

  const label = safeLang === "fr" ? topicRow.label_fr : topicRow.label_en;
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(
    dateLocale(safeLang),
    { day: "numeric", month: "long", year: "numeric" },
  );

  const title =
    safeLang === "fr"
      ? `Vidéos transcrites · ${label} · ${dateLabel} — 8news.ai`
      : `Transcribed videos · ${label} · ${dateLabel} — 8news.ai`;
  const description =
    safeLang === "fr"
      ? `Toutes les vidéos YouTube transcrites et résumées par IA pour le topic ${label} le ${dateLabel}.`
      : `All YouTube videos transcribed and summarized by AI for the ${label} topic on ${dateLabel}.`;

  const altLang = safeLang === "fr" ? "en" : "fr";

  return {
    title,
    description,
    alternates: {
      canonical: `https://8news.ai/${topic}/videos/${date}?lang=${safeLang}`,
      languages: {
        [safeLang]: `https://8news.ai/${topic}/videos/${date}?lang=${safeLang}`,
        [altLang]: `https://8news.ai/${topic}/videos/${date}?lang=${altLang}`,
      },
    },
  };
}

export default async function TopicVideosForDatePage({ params, searchParams }: PageProps) {
  const { topic, date } = await params;
  const { lang: rawLang } = await searchParams;
  const lang = await resolveServerLang(rawLang);
  const safeLang = lang === "fr" ? "fr" : "en";

  if (!VALID_DATE.test(date)) notFound();

  const [topicRow, videos, topics] = await Promise.all([
    getTopicById(topic),
    getVideoPagesForTopicDate(topic, date, safeLang),
    getActiveTopics(false),
  ]);

  if (!topicRow) notFound();
  // We don't 404 on empty `videos`. A topic that just had no transcribed
  // video on this date is a legitimate state (the visitor came from a
  // dated link in the archives index that may have stale data); we'd
  // rather render an empty-state page that can be linked to than
  // hand back a hard 404.

  // Topics dropdown is only used to render the breadcrumb topic chip
  // — kept for visual consistency with the archives hub. Actual list
  // sourced from `topicRow`.
  void topics;

  const label = safeLang === "fr" ? topicRow.label_fr : topicRow.label_en;
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(
    dateLocale(safeLang),
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  );

  return (
    <div
      style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}
    >
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "40px 20px" }}>
        <SeoNavBar
          lang={safeLang}
          altLangUrl={`/${topic}/videos/${date}?lang=${safeLang === "fr" ? "en" : "fr"}`}
        />
        <SeoGeneralMenu lang={safeLang} activePage="summaries" />

        <nav style={{ fontSize: 13, marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none" }}>
            {safeLang === "fr" ? "Accueil" : "Home"}
          </Link>
          <span style={{ color: color.textDim }}>/</span>
          <Link href={`/archives?lang=${safeLang}`} style={{ color: color.gold, textDecoration: "none" }}>
            {safeLang === "fr" ? "Archives" : "Archives"}
          </Link>
          <span style={{ color: color.textDim }}>/</span>
          <Link href={`/${topic}?lang=${safeLang}`} style={{ color: color.gold, textDecoration: "none" }}>
            {label}
          </Link>
          <span style={{ color: color.textDim }}>/</span>
          <span style={{ color: color.textMuted }}>{date}</span>
        </nav>

        <h1
          style={{ color: color.gold, fontSize: 24, fontWeight: 700, marginBottom: 6, marginTop: 0 }}
        >
          {safeLang === "fr"
            ? `Vidéos transcrites · ${label}`
            : `Transcribed videos · ${label}`}
        </h1>
        <p style={{ color: color.textMuted, fontSize: 14, marginTop: 0, marginBottom: 28 }}>
          {dateLabel}
        </p>

        {videos.length === 0 ? (
          <p style={{ color: color.textMuted, fontSize: 14, padding: "24px 0" }}>
            {safeLang === "fr"
              ? "Aucune vidéo transcrite pour ce topic à cette date."
              : "No transcribed video for this topic on that date."}
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {videos.map((v) => {
              const title = v.title_localized ?? v.title;
              const score = v.summary_score;
              return (
                <li
                  key={v.video_id}
                  style={{
                    background: color.surface,
                    border: `1px solid ${color.border}`,
                    borderRadius: 10,
                    padding: "14px 18px",
                    marginBottom: 12,
                  }}
                >
                  <Link
                    href={`/${topic}/v/${v.published_date}/${v.slug_keywords}?lang=${safeLang}`}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "center",
                      color: color.text,
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.4 }}>
                      <span style={{ color: color.gold, marginRight: 8 }}>→</span>
                      {title}
                    </span>
                    {typeof score === "number" && (
                      <span style={{ flexShrink: 0 }}>
                        <ScoreMeter score={score} width={60} align="end" />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div style={{ marginTop: 32 }}>
          <Link
            href={`/archives?lang=${safeLang}`}
            style={{ color: color.gold, textDecoration: "none", fontSize: 13, fontWeight: 600 }}
          >
            {safeLang === "fr" ? "← Retour aux archives" : "← Back to archives"}
          </Link>
        </div>

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
        </footer>
      </div>
    </div>
  );
}
