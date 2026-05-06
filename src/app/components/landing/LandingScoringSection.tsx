import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";
import { LandingConsole } from "./LandingConsole";

/**
 * Dedicated « Live · scoring console » section that surfaces the
 * RSS-pipeline demo just below the hero. Used to live inside the hero
 * itself; promoted to a section of its own when the hero visual was
 * refocused on the YouTube → AI summary pipeline (see `LandingHero` →
 * `LandingVideoHero`). The RSS scoring is still core to the product,
 * just no longer the headline visual — it now sits in second position
 * with a kicker + title that name what the user is looking at.
 */
export function LandingScoringSection({ lang }: { lang: LandingLang }) {
  const s = LANDING_CONTENT.scoringSection;
  return (
    <section
      id="scoring"
      style={{ borderTop: "1px solid var(--border)", paddingTop: 64, paddingBottom: 64 }}
    >
      <div className="wrap scoring-grid">
        <div className="scoring-copy">
          <div className="kicker">{s.kicker[lang]}</div>
          <h2
            className="big"
            style={{ marginTop: 16 }}
            dangerouslySetInnerHTML={{ __html: s.title[lang] }}
          />
          <p
            style={{
              fontSize: 16,
              color: "var(--text-2)",
              marginTop: 20,
              lineHeight: 1.55,
              maxWidth: 460,
            }}
          >
            {s.sub[lang]}
          </p>
        </div>
        <div className="scoring-visual">
          <LandingConsole lang={lang} />
        </div>
      </div>
    </section>
  );
}
