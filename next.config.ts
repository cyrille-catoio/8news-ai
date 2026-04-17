import type { NextConfig } from "next";

// These are client-side SPA routes managed by pushState in page.tsx.
// On a hard refresh, the browser requests them from the server. We rewrite
// them to "/" before Next.js tries to match filesystem routes (otherwise
// /videos would hit [topic]/page.tsx → notFound() → 404).
const SPA_ROUTES = [
  "/stats",
  "/crons",
  "/topics",
  "/settings",
  "/changelog",
  "/feeds",
  "/categories",
  "/favorites",
  "/daily-summaries",
  "/videos",
  "/youtube-channels",
  "/top-articles",
  "/summaries-browse",
];

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: SPA_ROUTES.map((source) => ({ source, destination: "/" })),
    };
  },
};

export default nextConfig;
