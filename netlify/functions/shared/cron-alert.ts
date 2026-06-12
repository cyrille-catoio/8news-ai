/**
 * Operator alerting for the Netlify cron functions — sends a plain-text
 * email through Resend when a cron run ends with errors (or when the
 * watchdog detects stale output data), so failures surface in the
 * owner's inbox instead of being discovered by looking at the home page.
 *
 * Configuration (Netlify env vars):
 *   - `ALERT_EMAIL_TO`      — recipient(s), comma-separated. **Unset = alerting
 *                             disabled** (the helper logs a note and returns).
 *   - `RESEND_API_KEY`      — same key the daily newsletter already uses.
 *   - `RESEND_FROM_ADDRESS` — optional, shared default with the newsletter.
 *
 * Contract: NEVER throws and never takes longer than ~10 s — a broken or
 * slow alert channel must not take the cron down with it. All outcomes
 * are logged with the `[cron-alert]` prefix.
 */

const RESEND_SINGLE_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "8news <newsletter@8news.ai>";
const SEND_TIMEOUT_MS = 10_000;

export async function sendCronAlert(
  cronName: string,
  summary: string,
  details: readonly string[] = [],
): Promise<void> {
  const toRaw = process.env.ALERT_EMAIL_TO?.trim();
  if (!toRaw) {
    console.log(
      `[cron-alert] cron=${cronName} alert suppressed — ALERT_EMAIL_TO not configured`,
    );
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(
      `[cron-alert] cron=${cronName} alert NOT sent — RESEND_API_KEY not configured`,
    );
    return;
  }

  const to = toRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const from = process.env.RESEND_FROM_ADDRESS?.trim() || DEFAULT_FROM;
  const subject = `[8news alerte] cron=${cronName} — erreur détectée`;
  const text = [
    `Cron : ${cronName}`,
    `Date : ${new Date().toISOString()}`,
    "",
    summary,
    ...(details.length > 0 ? ["", "Détail des erreurs :", ...details.map((d) => `  - ${d}`)] : []),
    "",
    "Logs complets : Netlify → Logs → Functions → " + cronName,
  ].join("\n");

  try {
    const res = await fetch(RESEND_SINGLE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      console.error(
        `[cron-alert] cron=${cronName} alert send failed — http=${res.status} ${body}`,
      );
      return;
    }
    console.log(`[cron-alert] cron=${cronName} alert email sent to ${to.join(", ")}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[cron-alert] cron=${cronName} alert send threw — ${msg}`);
  }
}
