import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { insertUserEvents, type UserEventInsert } from "@/lib/supabase";
import { NO_STORE_HEADERS } from "@/lib/api-helpers";

/**
 * Append-only event ingest for the `user_event` table (mig. 030+).
 *
 * POST /api/user/event
 *   body: { events: TrackedEvent[] } (≤ 50 per batch)
 *
 * Auth: optional. Anonymous visitors are tracked via a `visitor_id`
 * cookie set client-side by `src/lib/track.ts`; authenticated visitors
 * additionally surface their `user_id` (resolved server-side from the
 * Supabase session cookie, never trusting the client).
 *
 * Rate-limited: a simple in-memory token bucket per IP keeps a chatty
 * client from flooding the table. Resets on every Lambda cold start
 * (acceptable — Netlify keeps instances warm for minutes).
 *
 * The endpoint always returns 204-style no-store JSON. It never
 * propagates errors back to the client because telemetry must not
 * break UX — bad batches are silently dropped with a server-side log.
 */

const MAX_EVENTS_PER_BATCH = 50;
const MAX_TYPE_LEN = 64;
const MAX_TARGET_LEN = 512;
const MAX_ACTION_LEN = 64;
const MAX_LANG_LEN = 8;
const MAX_PATH_LEN = 512;
const MAX_META_BYTES = 4096;

// ── Rate limiting ────────────────────────────────────────────────
// 60 batches per minute per IP. A batch is up to 50 events, so the
// effective cap is 3 000 events / min / IP which is well above any
// legitimate client load. The map is module-level so it survives
// across requests within the same Lambda instance.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_HITS = 60;
const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (ipHits.get(ip) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= RATE_LIMIT_MAX_HITS) {
    ipHits.set(ip, arr);
    return true;
  }
  arr.push(now);
  ipHits.set(ip, arr);
  // Periodic cleanup of old IPs so the map doesn't grow unbounded.
  if (ipHits.size > 1024) {
    for (const [k, v] of ipHits) {
      if (v.length === 0 || (v[v.length - 1] ?? 0) < cutoff) ipHits.delete(k);
    }
  }
  return false;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function getOptionalUserId(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* no-op — read-only context */
        },
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

interface IncomingEvent {
  type?: unknown;
  target_id?: unknown;
  action?: unknown;
  lang?: unknown;
  path?: unknown;
  meta?: unknown;
}

function sanitizeString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function sanitizeMeta(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const json = JSON.stringify(value);
    if (json.length > MAX_META_BYTES) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    // Return 200 so clients don't retry — the events are intentionally
    // discarded but we don't want to leak the rate-limit boundary to
    // misbehaving callers either.
    return NextResponse.json({ ok: true, dropped: true }, { headers: NO_STORE_HEADERS });
  }

  let body: { events?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const incoming = Array.isArray(body.events) ? (body.events as IncomingEvent[]) : [];
  if (incoming.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 }, { headers: NO_STORE_HEADERS });
  }
  const capped = incoming.slice(0, MAX_EVENTS_PER_BATCH);

  // Resolve server-side identity ONCE per batch (a session is stable
  // for the duration of an HTTP request anyway). Both lookups are
  // safe to call even when the user is anonymous — they just return
  // null and the row attribution falls back to `visitor_id`.
  const [userId, cookieStore] = await Promise.all([getOptionalUserId(), cookies()]);
  const visitorId = cookieStore.get("visitor_id")?.value ?? null;

  if (!userId && !visitorId) {
    // The CHECK constraint requires at least one of the two — drop
    // the batch silently rather than fight the constraint.
    return NextResponse.json({ ok: true, inserted: 0 }, { headers: NO_STORE_HEADERS });
  }

  const rows: UserEventInsert[] = [];
  for (const ev of capped) {
    const type = sanitizeString(ev.type, MAX_TYPE_LEN);
    if (!type) continue;
    rows.push({
      user_id: userId,
      visitor_id: userId ? null : visitorId,
      event_type: type,
      target_id: sanitizeString(ev.target_id, MAX_TARGET_LEN),
      action: sanitizeString(ev.action, MAX_ACTION_LEN),
      lang: sanitizeString(ev.lang, MAX_LANG_LEN),
      path: sanitizeString(ev.path, MAX_PATH_LEN),
      meta: sanitizeMeta(ev.meta),
    });
  }

  const inserted = await insertUserEvents(rows);
  return NextResponse.json({ ok: true, inserted }, { headers: NO_STORE_HEADERS });
}
