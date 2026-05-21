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
 *  empty-title group so the order is preserved.
 *
 *  v2.6.13+ groups are then sorted by descending `importance_score`
 *  (first bullet of each group; every bullet in a same-title run
 *  carries the same score). Bullets without a score (NULL on legacy
 *  snapshots predating mig 026) collapse to 0 so they sink below
 *  scored groups. Bullet order WITHIN a group is preserved (it's a
 *  narrative, not a ranking). Stable sort keeps tied groups in LLM
 *  emission order. */
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
  const decorated = out.map((g, i) => ({
    g,
    i,
    s:
      typeof g.bullets[0]?.importance_score === "number"
        ? (g.bullets[0]?.importance_score as number)
        : 0,
  }));
  decorated.sort((a, b) => (b.s - a.s) || (a.i - b.i));
  return decorated.map((d) => d.g);
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip the `**Title**\n\n` markdown prefix re-injected by
 * `generate-top-summary.ts` into `summary_bullets.text`. Mirrors the
 * same cleanup the web API does in
 * `/api/news/top-summary/latest/route.ts` so the bullet body in the
 * newsletter matches the raw LLM output — without it, both the gold
 * serif title (rendered above the paragraph from `bullet.title`) and
 * the bolded title prefix (inside the body) show up, producing a
 * redundant double headline in every group.
 *
 * Permissive trailing-whitespace match (`[\s\n]*`) so the helper
 * catches both the canonical `\n\n` separator the cron writes and
 * stray space-only variants from any future writer that doesn't
 * normalize. Falls through unchanged when the title is absent or
 * doesn't actually appear at the head of the text (legacy bullets).
 */
function stripTitlePrefix(text: string, title: string | null): string {
  if (!title) return text.trim();
  const re = new RegExp(`^\\*\\*${escapeRegExp(title)}\\*\\*[\\s\\n]*`);
  return text.replace(re, "").trim();
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
  /** Absolute origin used for logo, CTA and settings links
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
  const topArticlesUrl = `${origin}/app/top-articles${lang === "fr" ? "?lang=fr" : ""}`;
  const subject = `${t("newsletterSubjectPrefix", lang)} · ${dateShort}`;

  const html = buildHtml({ groups, lang, dateLong, ctaUrl: topArticlesUrl, origin });
  const text = buildText({ groups, lang, dateLong, ctaUrl: topArticlesUrl });

  return { subject, html, text };
}

// ------------------------------------------------------------------
//   HTML body
// ------------------------------------------------------------------

function buildHtml(args: {
  groups: Group[];
  lang: Lang;
  dateLong: string;
  ctaUrl: string;
  origin: string;
}): string {
  const { groups, lang, dateLong, ctaUrl, origin } = args;

  const groupsHtml = groups
    .map((g) => renderGroupHtml(g))
    .filter(Boolean)
    .join("\n");

  // Brand header. Absolute URL is mandatory in emails — `${origin}` is
  // the same `NEWSLETTER_PUBLIC_ORIGIN` env var that drives the
  // « Read online » CTA below, so the logo file is served from the
  // exact same host the user already trusts (no extra DKIM /
  // image-proxy gymnastics). Width/height attributes are set
  // explicitly so Outlook reserves space before the image loads, and
  // `display:block` prevents the 3-4px baseline gap Gmail otherwise
  // adds around inline images. `alt="8news"` ensures clients that
  // block images (default in Outlook on Windows + many Gmail setups
  // for unknown senders) still see the brand name in the header slot.
  // The PNG used here is the same `/logo-8news.png` shipped from
  // `public/` and rendered by `<AppHeader>`, `<SeoNavBar>`,
  // `<LandingNav>` and `<LandingFooter>` — single source of truth
  // for the brand image across the whole product.
  const logoHtml = `<div style="text-align:center;padding:28px 24px 0;">
    <a href="${esc(origin)}" style="text-decoration:none;display:inline-block;line-height:0;">
      <img src="${esc(origin)}/logo-8news.png" alt="8news" width="120" height="auto" style="display:block;height:auto;width:120px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
    </a>
  </div>`;

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
            <td>
              ${logoHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 0;">
              <div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${COLOR.gold};margin-bottom:12px;">
                ${esc(t("top24hHeroKicker", lang))}
              </div>
              <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;color:${COLOR.text};margin:0 0 8px;font-weight:400;letter-spacing:-0.01em;">
                ${esc(t("newsletterSubjectPrefix", lang))}
              </h1>
              <div style="color:${COLOR.textDim};font-size:15px;letter-spacing:0.02em;margin-bottom:20px;">
                ${esc(dateLong)}
              </div>
              <p style="margin:0 0 22px;color:${COLOR.textSecondary};font-size:17px;line-height:1.55;">
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
                <a href="${esc(ctaUrl)}" style="display:inline-block;padding:13px 22px;background:${COLOR.gold};color:#000000;text-decoration:none;border-radius:6px;font-size:17px;font-weight:600;letter-spacing:0.01em;">
                  ${esc(t("newsletterReadOnline", lang))} &rarr;
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 24px;">
              <div style="border-top:1px solid ${COLOR.border};padding-top:16px;color:${COLOR.textDim};font-size:13px;line-height:1.5;text-align:center;">
                <div>${esc(t("newsletterFooterReason", lang))}</div>
                <div style="margin-top:6px;">
                  <a href="${esc(origin)}/app/settings" style="color:${COLOR.gold};text-decoration:none;">
                    ${esc(t("newsletterFooterUnsubscribe", lang))}
                  </a>
                </div>
              </div>
            </td>
          </tr>
        </table>
        <div style="color:${COLOR.textDim};font-size:13px;margin-top:14px;">
          8news.ai
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Importance score badge — colored mono pill rendered next to each
 *  group title. Replicates the website `ScoreMeter` tier colors
 *  (green 8-10 / gold 5-7 / orange 3-4 / red 1-2 since v2.6.14) with
 *  an email-safe pill (no SVG, no flex). The `clamped/10` text stays
 *  mono for the same instant-recognition register used everywhere else
 *  on the product (article badges, video recap scores, daily summary
 *  scores). */
function renderScoreBadgeHtml(score: number): string {
  const clamped = Math.max(0, Math.min(10, Math.round(score)));
  const tier =
    clamped >= 8
      ? { fg: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.45)" }
      : clamped >= 5
        ? { fg: COLOR.gold, bg: COLOR.goldSoft, border: COLOR.goldRing }
        : clamped >= 3
          ? { fg: "#f97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.45)" }
          : { fg: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.45)" };
  return `<span style="display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:700;letter-spacing:0.02em;color:${tier.fg};background:${tier.bg};border:1px solid ${tier.border};border-radius:999px;padding:3px 10px;line-height:1.2;white-space:nowrap;">${clamped}/10</span>`;
}

function renderGroupHtml(g: Group): string {
  const first = g.bullets[0];
  if (!first) return "";

  // Importance score badge (1-10) — mirrors the website's `ScoreMeter`
  // tier coloring (green 8-10 / gold 5-7 / orange 3-4 / red 1-2 since
  // v2.6.14) but rendered as a simple mono pill since SVG bars don't
  // survive most email clients. Hidden when null (legacy snapshots,
  // missing mig 026).
  const score =
    typeof first.importance_score === "number" ? first.importance_score : null;
  const scoreBadgeHtml = score !== null ? renderScoreBadgeHtml(score) : "";

  // Title row — gold serif title with the score badge aligned to the
  // right. A two-cell `<table>` keeps the alignment robust across
  // Outlook (flex/justify-content don't reliably collapse) — left cell
  // holds the title and stretches, right cell hugs the badge.
  const titleHtml = g.title
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0 10px;">
         <tr>
           <td valign="middle" style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:${COLOR.gold};font-weight:600;padding-right:10px;">
             ${esc(g.title)}
           </td>
           <td valign="middle" align="right" style="white-space:nowrap;">
             ${scoreBadgeHtml}
           </td>
         </tr>
       </table>`
    : "";

  const bulletsHtml = g.bullets
    .map((b) => {
      const cleanText = stripTitlePrefix(b.text, b.title);
      const text = `<div style="color:${COLOR.textSecondary};font-size:17px;line-height:1.6;margin:6px 0 0;">${esc(cleanText)}</div>`;
      const refs =
        b.refs.length > 0
          ? `<div style="margin:12px 0 0;">
               ${b.refs
                 .map(
                   (r) => `<a href="${esc(r.link)}" style="display:inline-block;color:${COLOR.gold};font-size:14px;font-weight:600;text-decoration:none;padding:5px 11px;border:1px solid ${COLOR.goldRing};background:${COLOR.goldSoft};border-radius:999px;margin:0 6px 6px 0;letter-spacing:0.01em;line-height:1.3;">${esc(r.source)} &nearr;</a>`,
                 )
                 .join("")}
             </div>`
          : "";
      return `<div style="margin:0 0 16px;">${text}${refs}</div>`;
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
  ctaUrl: string;
}): string {
  const { groups, lang, dateLong, ctaUrl } = args;

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
    `${t("newsletterReadOnline", lang)}: ${ctaUrl}`,
    "",
    t("newsletterFooterReason", lang),
    "",
    "8news.ai",
  ].join("\n");

  return `${header}${body}${footer}`;
}

function renderGroupText(g: Group): string {
  const lines: string[] = [];
  if (g.title) {
    const score =
      typeof g.bullets[0]?.importance_score === "number"
        ? Math.max(0, Math.min(10, Math.round(g.bullets[0].importance_score)))
        : null;
    const scoreSuffix = score !== null ? ` [${score}/10]` : "";
    lines.push(`## ${g.title}${scoreSuffix}`);
  }
  for (const b of g.bullets) {
    const cleanText = stripTitlePrefix(b.text, b.title);
    lines.push(`- ${cleanText}`);
    for (const r of b.refs) {
      lines.push(`  • ${r.source}: ${r.link}`);
    }
  }
  return lines.join("\n");
}
