"use client";

import { color, card, outlinedButtonStyle } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { useCryptoPrices, type CryptoPrice } from "@/hooks/useCryptoPrices";
import { resolveBinanceSymbol } from "@/lib/crypto-tradingview";
import { CryptoCandleChart } from "@/app/components/crypto-chart/CryptoCandleChart";
import { CryptoCoinPicker } from "@/app/components/crypto-chart/CryptoCoinPicker";

export interface CryptoChartTarget {
  coinId: string;
  symbol: string;
}

function readQueryCoin(): { coinId: string; symbol: string } {
  if (typeof window === "undefined") return { coinId: "bitcoin", symbol: "btc" };
  const params = new URLSearchParams(window.location.search);
  const coinId = (params.get("coin") || "bitcoin").trim().toLowerCase();
  const symbol = (params.get("symbol") || "btc").trim().toLowerCase();
  return { coinId, symbol };
}

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    maximumFractionDigits: price >= 1000 ? 0 : price >= 1 ? 2 : 4,
  });
}

function fallbackPrice(coinId: string, symbol: string): CryptoPrice {
  return {
    coinId,
    symbol,
    name: symbol.toUpperCase(),
    marketCapRank: 0,
    price: 0,
    change24h: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function CryptoChartPage({
  lang,
  target,
  onSelectCoin,
}: {
  lang: Lang;
  target?: CryptoChartTarget | null;
  /** Switch the chart to another coin (SPA navigation). Falls back to a
   *  full navigation when not provided (e.g. direct/hard load). */
  onSelectCoin?: (coin: CryptoChartTarget) => void;
}) {
  const query = target ?? readQueryCoin();
  const crypto = useCryptoPrices({ poll: true, selectedSymbols: [query.symbol] });
  const price = crypto.prices.find((p) => p.symbol === query.symbol) ?? fallbackPrice(query.coinId, query.symbol);
  const binanceSymbol = resolveBinanceSymbol(price);
  const positive = price.change24h >= 0;

  const availableCoins = [...crypto.availableCoins].sort((a, b) => a.marketCapRank - b.marketCapRank);

  const handleSelect = (coin: CryptoChartTarget) => {
    if (onSelectCoin) {
      onSelectCoin(coin);
    } else if (typeof window !== "undefined") {
      window.location.assign(`/app/crypto-chart?coin=${encodeURIComponent(coin.coinId)}&symbol=${encodeURIComponent(coin.symbol)}`);
    }
  };

  return (
    <section>
      {/* Compact one-row header so the chart is visible above the fold. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
          <CryptoCoinPicker
            lang={lang}
            currentSymbol={price.symbol}
            currentLabel={price.symbol.toUpperCase()}
            fallbackCoins={availableCoins}
            onSelect={handleSelect}
          />
          <span style={{ color: color.gold, fontSize: 20, fontWeight: 800 }}>
            {price.price > 0 ? `$${formatPrice(price.price)}` : "—"}
          </span>
          <span style={{ color: positive ? "#4ade80" : color.errorText, fontSize: 15, fontWeight: 700 }}>
            {price.price > 0 ? `${positive ? "+" : ""}${price.change24h.toFixed(1)}%` : ""}
          </span>
          {price.marketCapRank > 0 && (
            <span style={{ color: color.textMuted, fontSize: 13, fontWeight: 600 }}>
              {t("cryptoChartRank", lang)} #{price.marketCapRank}
            </span>
          )}
          <span style={{ color: color.textDim, fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace" }}>
            {binanceSymbol} · Binance
          </span>
        </div>
        <a
          href={`https://www.coingecko.com/en/coins/${price.coinId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...outlinedButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
        >
          CoinGecko
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>

      <div
        style={{
          ...card,
          marginBottom: 0,
          padding: 0,
          overflow: "hidden",
          height: "min(82vh, 760px)",
          minHeight: 420,
          background: "#050505",
        }}
      >
        <CryptoCandleChart binanceSymbol={binanceSymbol} lang={lang} />
      </div>
    </section>
  );
}
