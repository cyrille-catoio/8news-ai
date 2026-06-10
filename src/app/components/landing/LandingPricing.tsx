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
              <div className="price-row">
                <div>
                  <div className="price-main-row">
                    <div className="price">
                      {pl.price}
                      {pl.per ? (
                        <small className={pl.featured ? "price-period-annual" : "price-period"}>
                          {pl.per}
                        </small>
                      ) : null}
                    </div>
                    {pl.compareAtPrice ? (
                      <div className="price-compare">
                        <span className="price-compare-label">
                          {lang === "fr" ? "Au lieu de" : "Instead of"}
                        </span>
                        <span className="price-compare-val">
                          <span className="price-compare-amount">{pl.compareAtPrice}</span>
                          {pl.per ? (
                            <small className="price-compare-per">
                              {lang === "fr" ? " par an" : pl.per}
                            </small>
                          ) : null}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  {pl.saveLabel && !pl.priceYear ? (
                    <div className="price-year" style={{ marginTop: 10 }}>
                      <span className="price-save">{pl.saveLabel}</span>
                    </div>
                  ) : null}
                </div>
                {pl.priceYear ? (
                  <div className="price-year">
                    {lang === "fr" ? "Soit " : "Billed as "}
                    <strong>{pl.priceYear}</strong>
                    <span className="price-year-per">{pl.perYear}</span>
                    {pl.saveLabel ? <span className="price-save">{pl.saveLabel}</span> : null}
                  </div>
                ) : null}
              </div>
              <div className="desc">{pl.desc}</div>
              <ul>
                {pl.features.map((f, j) => (
                  <li key={j}>{f}</li>
                ))}
              </ul>
              <div className="plan-footer">
                <Link
                  href={pl.featured ? "/app/settings" : "/app"}
                  className={`btn-${pl.featured ? "primary" : "ghost"} cta`}
                  style={{ padding: 14, fontSize: 14 }}
                >
                  {pl.cta}
                </Link>
                <div className="plan-note">
                  {pl.featured
                    ? lang === "fr"
                      ? "Aucune carte bancaire aujourd'hui. On enregistre votre intérêt Pro."
                      : "No card today. We only record your Pro interest."
                    : "\u00a0"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
