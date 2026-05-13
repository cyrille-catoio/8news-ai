import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mentions légales — 8news.ai",
  description: "Mentions légales et informations d'édition du site 8NEWS / 8news.ai.",
  alternates: {
    canonical: "https://8news.ai/mentions-legales",
  },
};

const pageStyle = {
  minHeight: "100vh",
  background: "#000",
  color: "#f5f5f5",
  padding: "56px 20px 80px",
} as const;

const wrapStyle = {
  maxWidth: 760,
  margin: "0 auto",
} as const;

const cardStyle = {
  background: "#0a0a0a",
  border: "1px solid #1f1f1f",
  borderRadius: 14,
  padding: "28px 30px",
  lineHeight: 1.65,
} as const;

const labelStyle = {
  color: "#c9a227",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  marginBottom: 8,
} as const;

export default function LegalNoticePage() {
  return (
    <main style={pageStyle}>
      <div style={wrapStyle}>
        <Link
          href="/"
          style={{
            color: "#c9a227",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          ← Retour à l'accueil
        </Link>

        <section style={{ ...cardStyle, marginTop: 22 }}>
          <div style={labelStyle}>Mentions légales</div>
          <h1
            style={{
              fontFamily: "ui-serif, Georgia, serif",
              fontSize: "clamp(34px, 6vw, 54px)",
              lineHeight: 1.05,
              fontWeight: 400,
              margin: "0 0 20px",
            }}
          >
            Propriété et édition du site
          </h1>

          <p style={{ color: "#c8c8c8", marginTop: 0 }}>
            Le site web <strong style={{ color: "#fff" }}>8NEWS</strong>,
            accessible notamment via <strong style={{ color: "#fff" }}>8news.ai</strong>,
            est édité et exploité par la société suivante :
          </p>

          <dl style={{ display: "grid", gap: 12, margin: "24px 0" }}>
            <div>
              <dt style={labelStyle}>Société</dt>
              <dd style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>8SEED</dd>
            </div>
            <div>
              <dt style={labelStyle}>SIREN</dt>
              <dd style={{ margin: 0, fontSize: 18 }}>941414617</dd>
            </div>
            <div>
              <dt style={labelStyle}>Contact</dt>
              <dd style={{ margin: 0, fontSize: 18 }}>
                <a
                  href="mailto:contact@8seed.ai"
                  style={{ color: "#c9a227", textDecoration: "none", fontWeight: 700 }}
                >
                  contact@8seed.ai
                </a>
              </dd>
            </div>
          </dl>

          <p style={{ color: "#8a8a8a", fontSize: 13, marginBottom: 0 }}>
            Pour toute question relative au site, à son contenu ou à son exploitation,
            vous pouvez contacter l'éditeur à l'adresse email ci-dessus.
          </p>
        </section>
      </div>
    </main>
  );
}
