import type { Metadata } from "next";
import {
  generateDailySummaryMetadata,
  renderDailySummaryPage,
} from "@/app/daily-summary-page";

interface PageProps {
  params: Promise<{ topic: string; date: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { topic, date, slug } = await params;
  return generateDailySummaryMetadata({ lang: "fr", topicId: topic, date, slug });
}

export default async function FrenchDailySummaryPage({ params }: PageProps) {
  const { topic, date, slug } = await params;
  return renderDailySummaryPage({ lang: "fr", topicId: topic, date, slug });
}
