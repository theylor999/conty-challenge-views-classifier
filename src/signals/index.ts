import type { Series } from "../series.ts";
import type { Signal } from "../types.ts";
import { circadianMismatch } from "./circadian.ts";
import { dropToZero, purgeDrop } from "./drops.ts";
import { mechanicalRegularity } from "./regularity.ts";
import { repeatedValues, roundNumbers } from "./repeats.ts";
import { spikeShape } from "./spike.ts";

export function computeSignals(s: Series): Signal[] {
  return [spikeShape(s), mechanicalRegularity(s), repeatedValues(s), roundNumbers(s), circadianMismatch(s), purgeDrop(s), dropToZero(s)];
}
