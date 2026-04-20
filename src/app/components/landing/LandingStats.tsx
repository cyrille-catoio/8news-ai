import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

export function LandingStats({ lang }: { lang: LandingLang }) {
  const items = LANDING_CONTENT.stats[lang];
  return (
    <section className="stats-section">
      <div className="stats-strip">
        {items.map((s, i) => (
          <div key={i} className="stat">
            <div className="n">
              {s.n}
              {s.unit && <span className="unit">{s.unit}</span>}
            </div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
