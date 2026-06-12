/**
 * Pure rendering of the « share by email » message (subject + HTML +
 * plain-text). Consumed by `POST /api/share` when a visitor sends a
 * video page / daily summary link to a friend from the Share modal.
 *
 * Same constraints as `render-daily-newsletter.ts`:
 *   - zero I/O so it can be unit-tested in isolation;
 *   - all styling inline (Gmail / Outlook strip `<style>` blocks);
 *   - color tokens duplicated from `src/lib/theme.ts` on purpose —
 *     emails don't share styles with the SPA;
 *   - user-provided strings (title, personal message) are HTML-escaped
 *     before injection.
 */

import { t, type Lang } from "@/lib/i18n";

const COLOR = {
  bg: "#0a0a0a",
  surface: "#111111",
  border: "#262626",
  text: "#f5f5f4",
  textDim: "#a3a3a3",
  gold: "#c9a227",
} as const;

export interface ShareEmailInput {
  /** Absolute, server-validated 8news.ai URL of the shared page. */
  url: string;
  /** Title of the shared article / video page. */
  title: string;
  /** Optional personal note typed by the sender. */
  message?: string | null;
  lang: Lang;
}

export interface ShareEmailOutput {
  subject: string;
  html: string;
  text: string;
}

/** Minimal HTML escaping for user-generated strings. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderShareEmail({ url, title, message, lang }: ShareEmailInput): ShareEmailOutput {
  const cleanTitle = title.trim();
  const cleanMessage = (message ?? "").trim();
  const subject = t("shareEmailSubject", lang).replace("{title}", cleanTitle);
  const intro = t("shareEmailIntro", lang);
  const cta = t("shareEmailCta", lang);
  const footer = t("shareEmailFooter", lang);

  const messageHtml = cleanMessage
    ? `<div style="margin:0 0 24px;padding:14px 18px;border-left:3px solid ${COLOR.gold};background:${COLOR.surface};border-radius:0 8px 8px 0;">
        <p style="margin:0;color:${COLOR.text};font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(cleanMessage)}</p>
      </div>`
    : "";

  const html = `<!doctype html>
<html lang="${lang}">
<body style="margin:0;padding:0;background:${COLOR.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLOR.bg};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
          <tr>
            <td style="padding-bottom:24px;">
              <span style="color:${COLOR.gold};font-size:20px;font-weight:700;">8news.ai</span>
            </td>
          </tr>
          <tr>
            <td>
              <p style="margin:0 0 16px;color:${COLOR.textDim};font-size:14px;line-height:1.6;">${esc(intro)}</p>
              <h1 style="margin:0 0 20px;color:${COLOR.gold};font-size:22px;font-weight:700;line-height:1.35;">${esc(cleanTitle)}</h1>
              ${messageHtml}
              <a href="${esc(url)}" style="display:inline-block;padding:12px 24px;border:1px solid ${COLOR.gold};border-radius:8px;background:${COLOR.bg};color:${COLOR.gold};font-size:15px;font-weight:600;text-decoration:none;">${esc(cta)}</a>
              <p style="margin:20px 0 0;color:${COLOR.textDim};font-size:12px;line-height:1.6;word-break:break-all;">
                <a href="${esc(url)}" style="color:${COLOR.textDim};text-decoration:underline;">${esc(url)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:28px;">
              <p style="margin:0;padding-top:16px;border-top:1px solid ${COLOR.border};color:${COLOR.textDim};font-size:12px;">${esc(footer)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    intro,
    "",
    cleanTitle,
    ...(cleanMessage ? ["", cleanMessage] : []),
    "",
    url,
    "",
    footer,
  ];

  return { subject, html, text: textParts.join("\n") };
}
