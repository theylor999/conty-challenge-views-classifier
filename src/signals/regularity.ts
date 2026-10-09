import { fmt, fmt1 } from "../format.ts";
import { RULES } from "../rules.ts";
import type { Series } from "../series.ts";
import { cv, mean } from "../stats.ts";
import type { Signal } from "../types.ts";

const R = RULES.regularity;

/**
 * Real audiences are noisy: even a flat hour-to-hour trend carries sampling noise
 * and the day/night cycle. A long run with almost no variation looks like a script.
 */
export function mechanicalRegularity(s: Series): Signal {
  const { x } = s;
  const covered = new Array<boolean>(x.length).fill(false);
  const windowCv = new Array<number>(x.length).fill(0);

  for (let i = 0; i + R.windowHours <= x.length; i++) {
    const w = x.slice(i, i + R.windowHours);
    const m = mean(w);
    const c = cv(w);
    if (m >= R.minMeanViews && c <= R.maxCv) {
      for (let j = i; j < i + R.windowHours; j++) {
        covered[j] = true;
        windowCv[j] = Math.max(windowCv[j]!, c);
      }
    }
  }

  let best = 0;
  let bestEnd = -1;
  let run = 0;
  for (let i = 0; i < x.length; i++) {
    run = covered[i] ? run + 1 : 0;
    if (run > best) {
      best = run;
      bestEnd = i;
    }
  }

  const common = {
    id: "mechanical_regularity" as const,
    unit: "horas seguidas",
    threshold: R.moderateRunHours,
    strong_threshold: R.strongRunHours,
    comparison: ">=" as const,
  };
  const limit = `${R.moderateRunHours} h com variação de até ${fmt1(R.maxCv * 100)}%`;

  if (best < R.moderateRunHours) {
    return {
      ...common,
      value: best,
      triggered: false,
      severity: "none",
      explanation: `Maior trecho de views quase constantes: ${best} h (o limite é ${limit}).`,
      evidence: { run_hours: best },
    };
  }
  const startIdx = bestEnd - best + 1;
  const level = mean(x.slice(startIdx, bestEnd + 1));
  const maxCv = Math.max(...windowCv.slice(startIdx, bestEnd + 1));
  const strong = best >= R.strongRunHours;
  return {
    ...common,
    value: best,
    triggered: true,
    severity: strong ? "strong" : "moderate",
    explanation: `Por ${best} h seguidas (a partir de ${s.when(startIdx)}) as views ficaram em ~${fmt(level)}/h variando no máximo ${fmt1(maxCv * 100)}%, regular demais para audiência humana.`,
    evidence: { run_hours: best, mean_views: level, max_cv: maxCv, start_index: startIdx },
  };
}
