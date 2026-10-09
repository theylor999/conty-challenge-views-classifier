import { fmt1 } from "../format.ts";
import { RULES } from "../rules.ts";
import type { Series } from "../series.ts";
import { median } from "../stats.ts";
import type { Signal } from "../types.ts";

const R = RULES.circadian;
const pct = (r: number) => fmt1(r * 100);

/**
 * Typical (median) volume in the local dead hours vs the active hours. Uses the
 * median so one night burst does not move it: that is the spike signal's job.
 * It only fires when the whole series lacks a night/day pattern.
 * Never strong: an audience in another time zone looks the same.
 */
export function circadianMismatch(s: Series, skip: readonly boolean[]): Signal {
  const dead: number[] = [];
  const active: number[] = [];
  let total = 0;
  s.x.forEach((v, i) => {
    if (skip[i]) return;
    total += v;
    const h = s.localHour[i]!;
    if ((R.deadHours as readonly number[]).includes(h)) dead.push(v);
    else if ((R.activeHours as readonly number[]).includes(h)) active.push(v);
  });

  const common = {
    id: "circadian_mismatch" as const,
    unit: "madrugada ÷ tarde/noite",
    threshold: R.moderateRatio,
    strong_threshold: null,
    comparison: ">=" as const,
  };
  const activeMedian = median(active);

  if (total < R.minTotalViews || activeMedian < R.minActiveMedian || dead.length < R.minDeadSamples || active.length < R.minActiveSamples) {
    return {
      ...common,
      value: null,
      triggered: false,
      severity: "none",
      explanation: `Há pouca informação para medir o ritmo diário: volume típico de ${fmt1(activeMedian)} views/h na tarde/noite (mínimo ${R.minActiveMedian}/h) e ${dead.length} horas de madrugada (mínimo ${R.minDeadSamples}), sem contar picos e quedas já explicados.`,
      evidence: { active_median: activeMedian },
    };
  }
  const ratio = median(dead) / activeMedian;
  const triggered = ratio >= R.moderateRatio;
  return {
    ...common,
    value: Math.round(ratio * 1000) / 1000,
    triggered,
    severity: triggered ? "moderate" : "none",
    explanation: triggered
      ? `De madrugada (02h–05h) o volume típico é ${pct(ratio)}% do da tarde/noite (10h–21h) no fuso ${s.timezone}; sem o vale noturno de uma audiência local (o limite é ${pct(R.moderateRatio)}%), embora audiência de outro fuso produza o mesmo padrão.`
      : `De madrugada (02h–05h) o volume típico é ${pct(ratio)}% do da tarde/noite (10h–21h): ritmo diário normal (o limite é ${pct(R.moderateRatio)}%).`,
    evidence: { dead_median: median(dead), active_median: activeMedian },
  };
}
