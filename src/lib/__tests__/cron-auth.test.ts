import { describe, expect, it } from "vitest";
import { authorizeCronRequest } from "@/lib/cron-auth";

const SECRET = "s3cr3t";

describe("authorizeCronRequest", () => {
  it("accepts a bearer token", () => {
    const req = new Request("https://8news.ai/.netlify/functions/cron-fetching-background", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(authorizeCronRequest(req, SECRET)).toEqual({ ok: true });
  });

  it("accepts the cron secret header", () => {
    const req = new Request("https://8news.ai/.netlify/functions/cron-fetching-background", {
      headers: { "x-cron-secret": SECRET },
    });
    expect(authorizeCronRequest(req, SECRET)).toEqual({ ok: true });
  });

  it("accepts the secret query param for cron-job.org URLs", () => {
    const req = new Request(
      `https://8news.ai/.netlify/functions/cron-fetching-background?secret=${SECRET}`,
    );
    expect(authorizeCronRequest(req, SECRET)).toEqual({ ok: true });
  });

  it("rejects missing config and invalid requests", () => {
    const req = new Request("https://8news.ai/.netlify/functions/cron-fetching-background");
    expect(authorizeCronRequest(req, undefined)).toEqual({
      ok: false,
      reason: "missing_config",
    });
    expect(authorizeCronRequest(undefined, SECRET)).toEqual({
      ok: false,
      reason: "missing_request",
    });
    expect(authorizeCronRequest(req, SECRET)).toEqual({
      ok: false,
      reason: "invalid_secret",
    });
  });
});

