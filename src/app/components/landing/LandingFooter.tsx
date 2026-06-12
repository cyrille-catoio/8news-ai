import Link from "next/link";
import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

function footerHref(label: string): string {
  if (label === "Mentions légales" || label === "Legal notice") {
    return "/mentions-legales";
  }
  return "#";
}

export function LandingFooter({ lang }: { lang: LandingLang }) {
  const f = LANDING_CONTENT.footer;
  return (
    <footer className="landing-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-col">
            <Link href="#top" className="logo" aria-label="8news">
              <img
                src="/logo-8news.png"
                alt="8news"
                style={{ height: 32, width: "auto", display: "block" }}
              />
            </Link>
            <p className="footer-tagline" style={{ marginTop: 16 }}>
              {f.tagline[lang]}
            </p>
          </div>
          {f.cols[lang].map((col, i) => (
            <div key={i} className="footer-col">
              <h4>{col.h}</h4>
              {col.links.map((l, j) => {
                const href = footerHref(l);
                return href.startsWith("/") ? (
                  <Link key={j} href={href}>{l}</Link>
                ) : (
                  <a key={j} href={href}>{l}</a>
                );
              })}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>{f.copy[lang]}</span>
          <span>v2.13.5 · 8NEWS.AI</span>
        </div>
      </div>
    </footer>
  );
}
