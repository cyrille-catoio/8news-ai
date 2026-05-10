/**
 * Pure rendering of the daily newsletter HTML + plain-text bodies.
 *
 * Consumed by `netlify/functions/cron-newsletter-daily-background.ts`.
 * Kept in `src/lib/email/` and free of any I/O so it can be unit-tested
 * in isolation and reused later (e.g. preview route, re-send tooling).
 *
 * Editorial contract — same as the home `<Top24hHero>` accordion the
 * user already sees on /app:
 *   - Bullets are grouped by `title` (consecutive same-title runs).
 *   - Each group renders as: a gold serif title, body paragraphs in
 *     white, and a row of source pills (one per ref) that deep-link to
 *     the original article.
 *   - The full `snapshot.articles` array is intentionally **NOT**
 *     rendered: the user requested only the grouped bullets + their
 *     refs to keep the email lightweight and scannable.
 *
 * Email-client safety:
 *   - All styling is inline (Gmail / Outlook strip `<style>` blocks).
 *   - Layout uses a single 600px-max wrapper `<table>` plus stacked
 *     `<div>`s — no flex/grid (Outlook still ignores them in 2026).
 *   - Color tokens duplicated (not imported from `@/lib/theme`) so the
 *     module stays free of Next.js path aliases and can be required
 *     from a Netlify Function without bundler config gymnastics.
 *   - `Intl.DateTimeFormat` is the only Node-builtin dep.
 *
 * The plain-text body mirrors the structure (title, bullets, sources)
 * but strips HTML — improves deliverability (Gmail compares text vs.
 * HTML for spam scoring) and helps clients that opt out of HTML.
 */

import type { Lang } from "@/lib/i18n";
import { t, dateLocale } from "@/lib/i18n";
import type {
  TopSummaryRow,
  TopSummaryBulletRow,
} from "@/lib/supabase/top-summaries";

// --- Color tokens (kept in sync with `src/lib/theme.ts`) ----------
// Duplicated on purpose so this module has zero runtime deps on
// `@/lib/theme` (which transitively pulls React-only stuff). Any
// drift here is harmless: emails don't share styles with the SPA.
const COLOR = {
  bg: "#0a0a0a",
  surface: "#111111",
  border: "#262626",
  text: "#f5f5f4",
  textDim: "#a3a3a3",
  textSecondary: "#d4d4d8",
  gold: "#c9a227",
  goldSoft: "rgba(201, 162, 39, 0.10)",
  goldRing: "rgba(201, 162, 39, 0.45)",
} as const;

interface Group {
  title: string;
  bullets: TopSummaryBulletRow[];
}

/** Same logic as `<Top24hHero>.groupBullets` — fold consecutive bullets
 *  sharing the same title. Untitled bullets each become their own
 *  empty-title group so the order is preserved. */
function groupBullets(bullets: TopSummaryBulletRow[]): Group[] {
  const out: Group[] = [];
  for (const b of bullets) {
    const tt = (b.title ?? "").trim();
    if (!tt) {
      out.push({ title: "", bullets: [b] });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.title === tt) last.bullets.push(b);
    else out.push({ title: tt, bullets: [b] });
  }
  return out;
}

/** Minimal HTML escaping for user-generated strings (bullet text,
 *  ref titles, source names). The bullets come from an LLM and we
 *  inject them straight into HTML — escape angle brackets, quotes,
 *  and ampersands so a malformed payload can't break out of the
 *  surrounding markup. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateLong(dateISO: string, lang: Lang): string {
  // Force UTC parsing so a `YYYY-MM-DD` string isn't shifted by the
  // server's local TZ (which on Netlify is UTC anyway, but might
  // differ in local dev / preview deploys).
  const d = new Date(`${dateISO}T12:00:00Z`);
  return new Intl.DateTimeFormat(dateLocale(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatDateShort(dateISO: string, lang: Lang): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return new Intl.DateTimeFormat(dateLocale(lang), {
    day: "numeric",
    month: "long",
  }).format(d);
}

export interface RenderNewsletterParams {
  snapshot: TopSummaryRow;
  bullets: TopSummaryBulletRow[];
  lang: Lang;
  /** Absolute origin used to build the « Read online » deep link
   *  (e.g. "https://8news.ai"). No trailing slash. */
  origin: string;
}

export interface RenderedNewsletter {
  subject: string;
  html: string;
  text: string;
}

export function renderDailyNewsletter(
  params: RenderNewsletterParams,
): RenderedNewsletter {
  const { snapshot, bullets, lang, origin } = params;
  const groups = groupBullets(bullets);
  const dateLong = formatDateLong(snapshot.summary_date, lang);
  const dateShort = formatDateShort(snapshot.summary_date, lang);
  const archiveUrl = `${origin}/${snapshot.summary_date}${lang === "fr" ? "?lang=fr" : ""}`;
  const subject = `${t("newsletterSubjectPrefix", lang)} · ${dateShort}`;

  const html = buildHtml({ groups, lang, dateLong, archiveUrl });
  const text = buildText({ groups, lang, dateLong, archiveUrl });

  return { subject, html, text };
}

// ------------------------------------------------------------------
//   HTML body
// ------------------------------------------------------------------

function buildHtml(args: {
  groups: Group[];
  lang: Lang;
  dateLong: string;
  archiveUrl: string;
}): string {
  const { groups, lang, dateLong, archiveUrl } = args;

  const groupsHtml = groups
    .map((g) => renderGroupHtml(g))
    .filter(Boolean)
    .join("\n");

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(t("newsletterSubjectPrefix", lang))} · ${esc(dateLong)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${COLOR.text};-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR.bg};">
    <tr>
      <td align="center" style="padding:24px 12px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${COLOR.surface};border:1px solid ${COLOR.gold};border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 0;">
              <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${COLOR.gold};margin-bottom:10px;">
                ${esc(t("top24hHeroKicker", lang))}
              </div>
              <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${COLOR.text};margin:0 0 6px;font-weight:400;letter-spacing:-0.01em;">
                ${esc(t("newsletterSubjectPrefix", lang))}
              </h1>
              <div style="color:${COLOR.textDim};font-size:13px;letter-spacing:0.02em;margin-bottom:18px;">
                ${esc(dateLong)}
              </div>
              <p style="margin:0 0 22px;color:${COLOR.textSecondary};font-size:14px;line-height:1.55;">
                ${esc(t("newsletterIntro", lang))}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px;">
              <div style="border-top:1px solid ${COLOR.border};"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 8px;">
              ${groupsHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 8px;">
              <div style="text-align:center;margin:8px 0 4px;">
                <a href="${esc(archiveUrl)}" style="display:inline-block;padding:10px 18px;background:${COLOR.gold};color:#000000;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;letter-spacing:0.01em;">
                  ${esc(t("newsletterReadOnline", lang))} &rarr;
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 24px;">
              <div style="border-top:1px solid ${COLOR.border};padding-top:14px;color:${COLOR.textDim};font-size:11px;line-height:1.5;text-align:center;">
                <div>${esc(t("newsletterFooterReason", lang))}</div>
                <div style="margin-top:4px;">
                  <a href="${esc(originFromUrl(archiveUrl))}/app/settings" style="color:${COLOR.gold};text-decoration:none;">
                    ${esc(t("newsletterFooterUnsubscribe", lang))}
                  </a>
                </div>
              </div>
            </td>
          </tr>
        </table>
        <div style="color:${COLOR.textDim};font-size:11px;margin-top:14px;">
          8news.ai
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Helper to pull the bare origin back out of the full archive URL so
 *  the footer's settings link doesn't need an extra prop. The archive
 *  URL is built as `${origin}/${date}` (optionally with `?lang=fr`),
 *  so the origin is everything before the second slash after `://`. */
function originFromUrl(archiveUrl: string): string {
  try {
    const u = new URL(archiveUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return archiveUrl;
  }
}

function renderGroupHtml(g: Group): string {
  const first = g.bullets[0];
  if (!first) return "";

  // Title row — gold serif if present, otherwise we render the bullet
  // text directly without a heading (matches the « untitled fallback
  // row » in <Top24hHero>).
  const titleHtml = g.title
    ? `<div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.3;color:${COLOR.gold};font-weight:600;margin:18px 0 8px;">
         ${esc(g.title)}
       </div>`
    : "";

  const bulletsHtml = g.bullets
    .map((b) => {
      const text = `<div style="color:${COLOR.textSecondary};font-size:14px;line-height:1.6;margin:6px 0 0;">${esc(b.text)}</div>`;
      const refs =
        b.refs.length > 0
          ? `<div style="margin:10px 0 0;">
               ${b.refs
                 .map(
                   (r) => `<a href="${esc(r.link)}" style="display:inline-block;color:${COLOR.gold};font-size:12px;font-weight:600;text-decoration:none;padding:3px 9px;border:1px solid ${COLOR.goldRing};background:${COLOR.goldSoft};border-radius:999px;margin:0 6px 6px 0;letter-spacing:0.01em;line-height:1.3;">${esc(r.source)} &nearr;</a>`,
                 )
                 .join("")}
             </div>`
          : "";
      return `<div style="margin:0 0 14px;">${text}${refs}</div>`;
    })
    .join("");

  // Lead bullet decoration when there's no title — the dot keeps the
  // visual rhythm aligned with the home accordion's untitled rows.
  const bulletPrefix = g.title
    ? ""
    : `<span style="color:${COLOR.gold};font-size:18px;line-height:1;margin-right:8px;">•</span>`;

  return `<div style="padding:6px 0;border-bottom:1px solid ${COLOR.border};">
    ${titleHtml}
    ${bulletPrefix ? `<div style="display:block;">${bulletPrefix}${bulletsHtml}</div>` : bulletsHtml}
  </div>`;
}

// ------------------------------------------------------------------
//   Plain-text body
// ------------------------------------------------------------------

function buildText(args: {
  groups: Group[];
  lang: Lang;
  dateLong: string;
  archiveUrl: string;
}): string {
  const { groups, lang, dateLong, archiveUrl } = args;

  const header = [
    `${t("newsletterSubjectPrefix", lang).toUpperCase()} — ${dateLong}`,
    "",
    t("newsletterIntro", lang),
    "",
    "----------------------------------------",
    "",
  ].join("\n");

  const body = groups
    .map((g) => renderGroupText(g))
    .filter(Boolean)
    .join("\n\n");

  const footer = [
    "",
    "----------------------------------------",
    "",
    `${t("newsletterReadOnline", lang)}: ${archiveUrl}`,
    "",
    t("newsletterFooterReason", lang),
    "",
    "8news.ai",
  ].join("\n");

  return `${header}${body}${footer}`;
}

function renderGroupText(g: Group): string {
  const lines: string[] = [];
  if (g.title) lines.push(`## ${g.title}`);
  for (const b of g.bullets) {
    lines.push(`- ${b.text}`);
    for (const r of b.refs) {
      lines.push(`  • ${r.source}: ${r.link}`);
    }
  }
  return lines.join("\n");
}
