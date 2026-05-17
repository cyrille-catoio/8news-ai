/**
 * Client-side telemetry helper for the `user_event` table (mig. 030+).
 *
 * Single responsibility: queue UI events and ship them in batches to
 * `/api/user/event` so the owner-only « User Activity » stats page has
 * data to work with.
 *
 * Design constraints:
 *  - **Never break UX.** Network failures, missing cookies, server
 *    outage — all silently swallowed. Telemetry is best-effort.
 *  - **No PII.** Only opaque identifiers leave the browser: a random
 *    `visitor_id` UUID for anonymous visitors (no fingerprinting), and
 *    the Supabase `user_id` after sign-in (already known to the
 *    server). Email / IP / username are never read here.
 *  - **Cheap.** Events are batched (≤ 10 per flush, ≤ 5 s latency) so
 *    a chatty page like the home doesn't fire dozens of XHRs. The
 *    final flush on `pagehide` uses `navigator.sendBeacon` so the
 *    last batch survives a tab close.
 *  - **SSR safe.** All `document` / `window` access is guarded so the
 *    module can be imported from server components (and tree-shaken
 *    server-side).
 */

import { getCookie, setCookie } from "@/lib/cookies";

const VISITOR_COOKIE = "visitor_id";
const VISITOR_COOKIE_DAYS = 365;
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 10;
const MAX_QUEUE = 50; // safety cap — drops oldest above this
const ENDPOINT = "/api/user/event";

export interface TrackedEvent {
  type: string;
  target_id?: string;
  action?: string;
  lang?: string;
  path?: string;
  meta?: Record<string, unknown>;
}

interface QueuedEvent extends TrackedEvent {
  /** ISO timestamp captured client-side at trackEvent() time.
   *  The server uses its own `now()` for the DB column but we keep this
   *  in the payload for potential drift analysis. */
  _ts: string;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;

/** Lightweight v4 UUID generator (crypto.randomUUID when available,
 *  else manual). 36 chars; fits well under any cookie size limit. */
function randomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Reads (or creates and persists) the per-browser visitor UUID. The
 *  cookie is `SameSite=Lax`, 1-year max-age, NOT HttpOnly (we need to
 *  read it from JS to attach it to the payload). Server-side cookie
 *  parsing in `/api/user/event` reads the same cookie too. */
export function getOrCreateVisitorId(): string | null {
  if (typeof document === "undefined") return null;
  const existing = getCookie(VISITOR_COOKIE);
  if (existing && /^[0-9a-f-]{32,36}$/i.test(existing)) return existing;
  const id = randomUUID();
  setCookie(VISITOR_COOKIE, id, VISITOR_COOKIE_DAYS);
  return id;
}

function installListeners() {
  if (listenersInstalled) return;
  if (typeof window === "undefined") return;
  listenersInstalled = true;
  // Flush on tab close / navigation away — `sendBeacon` guarantees the
  // last batch is delivered even when the browser is tearing down.
  const beaconFlush = () => flush(true);
  window.addEventListener("pagehide", beaconFlush);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") beaconFlush();
  });
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush(false);
  }, FLUSH_INTERVAL_MS);
}

async function flush(useBeacon: boolean): Promise<void> {
  if (typeof window === "undefined") return;
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const payload = JSON.stringify({ events: batch });

  // `sendBeacon` is the only path that reliably ships data during a
  // page unload — `fetch(..., { keepalive: true })` is close but has
  // payload size limits and worse browser support. Prefer beacon when
  // available AND when we're tearing down, else use fetch so we can
  // catch transient errors and log them in dev.
  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
    } catch {
      /* swallow */
    }
    return;
  }
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  } catch {
    /* swallow — telemetry is best-effort */
  }
}

/** Public API. Queue a UI event for the next batch flush. */
export function trackEvent(type: string, opts: Omit<TrackedEvent, "type"> = {}): void {
  if (typeof window === "undefined") return;
  if (!type) return;
  installListeners();
  // Auto-attach current pathname so the server doesn't have to guess.
  const path = opts.path ?? (typeof location !== "undefined" ? location.pathname : undefined);
  const event: QueuedEvent = {
    type,
    target_id: opts.target_id,
    action: opts.action,
    lang: opts.lang,
    path,
    meta: opts.meta,
    _ts: new Date().toISOString(),
  };
  queue.push(event);
  if (queue.length > MAX_QUEUE) {
    queue = queue.slice(-MAX_QUEUE);
  }
  if (queue.length >= FLUSH_BATCH_SIZE) {
    void flush(false);
  } else {
    scheduleFlush();
  }
  // Make sure the visitor cookie exists before the next flush hits the
  // server — flush() doesn't pass the visitor_id directly; the server
  // reads it from the cookie header on the request.
  getOrCreateVisitorId();
}
