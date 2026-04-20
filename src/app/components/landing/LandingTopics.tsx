import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

/**
 * Deterministic mini-histogram heights for each topic card. The original
 * vanilla-JS landing used `Math.random()` here, but Server-Side rendering
 * needs a stable output to avoid hydration mismatches. We use a small
 * mulberry32 PRNG seeded by (topic index, bar index) so the bars stay
 * varied but reproducible.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBars(topicIndex: number) {
  const r = rng(topicIndex * 9176 + 1);
  return Array.from({ length: 10 }, () => {
    const hot = r() > 0.45;
    const h = 30 + r() * 70;
    return { hot, h };
  });
}

export function LandingTopics({ lang }: { lang: LandingLang }) {
  const t = LANDING_CONTENT.topics;
  const feedsLabel = lang === "en" ? "feeds" : "flux";

  return (
    <section id="topics" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="wrap">
        <div className="kicker">{t.kicker[lang]}</div>
        <h2
          className="big"
          style={{ marginTop: 16, maxWidth: 880 }}
          dangerouslySetInnerHTML={{ __html: t.title[lang] }}
        />
        <p style={{ maxWidth: 620, fontSize: 16, color: "var(--text-2)", marginTop: 20, lineHeight: 1.55 }}>
          {t.sub[lang]}
        </p>
        <div className="topics-grid">
          {t.list.map((x, i) => {
            const label = lang === "en" ? x.label_en : x.label_fr;
            const bars = buildBars(i);
            return (
              <div key={i} className="topic-card">
                <div className="label">{label}</div>
                <div className="feeds">
                  {x.feeds} {feedsLabel}
                </div>
                <div className="score-mini">
                  {bars.map((b, j) => (
                    <span key={j} className={b.hot ? "hot" : ""} style={{ height: `${b.h}%` }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
