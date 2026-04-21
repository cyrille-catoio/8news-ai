import type { Metadata } from "next";
import "./landing.css";
import type { LandingLang } from "@/lib/landing-content";
import { LandingNav } from "@/app/components/landing/LandingNav";
import { LandingHero } from "@/app/components/landing/LandingHero";
import { LandingTicker } from "@/app/components/landing/LandingTicker";
import { LandingStats } from "@/app/components/landing/LandingStats";
import { LandingHow } from "@/app/components/landing/LandingHow";
import { LandingTopics } from "@/app/components/landing/LandingTopics";
import { LandingYT } from "@/app/components/landing/LandingYT";
import { LandingPricing } from "@/app/components/landing/LandingPricing";
import { LandingFAQ } from "@/app/components/landing/LandingFAQ";
import { LandingCTA } from "@/app/components/landing/LandingCTA";
import { LandingFooter } from "@/app/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "8news.ai — Tech decoded by AI · Two hours of YouTube, read in eight minutes",
  description:
    "8news aggregates the YouTube channels you actually care about and 400+ RSS feeds, scores every article from 1 to 10 with AI. EN / FR.",
  alternates: {
    canonical: "https://8news.ai",
    languages: {
      en: "https://8news.ai?lang=en",
      fr: "https://8news.ai?lang=fr",
    },
  },
  openGraph: {
    title: "8news.ai — Tech decoded by AI",
    description: "Two hours of YouTube, read in 8 minutes. AI-curated tech news in EN / FR.",
    url: "https://8news.ai",
    siteName: "8news.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "8news.ai — Tech decoded by AI",
    description: "Two hours of YouTube, read in eight minutes.",
  },
};

interface PageProps {
  searchParams: Promise<{ lang?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const lang: LandingLang = params.lang === "en" ? "en" : "fr";

  return (
    <div className="landing-root" data-lang={lang} data-hero="sober">
      <LandingNav lang={lang} />
      <LandingHero lang={lang} />
      <LandingTicker lang={lang} />
      <LandingStats lang={lang} />
      <LandingYT lang={lang} />
      <LandingHow lang={lang} />
      <LandingTopics lang={lang} />
      <LandingPricing lang={lang} />
      <LandingFAQ lang={lang} />
      <LandingCTA lang={lang} />
      <LandingFooter lang={lang} />
    </div>
  );
}
