"use client";

import { useEffect, useState } from "react";
import { color, card } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import type { TopicLabel } from "@/lib/types";
import { summaryPath } from "@/lib/summary-routes";
import { kicker } from "@/app/components/briefing/styles";
import { buildSummaryTeaser, type DailySummaryBullet } from "@/app/components/briefing/utils";

/** Routing tuple identifying one daily summary. Mirror of the row
 *  returned by `GET /api/summaries/routes`. */
export interface SummaryRoute {
  topic_id: string;
  summary_date: string;
  slug_keywords: string;
  lang: string;
}

/**
 * « Résumé quotidien » teaser card. Fetches the actual summary opening
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

  // Lazy-fetch the actual summary body so the teaser shows the
  // opening lines of the editorial bullets instead of a generic « AI
  // bullet-point summary… » placeholder. The route already serves
  // `seo_description` + structured `bullets`, both 1 h CDN-cached, so
  // a re-render of the home page costs at most one fast roundtrip.
  const [teaser, setTeaser] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const qs = route.lang === "fr" ? "?lang=fr" : "";
    fetch(`/api/summaries/${route.topic_id}/${route.summary_date}${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { bullets?: DailySummaryBullet[]; seoDescription?: string } | null) => {
        if (cancelled || !json) return;
        const built = buildSummaryTeaser(json.bullets ?? [], json.seoDescription ?? "");
        if (built) setTeaser(built);
      })
      .catch(() => { /* silent — keep teaser null, fallback below */ });
    return () => { cancelled = true; };
  }, [route.topic_id, route.summary_date, route.lang]);

  const fallback = lang === "fr"
    ? "Résumé IA en bullet points avec sources, scoré sur les meilleurs articles du jour."
    : "AI bullet-point summary with sources, scored on the day's top articles.";
  const teaserText = teaser ?? fallback;

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>
        {lang === "fr" ? "Résumé quotidien" : "Daily summary"}
      </div>
      <a href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        <div
          style={{
            ...card,
            display: "block",
            padding: 20,
            borderColor: color.gold,
            background:
              "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
          }}
        >
          <h3 style={{ color: color.text, margin: 0, fontSize: 20, fontFamily: "ui-serif, Georgia, serif", fontWeight: 400 }}>
            {topic?.label ?? route.topic_id}
            <span style={{ color: color.textMuted, fontSize: 14, marginLeft: 10, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.04em" }}>
              · {dateLabel}
            </span>
          </h3>
          <p
            className="app-paragraph-lg"
            style={{
              color: color.articleSnippet,
              marginTop: 10,
              marginBottom: 16,
              // Clamp to ~5 lines so the teaser never blows up the
              // card height — anything past line 5 hides under the
              // « Lire la suite » CTA, which is exactly the user goal.
              display: "-webkit-box",
              WebkitLineClamp: 5,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {teaserText}
          </p>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 6,
              border: `1px solid ${color.gold}`,
              background: "rgba(201,162,39,0.10)",
              color: color.gold,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.01em",
            }}
          >
            {lang === "fr" ? "Lire la suite →" : "Read more →"}
          </span>
        </div>
      </a>
    </section>
  );
}
