import Link from "next/link";
import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

export function LandingCTA({ lang }: { lang: LandingLang }) {
  const c = LANDING_CONTENT.ctaStrip;
  return (
    <div className="cta-strip">
      <div className="wrap">
        <h2 dangerouslySetInnerHTML={{ __html: c.title[lang] }} />
        <div className="ctas">
          <Link href="/app" className="btn-primary" style={{ padding: "16px 28px", fontSize: 15 }}>
            {c.primary[lang]}
          </Link>
          <Link href="/summaries" className="btn-ghost" style={{ padding: "16px 28px", fontSize: 15 }}>
            {c.secondary[lang]}
          </Link>
        </div>
      </div>
    </div>
  );
}
