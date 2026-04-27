"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
  updatedAt: string;
}

interface CryptoApiResponse {
  prices?: CryptoPrice[];
  stale?: boolean;
}

const POLL_MS = 60_000;

/**
 * Live BTC/ETH/SOL/XRP prices for the AppHeader ticker. Mirrors the
 * `useTopFeed` shape (poll flag + cleanup-safe effects) so the
 * AppHeader can pass `poll={currentPage !== "landing"}` and the hook
 * stops talking to the API on the marketing page.
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
export function useCryptoPrices({ poll }: { poll: boolean }) {
  const [prices, setPrices] = useState<CryptoPrice[]>([]);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // `cancelled` mirrors the standard React-fetch-effect pattern (also
  // used in useTopFeed): every async resolve checks the ref so a state
  // setter never lands after unmount or after a stale request.
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    try {
      const r = await fetch("/api/crypto", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as CryptoApiResponse;
      if (cancelledRef.current) return;
      setPrices(json.prices ?? []);
      setStale(Boolean(json.stale));
      setError(false);
    } catch {
      if (cancelledRef.current) return;
      setError(true);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    void fetchOnce();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchOnce]);

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
        // Coming back from background: refresh immediately so the
        // ticker is current the moment the user lands on the tab,
        // then resume the regular cadence.
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

  return { prices, stale, loading, error, refresh };
}
