"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { color, font, formInputStyle } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import type { CryptoCoin } from "@/hooks/useCryptoPrices";

export interface CoinPick {
  coinId: string;
  symbol: string;
}

interface CoinsResponse {
  coins?: CryptoCoin[];
}

/**
 * Coin switcher for the crypto chart page. A compact trigger button
 * shows the current coin; clicking it opens a clean modal with a search
 * field over the CoinGecko top ~200 by market cap. Falls back to the
 * `fallbackCoins` (live ticker top 50) until the top-200 list loads.
 */
export function CryptoCoinPicker({
  lang,
  currentSymbol,
  currentLabel,
  fallbackCoins,
  onSelect,
}: {
  lang: Lang;
  currentSymbol: string;
  currentLabel: string;
  fallbackCoins: CryptoCoin[];
  onSelect: (coin: CoinPick) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coins, setCoins] = useState<CryptoCoin[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazy-load the top-200 list the first time the modal opens.
  useEffect(() => {
    if (!open || coins.length > 0) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/crypto/coins", { cache: "no-store" });
        const json = (await res.json()) as CoinsResponse;
        if (cancelled) return;
        setCoins(json.coins && json.coins.length > 0 ? json.coins : fallbackCoins);
      } catch {
        if (!cancelled) setCoins(fallbackCoins);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, coins.length, fallbackCoins]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const list = coins.length > 0 ? coins : fallbackCoins;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...list].sort((a, b) => a.marketCapRank - b.marketCapRank);
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        String(c.marketCapRank).includes(q),
    );
  }, [list, query]);

  const choose = useCallback(
    (coin: CryptoCoin) => {
      setOpen(false);
      setQuery("");
      onSelect({ coinId: coin.coinId, symbol: coin.symbol });
    },
    [onSelect],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("cryptoChartSelectCoin", lang)}
        title={t("cryptoChartSelectCoin", lang)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: color.surface,
          color: color.text,
          border: `1px solid ${color.gold}`,
          borderRadius: 8,
          padding: "6px 12px",
          fontFamily: "ui-serif, Georgia, serif",
          fontSize: "clamp(20px, 3vw, 28px)",
          fontWeight: 700,
          cursor: "pointer",
          maxWidth: "100%",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentLabel}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color.gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("cryptoChartPickerTitle", lang)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "60px 20px 20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              maxHeight: "min(70vh, 600px)",
              display: "flex",
              flexDirection: "column",
              background: color.surface,
              border: `1px solid ${color.border}`,
              borderRadius: 12,
              overflow: "hidden",
              fontFamily: font.base,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${color.border}` }}>
              <span style={{ color: color.gold, fontSize: 14, fontWeight: 700 }}>{t("cryptoChartPickerTitle", lang)}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("authCloseAria", lang)}
                style={{ border: "none", background: "transparent", color: color.textMuted, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${color.border}` }}>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("cryptoTickerSearchPlaceholder", lang)}
                aria-label={t("cryptoTickerSearchPlaceholder", lang)}
                style={{ ...formInputStyle, width: "100%" }}
              />
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {loading && list.length === 0 ? (
                <div style={{ color: color.textMuted, fontSize: 13, padding: "24px 16px", textAlign: "center" }}>
                  {t("cryptoChartLoading", lang)}
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ color: color.textMuted, fontSize: 13, padding: "24px 16px", textAlign: "center" }}>
                  {t("cryptoTickerSearchEmpty", lang)}
                </div>
              ) : (
                filtered.map((c) => {
                  const active = c.symbol.toLowerCase() === currentSymbol.toLowerCase();
                  return (
                    <button
                      key={c.coinId}
                      type="button"
                      onClick={() => choose(c)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "44px 64px minmax(0, 1fr)",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 16px",
                        border: "none",
                        borderBottom: `1px solid ${color.border}`,
                        background: active ? "rgba(201,162,39,0.12)" : "transparent",
                        color: color.textSecondary,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: color.textMuted, fontVariantNumeric: "tabular-nums" }}>#{c.marketCapRank}</span>
                      <span style={{ color: color.gold, fontWeight: 800 }}>{c.symbol.toUpperCase()}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
