"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { readCachedCrypto, writeCachedCrypto } from "@/lib/crypto-cache";
import { sanitizeCryptoSymbols } from "@/lib/crypto-preferences";

export interface CryptoCoin {
  symbol: string;
  coinId: string;
  name: string;
  marketCapRank: number;
}

export interface CryptoPrice extends CryptoCoin {
  price: number;
  change24h: number;
  updatedAt: string;
}

interface CryptoApiResponse {
  prices?: CryptoPrice[];
  availableCoins?: CryptoCoin[];
  stale?: boolean;
}

const POLL_MS = 60_000;

/**
 * Live top-50 CoinGecko prices for the AppHeader ticker. Mirrors the
 * `useTopFeed` shape (poll flag + cleanup-safe effects) so the
 * AppHeader can pass `poll={currentPage !== "landing"}` and the hook
 * stops talking to the API on the marketing page.
 *
 * Stale-while-revalidate (v2.12.1+): after mount we read
 * `localStorage` via `readCachedCrypto()` so returning visitors see
 * the last tick on the next paint without a hydration mismatch — cache
 * is never applied during the initial render (SSR + first client pass
 * both show the same empty placeholder until `useEffect` runs).
 *
 * Visibility-aware: when the tab is hidden we pause the interval (saves
 * CoinGecko credits — Chrome already throttles background setInterval to
 * ≥ 1 min, but explicitly pausing means we never even attempt the
 * fetch). On `visibilitychange → visible` we refresh once and resume
 * the regular cadence.
 *
 * The endpoint itself is cached behind a 60 s Supabase row + 60 s edge
 * window, so even if N tabs all poll at the same rate, at most one of
 * them triggers an actual CoinGecko call per minute.
 */
export function useCryptoPrices({
  poll,
  selectedSymbols,
}: {
  poll: boolean;
  selectedSymbols: string[];
}) {
  const [prices, setPrices] = useState<CryptoPrice[]>([]);
  const [availableCoins, setAvailableCoins] = useState<CryptoCoin[]>([]);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const cancelledRef = useRef(false);
  const normalizedSymbols = useMemo(() => sanitizeCryptoSymbols(selectedSymbols), [selectedSymbols]);
  const symbolsKey = normalizedSymbols.join(",");

  const fetchOnce = useCallback(async () => {
    try {
      const qs = symbolsKey ? `?symbols=${encodeURIComponent(symbolsKey)}` : "";
      const r = await fetch(`/api/crypto${qs}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as CryptoApiResponse;
      if (cancelledRef.current) return;
      const nextPrices = json.prices ?? [];
      const nextAvailableCoins = json.availableCoins ?? [];
      const nextStale = Boolean(json.stale);
      setPrices(nextPrices);
      setAvailableCoins(nextAvailableCoins);
      setStale(nextStale);
      setError(false);
      if (nextPrices.length > 0) {
        writeCachedCrypto(
          { prices: nextPrices, availableCoins: nextAvailableCoins, stale: nextStale },
          normalizedSymbols,
        );
      }
    } catch {
      if (cancelledRef.current) return;
      setError(true);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [normalizedSymbols, symbolsKey]);

  const refresh = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  useEffect(() => {
    cancelledRef.current = false;
    const cached = readCachedCrypto(normalizedSymbols);
    if (cached?.prices?.length) {
      setPrices(cached.prices);
      setAvailableCoins(cached.availableCoins ?? []);
      setStale(cached.stale);
      setLoading(false);
    }
    if (!poll) return;
    void fetchOnce();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchOnce, normalizedSymbols, poll]);

  useEffect(() => {
    if (!poll) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        void fetchOnce();
      }, POLL_MS);
    };
    const stop = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    if (typeof document === "undefined" || document.visibilityState !== "hidden") {
      start();
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        void fetchOnce();
        start();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [poll, fetchOnce]);

  return { prices, availableCoins, stale, loading, error, refresh };
}
