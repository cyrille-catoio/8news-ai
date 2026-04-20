import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

export function LandingYT({ lang }: { lang: LandingLang }) {
  const y = LANDING_CONTENT.yt;
  const summaryLabel = lang === "en" ? "AI SUMMARY · GPT-4.1-MINI" : "RÉSUMÉ IA · GPT-4.1-MINI";
  const transcribedLabel = lang === "en" ? "Transcribed" : "Transcrit";
  const bulletsLabel = lang === "en" ? "8 bullets" : "8 puces";
  const creditLabel = lang === "en" ? "1 credit · 14s" : "1 crédit · 14s";

  return (
    <section id="videos" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="wrap">
        <div className="kicker">{y.kicker[lang]}</div>
        <h2
          className="big"
          style={{ marginTop: 16, maxWidth: 880 }}
          dangerouslySetInnerHTML={{ __html: y.title[lang] }}
        />
        <p style={{ maxWidth: 620, fontSize: 16, color: "var(--text-2)", marginTop: 20, lineHeight: 1.55 }}>
          {y.sub[lang]}
        </p>
        <div className="yt-grid">
          {y.cards.map((c, i) => {
            const bullets = lang === "en" ? c.bullets_en : c.bullets_fr;
            return (
              <div key={i} className="yt-card">
                <div className="yt-thumb">
                  <div className="play" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <div className="dur">{c.dur}</div>
                </div>
                <div className="yt-body">
                  <div className="title">{lang === "en" ? c.title_en : c.title_fr}</div>
                  <div className="chan">{c.channel}</div>
                  <div className="yt-summary">
                    <div className="meta meta-gold" style={{ marginBottom: 10 }}>{summaryLabel}</div>
                    <ul>
                      {bullets.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="yt-meta-bar">
                  <span>
                    {transcribedLabel} <b>{c.dur}</b> → <b>{bulletsLabel}</b>
                  </span>
                  <span>{creditLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
