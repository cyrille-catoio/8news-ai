import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";
import { getActiveTopics } from "@/lib/supabase/topics";

/**
 * Marquee strip rendered right under the hero. Lists every active /
 * displayed topic from the `topics` table (label_en / label_fr,
 * upper-cased), sorted by `sort_order`.
 *
 * Data flow:
 *  - Server-rendered (this is an async server component).
 *  - Falls back to the static list in `landing-content.ts#ticker` if
 *    Supabase is unreachable or returns 0 rows — so the marketing page
 *    never ships with an empty bandeau.
 *
 * Visual layout (`.ticker` + `.ticker-track` in `landing.css`):
 *  - Width = `max-content`, animated `translateX(-50%)` over 60 s.
 *    Items are tripled here so the loop stays seamless under the
 *    50 % shift.
 *  - Each item is `<dot> <BOLD GOLD label>` (no head/tail split — the
 *    topic label is the entire item, so we wrap it in `<b>` to keep
 *    the gold + heavier weight pattern from the previous design).
 */
export async function LandingTicker({ lang }: { lang: LandingLang }) {
  const topics = await getActiveTopics();

  /**
   * Map topics → uppercased labels. Falls back to the curated static
   * list when the DB is empty or offline so the section never renders
   * a blank scroller.
   */
  const labels: string[] = (() => {
    if (topics.length > 0) {
      return topics.map((t) =>
        ((lang === "en" ? t.label_en : t.label_fr) ?? t.id).toUpperCase().trim(),
      );
    }
    return lang === "en"
      ? LANDING_CONTENT.ticker.items_en
      : LANDING_CONTENT.ticker.items_fr;
  })();

  // Triple to keep the loop seamless under the 50% translateX animation.
  const dup = [...labels, ...labels, ...labels];

  return (
    <div className="ticker">
      <div className="ticker-track">
        {dup.map((label, i) => (
          <span key={i} className="ticker-item">
            <span className="dot" />
            <b>{label}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
