import { fmt, fmt1 } from "../format.ts";
import { RULES } from "../rules.ts";
import type { Series } from "../series.ts";
import { cv, mean } from "../stats.ts";
import type { Signal } from "../types.ts";

const R = RULES.regularity;

/**
 * Real audiences are noisy: even a flat hour-to-hour trend carries sampling noise
 * and the day/night cycle. A long run with almost no variation looks like a script.
 *
 * A run is a sequence of consecutive 12-hour windows that each pass the test, so
 * two flat plateaus at different levels never merge into one run: the windows that
 * cross the step fail.
 */
export function mechanicalRegularity(s: Series): Signal {
  const { x } = s;
  let bestWindows = 0;
  let bestStart = 0;
  let bestMaxCv = 0;
  let windows = 0;
  let maxCv = 0;

  for (let i = 0; i + R.windowHours <= x.length; i++) {
    const w = x.slice(i, i + R.windowHours);
    const c = cv(w);
    if (mean(w) >= R.minMeanViews && c <= R.maxCv) {
      windows++;
      maxCv = Math.max(maxCv, c);
      if (windows > bestWindows) {
        bestWindows = windows;
        bestStart = i - windows + 1;
        bestMaxCv = maxCv;
      }
    } else {
      windows = 0;
      maxCv = 0;
    }
  }
  const best = bestWindows === 0 ? 0 : bestWindows + R.windowHours - 1;

  const common = {
    id: "mechanical_regularity" as const,
    unit: "horas seguidas",
    threshold: R.moderateRunHours,
    strong_threshold: R.strongRunHours,
    comparison: ">=" as const,
  };
  const limit = `${R.moderateRunHours} h em que toda janela de ${R.windowHours} h varia até ${fmt1(R.maxCv * 100)}%`;

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
  const level = mean(x.slice(bestStart, bestStart + best));
  const strong = best >= R.strongRunHours;
  return {
    ...common,
    value: best,
    triggered: true,
    severity: strong ? "strong" : "moderate",
    explanation: `Por ${best} h seguidas (a partir de ${s.when(bestStart)}) as views ficaram em ~${fmt(level)}/h, com variação de no máximo ${fmt1(bestMaxCv * 100)}% em cada janela de ${R.windowHours} h: regular demais para audiência humana.`,
    evidence: { run_hours: best, mean_views: level, max_cv: bestMaxCv, start_index: bestStart },
  };
}
