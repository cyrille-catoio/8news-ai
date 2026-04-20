import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

export function LandingTicker({ lang }: { lang: LandingLang }) {
  const items = lang === "en"
    ? LANDING_CONTENT.ticker.items_en
    : LANDING_CONTENT.ticker.items_fr;
  // Triple to keep the loop seamless under the 50% translateX animation.
  const dup = [...items, ...items, ...items];

  return (
    <div className="ticker">
      <div className="ticker-track">
        {dup.map((t, i) => {
          const [head, ...rest] = t.split("·");
          const tail = rest.join("·").trim();
          return (
            <span key={i} className="ticker-item">
              <span className="dot" />
              <b>{head.trim()}</b>
              {tail ? ` · ${tail}` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
