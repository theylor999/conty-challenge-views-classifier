import { fmt, fmt1 } from "./format.ts";
import { RULE_VERSION, RULES } from "./rules.ts";
import { InputError, normalize } from "./series.ts";
import { computeSignals } from "./signals/index.ts";
import type { ClassifyInput, ClassifyResult, Signal } from "./types.ts";

export { InputError };

/**
 * Decision rule (documented in the README):
 *   suspeito      >= 1 strong signal, or >= 2 moderate signals
 *   inconclusivo  exactly 1 moderate signal, or a signal that cannot be judged
 *   legitimo      nothing above the limits
 * Too short or too small series are inconclusivo without looking at signals.
 */
export function classify(input: ClassifyInput): ClassifyResult {
  const s = normalize(input);
  const hours = s.x.length;

  if (hours < RULES.minHours) {
    return {
      label: "inconclusivo",
      reason: `A série tem ${hours} h e o mínimo para avaliar é ${RULES.minHours} h (dois ciclos diários completos).`,
      signals: [],
      rule_version: RULE_VERSION,
    };
  }
  const total = s.x.reduce((a, b) => a + b, 0);
  if (total < RULES.minTotalViews) {
    return {
      label: "inconclusivo",
      reason: `A série soma só ${fmt(total)} views e o mínimo para avaliar é ${RULES.minTotalViews}: não há volume para inflar nem para julgar.`,
      signals: [],
      rule_version: RULE_VERSION,
    };
  }

  const signals = computeSignals(s);
  const strong = signals.filter((x) => x.severity === "strong");
  const moderate = signals.filter((x) => x.severity === "moderate");
  const undetermined = signals.filter((x) => x.severity === "undetermined");

  if (strong.length >= 1 || moderate.length >= 2) {
    const evidence = [...strong, ...moderate].slice(0, 2);
    return { label: "suspeito", reason: evidence.map((x) => x.explanation).join(" "), signals, rule_version: RULE_VERSION };
  }
  if (moderate.length === 1) {
    return {
      label: "inconclusivo",
      reason: `${moderate[0]!.explanation} Um único sinal moderado não basta para acusar (a regra pede 1 sinal forte ou 2 moderados).`,
      signals,
      rule_version: RULE_VERSION,
    };
  }
  if (undetermined.length >= 1) {
    return { label: "inconclusivo", reason: undetermined[0]!.explanation, signals, rule_version: RULE_VERSION };
  }
  return { label: "legitimo", reason: legitimateReason(signals), signals, rule_version: RULE_VERSION };
}

function legitimateReason(signals: Signal[]): string {
  const spike = signals.find((x) => x.id === "spike_shape")!;
  const circ = signals.find((x) => x.id === "circadian_mismatch")!;
  const peak = spike.evidence["peak"] as number;
  const base = spike.evidence["baseline"] as number;
  const ratio = spike.evidence["ratio"] as number;
  const shape =
    spike.value === null
      ? `a maior hora (${fmt(peak)} views) é ${fmt1(ratio)}× o patamar de ${fmt(base)}/h`
      : `o pico de ${fmt(peak)}/h (${fmt1(ratio)}× o patamar) teve cauda de decaimento de ${fmt(spike.value)} h`;
  const rhythm = circ.value === null ? "" : `, madrugada em ${fmt1(circ.value * 100)}% da tarde/noite`;
  return `Nenhum dos ${signals.length} sinais passou do limite: ${shape}${rhythm} e não há trechos mecânicos nem quedas bruscas.`;
}
