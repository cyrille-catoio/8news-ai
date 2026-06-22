/**
 * Pure technical-indicator helpers for the in-app crypto candle chart
 * (`CryptoCandleChart`). Kept free of any chart/DOM dependency so the
 * math is unit-testable in isolation.
 */

export interface OhlcCandle {
  /** Day string `YYYY-MM-DD` (UTC) — the lightweight-charts time format. */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Base-asset volume for the day. Optional for callers (e.g. tests)
   *  that only care about the OHLC math. */
  volume?: number;
}

export interface BollingerPoint {
  time: string;
  upper: number;
  middle: number;
  lower: number;
}

/**
 * Standard Bollinger Bands: a `period`-length simple moving average
 * (middle band) plus/minus `mult` population standard deviations.
 *
 * Returns one point per candle from index `period - 1` onward (the
 * first `period - 1` candles have no full window). Uses the population
 * standard deviation (÷ N), matching TradingView's default Bollinger
 * Bands study.
 */
export function computeBollingerBands(
  candles: OhlcCandle[],
  period = 20,
  mult = 2,
): BollingerPoint[] {
  if (period <= 0 || candles.length < period) return [];

  const out: BollingerPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const mean = sum / period;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = candles[j].close - mean;
      variance += diff * diff;
    }
    const stdDev = Math.sqrt(variance / period);

    out.push({
      time: candles[i].time,
      middle: mean,
      upper: mean + mult * stdDev,
      lower: mean - mult * stdDev,
    });
  }
  return out;
}
