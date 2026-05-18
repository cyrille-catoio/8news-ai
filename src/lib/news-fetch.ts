import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { SummaryResponse } from "@/lib/types";

/**
 * `/api/news` client wrapper used by the SPA `Home` component.
 *
 * v2.12 extracted from `src/app/app/page.tsx` so the SPA shell stays
 * focused on composition + state. The behavior is byte-identical to
 * what was previously inlined.
 *
 * Surface:
 *   - `fetchNewsApi(url, lang)` — main entry. Retries once on transient
 *     HTTP errors (502/503/504) with a small delay, surfaces an i18n
 *     message on failure.
 *   - `PERIODS` — the period chips ladder rendered by the home (30m,
 *     1h, …, 3mo).
 */

export const NEWS_API_TRANSIENT_STATUSES = new Set([502, 503, 504]);
export const NEWS_API_RETRY_DELAY_MS = 750;
export const MAX_VISIBLE_ERROR_CHARS = 280;

export const PERIODS = [
  { label: "30 m",  hours: 0.5 },
  { label: "1 h",   hours: 1 },
  { label: "3 h",   hours: 3 },
  { label: "6 h",   hours: 6 },
  { label: "12 h",  hours: 12 },
  { label: "24 h",  hours: 24 },
  { label: "48 h",  hours: 48 },
  { label: "3 d",   hours: 72 },
  { label: "7 d",   hours: 168 },
  { label: "14 d",  hours: 336 },
  { label: "30 d",  hours: 720 },
  { label: "2 mo",  hours: 1440 },
  { label: "3 mo",  hours: 2160 },
] as const;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isHtmlErrorResponse(text: string, contentType: string): boolean {
  const trimmed = text.trimStart();
  return (
    contentType.toLowerCase().includes("text/html") ||
    /^<!doctype html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed)
  );
}

export async function safeNewsApiErrorMessage(res: Response, lang: Lang): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().includes("application/json")) {
    const body = await res.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
    const message = typeof body?.error === "string" ? body.error : typeof body?.message === "string" ? body.message : "";
    if (message.trim()) return message.trim();
  }

  const text = await res.text().catch(() => "");
  if (NEWS_API_TRANSIENT_STATUSES.has(res.status) || isHtmlErrorResponse(text, contentType)) {
    return t("temporaryServerError", lang);
  }

  const trimmed = text.trim();
  if (trimmed.length > 0) return trimmed.slice(0, MAX_VISIBLE_ERROR_CHARS);
  return `${t("unknownError", lang)} (HTTP ${res.status})`;
}

export async function fetchNewsApi(url: string, lang: Lang): Promise<SummaryResponse> {
  let res = await fetch(url, { cache: "no-store" });
  if (NEWS_API_TRANSIENT_STATUSES.has(res.status)) {
    await delay(NEWS_API_RETRY_DELAY_MS);
    res = await fetch(url, { cache: "no-store" });
  }

  if (!res.ok) {
    throw new Error(await safeNewsApiErrorMessage(res, lang));
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const text = await res.text().catch(() => "");
    if (isHtmlErrorResponse(text, contentType)) {
      throw new Error(t("temporaryServerError", lang));
    }
    throw new Error(t("unknownError", lang));
  }

  try {
    return await res.json() as SummaryResponse;
  } catch {
    throw new Error(t("temporaryServerError", lang));
  }
}
