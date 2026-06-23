import { NextResponse } from "next/server";

/**
 * GET /api/crypto/ohlc?symbol=BTCUSDT&days=365
 *
 * Daily OHLC candles for the in-app crypto candle chart
 * (`CryptoCandleChart`). Proxies public spot klines server-side so the
 * browser never talks to an exchange directly — keeps the data feed
 * server-side, dodges browser region/CORS quirks, and lets the Netlify
 * edge cache the response.
 *
 * Source chain: Binance first (widest top-50 coverage). If Binance
 * doesn't list the pair (e.g. Hyperliquid `HYPEUSDT` → "Invalid
 * symbol"), fall back to KuCoin (`HYPE-USDT`). This mirrors the curated
 * exchange mapping in `crypto-tradingview.ts`.
 *
 * One candle = one UTC day. The default range pulls ~1 year so the
 * client can switch its visible window (1M / 3M / 6M / 1Y) and compute
 * Bollinger Bands with enough warm-up candles, without re-fetching.
 *
 * Output: `{ candles: [{ time, open, high, low, close, volume }], stale }`.
 * On total upstream failure we return `{ candles: [], stale: true }` so
 * the UI shows an empty-state instead of crashing.
 */

const BINANCE_URL = "https://api.binance.com/api/v3/klines";
const KUCOIN_URL = "https://api.kucoin.com/api/v1/market/candles";
const FETCH_TIMEOUT_MS = 6_000;
const DEFAULT_DAYS = 365;
const MAX_DAYS = 1000;

interface OhlcCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function jsonResponse(payload: { candles: OhlcCandle[]; stale: boolean }, cacheable: boolean): NextResponse {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": cacheable
        ? "public, max-age=0, s-maxage=600, must-revalidate"
        : "private, no-store",
    },
  });
}

function parseSymbol(raw: string | null): string | null {
  if (!raw) return null;
  const sym = raw.trim().toUpperCase();
  // Spot pairs are alphanumeric (e.g. BTCUSDT). Reject anything else so
  // we never forward an arbitrary string upstream.
  if (!/^[A-Z0-9]{5,20}$/.test(sym)) return null;
  return sym;
}

function toDayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function fetchJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Binance klines: [openTime(ms), open, high, low, close, volume, …] ascending. */
async function fetchBinance(symbol: string, days: number): Promise<OhlcCandle[]> {
  const json = await fetchJson(`${BINANCE_URL}?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=${days}`);
  if (!Array.isArray(json)) return [];
  const out: OhlcCandle[] = [];
  for (const row of json) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const openTime = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);
    if (![openTime, open, high, low, close].every(Number.isFinite)) continue;
    out.push({ time: toDayString(openTime), open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
  }
  return out;
}

/** KuCoin candles: { data: [[time(s), open, close, high, low, volume, turnover], …] } DESC. */
async function fetchKucoin(symbol: string, days: number): Promise<OhlcCandle[]> {
  const base = symbol.replace(/USDT$/, "");
  if (!base) return [];
  const kucoinSymbol = `${base}-USDT`;
  const json = (await fetchJson(`${KUCOIN_URL}?type=1day&symbol=${encodeURIComponent(kucoinSymbol)}`)) as
    | { data?: unknown }
    | null;
  const rows = json && Array.isArray(json.data) ? json.data : null;
  if (!rows) return [];
  const out: OhlcCandle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const timeSec = Number(row[0]);
    const open = Number(row[1]);
    const close = Number(row[2]);
    const high = Number(row[3]);
    const low = Number(row[4]);
    const volume = Number(row[5]);
    if (![timeSec, open, high, low, close].every(Number.isFinite)) continue;
    out.push({ time: toDayString(timeSec * 1000), open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
  }
  // KuCoin returns newest-first; the chart expects ascending order.
  out.reverse();
  return out.slice(-days);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = parseSymbol(searchParams.get("symbol"));
  if (!symbol) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const daysRaw = parseInt(searchParams.get("days") ?? "", 10);
  const days = Number.isFinite(daysRaw) ? Math.min(MAX_DAYS, Math.max(30, daysRaw)) : DEFAULT_DAYS;

  let candles = await fetchBinance(symbol, days);
  if (candles.length === 0) {
    candles = await fetchKucoin(symbol, days);
  }

  if (candles.length === 0) {
    console.warn(`[crypto/ohlc] no candles for ${symbol} (binance + kucoin)`);
    return jsonResponse({ candles: [], stale: true }, false);
  }
  return jsonResponse({ candles, stale: false }, true);
}
