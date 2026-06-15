import { authorizeCronRequest, type CronAuthResult } from "../../../src/lib/cron-auth";

export function checkCronSecret(req: Request | undefined, cronName: string): CronAuthResult {
  const result = authorizeCronRequest(req, process.env.CRON_SECRET);
  if (!result.ok) {
    console.error(`[${cronName}] unauthorized cron request: ${result.reason}`);
  }
  return result;
}

export function requireCronSecret(req: Request | undefined, cronName: string): boolean {
  return checkCronSecret(req, cronName).ok;
}

export function unauthorizedCronResponse(result: CronAuthResult): Response {
  return Response.json(
    { ok: false, error: "unauthorized_cron_request", reason: result.reason },
    { status: result.reason === "missing_config" ? 500 : 401 },
  );
}

export function cronSecretHeaders(): HeadersInit {
  const secret = process.env.CRON_SECRET?.trim();
  return secret ? { "x-cron-secret": secret } : {};
}

