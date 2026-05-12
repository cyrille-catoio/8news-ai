import Link from "next/link";
import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

export function LandingHero({ lang }: { lang: LandingLang }) {
  const h = LANDING_CONTENT.hero;
  return (
    <section className="hero" id="top">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <div className="kicker">{h.kicker[lang]}</div>
          <h1 className="headline" dangerouslySetInnerHTML={{ __html: h.headline[lang] }} />
          <p className="sub">{h.sub[lang]}</p>
          <div className="hero-ctas">
            <Link
              href="/app"
              className="btn-primary"
              style={{ padding: "14px 22px", fontSize: 14 }}
            >
              {h.ctaPrimary[lang]}
            </Link>
            <Link
              href="/app"
              className="btn-ghost"
              style={{ padding: "14px 22px", fontSize: 14 }}
            >
              {h.ctaSecondary[lang]}
            </Link>
            <span className="hint">· {h.hint[lang]}</span>
          </div>
        </div>
        <div className="hero-visual">
          {/* v2.6.4 — the standalone « YouTube intelligence » section
              folded into the hero. The summary preview screenshot
              that used to live in `LandingYT` is promoted here as the
              hero illustration: it pictures exactly what the new sub
              copy describes (audio player + intro + key points). The
              previous `LandingVideoHero` mock is retired. */}
          <img
            src="/landing/yt-summary-preview.png"
            alt={
              lang === "fr"
                ? "Aperçu d'un résumé vidéo YouTube généré par 8news avec lecteur audio, intro et points clés."
                : "Preview of an 8news YouTube video summary with audio player, intro and key points."
            }
            loading="eager"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              borderRadius: 12,
              border: "1px solid var(--border)",
              boxShadow:
                "0 20px 60px -20px rgba(201, 162, 39, 0.15), 0 0 0 1px rgba(255,255,255,0.02) inset",
            }}
          />
          <div className="hero-ai-score-badge" aria-label={lang === "fr" ? "Note IA 9 sur 10" : "AI score 9 out of 10"}>
            <span>{lang === "fr" ? "Note IA" : "AI score"}</span>
            <strong>9/10</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
