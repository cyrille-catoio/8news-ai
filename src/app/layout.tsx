import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "8news.ai — USA/Israel vs Iran Conflict",
  description:
    "8news.ai — AI-powered summary of the latest news on the USA/Israel vs Iran conflict, aggregated from 10 RSS feeds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
