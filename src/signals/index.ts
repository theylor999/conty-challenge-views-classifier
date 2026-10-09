import type { Series } from "../series.ts";
import type { Signal } from "../types.ts";
import { circadianMismatch } from "./circadian.ts";
import { dropToZero, purgeDrop } from "./drops.ts";
import { mechanicalRegularity } from "./regularity.ts";
import { repeatedValues, roundNumbers } from "./repeats.ts";
import { spikeShape } from "./spike.ts";

/**
 * Hours already explained by a spike (and its tail) or by a stop to zero do not
 * say anything about the daily rhythm, so the circadian signal skips them.
 */
function explainedHours(s: Series, signals: Signal[]): boolean[] {
  const skip = new Array<boolean>(s.x.length).fill(false);
  for (const sig of signals) {
    const from = sig.evidence["region_start"];
    const to = sig.evidence["region_end"];
    if (typeof from === "number" && typeof to === "number") skip.fill(true, from, to + 1);
  }
  return skip;
}

export function computeSignals(s: Series): Signal[] {
  const drop = dropToZero(s);
  const spike = spikeShape(s, explainedHours(s, [drop]));
  const skip = explainedHours(s, [spike, drop]);
  return [spike, mechanicalRegularity(s), repeatedValues(s), roundNumbers(s), circadianMismatch(s, skip), purgeDrop(s), drop];
}
