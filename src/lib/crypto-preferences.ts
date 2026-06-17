"use client";

import { getCookie, setCookie } from "@/lib/cookies";

export const DEFAULT_CRYPTO_TICKER_SYMBOLS = ["btc", "eth", "sol", "xrp", "tao", "sui"] as const;
export const MAX_CRYPTO_TICKER_SYMBOLS = 10;

const COOKIE_KEY = "cryptoTickerSymbols";
export const CRYPTO_TICKER_SYMBOLS_EVENT = "cryptoTickerSymbolsChanged";

export function normalizeCryptoSymbol(symbol: string): string {
  return symbol.trim().toLowerCase();
}

export function sanitizeCryptoSymbols(value: unknown, allowedSymbols?: Set<string>): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_CRYPTO_TICKER_SYMBOLS];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const symbol = normalizeCryptoSymbol(item);
    if (!/^[a-z0-9]+$/.test(symbol)) continue;
    if (allowedSymbols && !allowedSymbols.has(symbol)) continue;
    if (out.includes(symbol)) continue;
    out.push(symbol);
    if (out.length >= MAX_CRYPTO_TICKER_SYMBOLS) break;
  }
  return out.length > 0 ? out : [...DEFAULT_CRYPTO_TICKER_SYMBOLS];
}

export function readCryptoTickerSymbols(): string[] {
  if (typeof document === "undefined") return [...DEFAULT_CRYPTO_TICKER_SYMBOLS];
  const raw = getCookie(COOKIE_KEY);
  if (!raw) return [...DEFAULT_CRYPTO_TICKER_SYMBOLS];
  try {
    return sanitizeCryptoSymbols(JSON.parse(raw));
  } catch {
    return [...DEFAULT_CRYPTO_TICKER_SYMBOLS];
  }
}

export function writeCryptoTickerSymbols(symbols: string[]): void {
  if (typeof document === "undefined") return;
  const sanitized = sanitizeCryptoSymbols(symbols);
  setCookie(COOKIE_KEY, JSON.stringify(sanitized));
  window.dispatchEvent(
    new CustomEvent<string[]>(CRYPTO_TICKER_SYMBOLS_EVENT, { detail: sanitized }),
  );
}
