import Link from "next/link";
import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

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
              {col.links.map((l, j) => (
                <a key={j} href="#">{l}</a>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>{f.copy[lang]}</span>
          <span>v2.6.6 · 8NEWS.AI</span>
        </div>
      </div>
    </footer>
  );
}
