import { fmt, fmt1 } from "../format.ts";
import { RULES } from "../rules.ts";
import type { Series } from "../series.ts";
import { median } from "../stats.ts";
import type { Signal } from "../types.ts";

/** Running total went down: the platform removed views it had counted before. */
export function purgeDrop(s: Series): Signal {
  const R = RULES.purge;
  const common = {
    id: "purge_drop" as const,
    unit: "% do acumulado",
    threshold: R.moderatePercent,
    strong_threshold: R.strongPercent,
    comparison: ">=" as const,
  };
  if (s.mode !== "cumulative") {
    return {
      ...common,
      value: null,
      triggered: false,
      severity: "none",
      explanation: "A série veio em views por hora, então não dá para ver quedas do acumulado (envie mode=cumulative para isso).",
      evidence: {},
    };
  }
  const worst = s.purges.reduce((a, b) => (b.percent > a.percent ? b : a), { index: -1, percent: 0, removed: 0 });
  if (worst.percent < R.moderatePercent) {
    return {
      ...common,
      value: worst.percent,
      triggered: false,
      severity: "none",
      explanation: `Maior queda do acumulado: ${fmt1(worst.percent)}% (o limite é ${fmt1(R.moderatePercent)}%).`,
      evidence: { purges: s.purges.length },
    };
  }
  const strong = worst.percent >= R.strongPercent;
  return {
    ...common,
    value: worst.percent,
    triggered: true,
    severity: strong ? "strong" : "moderate",
    explanation: `O acumulado caiu ${fmt1(worst.percent)}% (${fmt(worst.removed)} views) em ${s.when(worst.index + 1)}: a plataforma removeu views que antes contavam.`,
    evidence: { purges: s.purges.length, removed: worst.removed, index: worst.index + 1 },
  };
}

/**
 * Views that were flowing at a normal rate stop in one hour and stay near zero.
 * Moderate only: a video made private, deleted or a gap in the data does the same.
 */
export function dropToZero(s: Series): Signal {
  const R = RULES.dropToZero;
  const { x } = s;
  let found: { at: number; prior: number; zeros: number } | null = null;

  for (let i = R.lookbackHours; i < x.length; i++) {
    const prior = median(x.slice(i - R.lookbackHours, i));
    if (prior < R.minPriorMedian) continue;
    if (x[i - 1]! < R.minLastHourShare * prior) continue;
    let zeros = 0;
    while (i + zeros < x.length && x[i + zeros]! <= R.nearZeroShare * prior) zeros++;
    if (zeros >= R.minHoursAtZero && (!found || prior > found.prior)) found = { at: i, prior, zeros };
  }

  const common = {
    id: "drop_to_zero" as const,
    unit: "horas perto de zero",
    threshold: R.minHoursAtZero,
    strong_threshold: null,
    comparison: ">=" as const,
  };
  if (!found) {
    return {
      ...common,
      value: 0,
      triggered: false,
      severity: "none",
      explanation: `Nenhuma queda brusca para perto de zero (o limite é ${R.minHoursAtZero} h abaixo de ${R.nearZeroShare * 100}% do ritmo anterior).`,
      evidence: {},
    };
  }
  return {
    ...common,
    value: found.zeros,
    triggered: true,
    severity: "moderate",
    explanation: `Em ${s.when(found.at)} as views caíram de ~${fmt(found.prior)}/h para quase zero e ficaram assim por ${found.zeros} h, sem cauda de decaimento, o que também acontece quando o vídeo é ocultado ou a coleta falha.`,
    evidence: { prior_median: found.prior, region_start: found.at, region_end: found.at + found.zeros - 1 },
  };
}
