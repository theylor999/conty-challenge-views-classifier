import { Rng } from "../src/dataset/prng.ts";
import type { ClassifyInput } from "../src/types.ts";

/** Monday 00:00 in São Paulo. */
export const START = "2025-03-10T00:00:00-03:00";

/** Expected hourly shape: trough at 04h, peak at 16h, +-60% around the level. */
export function diurnalBase(hours: number, level: number, seed = 1, noise = 0.1, phaseHours = 0): number[] {
  const rng = new Rng(seed);
  return Array.from({ length: hours }, (_, i) => {
    const shape = 1 + 0.6 * Math.sin((2 * Math.PI * (i - 10 - phaseHours)) / 24);
    return Math.round(level * shape * Math.exp(noise * rng.normal()));
  });
}

export function addAt(views: number[], at: number, extra: number[]): number[] {
  return views.map((v, i) => v + (extra[i - at] ?? 0));
}

export function viralBurst(peak: number, halfLifeHours: number, length: number): number[] {
  return Array.from({ length }, (_, t) => Math.round(peak * 2 ** (-t / halfLifeHours)));
}

export const series = (views: number[], extra: Partial<ClassifyInput> = {}): ClassifyInput => ({ start: START, views, ...extra });

export function cumulative(increments: number[], from = 10_000): number[] {
  const out = [from];
  for (const v of increments) out.push(out[out.length - 1]! + v);
  return out;
}

export const signal = <T extends { id: string }>(signals: T[], id: string): T => signals.find((s) => s.id === id)!;
