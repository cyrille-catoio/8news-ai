import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";

/**
 * GET /api/crypto
 *
 * Returns the top 50 CoinGecko market-cap coins, optionally filtered down
 * to the user's selected ticker symbols for the AppHeader.
 * `<CryptoTicker />`. Public endpoint, no session required, no `?lang`
 * dimension (USD-only — the labels are language-neutral).
 *
 * Caching strategy (mirrors `/api/news/top-story`)
 * ------------------------------------------------
 * 1. **Supabase row cache** (`crypto_prices`, migration 020). The DB is
 *    the single source of truth shared across all warm Function
 *    instances. We refresh from CoinGecko when the top 50 rows are older
 *    than `CACHE_TTL_MS` (60 s) or when the table is empty.
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
 *     prices: [{ symbol, coinId, name, marketCapRank, price, change24h, updatedAt }],
 *     availableCoins: [{ symbol, coinId, name, marketCapRank }],
 *     stale: false  // true when we couldn't reach CoinGecko this tick
 *   }
 */

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;
const TOP_COINS_LIMIT = 50;
const MAX_SELECTED_SYMBOLS = 20;

const COINGECKO_URL =
  `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${TOP_COINS_LIMIT}&page=1&sparkline=false&price_change_percentage=24h`;

const DEFAULT_SYMBOLS = ["btc", "eth", "sol", "xrp", "tao", "sui"] as const;

interface CryptoCoin {
  symbol: string;
  coinId: string;
  name: string;
  marketCapRank: number;
}

interface CryptoPrice extends CryptoCoin {
  price: number;
  change24h: number;
  updatedAt: string;
}

interface CryptoPayload {
  prices: CryptoPrice[];
  availableCoins: CryptoCoin[];
  stale: boolean;
}

interface CoinGeckoMarketEntry {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  price_change_percentage_24h: number | null;
  market_cap_rank: number | null;
}

interface CryptoRow {
  symbol: string;
  coin_id: string | null;
  name: string | null;
  market_cap_rank: number | null;
  price_usd: number | string;
  change_24h: number | string;
  updated_at: string;
}

interface MemoEntry {
  prices: CryptoPrice[];
  stale: boolean;
  cachedAt: number;
}

let memo: MemoEntry | null = null;

function jsonResponse(payload: CryptoPayload, cacheable: boolean): NextResponse {
  return NextResponse.json(payload, {
    headers: {
      // public  → cacheable by the Netlify edge.
      // s-maxage=60 → edge serves the same payload for up to 1 minute.
      // max-age=0 + must-revalidate → browsers always check upstream
      //   so a refresh picks up the new tick the moment the edge flips.
      "Cache-Control": cacheable
        ? "public, max-age=0, s-maxage=60, must-revalidate"
        : "private, no-store",
    },
  });
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toLowerCase();
}

function parseRequestedSymbols(request: Request): string[] | null {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("symbols");
  if (!raw) return null;
  const symbols: string[] = [];
  for (const part of raw.split(",")) {
    const sym = normalizeSymbol(part);
    if (!/^[a-z0-9]+$/.test(sym) || symbols.includes(sym)) continue;
    symbols.push(sym);
    if (symbols.length >= MAX_SELECTED_SYMBOLS) break;
  }
  return symbols.length > 0 ? symbols : null;
}

function rowsToPrices(rows: CryptoRow[]): CryptoPrice[] {
  // Postgres numeric arrives as `string` over PostgREST when precision could
  // overflow JS numbers; these market prices are safe to coerce.
  return rows
    .map((r) => ({
      symbol: normalizeSymbol(r.symbol),
      coinId: r.coin_id ?? normalizeSymbol(r.symbol),
      name: r.name ?? r.symbol.toUpperCase(),
      marketCapRank: typeof r.market_cap_rank === "number" ? r.market_cap_rank : TOP_COINS_LIMIT + 1,
      price: Number(r.price_usd),
      change24h: Number(r.change_24h),
      updatedAt: r.updated_at,
    }))
    .sort((a, b) => a.marketCapRank - b.marketCapRank);
}

function selectPrices(allPrices: CryptoPrice[], requestedSymbols: string[] | null): CryptoPrice[] {
  const allowedSymbols = new Set(allPrices.map((p) => p.symbol));
  const requested =
    requestedSymbols?.filter((sym) => allowedSymbols.has(sym)).slice(0, MAX_SELECTED_SYMBOLS) ?? [];
  const targetSymbols = requested.length > 0 ? requested : DEFAULT_SYMBOLS;
  const bySymbol = new Map(allPrices.map((p) => [p.symbol, p]));
  return targetSymbols
    .map((sym) => bySymbol.get(sym))
    .filter((p): p is CryptoPrice => Boolean(p))
    .slice(0, MAX_SELECTED_SYMBOLS);
}

function buildPayload(
  allPrices: CryptoPrice[],
  requestedSymbols: string[] | null,
  stale: boolean,
): CryptoPayload {
  return {
    prices: selectPrices(allPrices, requestedSymbols),
    availableCoins: allPrices.slice(0, TOP_COINS_LIMIT).map(({ symbol, coinId, name, marketCapRank }) => ({
      symbol,
      coinId,
      name,
      marketCapRank,
    })),
    stale,
  };
}

async function fetchCoinGecko(): Promise<CryptoPrice[] | null> {
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
    const json = (await res.json()) as CoinGeckoMarketEntry[];
    // Single observability hook — visible in `next dev` console and
    // Netlify Function logs so we can verify the « ≤ 1 call/min »
    // claim in production at a glance.
    console.log(`[crypto] coingecko fetch ok in ${Date.now() - startedAt}ms`);
    const nowIso = new Date().toISOString();
    return json
      .filter((entry) => {
        return (
          typeof entry.id === "string" &&
          typeof entry.symbol === "string" &&
          typeof entry.name === "string" &&
          typeof entry.current_price === "number"
        );
      })
      .map((entry, index) => ({
        symbol: normalizeSymbol(entry.symbol),
        coinId: entry.id,
        name: entry.name,
        marketCapRank: typeof entry.market_cap_rank === "number" ? entry.market_cap_rank : index + 1,
        price: entry.current_price as number,
        change24h:
          typeof entry.price_change_percentage_24h === "number"
            ? entry.price_change_percentage_24h
            : 0,
        updatedAt: nowIso,
      }))
      .slice(0, TOP_COINS_LIMIT);
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

export async function GET(request: Request) {
  const now = Date.now();
  const requestedSymbols = parseRequestedSymbols(request);

  // ── Tier 1: in-process memoization ────────────────────────────
  // Same warm instance, fresh enough → skip Supabase + CoinGecko entirely.
  if (memo && now - memo.cachedAt < CACHE_TTL_MS) {
    return jsonResponse(
      buildPayload(memo.prices, requestedSymbols, memo.stale),
      requestedSymbols === null,
    );
  }

  // ── Setup Supabase service-role client ────────────────────────
  const dbP = getServerClient();
  if (!dbP) {
    // No DB → no cache fallback possible. Fail open with empty payload.
    const empty: CryptoPayload = { prices: [], availableCoins: [], stale: true };
    return jsonResponse(empty, requestedSymbols === null);
  }
  const db = await dbP;

  // ── Tier 2: read DB, decide if upstream refresh is needed ────
  const { data: rows, error } = await db
    .from("crypto_prices")
    .select("symbol, coin_id, name, market_cap_rank, price_usd, change_24h, updated_at");
  if (error) {
    console.warn("[crypto] Supabase cache read failed", error.message);
  }

  const dbRows = error || !rows ? [] : (rows as CryptoRow[]);
  const cutoffIso = new Date(now - CACHE_TTL_MS).toISOString();
  const allFresh =
    dbRows.length >= TOP_COINS_LIMIT &&
    dbRows.every((r) => r.updated_at >= cutoffIso);

  if (allFresh) {
    const prices = rowsToPrices(dbRows);
    memo = { prices, stale: false, cachedAt: now };
    return jsonResponse(buildPayload(prices, requestedSymbols, false), requestedSymbols === null);
  }

  // ── Tier 3: refresh from CoinGecko ───────────────────────────
  const cgPrices = await fetchCoinGecko();
  if (!cgPrices) {
    // Upstream failed. Surface whatever we have in DB (if anything)
    // with stale=true so the UI shows the grey dot.
    const prices = rowsToPrices(dbRows);
    const payload = buildPayload(prices, requestedSymbols, true);
    // Memoize the failure for a *short* window so we don't hammer
    // CoinGecko on every cache-miss request — but well under TTL so
    // we recover within seconds of upstream coming back.
    memo = { prices, stale: true, cachedAt: now - (CACHE_TTL_MS - 10_000) };
    return jsonResponse(payload, requestedSymbols === null);
  }

  const upserts = cgPrices.map((p) => ({
    symbol: p.symbol,
    coin_id: p.coinId,
    name: p.name,
    market_cap_rank: p.marketCapRank,
    price_usd: p.price,
    change_24h: p.change24h,
    updated_at: p.updatedAt,
  }));

  if (upserts.length === 0) {
    // CoinGecko returned a 200 with no usable entries (rare). Fall
    // back to whatever's in DB.
    const prices = rowsToPrices(dbRows);
    const payload = buildPayload(prices, requestedSymbols, true);
    memo = { prices, stale: true, cachedAt: now - (CACHE_TTL_MS - 10_000) };
    return jsonResponse(payload, requestedSymbols === null);
  }

  // Upsert is non-blocking for the response — the user gets the
  // freshly-fetched prices immediately, the row write happens in
  // parallel. Log failed writes so a missing migration is visible in prod.
  void db
    .from("crypto_prices")
    .upsert(upserts, { onConflict: "symbol" })
    .then(({ error: upsertError }) => {
      if (upsertError) console.warn("[crypto] Supabase cache upsert failed", upsertError.message);
    });

  memo = { prices: cgPrices, stale: false, cachedAt: now };
  return jsonResponse(buildPayload(cgPrices, requestedSymbols, false), requestedSymbols === null);
}
