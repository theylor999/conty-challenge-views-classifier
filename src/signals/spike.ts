import { fmt, fmt1 } from "../format.ts";
import { RULES } from "../rules.ts";
import type { Series } from "../series.ts";
import { mad, median } from "../stats.ts";
import type { Signal } from "../types.ts";

const R = RULES.spike;

/**
 * `ignore` marks hours (a stop to zero) that must not pull the baseline down.
 * Looks at the highest hour. If it is a real jump over the baseline, asks what
 * came after: an organic spike decays over many hours, a bought burst stops cold.
 */
export function spikeShape(s: Series, ignore: readonly boolean[]): Signal {
  const { x } = s;
  const n = x.length;
  let p = 0;
  for (let i = 1; i < n; i++) if (x[i]! > x[p]!) p = i;
  const usable = (from: number, to: number) => x.slice(from, to).filter((_, k) => !ignore[from + k]);
  const history = p >= R.minHoursBefore ? usable(Math.max(0, p - R.baselineHours), p) : [];
  const reference = history.length >= R.minHoursBefore ? history : usable(0, n).length >= RULES.minHours ? usable(0, n) : x;
  const base = median(reference);
  const sigma = Math.max(1.4826 * mad(reference), 1);
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
      explanation: `Sem salto relevante: a maior hora (${fmt(peak)} views em ${s.when(p)}) é ${fmt1(ratio)}× o patamar de ${fmt(base)}/h (mediana das horas anteriores); só conta a partir de ${R.riseRatio}× e ${fmt(R.minExcess)} views acima do patamar.`,
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

  let eventEnd = last + tail;
  while (eventEnd + 1 < n && x[eventEnd + 1]! >= Math.max(R.eventEndRatio * base, 1)) eventEnd++;
  const evidence = {
    peak,
    baseline: base,
    ratio,
    peak_index: p,
    hold_hours: hold,
    tail_hours: tail,
    before_level: before,
    high_level: level,
    region_start: first,
    region_end: eventEnd,
  };
  const night = RULES.circadian.deadHours.some((h) => h === s.localHour[first]) ? " (madrugada)" : "";
  const jump = `${s.when(first)}${night}, as views saltaram de ~${fmt(before)}/h para ${fmt(level)}/h (${fmt1(ratio)}× o patamar)`;
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
      explanation: `Em ${jump}, ficaram nesse nível ${holdText} e em ${tail + 1} h já estavam abaixo de ${fmt(floor)}/h (${R.tailShare * 100}% do salto sobre o patamar), sem cauda de decaimento.`,
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
    explanation: reachedEnd
      ? `Em ${jump}, e depois decaíram por pelo menos ${fmt(tail)} h, ainda acima do patamar quando a série termina: cauda de pico orgânico, não um corte seco.`
      : `Em ${jump}, e depois decaíram por ${fmt(tail)} h até ficar abaixo de ${fmt(floor)}/h (${R.tailShare * 100}% do salto sobre o patamar): cauda de pico orgânico.`,
    evidence,
  };
}
