import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

export function LandingYT({ lang }: { lang: LandingLang }) {
  const y = LANDING_CONTENT.yt;

  return (
    <section id="videos" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="wrap">
        {/* Two-column layout: kicker + title + descriptive paragraph in the
            left column, summary screenshot in the right column. Stacks
            vertically at the same breakpoint as the hero (<= 960px). */}
        <div className="yt-content">
          <div className="yt-copy">
            <div className="kicker">{y.kicker[lang]}</div>
            <h2
              className="big"
              style={{ marginTop: 16 }}
              dangerouslySetInnerHTML={{ __html: y.title[lang] }}
            />
            <p
              className="yt-sub"
              style={{ fontSize: 16, color: "var(--text-2)", marginTop: 20, lineHeight: 1.55 }}
            >
              {y.sub[lang]}
            </p>
          </div>
          <div className="yt-preview">
            <img
              src="/landing/yt-summary-preview.png"
              alt={
                lang === "fr"
                  ? "Aperçu d'un résumé vidéo YouTube généré par 8news avec lecteur audio, intro et points clés."
                  : "Preview of an 8news YouTube video summary with audio player, intro and key points."
              }
              loading="lazy"
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                borderRadius: 12,
                border: "1px solid var(--border)",
                boxShadow: "0 20px 60px -20px rgba(201, 162, 39, 0.15), 0 0 0 1px rgba(255,255,255,0.02) inset",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
