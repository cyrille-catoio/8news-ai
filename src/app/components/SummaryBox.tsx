"use client";

import type { SummaryResponse } from "@/lib/types";
import { t, type Lang } from "@/lib/i18n";
import { color, card, sectionHeading } from "@/lib/theme";
import { AudioPlayer } from "@/app/components/AudioPlayer";

function RefIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", opacity: 0.6 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ttsIntro(hours: number, lang: Lang, topicName: string): string {
  if (lang === "fr") {
    const period =
      hours < 1 ? `les ${Math.round(hours * 60)} dernières minutes`
      : hours === 1 ? "la dernière heure"
      : hours < 24 ? `les ${hours} dernières heures`
      : hours === 24 ? "les dernières 24 heures"
      : `les ${Math.round(hours / 24)} derniers jours`;
    return `${topicName}. Voici l'actualité analysée pour ${period}.`;
  }
  const period =
    hours < 1 ? `the last ${Math.round(hours * 60)} minutes`
    : hours === 1 ? "the last hour"
    : hours < 24 ? `the last ${hours} hours`
    : hours === 24 ? "the last 24 hours"
    : `the last ${Math.round(hours / 24)} days`;
  return `${topicName}. Here is the news analyzed for ${period}.`;
}

export function SummaryBox({ data, locale, lang, hours, topicName, speed, voice, showAnalyzedCount = false }: { data: SummaryResponse; locale: string; lang: Lang; hours: number; topicName: string; speed: number; voice: string; showAnalyzedCount?: boolean }) {
  const raw = typeof data.summary === "string" ? data.summary : String(data.summary ?? "");
  const ttsOutro = lang === "fr" ? "... ... Analyse terminée. Vous pouvez reprendre une activité normale." : "... ... That's all folks!";
  const intro = ttsIntro(hours, lang, topicName);
  const maxTtsBody = 4800 - intro.length - ttsOutro.length;
  const ttsBody = raw.trim().length > maxTtsBody ? raw.trim().slice(0, maxTtsBody) + "…" : raw.trim();
  const ttsText = ttsBody.length > 0 ? `${intro} ${ttsBody} ${ttsOutro}` : "";
  const bullets = data.bullets ?? [];
  const hasBullets = bullets.length > 0;
  const loc = lang === "fr" ? "fr-FR" : "en-US";
  const fmt = (n: number) => n.toLocaleString(loc);

  return (
    <div style={{ ...card, borderRadius: 12, padding: 20, marginBottom: 28, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ ...sectionHeading, margin: 0 }}>
          {t("summary", lang)}
          {topicName && (
            <span style={{ color: color.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: "normal" }}>
              {" | "}
              <span style={{ textTransform: "uppercase" }}>{topicName}</span>
              {" |"}
            </span>
          )}
        </h2>
        {data.meta && (
          <p className="summary-meta-line" style={{ margin: 0 }}>
            {lang === "fr" ? (
              <>
              {fmt(data.meta.totalArticles)} articles,{" "}
              {showAnalyzedCount ? `${fmt(data.meta.analyzedArticles)} ` : ""}
              <span style={{ color: color.gold }}>sélectionnés et analysés par IA</span>
              </>
            ) : (
              <>
                {fmt(data.meta.totalArticles)} articles,{" "}
                {showAnalyzedCount ? `${fmt(data.meta.analyzedArticles)} ` : ""}
                <span style={{ color: color.gold }}>scored and analyzed by AI</span>
              </>
            )}
          </p>
        )}
      </div>
      {ttsText.length > 0 && <div style={{ marginBottom: 12 }}><AudioPlayer text={ttsText} lang={lang} speed={speed} voice={voice} /></div>}
      {hasBullets ? (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {bullets.map((bullet, i) => (
            <li
              key={i}
              style={{
                color: color.textSecondary,
                lineHeight: 1.6,
                fontSize: 15,
                padding: "5px 0",
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: color.gold, flexShrink: 0 }}>•</span>
                <span>{bullet.text}</span>
              </div>
              {bullet.refs.length > 0 && (
                <div style={{ display: "flex", gap: 10, marginTop: 4, marginLeft: 18, flexWrap: "wrap" }}>
                  {bullet.refs.map((ref, j) => (
                    <a
                      key={j}
                      href={ref.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={ref.title}
                      style={{
                        color: color.textDim,
                        fontSize: 11,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = color.gold)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = color.textDim)}
                    >
                      {ref.source} <RefIcon />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: color.textSecondary, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0, fontSize: 15 }}>
          {raw}
        </p>
      )}
      <p style={{ color: color.textDim, fontSize: 13, marginTop: 12 }}>
        {new Date(data.period.from).toLocaleString(locale)} → {new Date(data.period.to).toLocaleString(locale)}
      </p>
    </div>
  );
}
