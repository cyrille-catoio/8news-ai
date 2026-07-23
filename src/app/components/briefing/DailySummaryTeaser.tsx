"use client";

import { useEffect, useState } from "react";
import { color, card } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import type { TopicLabel } from "@/lib/types";
import { summaryPath } from "@/lib/summary-routes";
import { kicker, ctaLink } from "@/app/components/briefing/styles";
import { buildTeaserBullets, type DailySummaryBullet } from "@/app/components/briefing/utils";

/** Routing tuple identifying one daily summary. Mirror of the row
 *  returned by `GET /api/summaries/routes`. */
export interface SummaryRoute {
  topic_id: string;
  summary_date: string;
  slug_keywords: string;
  lang: string;
}

/**
 * « Résumé quotidien topic » teaser card. Fetches the actual summary opening
 * lines from `/api/summaries/{topic}/{date}` so the home shows real
 * editorial content instead of a generic placeholder.
 *
 * v2.12 extracted from `BriefingPage.tsx`.
 */
export function DailySummaryTeaser({
  route,
  lang,
  locale,
  topicLabels,
}: {
  route: SummaryRoute;
  lang: Lang;
  locale: string;
  topicLabels: TopicLabel[];
}) {
  const topic = topicLabels.find((tl) => tl.id === route.topic_id);
  const dateLabel = new Date(route.summary_date + "T00:00:00").toLocaleDateString(locale, {
    day: "numeric", month: "short", year: "numeric",
  });
  const href = summaryPath(route);

  // Lazy-fetch the actual summary body so the teaser shows the first
  // editorial bullets instead of a generic « AI bullet-point summary… »
  // placeholder. The route already serves `seo_description` + structured
  // `bullets`, both 1 h CDN-cached, so a re-render of the home page costs
  // at most one fast roundtrip.
  const [teaserBullets, setTeaserBullets] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const qs = route.lang === "fr" ? "?lang=fr" : "";
    fetch(`/api/summaries/${route.topic_id}/${route.summary_date}${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { bullets?: DailySummaryBullet[]; seoDescription?: string } | null) => {
        if (cancelled || !json) return;
        const built = buildTeaserBullets(json.bullets ?? [], json.seoDescription ?? "");
        if (built.length > 0) setTeaserBullets(built);
      })
      .catch(() => { /* silent — keep teaserBullets null, fallback below */ });
    return () => { cancelled = true; };
  }, [route.topic_id, route.summary_date, route.lang]);

  const fallback = lang === "fr"
    ? "Résumé IA en bullet points avec sources, scoré sur les meilleurs articles du jour."
    : "AI bullet-point summary with sources, scored on the day's top articles.";

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
        {lang === "fr" ? "Votre topic favori · actu du jour" : "Your favorite topic · daily news"}
      </div>
      <a href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        <div
          style={{
            ...card,
            display: "block",
            padding: 20,
            borderColor: color.border,
            background: color.surface,
          }}
        >
          <h3 style={{ color: color.text, margin: 0, fontSize: 20, fontFamily: "ui-serif, Georgia, serif", fontWeight: 400 }}>
            {topic?.label ?? route.topic_id}
            <span style={{ color: color.textMuted, fontSize: 14, marginLeft: 10, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.04em" }}>
              · {dateLabel}
            </span>
          </h3>
          {teaserBullets ? (
            // First bullets of the summary, rendered as the same gold-dot
            // list the full summary page uses for « Points clés » — same
            // home description scale (`app-paragraph-lg`) as the previous
            // paragraph teaser.
            <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 16px" }}>
              {teaserBullets.map((text, i) => (
                <li
                  key={i}
                  className="app-paragraph-lg"
                  style={{
                    display: "flex",
                    gap: 8,
                    color: color.articleSnippet,
                    marginBottom: i < teaserBullets.length - 1 ? 10 : 0,
                  }}
                >
                  <span style={{ color: color.gold, fontWeight: 700, flexShrink: 0 }}>•</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="app-paragraph-lg"
              style={{
                color: color.articleSnippet,
                marginTop: 10,
                marginBottom: 16,
              }}
            >
              {fallback}
            </p>
          )}
          {/* CTA kept INSIDE the box, bottom-right — rendered as a span
              (not an anchor) since the whole card is already a link, so we
              avoid nesting <a> inside <a>. Mirrors the Daily Podcast. */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 4,
              paddingTop: 12,
              borderTop: `1px solid ${color.border}`,
            }}
          >
            <span style={ctaLink}>
              {lang === "fr" ? "Lire la suite →" : "Read more →"}
            </span>
          </div>
        </div>
      </a>
    </section>
  );
}
