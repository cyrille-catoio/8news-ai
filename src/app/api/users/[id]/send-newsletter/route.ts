import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOwnerSession } from "@/lib/auth-api";
import {
  getLatestTopSummary,
  getTopSummaryBulletsByDate,
} from "@/lib/supabase/top-summaries";
import { renderDailyNewsletter } from "@/lib/email/render-daily-newsletter";
import type { Lang } from "@/lib/i18n";

/**
 * One-off newsletter send — owner-only test path used from the admin
 * `<UsersSection>` row icons. Mirrors `cron-newsletter-daily-background`
 * but for a single recipient, so the operator can validate the
 * rendering / deliverability without waiting for the next scheduled
 * tick (or temporarily flipping their own `daily_newsletter` flag).
 *
 * Resolution rules (kept aligned with the cron so what arrives here
 * matches what arrives in the daily tick):
 *  - Pull the user record by id from `auth.users` to read `email` +
 *    `user_metadata.preferred_lang`. Fallback to `"en"` when unset
 *    (same heuristic as the cron's bucketing).
 *  - Pull the latest `top_summaries` snapshot for that lang via
 *    `getLatestTopSummary(lang)` and its bullets via
 *    `getTopSummaryBulletsByDate`. Degrade to yesterday's brief if
 *    today's cron tick hasn't landed yet — sending the previous day's
 *    digest is more useful than aborting on a freshly-rebooted env.
 *  - If a lang's snapshot is missing, fall back to the alternate lang
 *    snapshot (same fallback as the cron). Return 404 with a typed
 *    `reason` when no snapshot exists in any lang.
 *  - Ship via Resend `POST /emails` (single-recipient endpoint, not
 *    batch — there's only one `to`). Reuses the env vars
 *    `RESEND_API_KEY` / `RESEND_FROM_ADDRESS` / `NEWSLETTER_*` so a
 *    single Netlify config covers both the cron and this route.
 *
 * Returns: `{ ok, messageId, summaryDate, summaryLang }` on success;
 * `{ error, reason }` with a typed reason on failure so the admin UI
 * can show a meaningful toast.
 */

const DEFAULT_FROM = "8news <newsletter@8news.ai>";
const DEFAULT_UNSUBSCRIBE_MAILTO = "unsubscribe@8news.ai";
const DEFAULT_PUBLIC_ORIGIN = "https://8news.ai";
const RESEND_SINGLE_URL = "https://api.resend.com/emails";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const apiKey = process.env.RESEND_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "DB not configured", reason: "db_missing" },
      { status: 500 },
    );
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not set", reason: "resend_missing" },
      { status: 500 },
    );
  }

  const fromAddress =
    process.env.RESEND_FROM_ADDRESS?.trim() || DEFAULT_FROM;
  const unsubscribeMailto =
    process.env.NEWSLETTER_UNSUBSCRIBE_MAILTO?.trim() ||
    DEFAULT_UNSUBSCRIBE_MAILTO;
  const publicOrigin = (
    process.env.NEWSLETTER_PUBLIC_ORIGIN?.trim() || DEFAULT_PUBLIC_ORIGIN
  ).replace(/\/+$/, "");

  const { id } = await params;
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing, error: getErr } = await supabase.auth.admin.getUserById(id);
  if (getErr || !existing?.user) {
    return NextResponse.json(
      { error: "User not found", reason: "user_not_found" },
      { status: 404 },
    );
  }
  const recipient = (existing.user.email ?? "").trim();
  if (!recipient) {
    return NextResponse.json(
      { error: "User has no email", reason: "user_no_email" },
      { status: 400 },
    );
  }

  const rawLang = existing.user.user_metadata?.preferred_lang;
  const preferred: Lang =
    rawLang === "fr" ? "fr" : rawLang === "en" ? "en" : "en";

  // Try preferred lang first, then fall back to the other lang so a
  // test send works even when the snapshot for one lang is missing
  // (early-deploy state, failed cron tick). Same defensive fallback
  // as the daily cron — keeps the test rig honest.
  const tryLangs: Lang[] = preferred === "fr" ? ["fr", "en"] : ["en", "fr"];
  let summaryLang: Lang | null = null;
  let snapshot: Awaited<ReturnType<typeof getLatestTopSummary>> | null = null;
  let bullets: Awaited<ReturnType<typeof getTopSummaryBulletsByDate>> = [];

  for (const l of tryLangs) {
    const snap = await getLatestTopSummary(l);
    if (!snap) continue;
    const bts = await getTopSummaryBulletsByDate(l, snap.summary_date);
    if (bts.length === 0) continue;
    summaryLang = l;
    snapshot = snap;
    bullets = bts;
    break;
  }

  if (!snapshot || !summaryLang) {
    return NextResponse.json(
      {
        error:
          "No Top 24h snapshot available yet — wait for cron-top-summary-background to write one",
        reason: "no_snapshot",
      },
      { status: 404 },
    );
  }

  const { subject, html, text } = renderDailyNewsletter({
    snapshot,
    bullets,
    lang: summaryLang,
    origin: publicOrigin,
  });

  try {
    const res = await fetch(RESEND_SINGLE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipient,
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<mailto:${unsubscribeMailto}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    const bodyText = await res.text();
    let json: { id?: string; error?: { message: string; name?: string } } | null = null;
    try {
      json = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      json = null;
    }

    if (!res.ok || json?.error) {
      const msg =
        json?.error?.message ?? bodyText.slice(0, 200) ?? `HTTP ${res.status}`;
      return NextResponse.json(
        {
          error: msg,
          reason: "resend_error",
          httpStatus: res.status,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      messageId: json?.id ?? null,
      to: recipient,
      summaryDate: snapshot.summary_date,
      summaryLang,
      fellBackLang: summaryLang !== preferred,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: msg, reason: "fetch_throw" },
      { status: 502 },
    );
  }
}
