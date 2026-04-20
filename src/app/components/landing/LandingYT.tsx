import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

export function LandingYT({ lang }: { lang: LandingLang }) {
  const y = LANDING_CONTENT.yt;

  return (
    <section id="videos" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="wrap">
        <div className="kicker">{y.kicker[lang]}</div>
        <h2
          className="big"
          style={{
            marginTop: 16,
            // Force the title on a single line across viewports. Reduced
            // max from the default h2.big (64px) so the full phrase (~50
            // characters) fits the 1136px content area at desktop widths.
            whiteSpace: "nowrap",
            fontSize: "clamp(15px, 3.3vw, 40px)",
          }}
          dangerouslySetInnerHTML={{ __html: y.title[lang] }}
        />
        <p style={{ maxWidth: 620, fontSize: 16, color: "var(--text-2)", marginTop: 20, lineHeight: 1.55 }}>
          {y.sub[lang]}
        </p>
      </div>
    </section>
  );
}
