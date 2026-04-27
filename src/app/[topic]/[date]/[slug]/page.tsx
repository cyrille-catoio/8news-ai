import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getDailySummary, getDailySummariesBySlug, getTopicById } from "@/lib/supabase";
import { resolveServerLang } from "@/lib/server-lang";
import { summaryPath } from "@/lib/summary-routes";

interface PageProps {
  params: Promise<{ topic: string; date: string; slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Redirecting | 8news.ai",
    robots: { index: false, follow: true },
  };
}

export default async function LegacyDailySummaryPage({ params, searchParams }: PageProps) {
  const { topic: topicId, date, slug } = await params;
  const { lang: rawLang } = await searchParams;
  const preferredLang = await resolveServerLang(rawLang);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const topic = await getTopicById(topicId);
  if (!topic) notFound();

  const matches = await getDailySummariesBySlug(topicId, date, slug);
  const exact = matches.find((summary) => summary.lang === preferredLang) ?? matches[0];
  if (exact) {
    permanentRedirect(summaryPath(exact));
  }

  const altLang = preferredLang === "fr" ? "en" : "fr";
  const [preferredSummary, altSummary] = await Promise.all([
    getDailySummary(topicId, date, preferredLang),
    getDailySummary(topicId, date, altLang),
  ]);
  const canonical = preferredSummary ?? altSummary;
  if (canonical) {
    permanentRedirect(summaryPath(canonical));
  }

  notFound();
}
