import Link from "next/link";
import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

export function LandingPricing({ lang }: { lang: LandingLang }) {
  const p = LANDING_CONTENT.pricing;
  return (
    <section id="pricing" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="wrap">
        <div className="kicker">{p.kicker[lang]}</div>
        <h2
          className="big"
          style={{ marginTop: 16, maxWidth: 880 }}
          dangerouslySetInnerHTML={{ __html: p.title[lang] }}
        />
        <div className="pricing-grid">
          {p.plans[lang].map((pl, i) => (
            <div key={i} className={`plan${pl.featured ? " featured" : ""}`}>
              <div className="tag">{pl.tag}</div>
              <h3>{pl.name}</h3>
              <div className="price">
                {pl.price}
                <small>{pl.per}</small>
              </div>
              <div className="desc">{pl.desc}</div>
              <ul>
                {pl.features.map((f, j) => (
                  <li key={j}>{f}</li>
                ))}
              </ul>
              <Link
                href="/app"
                className={`btn-${pl.featured ? "primary" : "ghost"} cta`}
                style={{ padding: 14, fontSize: 14 }}
              >
                {pl.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
