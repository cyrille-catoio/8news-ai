import { describe, expect, it } from "vitest";
import { resolveBinanceSymbol, resolveTradingViewSymbol } from "../crypto-tradingview";

describe("resolveTradingViewSymbol", () => {
  it("uses curated TradingView symbols for common CoinGecko ids", () => {
    expect(resolveTradingViewSymbol({ coinId: "bitcoin", symbol: "btc" })).toEqual({
      symbol: "BINANCE:BTCUSDT",
      usedFallback: false,
    });
    expect(resolveTradingViewSymbol({ coinId: "bittensor", symbol: "tao" })).toEqual({
      symbol: "BINANCE:TAOUSDT",
      usedFallback: false,
    });
  });

  it("falls back to a Binance USDT pair for unknown top-50 symbols", () => {
    expect(resolveTradingViewSymbol({ coinId: "example-coin", symbol: "abc" })).toEqual({
      symbol: "BINANCE:ABCUSDT",
      usedFallback: true,
    });
  });
});

describe("resolveBinanceSymbol", () => {
  it("returns the Binance pair from the curated mapping", () => {
    expect(resolveBinanceSymbol({ coinId: "bitcoin", symbol: "btc" })).toBe("BTCUSDT");
    expect(resolveBinanceSymbol({ coinId: "bittensor", symbol: "tao" })).toBe("TAOUSDT");
  });

  it("falls back to a USDT pair for non-Binance or unknown coins", () => {
    expect(resolveBinanceSymbol({ coinId: "hyperliquid", symbol: "hype" })).toBe("HYPEUSDT");
    expect(resolveBinanceSymbol({ coinId: "example-coin", symbol: "abc" })).toBe("ABCUSDT");
  });
});
