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
          ← Retour à l&apos;accueil
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
            vous pouvez contacter l&apos;éditeur à l&apos;adresse email ci-dessus.
          </p>
        </section>

        <section style={{ ...cardStyle, marginTop: 22 }}>
          <div style={labelStyle}>Mesure d&apos;audience</div>
          <h2
            style={{
              fontFamily: "ui-serif, Georgia, serif",
              fontSize: "clamp(22px, 4vw, 32px)",
              lineHeight: 1.15,
              fontWeight: 400,
              margin: "0 0 16px",
            }}
          >
            Journal d&apos;événements d&apos;interface
          </h2>
          <p style={{ color: "#c8c8c8", marginTop: 0 }}>
            Pour améliorer le produit, 8NEWS journalise de manière anonyme les
            interactions d&apos;interface (clics sur les menus, ouverture des
            paragraphes du podcast, navigation dans l&apos;historique, lectures
            audio, etc.). Aucune donnée personnelle identifiante n&apos;est
            collectée (pas d&apos;adresse IP stockée, pas de fingerprinting).
          </p>
          <p style={{ color: "#c8c8c8" }}>
            Les visiteurs non connectés sont identifiés par un identifiant
            aléatoire (UUID) stocké dans un cookie <code style={{ background: "#1a1a1a", padding: "1px 6px", borderRadius: 4 }}>visitor_id</code>{" "}
            valable un an, afin de mesurer la conversion vers la création de
            compte. Les utilisateurs authentifiés sont identifiés par leur
            <code style={{ background: "#1a1a1a", padding: "1px 6px", borderRadius: 4 }}> user_id</code> Supabase.
          </p>
          <p style={{ color: "#8a8a8a", fontSize: 13, marginBottom: 0 }}>
            Pour vous opposer à cette collecte, vous pouvez supprimer le cookie{" "}
            <code style={{ background: "#1a1a1a", padding: "1px 6px", borderRadius: 4 }}>visitor_id</code>{" "}
            depuis les paramètres de votre navigateur. Pour les utilisateurs
            inscrits, la suppression du compte efface également les identifiants
            associés aux événements (rendus anonymes via{" "}
            <code style={{ background: "#1a1a1a", padding: "1px 6px", borderRadius: 4 }}>ON DELETE SET NULL</code>).
          </p>
        </section>
      </div>
    </main>
  );
}
