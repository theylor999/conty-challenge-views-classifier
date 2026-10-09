import { fmt, fmt1 } from "../format.ts";
import { RULES } from "../rules.ts";
import type { Series } from "../series.ts";
import { mad, median } from "../stats.ts";
import type { Signal } from "../types.ts";

const R = RULES.spike;

/**
 * Looks at the highest hour. If it is a real jump over the baseline, asks what
 * came after: an organic spike decays over many hours, a bought burst stops cold.
 */
export function spikeShape(s: Series): Signal {
  const { x } = s;
  const n = x.length;
  const base = median(x);
  const sigma = Math.max(1.4826 * mad(x), 1);

  let p = 0;
  for (let i = 1; i < n; i++) if (x[i]! > x[p]!) p = i;
  const peak = x[p]!;
  const excess = peak - base;
  const ratio = peak / Math.max(base, 1);
  const z = excess / sigma;

  const common = {
    id: "spike_shape" as const,
    unit: "horas de cauda",
    threshold: R.partialMaxTailHours,
    strong_threshold: R.cliffMaxTailHours,
    comparison: "<=" as const,
  };

  if (ratio < R.riseRatio || excess < R.minExcess || z < R.robustZ) {
    return {
      ...common,
      value: null,
      triggered: false,
      severity: "none",
      explanation: `Sem salto relevante: a maior hora (${fmt(peak)} views em ${s.when(p)}) é ${fmt1(ratio)}× a mediana de ${fmt(base)}/h; só conta a partir de ${R.riseRatio}× e ${fmt(R.minExcess)} views acima da mediana.`,
      evidence: { peak, baseline: base, ratio, peak_index: p },
    };
  }

  let first = p;
  while (first > 0 && x[first - 1]! - base >= R.highPhaseShare * excess) first--;
  let last = p;
  while (last < n - 1 && x[last + 1]! - base >= R.highPhaseShare * excess) last++;
  const hold = last - first + 1;

  const before = first >= 6 ? median(x.slice(Math.max(0, first - 24), first)) : base;
  const level = median(x.slice(first, last + 1));

  const floor = base + R.tailShare * excess;
  let i = last + 1;
  while (i < n && x[i]! >= floor) i++;
  const tail = i - last - 1;
  const reachedEnd = i >= n;
  const hoursAfter = n - 1 - last;

  const evidence = { peak, baseline: base, ratio, peak_index: p, hold_hours: hold, tail_hours: tail, before_level: before, high_level: level };
  const night = RULES.circadian.deadHours.some((h) => h === s.localHour[p]) ? " (madrugada)" : "";
  const jump = `${s.when(p)}${night} as views saltaram de ~${fmt(before)}/h para ${fmt(level)}/h (${fmt1(ratio)}× a mediana)`;
  const holdText = hold === 1 ? "por 1 h" : `por ${fmt(hold)} h`;

  if (hoursAfter < R.minHoursAfter) {
    return {
      ...common,
      value: null,
      triggered: false,
      severity: "undetermined",
      explanation: `Em ${jump}, mas a série termina ${hoursAfter} h depois do pico: ainda não dá para saber se houve cauda de decaimento.`,
      evidence,
    };
  }
  if (tail <= R.cliffMaxTailHours) {
    return {
      ...common,
      value: tail,
      triggered: true,
      severity: "strong",
      explanation: `Em ${jump}, ficaram nesse nível ${holdText} e voltaram ao patamar anterior em ${tail + 1} h, sem cauda de decaimento.`,
      evidence,
    };
  }
  if (tail <= R.partialMaxTailHours) {
    if (reachedEnd) {
      return {
        ...common,
        value: null,
        triggered: false,
        severity: "undetermined",
        explanation: `Em ${jump}, e a série acaba ${tail} h depois com as views ainda acima do patamar: não dá para ver se a cauda terminaria em corte seco ou em decaimento.`,
        evidence,
      };
    }
    return {
      ...common,
      value: tail,
      triggered: true,
      severity: "moderate",
      explanation: `Em ${jump}, e a cauda durou só ${tail} h acima de ${R.tailShare * 100}% do excesso: curta para um pico orgânico (esperado mais de ${R.partialMaxTailHours} h), mas não é um corte seco (${R.cliffMaxTailHours} h ou menos).`,
      evidence,
    };
  }
  return {
    ...common,
    value: tail,
    triggered: false,
    severity: "none",
    explanation: `Em ${jump}, e depois decaíram por ${fmt(tail)} h até o patamar anterior: cauda de pico orgânico.`,
    evidence,
  };
}
