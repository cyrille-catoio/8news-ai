import type { CryptoPrice } from "@/hooks/useCryptoPrices";

const KNOWN_TRADINGVIEW_SYMBOLS: Record<string, string> = {
  bitcoin: "BINANCE:BTCUSDT",
  btc: "BINANCE:BTCUSDT",
  ethereum: "BINANCE:ETHUSDT",
  eth: "BINANCE:ETHUSDT",
  solana: "BINANCE:SOLUSDT",
  sol: "BINANCE:SOLUSDT",
  ripple: "BINANCE:XRPUSDT",
  xrp: "BINANCE:XRPUSDT",
  bnb: "BINANCE:BNBUSDT",
  binancecoin: "BINANCE:BNBUSDT",
  dogecoin: "BINANCE:DOGEUSDT",
  doge: "BINANCE:DOGEUSDT",
  cardano: "BINANCE:ADAUSDT",
  ada: "BINANCE:ADAUSDT",
  tron: "BINANCE:TRXUSDT",
  trx: "BINANCE:TRXUSDT",
  chainlink: "BINANCE:LINKUSDT",
  link: "BINANCE:LINKUSDT",
  avalanche_2: "BINANCE:AVAXUSDT",
  avax: "BINANCE:AVAXUSDT",
  sui: "BINANCE:SUIUSDT",
  bittensor: "BINANCE:TAOUSDT",
  tao: "BINANCE:TAOUSDT",
  polkadot: "BINANCE:DOTUSDT",
  dot: "BINANCE:DOTUSDT",
  litecoin: "BINANCE:LTCUSDT",
  ltc: "BINANCE:LTCUSDT",
  stellar: "BINANCE:XLMUSDT",
  xlm: "BINANCE:XLMUSDT",
  hyperliquid: "KUCOIN:HYPEUSDT",
  hype: "KUCOIN:HYPEUSDT",
};

export interface TradingViewSymbolResolution {
  symbol: string;
  usedFallback: boolean;
}

export function resolveTradingViewSymbol(input: Pick<CryptoPrice, "coinId" | "symbol">): TradingViewSymbolResolution {
  const coinKey = input.coinId.trim().toLowerCase();
  const symbolKey = input.symbol.trim().toLowerCase();
  const known = KNOWN_TRADINGVIEW_SYMBOLS[coinKey] ?? KNOWN_TRADINGVIEW_SYMBOLS[symbolKey];
  if (known) return { symbol: known, usedFallback: false };
  return { symbol: `BINANCE:${symbolKey.toUpperCase()}USDT`, usedFallback: true };
}

/**
 * Binance spot trading pair (e.g. `BTCUSDT`) used by the in-app candle
 * chart's data source (`GET /api/crypto/ohlc`). Derived from the
 * curated TradingView mapping when it points at Binance, otherwise a
 * `${SYMBOL}USDT` heuristic. Non-Binance curated exchanges (e.g. KuCoin)
 * fall back to the plain USDT heuristic since the Binance klines API is
 * the data feed.
 */
export function resolveBinanceSymbol(input: Pick<CryptoPrice, "coinId" | "symbol">): string {
  const coinKey = input.coinId.trim().toLowerCase();
  const symbolKey = input.symbol.trim().toLowerCase();
  const known = KNOWN_TRADINGVIEW_SYMBOLS[coinKey] ?? KNOWN_TRADINGVIEW_SYMBOLS[symbolKey];
  if (known && known.startsWith("BINANCE:")) return known.slice("BINANCE:".length);
  return `${symbolKey.toUpperCase()}USDT`;
}
