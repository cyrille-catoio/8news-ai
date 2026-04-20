import Link from "next/link";
import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";
import { LandingConsole } from "./LandingConsole";

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
            <a
              href="#topics"
              className="btn-ghost"
              style={{ padding: "14px 22px", fontSize: 14 }}
            >
              {h.ctaSecondary[lang]}
            </a>
            <span className="hint">· {h.hint[lang]}</span>
          </div>
        </div>
        <div className="hero-visual">
          <LandingConsole lang={lang} />
        </div>
      </div>
    </section>
  );
}
