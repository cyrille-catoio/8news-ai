import Link from "next/link";
import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

/**
 * Sticky top navigation. The lang switch is a pair of plain `<Link>`
 * elements so the whole component stays a Server Component (no client
 * state — the page reads `searchParams.lang`).
 *
 * Responsive strategy:
 *  - ≥960px : logo + center links + (lang + signin + CTA)
 *  - <960px : center links hidden (content links stay reachable by
 *             scrolling the page — anchor nav is nice-to-have, not
 *             primary nav for a single-page marketing site)
 *  - <640px : "Sign in" text link also hidden; only logo, lang
 *             switch and primary CTA survive
 */
export function LandingNav({ lang }: { lang: LandingLang }) {
  const C = LANDING_CONTENT.nav;
  const signinLabel = lang === "fr" ? "Se connecter" : "Sign in";
  return (
    <nav className="nav" aria-label={lang === "fr" ? "Navigation principale" : "Primary navigation"}>
      <div className="wrap nav-inner">
        <Link href="#top" className="logo" aria-label="8news">
          <img
            src="/logo-8news.png"
            alt="8news"
            style={{ height: "clamp(28px, 3.2vw, 40px)", width: "auto", display: "block" }}
          />
        </Link>
        <div className="nav-links" aria-label={lang === "fr" ? "Sections" : "Sections"}>
          {C.links[lang].map(([k, v]) => (
            <a key={k} href={`#${k}`}>{v}</a>
          ))}
        </div>
        <div className="nav-right">
          <div
            className="lang-switch"
            role="group"
            aria-label={lang === "fr" ? "Langue" : "Language"}
          >
            <Link
              href="/?lang=en"
              className={lang === "en" ? "active" : ""}
              aria-current={lang === "en" ? "true" : undefined}
              hrefLang="en"
            >
              EN
            </Link>
            <Link
              href="/?lang=fr"
              className={lang === "fr" ? "active" : ""}
              aria-current={lang === "fr" ? "true" : undefined}
              hrefLang="fr"
            >
              FR
            </Link>
          </div>
          <Link href="/app" className="nav-signin">
            {signinLabel}
          </Link>
          <Link href="/app" className="btn-primary">
            {C.cta[lang]}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </nav>
  );
}
