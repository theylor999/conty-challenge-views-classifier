import { fmt } from "../format.ts";
import { RULES } from "../rules.ts";
import type { Series } from "../series.ts";
import type { Signal } from "../types.ts";

function longestRun(x: number[], accepts: (v: number) => boolean, sameValue: boolean) {
  let best = 0;
  let bestEnd = -1;
  let run = 0;
  for (let i = 0; i < x.length; i++) {
    const continues = run > 0 && (!sameValue || x[i] === x[i - 1]);
    run = accepts(x[i]!) ? (continues ? run + 1 : 1) : 0;
    if (run > best) {
      best = run;
      bestEnd = i;
    }
  }
  return { best, bestEnd };
}

/** The exact same hourly count many times in a row. Chance alone almost never does that. */
export function repeatedValues(s: Series): Signal {
  const R = RULES.repeats;
  const { best, bestEnd } = longestRun(s.x, (v) => v >= R.minValue, true);
  const triggered = best >= R.strongRunHours;
  const value = bestEnd >= 0 ? s.x[bestEnd]! : 0;
  return {
    id: "repeated_values",
    value: best,
    unit: "horas seguidas",
    threshold: R.strongRunHours,
    strong_threshold: R.strongRunHours,
    comparison: ">=",
    triggered,
    severity: triggered ? "strong" : "none",
    explanation: triggered
      ? `O valor exato de ${fmt(value)} views se repetiu por ${best} horas seguidas (a partir de ${s.when(bestEnd - best + 1)}), algo que o acaso quase nunca produz.`
      : `Maior repetição exata de um valor de ${R.minValue} views ou mais: ${best} h seguidas (o limite é ${R.strongRunHours} h).`,
    evidence: { run_hours: best, repeated_value: value },
  };
}

/**
 * Views delivered as exact multiples of 100. Moderate only: some analytics
 * exports round large numbers, which is an innocent explanation.
 */
export function roundNumbers(s: Series): Signal {
  const R = RULES.roundNumbers;
  const { best, bestEnd } = longestRun(s.x, (v) => v >= R.minValue && v % R.step === 0, false);
  const triggered = best >= R.moderateRunHours;
  return {
    id: "round_numbers",
    value: best,
    unit: "horas seguidas",
    threshold: R.moderateRunHours,
    strong_threshold: null,
    comparison: ">=",
    triggered,
    severity: triggered ? "moderate" : "none",
    explanation: triggered
      ? `Por ${best} h seguidas (a partir de ${s.when(bestEnd - best + 1)}) as views vieram em múltiplos exatos de ${R.step}, padrão de entrega em pacotes, mas também de fonte de dados que arredonda.`
      : `Maior trecho com views em múltiplos exatos de ${R.step}: ${best} h (o limite é ${R.moderateRunHours} h).`,
    evidence: { run_hours: best },
  };
}
