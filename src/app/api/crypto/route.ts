import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";

/**
 * GET /api/crypto
 *
 * Returns the six ticker prices (BTC, ETH, SOL, XRP, TAO, SUI) for the
 * AppHeader — TAO/SUI are rendered on desktop viewports only.
 * `<CryptoTicker />`. Public endpoint, no session required, no `?lang`
 * dimension (USD-only — the labels are language-neutral).
 *
 * Caching strategy (mirrors `/api/news/top-story`)
 * ------------------------------------------------
 * 1. **Supabase row cache** (`crypto_prices`, migration 020). The DB is
 *    the single source of truth shared across all warm Function
 *    instances. We refresh from CoinGecko when *any* of the four rows
 *    is older than `CACHE_TTL_MS` (60 s) or when the table is empty.
 * 2. **Module-level memoization**. A tiny `{ payload, cachedAt }`
 *    object lives at module scope so two requests hitting the same
 *    warm instance within `CACHE_TTL_MS` skip Supabase entirely and
 *    return the in-memory copy.
 * 3. **CDN cache headers**. `Cache-Control: public, s-maxage=60,
 *    max-age=0, must-revalidate` lets Netlify's edge cache the response
 *    for ≤ 60 s; browsers always re-validate so a manual refresh picks
 *    up the latest tick immediately when the edge has flipped.
 *
 * Net effect with N concurrent users: 1 CoinGecko call per minute, period.
 * CoinGecko free tier = 30 calls/minute, so we sit 30× under the limit.
 *
 * Failure modes
 * -------------
 * - CoinGecko fetch errors / 5xx / timeout → return the last cached DB
 *   rows with `stale: true`. The ticker keeps working, the front-end
 *   shows a small grey dot. We only return `prices: []` when the table
 *   has *never* been populated (first ever cold start with no upstream).
 * - Supabase service-role env vars missing → fail open with empty
 *   payload + `stale: true`. The ticker hides itself gracefully.
 *
 * Output shape (single JSON, no streaming):
 *   {
 *     prices: [
 *       { symbol: "btc", price: 67234.12, change24h: 2.4, updatedAt: "..." },
 *       ...
 *     ],
 *     stale: false  // true when we couldn't reach CoinGecko this tick
 *   }
 */

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,bittensor,sui&vs_currencies=usd&include_24hr_change=true";

const COINGECKO_TO_SYMBOL: Record<string, string> = {
  bitcoin: "btc",
  ethereum: "eth",
  solana: "sol",
  ripple: "xrp",
  bittensor: "tao",
  sui: "sui",
};

const TRACKED_SYMBOLS = ["btc", "eth", "sol", "xrp", "tao", "sui"] as const;

interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
  updatedAt: string;
}

interface CryptoPayload {
  prices: CryptoPrice[];
  stale: boolean;
}

interface CoinGeckoEntry {
  usd: number;
  usd_24h_change: number;
}

interface CryptoRow {
  symbol: string;
  price_usd: number | string;
  change_24h: number | string;
  updated_at: string;
}

interface MemoEntry {
  payload: CryptoPayload;
  cachedAt: number;
}

let memo: MemoEntry | null = null;

function jsonResponse(payload: CryptoPayload): NextResponse {
  return NextResponse.json(payload, {
    headers: {
      // public  → cacheable by the Netlify edge.
      // s-maxage=60 → edge serves the same payload for up to 1 minute.
      // max-age=0 + must-revalidate → browsers always check upstream
      //   so a refresh picks up the new tick the moment the edge flips.
      "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
    },
  });
}

function rowsToPayload(rows: CryptoRow[], stale: boolean): CryptoPayload {
  // Re-order rows to the canonical TRACKED_SYMBOLS sequence so the UI
  // doesn't depend on the DB's `select` ordering. Coerce numeric columns
  // (Postgres numeric arrives as `string` over PostgREST when precision
  // could overflow JS numbers; we know our values fit so `Number()` is
  // safe and produces a primitive that React can render).
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  const prices: CryptoPrice[] = [];
  for (const sym of TRACKED_SYMBOLS) {
    const r = bySymbol.get(sym);
    if (!r) continue;
    prices.push({
      symbol: r.symbol,
      price: Number(r.price_usd),
      change24h: Number(r.change_24h),
      updatedAt: r.updated_at,
    });
  }
  return { prices, stale };
}

async function fetchCoinGecko(): Promise<Record<string, CoinGeckoEntry> | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(COINGECKO_URL, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
      // CoinGecko caches their own response for ~30 s; we still want
      // a fresh read every minute, so opt out of any Next/Node caching.
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(
        `[crypto] coingecko fetch failed: HTTP ${res.status} after ${Date.now() - startedAt}ms`,
      );
      return null;
    }
    const json = (await res.json()) as Record<string, CoinGeckoEntry>;
    // Single observability hook — visible in `next dev` console and
    // Netlify Function logs so we can verify the « ≤ 1 call/min »
    // claim in production at a glance.
    console.log(`[crypto] coingecko fetch ok in ${Date.now() - startedAt}ms`);
    return json;
  } catch (err) {
    console.warn(
      `[crypto] coingecko fetch threw after ${Date.now() - startedAt}ms`,
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const now = Date.now();

  // ── Tier 1: in-process memoization ────────────────────────────
  // Same warm instance, fresh enough → skip Supabase + CoinGecko entirely.
  if (memo && now - memo.cachedAt < CACHE_TTL_MS) {
    return jsonResponse(memo.payload);
  }

  // ── Setup Supabase service-role client ────────────────────────
  const dbP = getServerClient();
  if (!dbP) {
    // No DB → no cache fallback possible. Fail open with empty payload.
    const empty: CryptoPayload = { prices: [], stale: true };
    return jsonResponse(empty);
  }
  const db = await dbP;

  // ── Tier 2: read DB, decide if upstream refresh is needed ────
  const { data: rows, error } = await db
    .from("crypto_prices")
    .select("symbol, price_usd, change_24h, updated_at");

  const dbRows = error || !rows ? [] : (rows as CryptoRow[]);
  const cutoffIso = new Date(now - CACHE_TTL_MS).toISOString();
  const allFresh =
    dbRows.length === TRACKED_SYMBOLS.length &&
    dbRows.every((r) => r.updated_at >= cutoffIso);

  if (allFresh) {
    const payload = rowsToPayload(dbRows, false);
    memo = { payload, cachedAt: now };
    return jsonResponse(payload);
  }

  // ── Tier 3: refresh from CoinGecko ───────────────────────────
  const cg = await fetchCoinGecko();
  if (!cg) {
    // Upstream failed. Surface whatever we have in DB (if anything)
    // with stale=true so the UI shows the grey dot.
    const payload = rowsToPayload(dbRows, true);
    // Memoize the failure for a *short* window so we don't hammer
    // CoinGecko on every cache-miss request — but well under TTL so
    // we recover within seconds of upstream coming back.
    memo = { payload, cachedAt: now - (CACHE_TTL_MS - 10_000) };
    return jsonResponse(payload);
  }

  const nowIso = new Date(now).toISOString();
  const upserts = Object.entries(COINGECKO_TO_SYMBOL)
    .map(([cgId, sym]) => {
      const entry = cg[cgId];
      if (!entry || typeof entry.usd !== "number") return null;
      return {
        symbol: sym,
        price_usd: entry.usd,
        change_24h:
          typeof entry.usd_24h_change === "number" ? entry.usd_24h_change : 0,
        updated_at: nowIso,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (upserts.length === 0) {
    // CoinGecko returned a 200 with no usable entries (rare). Fall
    // back to whatever's in DB.
    const payload = rowsToPayload(dbRows, true);
    memo = { payload, cachedAt: now - (CACHE_TTL_MS - 10_000) };
    return jsonResponse(payload);
  }

  // Upsert is non-blocking for the response — the user gets the
  // freshly-fetched prices immediately, the row write happens in
  // parallel. A failed write just means the next minute repeats
  // the upstream call, which is harmless at our request volume.
  void db.from("crypto_prices").upsert(upserts, { onConflict: "symbol" });

  const payload = rowsToPayload(
    upserts.map((u) => ({
      symbol: u.symbol,
      price_usd: u.price_usd,
      change_24h: u.change_24h,
      updated_at: u.updated_at,
    })),
    false,
  );
  memo = { payload, cachedAt: now };
  return jsonResponse(payload);
}
