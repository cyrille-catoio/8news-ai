"use client";

import { color, card, outlinedButtonStyle } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { useCryptoPrices, type CryptoPrice } from "@/hooks/useCryptoPrices";
import { resolveBinanceSymbol } from "@/lib/crypto-tradingview";
import { CryptoCandleChart } from "@/app/components/crypto-chart/CryptoCandleChart";

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
}: {
  lang: Lang;
  target?: CryptoChartTarget | null;
}) {
  const query = target ?? readQueryCoin();
  const crypto = useCryptoPrices({ poll: true, selectedSymbols: [query.symbol] });
  const price = crypto.prices.find((p) => p.symbol === query.symbol) ?? fallbackPrice(query.coinId, query.symbol);
  const binanceSymbol = resolveBinanceSymbol(price);
  const positive = price.change24h >= 0;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ color: color.gold, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
            {t("cryptoChartKicker", lang)}
          </div>
          <h1 style={{ margin: 0, color: color.text, fontFamily: "ui-serif, Georgia, serif", fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 400, lineHeight: 1.08 }}>
            {price.symbol.toUpperCase()} · {price.name}
          </h1>
          <p style={{ color: color.textMuted, margin: "10px 0 0", fontSize: 14, lineHeight: 1.5 }}>
            {t("cryptoChartSubtitle", lang)}
          </p>
        </div>
        <a
          href={`https://www.coingecko.com/en/coins/${price.coinId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...outlinedButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          CoinGecko
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ color: color.gold, fontSize: 22, fontWeight: 800 }}>
            {price.price > 0 ? `$${formatPrice(price.price)}` : "—"}
          </div>
          <div style={{ color: color.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
            {t("cryptoChartPrice", lang)}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: positive ? "#4ade80" : color.errorText, fontSize: 22, fontWeight: 800 }}>
            {price.price > 0 ? `${positive ? "+" : ""}${price.change24h.toFixed(1)}%` : "—"}
          </div>
          <div style={{ color: color.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
            24h
          </div>
        </div>
        <div style={card}>
          <div style={{ color: color.text, fontSize: 22, fontWeight: 800 }}>
            {price.marketCapRank > 0 ? `#${price.marketCapRank}` : "—"}
          </div>
          <div style={{ color: color.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
            {t("cryptoChartRank", lang)}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: color.text, fontSize: 14, fontWeight: 800, wordBreak: "break-word" }}>
            {binanceSymbol}
          </div>
          <div style={{ color: color.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
            Binance
          </div>
        </div>
      </div>

      <div
        style={{
          ...card,
          padding: 0,
          overflow: "hidden",
          height: "min(72vh, 680px)",
          minHeight: 420,
          background: "#050505",
        }}
      >
        <CryptoCandleChart binanceSymbol={binanceSymbol} lang={lang} />
      </div>
    </section>
  );
}
