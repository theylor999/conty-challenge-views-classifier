import { describe, expect, it } from "vitest";
import { classify } from "../src/classifier.ts";
import { addAt, diurnalBase, series, signal } from "./helpers.ts";

/**
 * Same baseline, same peak hour, same peak height (20.000 views/h at 21h on day 4).
 * The only difference is what happens after the peak.
 */
const base = () => diurnalBase(168, 1000, 21);
const PEAK_AT = 3 * 24 + 21;
const PEAK = 20_000;

const organic = addAt(base(), PEAK_AT, Array.from({ length: 80 }, (_, t) => Math.round(PEAK * 2 ** (-t / 7))));
const bought = addAt(base(), PEAK_AT, [PEAK, PEAK, PEAK]);

describe("organic spike vs bought spike of the same height", () => {
  const a = classify(series(organic));
  const b = classify(series(bought));
  const peakOf = (r: typeof a) => signal(r.signals, "spike_shape").evidence["peak"] as number;

  it("both series have a peak of the same height", () => {
    expect(Math.abs(peakOf(a) - peakOf(b)) / PEAK).toBeLessThan(0.2);
    expect(signal(a.signals, "spike_shape").evidence["ratio"]).toBeGreaterThan(8);
    expect(signal(b.signals, "spike_shape").evidence["ratio"]).toBeGreaterThan(8);
  });

  it("falls in different buckets", () => {
    expect(a.label).toBe("legitimo");
    expect(b.label).toBe("suspeito");
  });

  it("the difference is the tail: many hours above the baseline vs a cliff", () => {
    const sa = signal(a.signals, "spike_shape");
    const sb = signal(b.signals, "spike_shape");
    expect(sa.triggered).toBe(false);
    expect(sb.triggered).toBe(true);
    expect(sa.value).toBeGreaterThanOrEqual(5);
    expect(sb.value).toBeLessThanOrEqual(1);
    expect(sb.explanation).toContain("sem cauda de decaimento");
    expect(sa.explanation).toContain("decaíram");
  });

  it("no other signal tells them apart", () => {
    const others = (r: typeof a) => r.signals.filter((s) => s.id !== "spike_shape").map((s) => `${s.id}:${s.severity}`);
    expect(others(a)).toEqual(others(b));
  });
});
