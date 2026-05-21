/**
 * Client-side stale-while-revalidate cache for the AppHeader crypto
 * ticker (`useCryptoPrices` → `/api/crypto`). Server-side we already
 * memoize in Supabase + edge; this layer makes returning visitors see
 * the last known BTC/ETH/SOL/XRP/TAO/SUI prices instantly instead of
 * an empty strip while the first `fetch()` is in flight.
 *
 * The 60 s polling loop is unchanged — we only skip the blank first
 * paint when `localStorage` still holds a recent envelope.
 */

import type { CryptoPrice } from "@/hooks/useCryptoPrices";

const KEY = "crypto-ticker-prices";
/** Defensive TTL if the network stays down — normal path revalidates every 60 s. */
const TTL_MS = 12 * 60 * 60 * 1000;
const SCHEMA = 1;

export interface CachedCryptoPayload {
  prices: CryptoPrice[];
  stale: boolean;
}

interface Envelope {
  schema: number;
  ts: number;
  data: CachedCryptoPayload;
}

export function readCachedCrypto(): CachedCryptoPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope;
    if (parsed.schema !== SCHEMA) return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    if (!Array.isArray(parsed.data?.prices) || parsed.data.prices.length === 0) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCachedCrypto(data: CachedCryptoPayload): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: Envelope = { schema: SCHEMA, ts: Date.now(), data };
    window.localStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    /* quota / disabled storage */
  }
}
