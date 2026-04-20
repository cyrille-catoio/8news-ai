import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

/**
 * "Live scoring console" widget shown on the right side of the hero.
 * Static mock data lives in landing-content.ts.
 */
export function LandingConsole({ lang }: { lang: LandingLang }) {
  const k = LANDING_CONTENT.console;
  return (
    <div className="console scoring-console">
      <div className="console-header">
        <div className="console-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="console-title">
          <span className="pulse" />
          {k.title[lang]}
        </div>
        <div className="console-title" style={{ color: "var(--text-4)" }}>
          GPT-4.1-nano
        </div>
      </div>
      <div className="console-body">
        {k.rows.map((r, i) => {
          const w = r.s / 10;
          const barClass =
            r.s >= 9 ? "bar-green"
              : r.s >= 5 ? ""
              : r.s >= 3 ? "bar-orange"
              : "bar-red";
          return (
            <div key={i} className="score-row" style={{ animationDelay: `${i * 0.1}s` }}>
              <span className={`score-badge score-${r.s}`}>{r.s}</span>
              <div className="score-body">
                <div className="title">{lang === "en" ? r.t_en : r.t_fr}</div>
                <div className="src">
                  <span className="topic">{r.topic}</span>
                  {r.src} · {8 - i}m ago
                </div>
              </div>
              <div className={`score-bar ${barClass}`}>
                <i style={{ width: `${w * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="console-footer"
        // dangerouslySetInnerHTML lets us keep the <b>…</b> highlights from
        // the source content. The strings come from a typed module under our
        // control (landing-content.ts), not from user input.
        dangerouslySetInnerHTML={{ __html: k.footer[lang] }}
      />
    </div>
  );
}
