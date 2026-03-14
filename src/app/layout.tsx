import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
