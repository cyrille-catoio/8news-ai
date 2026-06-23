import { NextResponse } from "next/server";

/**
 * GET /api/crypto/coins
 *
 * Lightweight metadata list of the top ~200 CoinGecko coins by market
 * cap, used by the chart page's coin picker modal (search + switch).
 * Read-only, no prices — just `{ coinId, symbol, name, marketCapRank }`.
 *
 * Cached aggressively: the ranking changes slowly, so we memoize in
 * process for 1 h and let the Netlify edge cache the response for the
 * same window. Falls back to an empty list on upstream failure (the
 * picker then degrades to the live ticker's top-50 list).
 */

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false";
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6_000;

interface CoinMeta {
  coinId: string;
  symbol: string;
  name: string;
  marketCapRank: number;
}

interface CoinGeckoMarketEntry {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number | null;
}

let memo: { coins: CoinMeta[]; cachedAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (memo && now - memo.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ coins: memo.coins }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, must-revalidate" } });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(COINGECKO_URL, { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) {
      console.warn(`[crypto/coins] coingecko fetch failed: HTTP ${res.status}`);
      return NextResponse.json({ coins: memo?.coins ?? [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const json = (await res.json()) as CoinGeckoMarketEntry[];
    if (!Array.isArray(json)) {
      return NextResponse.json({ coins: memo?.coins ?? [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const coins: CoinMeta[] = json
      .filter((e) => typeof e.id === "string" && typeof e.symbol === "string" && typeof e.name === "string")
      .map((e, i) => ({
        coinId: e.id,
        symbol: e.symbol.toLowerCase(),
        name: e.name,
        marketCapRank: typeof e.market_cap_rank === "number" ? e.market_cap_rank : i + 1,
      }));
    memo = { coins, cachedAt: now };
    return NextResponse.json({ coins }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, must-revalidate" } });
  } catch (err) {
    console.warn("[crypto/coins] coingecko fetch threw", err instanceof Error ? err.message : err);
    return NextResponse.json({ coins: memo?.coins ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timer);
  }
}
