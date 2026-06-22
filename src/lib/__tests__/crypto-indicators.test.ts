import { describe, expect, it } from "vitest";
import { computeBollingerBands, type OhlcCandle } from "../crypto-indicators";

function candle(time: string, close: number): OhlcCandle {
  return { time, open: close, high: close, low: close, close };
}

describe("computeBollingerBands", () => {
  it("returns nothing when there are fewer candles than the period", () => {
    const candles = [candle("2026-01-01", 10), candle("2026-01-02", 11)];
    expect(computeBollingerBands(candles, 20)).toEqual([]);
  });

  it("computes SMA middle band and population-stddev bands", () => {
    // period 2 over closes [2, 4]: mean = 3, population stddev = 1.
    const candles = [candle("2026-01-01", 2), candle("2026-01-02", 4)];
    const bands = computeBollingerBands(candles, 2, 2);
    expect(bands).toHaveLength(1);
    expect(bands[0]).toEqual({
      time: "2026-01-02",
      middle: 3,
      upper: 5,
      lower: 1,
    });
  });

  it("flattens to the mean when the window is constant (zero volatility)", () => {
    const candles = [candle("2026-01-01", 7), candle("2026-01-02", 7), candle("2026-01-03", 7)];
    const bands = computeBollingerBands(candles, 3, 2);
    expect(bands).toEqual([{ time: "2026-01-03", middle: 7, upper: 7, lower: 7 }]);
  });

  it("emits one point per candle from index period-1 onward", () => {
    const candles = Array.from({ length: 25 }, (_, i) =>
      candle(`2026-02-${String(i + 1).padStart(2, "0")}`, 100 + i),
    );
    const bands = computeBollingerBands(candles, 20, 2);
    expect(bands).toHaveLength(25 - 20 + 1);
    expect(bands[0].time).toBe("2026-02-20");
    expect(bands[bands.length - 1].time).toBe("2026-02-25");
  });
});
