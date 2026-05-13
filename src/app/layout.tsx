import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { Geist, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./providers";

const GA_ID = "G-X8RR3FMCR0";

// Landing-page fonts. Exposed as CSS variables (referenced by
// src/app/landing.css under `.landing-root`). They are not applied to the
// SPA or SSR pages — those keep the default system stack from globals.css.
const fontGeist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-geist",
  display: "swap",
});
const fontInstrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});
const fontJetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "8news.ai —  Tech • IA • Crypto",
  description:
    "8news.ai — AI-powered summary of the latest news on conflict, AI, crypto and robotics.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontGeist.variable} ${fontInstrumentSerif.variable} ${fontJetBrainsMono.variable}`}>
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
        </Script>
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <footer style={{ maxWidth: 916, margin: "0 auto", padding: "20px 20px 40px", borderTop: "1px solid #2a2a2a" }}>
          <nav style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", fontSize: 12 }}>
            <Link href="/archives" style={{ color: "#999", textDecoration: "none" }}>Archives</Link>
            <Link href="/mentions-legales" style={{ color: "#999", textDecoration: "none" }}>Mentions légales</Link>
            <a href="/sitemap.xml" style={{ color: "#666", textDecoration: "none" }}>Sitemap</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
