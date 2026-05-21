"use client";

import { type CSSProperties } from "react";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { useCryptoPrices, type CryptoPrice } from "@/hooks/useCryptoPrices";

/**
 * Compact live ticker for BTC / ETH / SOL / XRP (+ TAO / SUI on desktop)
 * side of the AppHeader. Powered by `useCryptoPrices` (60 s polling,
 * visibility-aware) which talks to `/api/crypto`. Cache layers
 * upstream guarantee a single CoinGecko call per minute SHARED across
 * every concurrent visitor — see the route's docblock. Client-side
 * `localStorage` (via `useCryptoPrices`, after mount) shows the last tick
 * on the next paint for return visits; the 60 s poll still revalidates.
 *
 * Mobile responsiveness lives in `globals.css` via helper classes:
 * - `.crypto-ticker-change` (24h %) hides at ≤640 px
 * - `.crypto-ticker-coin-desktop` (TAO, SUI) hides at ≤768 px — mobile
 *   shows BTC / ETH / SOL / XRP only
 *
 * The ticker is mounted by AppHeader only when the parent decides to
 * — see the `<CryptoTicker poll={…} />` call site. The hook itself
 * also supports `poll={false}` so the marketing landing page (future
 * `/landing` route) can mount the component but skip the polling
 * cycle if we ever want to keep prices visible without live updates.
 */

const COINGECKO_PAGES: Record<string, string> = {
  btc: "https://www.coingecko.com/en/coins/bitcoin",
  eth: "https://www.coingecko.com/en/coins/ethereum",
  sol: "https://www.coingecko.com/en/coins/solana",
  xrp: "https://www.coingecko.com/en/coins/ripple",
  tao: "https://www.coingecko.com/en/coins/bittensor",
  sui: "https://www.coingecko.com/en/coins/sui",
};

const POSITIVE_GREEN = "#4ade80";

function formatPrice(p: number): string {
  if (p >= 1000) {
    // 67234 → "67,234"; cents add no signal at this scale.
    return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (p >= 1) {
    // SOL ~ 150 → 2 decimals when below the $1k mark; XRP ~ 2.4 → same.
    return p.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  // Sub-dollar (would only matter if XRP crashed). Bump precision so
  // we don't render "$0".
  return p.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatChange(c: number): string {
  const sign = c >= 0 ? "+" : "";
  return `${sign}${c.toFixed(1)}%`;
}

function CoinCell({
  price,
  isDesktopOnly,
  refreshHint,
}: {
  price: CryptoPrice;
  isDesktopOnly: boolean;
  refreshHint: string;
}) {
  const positive = price.change24h >= 0;
  const changeColor = positive ? POSITIVE_GREEN : color.errorText;
  const href = COINGECKO_PAGES[price.symbol] ?? "https://www.coingecko.com";
  const title = `${price.symbol.toUpperCase()} · CoinGecko · ${refreshHint}`;

  // Re-keying on price triggers `cryptoFlash` (defined in globals.css)
  // each time the value changes. The keyframe just fades a faint gold
  // background, so unchanged ticks never flash and a real update gets
  // a brief visual confirmation.
  const flashKey = `${price.symbol}-${price.price}`;

  const linkStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: "inherit",
    textDecoration: "none",
    cursor: "pointer",
    padding: "6px 10px",
    border: `1px solid ${color.border}`,
    borderRadius: 999,
    background: "rgba(255,255,255,0.035)",
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className={
        isDesktopOnly
          ? "crypto-ticker-coin crypto-ticker-coin-desktop"
          : "crypto-ticker-coin"
      }
      style={linkStyle}
      key={flashKey}
    >
      <span
        style={{ color: color.gold, fontWeight: 700, animation: "cryptoFlash 800ms ease-out" }}
      >
        {price.symbol.toUpperCase()}
      </span>
      <span style={{ color: color.text }}>${formatPrice(price.price)}</span>
      <span className="crypto-ticker-change" style={{ color: changeColor }}>
        {formatChange(price.change24h)}
      </span>
    </a>
  );
}

export function CryptoTicker({ lang, poll }: { lang: Lang; poll: boolean }) {
  const { prices, stale, loading, error } = useCryptoPrices({ poll });
  const refreshHint = t("cryptoTickerRefreshHint", lang);

  // Initial cold load: render an empty placeholder slot of similar
  // width so the icon row doesn't jump when prices arrive a few hundred
  // ms later. We don't show a spinner — the ticker is ambient
  // information, never the focus of attention.
  if (loading && prices.length === 0) {
    return <div className="crypto-ticker" aria-hidden="true" />;
  }

  // Total upstream failure with no DB fallback (cold instance + cold
  // CoinGecko both down). Surface a quiet, accessible label rather
  // than an empty slot so screen-reader users know prices were
  // attempted but unavailable.
  if (error && prices.length === 0) {
    return (
      <div className="crypto-ticker" style={{ color: color.textMuted }}>
        <span title={t("cryptoTickerError", lang)}>—</span>
      </div>
    );
  }

  return (
    <div
      className="crypto-ticker"
      role="group"
      aria-label={`${refreshHint} — BTC, ETH, SOL, XRP`}
      style={{ color: color.text }}
    >
      {prices.map((p, i) => (
        <CoinCell
          key={p.symbol}
          price={p}
          refreshHint={refreshHint}
          // Mobile: BTC / ETH / SOL / XRP. Desktop adds TAO + SUI.
          isDesktopOnly={i >= 4}
        />
      ))}
      {stale && (
        <span
          title={t("cryptoTickerStale", lang)}
          aria-label={t("cryptoTickerStale", lang)}
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color.textMuted,
            opacity: 0.7,
          }}
        />
      )}
    </div>
  );
}
