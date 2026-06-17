import type { NextConfig } from "next";

// These are client-side SPA routes managed by pushState in src/app/app/page.tsx.
// On a hard refresh, the browser requests them from the server. We rewrite
// them to "/app" before Next.js tries to match filesystem routes (otherwise
// paths like /app/videos would hit a 404 since there is no [...] catch-all).
const SPA_ROUTES = [
  "/app",
  "/app/articles",
  "/app/my-topics",
  "/app/videos",
  "/app/channels",
  "/app/stats",
  "/app/crons",
  "/app/topics",
  "/app/settings",
  "/app/changelog",
  "/app/feeds",
  "/app/categories",
  "/app/favorites",
  "/app/daily-summaries",
  "/app/youtube-channels",
  "/app/users",
  "/app/user-activity",
  "/app/top-articles",
  "/app/summaries-browse",
];

const nextConfig: NextConfig = {
  experimental: {
    // Next 16.1 enables Turbopack's persistent filesystem cache in dev.
    // On this workspace it can corrupt `.next/dev` and produce blank pages
    // (missing manifests / ENOENT). Keep hot reload, but rebuild from
    // memory each dev session for a stable localhost.
    turbopackFileSystemCacheForDev: false,
  },
  async rewrites() {
    return {
      beforeFiles: SPA_ROUTES.map((source) => ({ source, destination: "/app" })),
    };
  },
};

export default nextConfig;
