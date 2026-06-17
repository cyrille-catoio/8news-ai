"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers";
import { useCryptoPrices, type CryptoCoin } from "@/hooks/useCryptoPrices";
import { t, type Lang } from "@/lib/i18n";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { color, formInputStyle, formSectionTitle, outlinedButtonStyle, sectionCard } from "@/lib/theme";
import { trackEvent } from "@/lib/track";
import {
  DEFAULT_CRYPTO_TICKER_SYMBOLS,
  MAX_CRYPTO_TICKER_SYMBOLS,
  readCryptoTickerSymbols,
  sanitizeCryptoSymbols,
  writeCryptoTickerSymbols,
} from "@/lib/crypto-preferences";

function coinMatchesQuery(coin: CryptoCoin, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    coin.symbol.toLowerCase().includes(q) ||
    coin.name.toLowerCase().includes(q) ||
    String(coin.marketCapRank).includes(q)
  );
}

export function CryptoTickerSettingsSection({ lang }: { lang: Lang }) {
  const { session, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(() => readCryptoTickerSymbols());
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const crypto = useCryptoPrices({ poll: true, selectedSymbols });

  useEffect(() => {
    if (authLoading || !session?.user) return;
    const raw = session.user.user_metadata?.crypto_ticker_symbols;
    if (!Array.isArray(raw)) return;
    const next = sanitizeCryptoSymbols(raw);
    setSelectedSymbols(next);
    writeCryptoTickerSymbols(next);
  }, [authLoading, session?.user]);

  const allowedSymbols = useMemo(() => {
    return crypto.availableCoins.length > 0
      ? new Set(crypto.availableCoins.map((coin) => coin.symbol))
      : undefined;
  }, [crypto.availableCoins]);

  const persistSymbols = useCallback(
    (symbols: string[]) => {
      const next = sanitizeCryptoSymbols(symbols, allowedSymbols);
      setSelectedSymbols(next);
      writeCryptoTickerSymbols(next);
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      setMessage(lang === "fr" ? "Sélection enregistrée." : "Selection saved.");
      trackEvent("settings.crypto_ticker_change", {
        lang,
        meta: { symbols: next, source: "crypto_settings_page" },
      });
      if (session?.user) {
        void supabase.auth.updateUser({
          data: {
            ...(session.user.user_metadata ?? {}),
            crypto_ticker_symbols: next,
          },
        });
      }
    },
    [allowedSymbols, lang, session, supabase],
  );

  const selectedSet = useMemo(() => new Set(selectedSymbols), [selectedSymbols]);
  const atLimit = selectedSymbols.length >= MAX_CRYPTO_TICKER_SYMBOLS;
  const filteredCoins = useMemo(() => {
    return [...crypto.availableCoins]
      .sort((a, b) => a.marketCapRank - b.marketCapRank)
      .filter((coin) => coinMatchesQuery(coin, query));
  }, [crypto.availableCoins, query]);

  function toggleCoin(symbol: string) {
    if (selectedSet.has(symbol)) {
      const next = selectedSymbols.filter((s) => s !== symbol);
      persistSymbols(next.length > 0 ? next : [...DEFAULT_CRYPTO_TICKER_SYMBOLS]);
      return;
    }
    if (atLimit) return;
    persistSymbols([...selectedSymbols, symbol].slice(0, MAX_CRYPTO_TICKER_SYMBOLS));
  }

  const coinRowStyle = (disabled: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "24px 42px 64px minmax(0, 1fr)",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    borderBottom: `1px solid ${color.border}`,
    color: color.textSecondary,
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  });

  return (
    <section style={sectionCard}>
      <h4 style={formSectionTitle}>
        {t("cryptoTickerSettingsTitle", lang)}
      </h4>
      <p style={{ color: color.textMuted, fontSize: 13, lineHeight: 1.55, marginTop: -6, marginBottom: 18 }}>
        {t("cryptoTickerSettingsSubtitle", lang)}
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ color: color.gold, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {t("cryptoTickerSettingsSelection", lang)}
            </div>
            <div style={{ color: color.textMuted, fontSize: 12, marginTop: 4 }}>
              {selectedSymbols.map((s) => s.toUpperCase()).join(" / ")}
            </div>
          </div>
          <div style={{ color: atLimit ? color.gold : color.textMuted, fontSize: 13, fontWeight: 800 }}>
            {selectedSymbols.length}/{MAX_CRYPTO_TICKER_SYMBOLS}
          </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("cryptoTickerSearchPlaceholder", lang)}
            aria-label={t("cryptoTickerSearchPlaceholder", lang)}
            style={{ ...formInputStyle, flex: "1 1 260px" }}
          />
          <button
            type="button"
            onClick={() => persistSymbols([...DEFAULT_CRYPTO_TICKER_SYMBOLS])}
            style={outlinedButtonStyle}
          >
            {t("cryptoTickerPickerReset", lang)}
          </button>
      </div>

      {message && (
          <p style={{ color: color.gold, fontSize: 12, marginTop: 0, marginBottom: 10 }}>
            {message}
          </p>
      )}

      {crypto.loading && crypto.availableCoins.length === 0 ? (
          <div style={{ color: color.textMuted, fontSize: 13, padding: "24px 0" }}>
            {t("cryptoTickerPickerLoading", lang)}
          </div>
        ) : filteredCoins.length === 0 ? (
          <div style={{ color: color.textMuted, fontSize: 13, padding: "24px 0" }}>
            {t("cryptoTickerSearchEmpty", lang)}
          </div>
        ) : (
          <div style={{ maxHeight: 560, overflowY: "auto", paddingRight: 4 }}>
            {filteredCoins.map((coin) => {
              const checked = selectedSet.has(coin.symbol);
              const disabled = !checked && atLimit;
              return (
                <label key={coin.coinId} style={coinRowStyle(disabled)}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleCoin(coin.symbol)}
                    style={{ accentColor: color.gold, cursor: disabled ? "not-allowed" : "pointer" }}
                  />
                  <span style={{ color: color.textMuted, fontVariantNumeric: "tabular-nums" }}>
                    #{coin.marketCapRank}
                  </span>
                  <span style={{ color: color.gold, fontWeight: 800 }}>
                    {coin.symbol.toUpperCase()}
                  </span>
                  <span style={{ color: color.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {coin.name}
                  </span>
                </label>
              );
            })}
          </div>
      )}

      {atLimit && (
          <p style={{ color: color.textMuted, fontSize: 12, lineHeight: 1.5, marginBottom: 0 }}>
            {t("cryptoTickerPickerLimit", lang)}
          </p>
      )}
    </section>
  );
}
