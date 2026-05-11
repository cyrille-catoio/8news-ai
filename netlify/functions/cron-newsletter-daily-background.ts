import { createClient } from "@supabase/supabase-js";
import {
  getLatestTopSummary,
  getTopSummaryBulletsByDate,
  type TopSummaryRow,
  type TopSummaryBulletRow,
} from "../../src/lib/supabase/top-summaries";
import { renderDailyNewsletter } from "../../src/lib/email/render-daily-newsletter";
import type { Lang } from "../../src/lib/i18n";

/**
 * Background (≤15 min): sends the daily Top 24h newsletter to every
 * opted-in user via Resend.
 *
 * Trigger ONCE a day from cron-job.org GET:
 *   /.netlify/functions/cron-newsletter-daily-background?secret=$CRON_SECRET
 * Recommended schedule: `30 6 * * *` UTC — runs ~30 min after the
 * `cron-top-summary-background` tick (suggested `0 6 * * *`) so the
 * day's snapshot is freshly written before we read it.
 *
 * Editorial contract:
 *   - Body content = the per-day `top_summaries` snapshot for the
 *     user's `user_metadata.preferred_lang` (fallback to "en").
 *   - We render ONLY the grouped bullets + their source pills — the
 *     full `snapshot.articles` array is intentionally omitted to keep
 *     the email scannable on mobile (~3-4 screens vs. the full
 *     /top-articles page).
 *   - The website wording (gold serif titles, gold pill chips on dark
 *     surface) is mirrored inline so users get a familiar editorial
 *     register in their inbox.
 *
 * Opt-in:
 *   - `user_metadata.daily_newsletter === true` is the gate. NULL /
 *     missing / false → skipped. Toggled from the admin
 *     `<UsersSection>` table (v2.6.12+, see SPEC §Admin · Users).
 *   - `user_metadata.preferred_lang` (en|fr) decides which snapshot
 *     and which copy. Missing / unset → defaults to "en", matching
 *     the rest of the app's `resolveServerLang()` heuristic.
 *
 * Delivery:
 *   - Resend's `POST /emails/batch` endpoint (up to 100 emails per
 *     request). Same HTML/text payload per recipient — Resend doesn't
 *     support templating, so we duplicate the body per `to`. Cheap
 *     in bandwidth, simple in code, and lets each user keep their own
 *     bounce/unsubscribe context with Resend.
 *   - The Resend free tier (3000 emails/month) is more than enough
 *     to bootstrap; rate limit is 100 req/sec and we send 1 req per
 *     100 recipients per lang.
 *   - List-Unsubscribe header is included (mailto:) per RFC 8058 so
 *     Gmail/Outlook surface a one-click unsubscribe — replies are
 *     handled out-of-band (the user toggles their preference in the
 *     admin or the future SettingsPage opt-out).
 *
 * Auth: unlike internal-only crons, this endpoint has a large external
 * side effect (email every opted-in subscriber), so it fails closed
 * unless `CRON_SECRET` is configured and supplied as `?secret=` or
 * `x-cron-secret`. Returning a bare `void` matches Netlify Functions v2
 * — plain `{ statusCode, body }` objects crash the runtime with
 * "Function returned an unsupported value".
 */

const LANGS: readonly Lang[] = ["en", "fr"] as const;
/** Default fallback for users without `preferred_lang`. */
const DEFAULT_LANG: Lang = "en";
/** Resend batch endpoint accepts max 100 emails per request. */
const RESEND_BATCH_SIZE = 100;
/** Supabase Admin listUsers page size — max 1000. We loop until the
 *  page comes back smaller than this to support >1000 users without
 *  changing the function. */
const USERS_PAGE_SIZE = 1000;
const DEFAULT_FROM = "8news <newsletter@8news.ai>";
const DEFAULT_UNSUBSCRIBE_MAILTO = "unsubscribe@8news.ai";
const DEFAULT_PUBLIC_ORIGIN = "https://8news.ai";
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";

interface ResendBatchEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

interface ResendBatchResponse {
  data?: Array<{ id: string }>;
  error?: { message: string; name?: string };
}

function getSuppliedCronSecret(request: Request | undefined): string | null {
  if (!request) return null;
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (headerSecret) return headerSecret;

  try {
    return new URL(request.url).searchParams.get("secret")?.trim() || null;
  } catch {
    return null;
  }
}

function isAuthorizedCronRequest(request: Request | undefined): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = getSuppliedCronSecret(request);
  return Boolean(expected && supplied && supplied === expected);
}

async function runCron(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fromAddress = process.env.RESEND_FROM_ADDRESS?.trim() || DEFAULT_FROM;
  const unsubscribeMailto =
    process.env.NEWSLETTER_UNSUBSCRIBE_MAILTO?.trim() ||
    DEFAULT_UNSUBSCRIBE_MAILTO;
  const publicOrigin = (
    process.env.NEWSLETTER_PUBLIC_ORIGIN?.trim() || DEFAULT_PUBLIC_ORIGIN
  ).replace(/\/+$/, "");

  if (!apiKey) {
    console.error(
      "[cron-newsletter] RESEND_API_KEY not configured — aborting (set it in Netlify env vars)",
    );
    return;
  }
  if (!url || !key) {
    console.error(
      "[cron-newsletter] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — aborting",
    );
    return;
  }

  const startedAt = Date.now();
  const lines: string[] = [];

  // ----------------------------------------------------------------
  // 1) Pull the latest snapshot per lang. We use `getLatestTopSummary`
  //    (not "today's date") so we degrade gracefully when the
  //    `cron-top-summary-background` tick hasn't run yet (or failed)
  //    — better to ship yesterday's brief than to silently skip the
  //    whole send and have subscribers wonder where the email went.
  // ----------------------------------------------------------------
  const snapshots = new Map<
    Lang,
    { snapshot: TopSummaryRow; bullets: TopSummaryBulletRow[] }
  >();
  for (const lang of LANGS) {
    try {
      const snapshot = await getLatestTopSummary(lang);
      if (!snapshot) {
        lines.push(`[skip-snapshot] lang=${lang} reason=no_top_summary_row`);
        continue;
      }
      const bullets = await getTopSummaryBulletsByDate(
        lang,
        snapshot.summary_date,
      );
      if (bullets.length === 0) {
        lines.push(
          `[skip-snapshot] lang=${lang} reason=no_bullets date=${snapshot.summary_date}`,
        );
        continue;
      }
      snapshots.set(lang, { snapshot, bullets });
      lines.push(
        `[snapshot] lang=${lang} date=${snapshot.summary_date} bullets=${bullets.length}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      lines.push(`[skip-snapshot] lang=${lang} reason=throw — ${msg}`);
    }
  }

  if (snapshots.size === 0) {
    lines.push(
      `[run] cron=newsletter-daily aborted=no_snapshot elapsed_ms=${Date.now() - startedAt}`,
    );
    console.log(lines.join("\n"));
    return;
  }

  // ----------------------------------------------------------------
  // 2) List opted-in subscribers and bucket them by lang. Supabase
  //    Admin listUsers caps at 1000/page so we loop until a short
  //    page comes back. We don't try to load all metadata into memory
  //    — just (email, lang) tuples to keep the heap small even with
  //    50k+ users.
  // ----------------------------------------------------------------
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const subscribersByLang = new Map<Lang, string[]>();
  let totalUsers = 0;
  let totalOptIn = 0;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: USERS_PAGE_SIZE,
    });
    if (error) {
      lines.push(
        `[error] listUsers page=${page} — ${error.message}; aborting send`,
      );
      console.error(lines.join("\n"));
      return;
    }
    const users = data.users ?? [];
    totalUsers += users.length;

    for (const u of users) {
      if (u.user_metadata?.daily_newsletter !== true) continue;
      const email = (u.email ?? "").trim();
      if (!email) continue;
      const rawLang = u.user_metadata?.preferred_lang;
      const lang: Lang =
        rawLang === "fr" ? "fr" : rawLang === "en" ? "en" : DEFAULT_LANG;
      // If we don't have a snapshot for this lang, fall back to the
      // other one rather than dropping the user — they still get the
      // brief, just in the alternate language. Better than nothing.
      const effectiveLang: Lang = snapshots.has(lang)
        ? lang
        : snapshots.has(DEFAULT_LANG)
          ? DEFAULT_LANG
          : (Array.from(snapshots.keys())[0] as Lang);
      const arr = subscribersByLang.get(effectiveLang) ?? [];
      arr.push(email);
      subscribersByLang.set(effectiveLang, arr);
      totalOptIn += 1;
    }

    if (users.length < USERS_PAGE_SIZE) break;
    page += 1;
    // Safety brake — should never trigger on a sane user base.
    if (page > 100) {
      lines.push(`[warn] listUsers loop hit page=${page}; bailing out`);
      break;
    }
  }

  lines.push(
    `[users] total=${totalUsers} opted_in=${totalOptIn} en=${subscribersByLang.get("en")?.length ?? 0} fr=${subscribersByLang.get("fr")?.length ?? 0}`,
  );

  if (totalOptIn === 0) {
    lines.push(
      `[run] cron=newsletter-daily sent=0 errors=0 elapsed_ms=${Date.now() - startedAt} note=no_subscribers`,
    );
    console.log(lines.join("\n"));
    return;
  }

  // ----------------------------------------------------------------
  // 3) For each lang bucket: render once, then ship in
  //    RESEND_BATCH_SIZE chunks. Per-batch try/catch — a failed
  //    batch doesn't abort the run, we just log and continue.
  // ----------------------------------------------------------------
  let totalSent = 0;
  let totalErrors = 0;

  for (const [lang, recipients] of subscribersByLang.entries()) {
    const bundle = snapshots.get(lang);
    if (!bundle) {
      // Defensive — should be impossible given the fallback above,
      // but better than dropping recipients silently.
      lines.push(
        `[skip-lang] lang=${lang} subscribers=${recipients.length} reason=snapshot_missing_after_fallback`,
      );
      continue;
    }

    const { subject, html, text } = renderDailyNewsletter({
      snapshot: bundle.snapshot,
      bullets: bundle.bullets,
      lang,
      origin: publicOrigin,
    });

    for (let i = 0; i < recipients.length; i += RESEND_BATCH_SIZE) {
      const slice = recipients.slice(i, i + RESEND_BATCH_SIZE);
      const batchNo = Math.floor(i / RESEND_BATCH_SIZE) + 1;
      const payload: ResendBatchEmail[] = slice.map((to) => ({
        from: fromAddress,
        to,
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<mailto:${unsubscribeMailto}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }));

      const batchStart = Date.now();
      try {
        const res = await fetch(RESEND_BATCH_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const bodyText = await res.text();
        let json: ResendBatchResponse | null = null;
        try {
          json = bodyText ? (JSON.parse(bodyText) as ResendBatchResponse) : null;
        } catch {
          json = null;
        }

        if (!res.ok || json?.error) {
          const msg =
            json?.error?.message ??
            bodyText.slice(0, 200) ??
            `HTTP ${res.status}`;
          totalErrors += slice.length;
          lines.push(
            `[error] lang=${lang} batch=${batchNo} count=${slice.length} http=${res.status} elapsed_ms=${Date.now() - batchStart} — ${msg}`,
          );
          continue;
        }

        const accepted = json?.data?.length ?? slice.length;
        totalSent += accepted;
        lines.push(
          `[ok] lang=${lang} batch=${batchNo} count=${accepted} elapsed_ms=${Date.now() - batchStart}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        totalErrors += slice.length;
        lines.push(
          `[error] lang=${lang} batch=${batchNo} count=${slice.length} elapsed_ms=${Date.now() - batchStart} reason=throw — ${msg}`,
        );
      }
    }
  }

  const summaryDates = Array.from(snapshots.entries())
    .map(([l, b]) => `${l}=${b.snapshot.summary_date}`)
    .join(",");
  lines.push(
    `[run] cron=newsletter-daily snapshots=${summaryDates} sent=${totalSent} errors=${totalErrors} elapsed_ms=${Date.now() - startedAt}`,
  );
  console.log(lines.join("\n"));
}

export default async (request?: Request): Promise<void> => {
  if (!isAuthorizedCronRequest(request)) {
    console.error(
      `[cron-newsletter] Unauthorized cron trigger — CRON_SECRET ${process.env.CRON_SECRET ? "configured" : "missing"}`,
    );
    return;
  }

  await runCron();
};
