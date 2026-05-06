import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

/**
 * Hero visual on the right column of the landing page.
 *
 * Replaces the older `LandingConsole` (RSS scoring ladder) so the hero
 * advertises the actual headliner of the product — the YouTube video
 * transcription pipeline — instead of an article-list demo. Shows:
 *
 *  1. A YouTube card mock (thumbnail + play overlay + duration tag,
 *     red « ▶ YouTube » badge + channel name in the footer strip).
 *  2. A connector strip « ✦ Transcribed & summarized by AI in 18 sec ✦ »
 *     that quantifies the AI step.
 *  3. Three gold bullets showing the AI summary in action.
 *  4. A small rotated badge « 45 min · Per video » materializing the
 *     time saved that the H1 promises.
 *
 * Static — no data fetch, mock content lives in `landing-content.ts
 * #videoHero`. This is a marketing illustration, not a live widget;
 * we keep it deterministic so the hero renders fast and consistently.
 * The matching live widget (RSS scoring console) moves down the page
 * in `LandingScoringSection`.
 */
export function LandingVideoHero({ lang }: { lang: LandingLang }) {
  const v = LANDING_CONTENT.videoHero;
  const title = lang === "fr" ? v.title_fr : v.title_en;
  const bullets = lang === "fr" ? v.bullets_fr : v.bullets_en;

  return (
    <div className="video-hero">
      <div className="video-hero-card">
        <div className="video-hero-thumb">
          <div className="video-hero-thumb-overlay">
            <div className="video-hero-play" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
          </div>
          <span className="video-hero-duration">{v.duration}</span>
        </div>
        <div className="video-hero-meta">
          <span className="video-hero-badge">{v.badge[lang]}</span>
          <span className="video-hero-channel">{v.channel}</span>
        </div>
        <div className="video-hero-title">{title}</div>
      </div>

      <div className="video-hero-arrow" aria-hidden>
        {v.arrow[lang]}
      </div>

      <ul className="video-hero-bullets">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>

      <div className="video-hero-per-video" aria-hidden>
        {v.perVideoBadge[lang]}
      </div>
    </div>
  );
}
