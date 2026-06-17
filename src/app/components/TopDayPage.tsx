import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllTopSummaryRoutes,
  getTopSummaryBulletsByDate,
  getTopSummaryByDate,
} from "@/lib/supabase";
import { color, font } from "@/lib/theme";
import { SeoGeneralMenu } from "@/app/components/GeneralMenu";
import { SeoNavBar } from "@/app/components/SeoNavBar";
import { Top24hHero } from "@/app/components/Top24hHero";
import { dateLocale, type Lang } from "@/lib/i18n";
import type { Bullet } from "@/app/components/top24h/Top24hHeroHelpers";

/**
 * Cross-topic Top 24h archive page (v2.7.1+) at `/{YYYY-MM-DD}`.
 *
 * Mounted via the date-fork in [src/app/[topic]/page.tsx](src/app/[topic]/page.tsx)
 * — when `params.topic` matches `^\d{4}-\d{2}-\d{2}$`, the topic hub
 * yields to this component. The reasoning behind that fork lives at
 * the top of the parent file; the short story is « Next.js can't
 * have two `/[seg]/` dynamic routes at the same level ».
 *
 * What the page renders
 * ---------------------
 *  - Same SeoNavBar + SeoGeneralMenu chrome as `/{topic}` and
 *    `/{topic}/r/{date}/{slug}` so the visitor stays in the SEO
 *    surface visual register.
 *  - A breadcrumb « Home → Archives → {date long} ».
 *  - The full editorial accordion (`<Top24hHero>` reused with
 *    `defaultOpen` + a static `data` prop, like the /top-articles
 *    route does since v2.6.8). Each thematic group is expanded by
 *    default — the visitor came here to read the day's brief, not
 *    to scan headlines.
 *  - The frozen 50-article source list (title + score + topic chip
 *    + source) mirroring what you'd see on `/top-articles` for
 *    « today », but for any past day in the 90-day archive.
 *  - Adjacent-day navigation (← jour précédent / jour suivant →)
 *    based on which other dates have a `top_summaries` row in this
 *    lang — skips empty days so the visitor always lands on
 *    content.
 *
 * Returns 404 when no `top_summaries` row exists for `(lang, date)`.
 * The visitor reaches this page via the gold « ALL TOPICS » box on
 * `/archives` which itself is conditional on `hasTopSummary`, so the
 * 404 only fires on direct URL hits to dates that don't have a
 * snapshot.
 */

export interface TopDayPageProps {
  date: string;
  lang: Lang;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function topicTierColor(score: number | null | undefined): string {
  if (typeof score !== "number") return color.textDim;
  // v2.6.14+ green threshold lowered 9 → 8 — mirrors ScoreMeter.
  if (score >= 8) return "#22c55e";
  if (score >= 5) return color.gold;
  if (score >= 3) return "#f97316";
  return "#ef4444";
}

export async function TopDayPage({ date, lang }: TopDayPageProps) {
  const [snapshot, bulletRows, allRoutes] = await Promise.all([
    getTopSummaryByDate(lang, date),
    getTopSummaryBulletsByDate(lang, date),
    getAllTopSummaryRoutes(),
  ]);

  if (!snapshot) notFound();

  const locale = dateLocale(lang);
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Strip the `**Title**\n\n` prefix re-injected at write time. Keeps
  // the bullet body separate from the bold title above so `Top24hHero`
  // can fold consecutive same-title rows back into a group like it
  // does for /top-articles. Same logic as the /api/news/top-summary/latest
  // route (intentionally duplicated rather than shared because we'd
  // otherwise need a server-only utility module just for one regex).
  const bullets: Bullet[] = bulletRows.map((b) => {
    const text = b.title
      ? b.text.replace(new RegExp(`^\\*\\*${escapeRegExp(b.title)}\\*\\*\\s*\\n+`), "").trim()
      : b.text.trim();
    return {
      text,
      title: b.title,
      refs: b.refs ?? [],
      importanceScore: b.importance_score,
      isVideo: b.video_transcription_id !== null,
    };
  });

  // Compute prev / next dates from the cached `top_summaries` index.
  // We pull at most 180 rows (90 days x 2 langs) so the in-memory
  // walk is essentially free — much simpler than two extra SELECTs.
  const sortedDatesForLang = allRoutes
    .filter((r) => r.lang === lang)
    .map((r) => r.summary_date)
    .sort((a, b) => (a < b ? 1 : -1)); // desc, freshest first
  const idx = sortedDatesForLang.indexOf(date);
  const newerDate = idx > 0 ? sortedDatesForLang[idx - 1] : null;
  const olderDate = idx >= 0 && idx < sortedDatesForLang.length - 1 ? sortedDatesForLang[idx + 1] : null;

  // Frozen article list: the JSON snapshot at `top_summaries.articles`
  // captures the 50 input rows used by the AI at generation time, with
  // their snippets, sources, scores and topics. Surfaced here as a
  // « Sources » list — same UX as /top-articles but pinned to that
  // historical day instead of « now ».
  const articles = snapshot.articles ?? [];

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, fontFamily: font.base }}>
      <div style={{ maxWidth: 916, margin: "0 auto", padding: "16px 20px 40px" }}>
        <SeoNavBar
          lang={lang}
          altLangUrl={`/${date}?lang=${lang === "fr" ? "en" : "fr"}`}
        />

        <SeoGeneralMenu lang={lang} activePage="summaries" />

        <nav style={{ fontSize: 13, marginBottom: 24 }}>
          <Link href="/app" style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
          <span style={{ color: color.textDim, margin: "0 8px" }}>/</span>
          <Link href={`/archives?lang=${lang}`} style={{ color: color.gold, textDecoration: "none" }}>
            {lang === "fr" ? "Archives" : "Archives"}
          </Link>
          <span style={{ color: color.textDim, margin: "0 8px" }}>/</span>
          <span style={{ color: color.textMuted }}>{dateLabel}</span>
        </nav>

        <h1 style={{ color: color.gold, fontSize: 24, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
          {lang === "fr" ? "Top articles 24h" : "Top 24h articles"}
        </h1>
        <p style={{ color: color.textMuted, fontSize: 14, marginTop: 0, marginBottom: 28 }}>
          {dateLabel}
          <span style={{ color: color.textDim, marginLeft: 12, fontSize: 12 }}>
            {lang === "fr"
              ? "Résumé IA cross-topic, basé sur les 50 articles du jour."
              : "Cross-topic AI summary, based on the day's top 50 articles."}
          </span>
        </p>

        {/* Reuse the same accordion the home and /top-articles render.
            `defaultOpen` opens every group up front — the visitor came
            here for the brief, not to scan headlines. `showSeeAllLink`
            is forced false because the « See full briefing → » CTA
            would loop back to the same route. */}
        <Top24hHero
          lang={lang}
          data={{
            bullets,
            summaryDate: snapshot.summary_date,
            generatedAt: snapshot.generated_at,
          }}
          defaultOpen
          showSeeAllLink={false}
        />

        {articles.length > 0 && (
          <section
            style={{
              marginTop: 32,
              background: color.surface,
              border: `1px solid ${color.border}`,
              borderRadius: 10,
              padding: "18px 22px",
            }}
          >
            <h2
              style={{
                color: color.gold,
                fontSize: 13,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: 0,
                marginBottom: 14,
              }}
            >
              {lang === "fr" ? "Sources" : "Sources"}
              <span
                style={{
                  marginLeft: 8,
                  color: color.textMuted,
                  fontWeight: 500,
                  letterSpacing: 0,
                  textTransform: "none",
                  fontSize: 12,
                }}
              >
                {articles.length}{" "}
                {articles.length === 1
                  ? lang === "fr"
                    ? "article"
                    : "article"
                  : lang === "fr"
                  ? "articles"
                  : "articles"}
              </span>
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {articles.map((a, i) => (
                <li
                  key={`${a.link}-${i}`}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "baseline",
                    padding: "8px 0",
                    borderBottom: i < articles.length - 1 ? `1px dashed ${color.borderLight}` : "none",
                    fontSize: 14,
                    lineHeight: 1.45,
                  }}
                >
                  {/* Inline score badge — same tier coloring as the
                      home Top story, but compact (single « N/10 » string)
                      because we have 50 of them and the full ScoreMeter
                      bar would visually drown the list. */}
                  {typeof a.score === "number" && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontFamily: "ui-monospace, Menlo, monospace",
                        fontSize: 12,
                        fontWeight: 700,
                        color: topicTierColor(a.score),
                        minWidth: 32,
                      }}
                      aria-label={`Score ${a.score}/10`}
                    >
                      {a.score}/10
                    </span>
                  )}
                  {a.topic && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontFamily: "ui-monospace, Menlo, monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        color: color.gold,
                        border: `1px solid ${color.gold}`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        alignSelf: "center",
                      }}
                    >
                      {a.topic}
                    </span>
                  )}
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: color.text,
                      textDecoration: "none",
                    }}
                  >
                    {a.title}
                    <span style={{ color: color.textMuted, fontSize: 12, marginLeft: 8 }}>
                      · {a.source}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(olderDate || newerDate) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 32,
              paddingTop: 16,
              borderTop: `1px solid ${color.border}`,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              {olderDate && (
                <Link
                  href={`/${olderDate}?lang=${lang}`}
                  style={{ color: color.gold, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
                >
                  ← {lang === "fr" ? "Jour plus ancien" : "Older day"}
                </Link>
              )}
            </span>
            <span style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
              {newerDate && (
                <Link
                  href={`/${newerDate}?lang=${lang}`}
                  style={{ color: color.gold, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
                >
                  {lang === "fr" ? "Jour plus récent" : "Newer day"} →
                </Link>
              )}
            </span>
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
