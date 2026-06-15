/**
 * Shared secret guard for the public Netlify cron endpoints.
 *
 * The `cron-*` functions are triggered by cron-job.org hitting their
 * PUBLIC URL (`https://8news.ai/.netlify/functions/cron-NAME`). Netlify
 * adds no auth of its own, so without this guard anyone who knows the
 * path can invoke the pipelines (billable OpenAI/ElevenLabs/Resend work,
 * data mutations, metric leaks). The `/api/*` cron routes already gate on
 * `CRON_SECRET` (`?secret=…`) — this brings the Netlify functions in line.
 *
 * The secret is accepted from EITHER:
 *   - the `secret` query param (`?secret=…`), matching the /api/* routes, or
 *   - the `x-cron-secret` request header (keeps the secret out of URL logs).
 *
 * Rollout is deliberately staged so flipping this on can't silently kill
 * the pipelines before every cron-job.org job has been updated:
 *
 *   - `CRON_SECRET` unset           → allow + warn (not configured).
 *   - secret valid                  → allow.
 *   - secret missing/invalid AND
 *       `CRON_ENFORCE_SECRET` !== "true" → allow + warn (warn-only mode).
 *       `CRON_ENFORCE_SECRET` === "true" → REJECT (401).
 *
 * Cutover: deploy (warn-only) → update every cron-job.org job to append
 * `?secret=$CRON_SECRET` (or send the `x-cron-secret` header) → confirm
 * the warn lines disappear from the function logs → set
 * `CRON_ENFORCE_SECRET=true` in the Netlify env. Reversible instantly by
 * unsetting the flag.
 */

export interface CronAuthResult {
  /** True when the request may proceed (valid secret, or not yet enforced). */
  ok: boolean;
  /**
   * A 401 `Response` to return when `ok` is false. Background functions
   * (`-background`) ACK 202 regardless, so for them the meaningful effect
   * is the early return that skips the work — `rejection` is still handy
   * for the synchronous functions (watchdog, top-summary) that surface it.
   */
  rejection?: Response;
  /**
   * A human-readable line to log when the secret was missing/invalid,
   * whether enforced or warn-only. `undefined` when the secret was valid
   * (or no secret is configured at all). Feed it to the cron's `elog`/`log`.
   */
  warning?: string;
}

/**
 * Validate the cron secret for an incoming request.
 *
 * @param req  The Netlify function `Request` (query + headers). May be
 *             `undefined` for functions invoked without a request object —
 *             treated as "no secret provided".
 */
export function checkCronSecret(req?: Request): CronAuthResult {
  const expected = process.env.CRON_SECRET?.trim();

  // Not configured: never block the pipelines on a missing env var, but
  // make the gap visible so it gets fixed.
  if (!expected) {
    return { ok: true, warning: "CRON_SECRET not configured — cron endpoint is unauthenticated" };
  }

  const provided = readProvidedSecret(req);
  if (provided && provided === expected) {
    return { ok: true };
  }

  const enforced = process.env.CRON_ENFORCE_SECRET?.trim() === "true";
  const reason = provided ? "invalid cron secret" : "missing cron secret";

  if (enforced) {
    return {
      ok: false,
      rejection: Response.json({ error: "Unauthorized" }, { status: 401 }),
      warning: `Rejected (${reason}) — CRON_ENFORCE_SECRET is on`,
    };
  }

  return {
    ok: true,
    warning: `${reason} — allowed (warn-only; set CRON_ENFORCE_SECRET=true to enforce)`,
  };
}

function readProvidedSecret(req?: Request): string | null {
  if (!req) return null;
  const header = req.headers?.get("x-cron-secret")?.trim();
  if (header) return header;
  try {
    const q = new URL(req.url).searchParams.get("secret")?.trim();
    return q || null;
  } catch {
    return null;
  }
}
