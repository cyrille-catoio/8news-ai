import Link from "next/link";
import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

/**
 * Sticky top navigation. The lang switch is implemented as plain
 * `<Link href="?lang=…">` so the whole component stays a Server Component
 * (no client-side state required — the page reads `searchParams.lang`).
 */
export function LandingNav({ lang }: { lang: LandingLang }) {
  const C = LANDING_CONTENT.nav;
  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <Link href="#top" className="logo" aria-label="8news">
          <img
            src="/logo-8news.png"
            alt="8news"
            style={{ height: "clamp(28px, 3.2vw, 40px)", width: "auto", display: "block" }}
          />
        </Link>
        <div className="nav-links">
          {C.links[lang].map(([k, v]) => (
            <a key={k} href={`#${k}`}>{v}</a>
          ))}
        </div>
        <div className="nav-right">
          <div className="lang-switch" role="tablist">
            <Link
              href="/?lang=en"
              className={lang === "en" ? "active" : ""}
              role="tab"
              aria-selected={lang === "en"}
            >
              EN
            </Link>
            <Link
              href="/?lang=fr"
              className={lang === "fr" ? "active" : ""}
              role="tab"
              aria-selected={lang === "fr"}
            >
              FR
            </Link>
          </div>
          <Link href="/app" className="btn-ghost" style={{ display: "inline-block" }}>
            {C.signin[lang]}
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
