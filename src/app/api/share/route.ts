import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS, parseLang } from "@/lib/api-helpers";
import { renderShareEmail } from "@/lib/email/render-share-email";

/**
 * Share-by-email endpoint backing the « Share » modal on the SSR
 * detail pages (video page, daily summary, video roundup).
 *
 * POST /api/share
 *   body: { to: string, url: string, title: string, message?: string, lang?: "en"|"fr" }
 *
 * Anti-abuse (the endpoint is public — anyone could turn it into a
 * spam relay otherwise):
 *  - Per-IP token bucket: 5 sends / 10 min. Same in-memory pattern as
 *    `/api/user/event` (resets on Lambda cold start — acceptable).
 *  - The shared URL is never trusted as-is: we only keep its pathname
 *    and rebuild the absolute URL on the public origin, so the email
 *    can only ever link to an 8news.ai page.
 *  - Hard caps on title / message length.
 */

export const dynamic = "force-dynamic";

const DEFAULT_FROM = "8news <newsletter@8news.ai>";
const DEFAULT_PUBLIC_ORIGIN = "https://8news.ai";
const RESEND_SINGLE_URL = "https://api.resend.com/emails";

const MAX_EMAIL_LEN = 254;
const MAX_TITLE_LEN = 300;
const MAX_MESSAGE_LEN = 1000;
const MAX_PATH_LEN = 512;

// 5 share emails per 10 minutes per IP — generous for a human, useless
// for a spammer. Module-level so it survives across requests within
// the same Lambda instance.
const RATE_LIMIT_WINDOW_MS = 600_000;
const RATE_LIMIT_MAX_HITS = 5;
const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (ipHits.get(ip) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= RATE_LIMIT_MAX_HITS) {
    ipHits.set(ip, arr);
    return true;
  }
  arr.push(now);
  ipHits.set(ip, arr);
  if (ipHits.size > 1024) {
    for (const [k, v] of ipHits) {
      if (v.length === 0 || (v[v.length - 1] ?? 0) < cutoff) ipHits.delete(k);
    }
  }
  return false;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isValidEmail(s: string): boolean {
  return s.length <= MAX_EMAIL_LEN && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Rebuild the shared URL on the public origin from its pathname only.
 * Returns null when the input is not a parseable URL or its path is
 * suspicious — the caller answers 400.
 */
function sanitizeShareUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const pathname = parsed.pathname;
  if (!pathname.startsWith("/") || pathname.length > MAX_PATH_LEN) return null;
  const origin = (
    process.env.NEWSLETTER_PUBLIC_ORIGIN?.trim() || DEFAULT_PUBLIC_ORIGIN
  ).replace(/\/+$/, "");
  return `${origin}${pathname}`;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limited", reason: "rate_limited" },
      { status: 429, headers: NO_STORE_HEADERS },
    );
  }

  let body: { to?: unknown; url?: unknown; title?: unknown; message?: unknown; lang?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", reason: "bad_json" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!isValidEmail(to)) {
    return NextResponse.json(
      { error: "Invalid recipient email", reason: "bad_email" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const url = typeof body.url === "string" ? sanitizeShareUrl(body.url.trim()) : null;
  if (!url) {
    return NextResponse.json(
      { error: "Invalid share URL", reason: "bad_url" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LEN) : "";
  if (!title) {
    return NextResponse.json(
      { error: "Missing title", reason: "bad_title" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LEN) : "";
  const lang = parseLang(typeof body.lang === "string" ? body.lang : null);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[api/share] RESEND_API_KEY not set — share email dropped");
    return NextResponse.json(
      { error: "Email not configured", reason: "resend_missing" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  const fromAddress = process.env.RESEND_FROM_ADDRESS?.trim() || DEFAULT_FROM;

  const { subject, html, text } = renderShareEmail({ url, title, message, lang });

  try {
    const res = await fetch(RESEND_SINGLE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress, to, subject, html, text }),
    });
    const bodyText = await res.text();
    let json: { id?: string; error?: { message: string } } | null = null;
    try {
      json = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      json = null;
    }

    if (!res.ok || json?.error) {
      const msg = json?.error?.message ?? bodyText.slice(0, 200) ?? `HTTP ${res.status}`;
      console.error(`[api/share] Resend error (${res.status}): ${msg}`);
      return NextResponse.json(
        { error: "Send failed", reason: "resend_error" },
        { status: 502, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true, messageId: json?.id ?? null },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[api/share] fetch threw: ${msg}`);
    return NextResponse.json(
      { error: "Send failed", reason: "fetch_throw" },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}
