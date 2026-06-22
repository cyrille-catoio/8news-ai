"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { computeBollingerBands, type OhlcCandle } from "@/lib/crypto-indicators";

const VOLUME_UP_COLOR = "rgba(74, 222, 128, 0.5)";
const VOLUME_DOWN_COLOR = "rgba(239, 68, 68, 0.5)";

const RANGE_OPTIONS = [
  { id: "1M", days: 30 },
  { id: "3M", days: 90 },
  { id: "6M", days: 180 },
  { id: "1Y", days: 365 },
] as const;

type RangeId = (typeof RANGE_OPTIONS)[number]["id"];

const UP_COLOR = "#4ade80";
const DOWN_COLOR = "#ef4444";
const BB_COLOR = "#c9a227";

interface OhlcResponse {
  candles?: OhlcCandle[];
  stale?: boolean;
}

export function CryptoCandleChart({
  binanceSymbol,
  lang,
}: {
  binanceSymbol: string;
  lang: Lang;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [candles, setCandles] = useState<OhlcCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<RangeId>("3M");

  // ── Fetch daily candles once per symbol (1 year of warm-up data). ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void (async () => {
      try {
        const res = await fetch(`/api/crypto/ohlc?symbol=${encodeURIComponent(binanceSymbol)}&days=365`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as OhlcResponse;
        if (cancelled) return;
        const next = json.candles ?? [];
        setCandles(next);
        setError(next.length === 0);
      } catch {
        if (!cancelled) {
          setCandles([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [binanceSymbol]);

  const bollinger = useMemo(() => computeBollingerBands(candles, 20, 2), [candles]);

  // ── Build the chart once data is present. ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#050505" },
        textColor: color.textMuted,
        fontFamily: "ui-monospace, Menlo, monospace",
      },
      grid: {
        vertLines: { color: "rgba(42,42,42,0.45)" },
        horzLines: { color: "rgba(42,42,42,0.45)" },
      },
      rightPriceScale: { borderColor: color.border, scaleMargins: { top: 0.05, bottom: 0.28 } },
      timeScale: { borderColor: color.border, timeVisible: false },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    chartRef.current = chart;

    // Volume histogram pinned to the bottom 22% of the pane via its own
    // overlay price scale (does not move the candle/Bollinger scale).
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    // Bollinger lines first so the candles paint on top.
    const upper = chart.addLineSeries({ color: BB_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const middle = chart.addLineSeries({ color: BB_COLOR, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const lower = chart.addLineSeries({ color: BB_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

    const candleSeries = chart.addCandlestickSeries({
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });
    candleSeriesRef.current = candleSeries;

    candleSeries.setData(
      candles.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as Time,
        value: c.volume ?? 0,
        color: c.close >= c.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
      })),
    );
    upper.setData(bollinger.map((b) => ({ time: b.time as Time, value: b.upper })));
    middle.setData(bollinger.map((b) => ({ time: b.time as Time, value: b.middle })));
    lower.setData(bollinger.map((b) => ({ time: b.time as Time, value: b.lower })));

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [candles, bollinger]);

  // ── Apply the visible range whenever the range buttons or data change.
  //    The candle resolution stays daily — only the visible window moves.
  //    We use a *logical* range so we can push the right edge ~20px past
  //    the last candle, keeping it off the price axis. ──
  useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container || candles.length === 0) return;
    const days = RANGE_OPTIONS.find((r) => r.id === range)?.days ?? 30;
    const lastIdx = candles.length - 1;
    const fromIdx = Math.max(0, candles.length - days);
    const visibleBars = Math.max(1, lastIdx - fromIdx + 1);
    const width = container.clientWidth || 800;
    const barSpacing = width / visibleBars;
    const rightMarginBars = barSpacing > 0 ? 20 / barSpacing : 0.5;
    chart.timeScale().setVisibleLogicalRange({
      from: fromIdx,
      to: lastIdx + rightMarginBars,
    });
  }, [range, candles]);

  const rangeBtn = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    borderRadius: 999,
    border: `1px solid ${active ? color.gold : color.border}`,
    background: active ? "rgba(201,162,39,0.15)" : "transparent",
    color: active ? color.gold : color.textMuted,
    fontSize: 12,
    fontWeight: 700,
    cursor: active ? "default" : "pointer",
    fontFamily: "inherit",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderBottom: `1px solid ${color.border}`, flexShrink: 0 }}>
        {RANGE_OPTIONS.map((r) => (
          <button key={r.id} type="button" onClick={() => setRange(r.id)} style={rangeBtn(range === r.id)}>
            {r.id}
          </button>
        ))}
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {loading ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: color.textMuted, fontSize: 13 }}>
            {t("cryptoChartLoading", lang)}
          </div>
        ) : error ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24, color: color.textMuted, fontSize: 13, lineHeight: 1.5 }}>
            {t("cryptoChartUnavailable", lang).replace("{symbol}", binanceSymbol)}
          </div>
        ) : (
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        )}
      </div>
    </div>
  );
}
