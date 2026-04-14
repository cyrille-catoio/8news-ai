import type { Metadata } from "next";
import { SummaryExplorer } from "@/app/components/SummaryExplorer";
import type { Lang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Daily Summaries — 8news.ai",
  description: "Browse AI-generated daily news summaries by topic and date.",
};

export default async function SummariesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang: Lang = rawLang === "fr" ? "fr" : "en";
  return <SummaryExplorer lang={lang} />;
}
