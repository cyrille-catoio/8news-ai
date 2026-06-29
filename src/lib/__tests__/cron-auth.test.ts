import { afterEach, describe, expect, it } from "vitest";
import { checkCronSecret } from "../../../netlify/functions/shared/cron-auth";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_CRON_ENFORCE_SECRET = process.env.CRON_ENFORCE_SECRET;

function restoreEnv() {
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }

  if (ORIGINAL_CRON_ENFORCE_SECRET === undefined) {
    delete process.env.CRON_ENFORCE_SECRET;
  } else {
    process.env.CRON_ENFORCE_SECRET = ORIGINAL_CRON_ENFORCE_SECRET;
  }
}

describe("checkCronSecret", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("fails closed when enforcement is enabled without a configured secret", () => {
    delete process.env.CRON_SECRET;
    process.env.CRON_ENFORCE_SECRET = "true";

    const result = checkCronSecret(new Request("https://8news.ai/.netlify/functions/cron-fetching-background"));

    expect(result.ok).toBe(false);
    expect(result.warning).toContain("CRON_SECRET not configured");
    expect(result.rejection?.status).toBe(401);
  });

  it("keeps the staged warn-only rollout when no secret is configured and enforcement is off", () => {
    delete process.env.CRON_SECRET;
    delete process.env.CRON_ENFORCE_SECRET;

    const result = checkCronSecret(new Request("https://8news.ai/.netlify/functions/cron-fetching-background"));

    expect(result.ok).toBe(true);
    expect(result.warning).toContain("unauthenticated");
  });

  it("accepts a valid header secret", () => {
    process.env.CRON_SECRET = "secret-value";
    process.env.CRON_ENFORCE_SECRET = "true";

    const result = checkCronSecret(
      new Request("https://8news.ai/.netlify/functions/cron-fetching-background", {
        headers: { "x-cron-secret": "secret-value" },
      }),
    );

    expect(result).toEqual({ ok: true });
  });
});
