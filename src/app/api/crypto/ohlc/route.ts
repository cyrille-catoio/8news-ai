import { NextResponse } from "next/server";

/**
 * GET /api/crypto/ohlc?symbol=BTCUSDT&days=365
 *
 * Daily OHLC candles for the in-app crypto candle chart
 * (`CryptoCandleChart`). Proxies Binance's public spot klines endpoint
 * (`interval=1d`, no API key) so the browser never talks to Binance
 * directly — this keeps the data feed server-side, dodges browser
 * region/CORS quirks, and lets the Netlify edge cache the response.
 *
 * One candle = one UTC day. The default range pulls ~1 year so the
 * client can switch its visible window (1M / 3M / 6M / 1Y) and compute
 * Bollinger Bands with enough warm-up candles, without re-fetching.
 *
 * Output: `{ candles: [{ time: "YYYY-MM-DD", open, high, low, close }], stale }`.
 * On upstream failure we return `{ candles: [], stale: true }` so the UI
 * shows an empty-state instead of crashing.
 */

const BINANCE_URL = "https://api.binance.com/api/v3/klines";
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
  // Binance pairs are alphanumeric (e.g. BTCUSDT). Reject anything else
  // so we never forward an arbitrary string upstream.
  if (!/^[A-Z0-9]{5,20}$/.test(sym)) return null;
  return sym;
}

function toDayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = parseSymbol(searchParams.get("symbol"));
  if (!symbol) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const daysRaw = parseInt(searchParams.get("days") ?? "", 10);
  const days = Number.isFinite(daysRaw) ? Math.min(MAX_DAYS, Math.max(30, daysRaw)) : DEFAULT_DAYS;

  const url = `${BINANCE_URL}?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=${days}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) {
      console.warn(`[crypto/ohlc] binance fetch failed for ${symbol}: HTTP ${res.status}`);
      return jsonResponse({ candles: [], stale: true }, false);
    }
    const rows = (await res.json()) as unknown[];
    if (!Array.isArray(rows)) {
      return jsonResponse({ candles: [], stale: true }, false);
    }
    const candles: OhlcCandle[] = [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const openTime = Number(row[0]);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[5]);
      if (![openTime, open, high, low, close].every(Number.isFinite)) continue;
      candles.push({
        time: toDayString(openTime),
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      });
    }
    return jsonResponse({ candles, stale: false }, true);
  } catch (err) {
    console.warn(`[crypto/ohlc] binance fetch threw for ${symbol}`, err instanceof Error ? err.message : err);
    return jsonResponse({ candles: [], stale: true }, false);
  } finally {
    clearTimeout(timer);
  }
}
