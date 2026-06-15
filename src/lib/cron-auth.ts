export type CronAuthResult =
  | { ok: true }
  | { ok: false; reason: "missing_config" | "missing_request" | "invalid_secret" };

const SECRET_QUERY_PARAM = "secret";
const SECRET_HEADER = "x-cron-secret";

function safeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let i = 0; i < len; i += 1) {
    diff |= (aBytes[i % aBytes.length] ?? 0) ^ (bBytes[i % bBytes.length] ?? 0);
  }

  return diff === 0;
}

function readProvidedSecret(req: Request): string | null {
  const auth = req.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice("bearer ".length).trim();
    if (token) return token;
  }

  const headerSecret = req.headers.get(SECRET_HEADER)?.trim();
  if (headerSecret) return headerSecret;

  const querySecret = new URL(req.url).searchParams.get(SECRET_QUERY_PARAM)?.trim();
  return querySecret || null;
}

export function authorizeCronRequest(
  req: Request | undefined,
  expectedSecret: string | undefined,
): CronAuthResult {
  const configuredSecret = expectedSecret?.trim();
  if (!configuredSecret) return { ok: false, reason: "missing_config" };
  if (!req) return { ok: false, reason: "missing_request" };

  const providedSecret = readProvidedSecret(req);
  if (!providedSecret || !safeEqual(providedSecret, configuredSecret)) {
    return { ok: false, reason: "invalid_secret" };
  }

  return { ok: true };
}

