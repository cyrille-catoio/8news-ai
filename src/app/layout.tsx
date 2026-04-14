import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import "./globals.css";
import { AuthProvider } from "./providers";

const GA_ID = "G-X8RR3FMCR0";

export const metadata: Metadata = {
  title: "8news.ai — AI that decodes the news",
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
    <html lang="en">
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
            <Link href="/summaries" style={{ color: "#999", textDecoration: "none" }}>Daily Summaries</Link>
            <a href="/sitemap.xml" style={{ color: "#666", textDecoration: "none" }}>Sitemap</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
