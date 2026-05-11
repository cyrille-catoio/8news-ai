import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

const FETCH_FEEDS: Array<{ name: string; t: number }> = [
  { name: "bbc.com", t: 12 },
  { name: "theverge.com", t: 49 },
  { name: "techcrunch.com", t: 26 },
  { name: "arxiv.org", t: 3 },
  { name: "ft.com", t: 40 },
  { name: "reuters.com", t: 17 },
];

// v2.6.14+ 4-tier illustrative distribution, aligned with the
// `ScoreMeter` color ladder (green ≥ 8, gold ≥ 5, orange ≥ 3, red < 3)
// and with the API's `pct8_10 / pct5_7 / pct3_4 / pct1_2` buckets. The
// percentages remain static / illustrative — this is a marketing
// landing block, not live data.
const SCORE_DIST: Array<{ tier: string; pct: number; clr: string }> = [
  { tier: "8-10", pct: 14, clr: "var(--green)" },
  { tier: "5-7", pct: 44, clr: "var(--gold)" },
  { tier: "3-4", pct: 28, clr: "var(--orange)" },
  { tier: "1-2", pct: 14, clr: "var(--red)" },
];

function StepViz({ kind, lang }: { kind: "fetch" | "score" | "summary"; lang: LandingLang }) {
  if (kind === "fetch") {
    return (
      <div className="step-viz">
        {FETCH_FEEDS.map((f) => (
          <div key={f.name} style={{ display: "flex", justifyContent: "space-between", color: "var(--text-3)", padding: "2px 0", borderBottom: "1px dashed var(--border)" }}>
            <span>{f.name}</span>
            <span style={{ color: "var(--green)" }}>200 OK · {f.t}s</span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "score") {
    return (
      <div className="step-viz">
        {SCORE_DIST.map((d) => (
          <div key={d.tier} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
            <span style={{ width: 34, color: "var(--text-3)" }}>{d.tier}</span>
            <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${d.pct * 2.5}%`, background: d.clr }} />
            </div>
            <span style={{ width: 36, textAlign: "right", color: "var(--text-2)" }}>{d.pct}%</span>
          </div>
        ))}
      </div>
    );
  }
  // summary
  const bullets = lang === "en"
    ? [
        'OpenAI announces GPT-5.3 with 2M-token context <span style="color:var(--gold)">[1,3]</span>',
        'Anthropic closes $15B at $250B valuation <span style="color:var(--gold)">[2]</span>',
        'Unitree H2 humanoid demos autonomous kitchen <span style="color:var(--gold)">[4]</span>',
      ]
    : [
        'OpenAI annonce GPT-5.3 avec contexte 2M tokens <span style="color:var(--gold)">[1,3]</span>',
        'Anthropic clôt 15 Md$ à 250 Md$ valorisation <span style="color:var(--gold)">[2]</span>',
        'Humanoïde Unitree H2 démontre cuisine autonome <span style="color:var(--gold)">[4]</span>',
      ];
  return (
    <div className="step-viz">
      {bullets.map((b, i) => (
        <div
          key={i}
          style={{ padding: "4px 0", color: "var(--text-2)", lineHeight: 1.45 }}
          dangerouslySetInnerHTML={{ __html: `<span style="color:var(--gold)">•</span> ${b}` }}
        />
      ))}
    </div>
  );
}

export function LandingHow({ lang }: { lang: LandingLang }) {
  const h = LANDING_CONTENT.how;
  const steps = h.steps[lang];
  const stepLabel = lang === "en" ? "Step" : "Étape";

  return (
    <section id="features" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="wrap">
        <div className="kicker">{h.kicker[lang]}</div>
        <h2
          className="big"
          style={{ marginTop: 16, maxWidth: 880 }}
          dangerouslySetInnerHTML={{ __html: h.title[lang] }}
        />
      </div>
      <div className="wrap" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="how-grid" style={{ marginLeft: 32, marginRight: 32 }}>
          {steps.map((s) => (
            <div key={s.num} className="step">
              <div className="num">
                {stepLabel} {s.num}
              </div>
              <h3 className="big">{s.title}</h3>
              <p>{s.body}</p>
              <StepViz kind={s.viz} lang={lang} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
