import type { Lang } from "@/lib/i18n";

export interface SummaryRouteParts {
  lang: string;
  topic_id?: string;
  topicId?: string;
  summary_date?: string;
  date?: string;
  slug_keywords?: string;
  slug?: string;
}

export function isSummaryLang(value: string | undefined): value is Lang {
  return value === "fr" || value === "en";
}

export function summaryPath(parts: SummaryRouteParts): string {
  if (!isSummaryLang(parts.lang)) {
    throw new Error(`Invalid summary lang: ${parts.lang}`);
  }
  const topic = parts.topic_id ?? parts.topicId;
  const date = parts.summary_date ?? parts.date;
  const slug = parts.slug_keywords ?? parts.slug;
  if (!topic || !date || !slug) {
    throw new Error("Missing summary route parts");
  }
  return `/${parts.lang}/${topic}/${date}/${slug}`;
}

export function summaryAbsoluteUrl(parts: SummaryRouteParts): string {
  return `https://8news.ai${summaryPath(parts)}`;
}
