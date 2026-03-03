import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NewsRead — Conflit USA/Israël vs Iran",
  description: "Résumé des dernières actualités sur le conflit USA/Israël vs Iran, issues de 10 flux RSS et filtrées par IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased font-sans"
      style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
