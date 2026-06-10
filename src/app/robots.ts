import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/video-transcript",
        "/api/youtube-channels/transcript",
      ],
    },
    sitemap: "https://8news.ai/sitemap.xml",
  };
}
