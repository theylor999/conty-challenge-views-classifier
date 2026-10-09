import { classify } from "../classifier.ts";
import type { Dataset } from "../dataset/generate.ts";
import type { Sample } from "../dataset/scenarios.ts";
import type { Label } from "../types.ts";

export type Counts = Record<Label, number>;

export interface ScenarioRow {
  scenario: string;
  truth: Sample["label"];
  difficulty: Sample["difficulty"];
  detectable: boolean;
  n: number;
  predicted: Counts;
}

export interface Metrics {
  seed: number;
  samples: number;
  legit_total: number;
  suspicious_total: number;
  /** Rows: ground truth. Columns: classifier output. */
  confusion: Record<Sample["label"], Counts>;
  false_positives: number;
  false_negatives: number;
  inconclusive_on_legit: number;
  inconclusive_on_suspicious: number;
  easy_legit_total: number;
  easy_false_positives: number;
  detectable_suspicious_total: number;
  detectable_caught: number;
  scenarios: ScenarioRow[];
  /** Ids of legitimate series classified suspeito. */
  false_positive_ids: string[];
}

const empty = (): Counts => ({ legitimo: 0, suspeito: 0, inconclusivo: 0 });

export function evaluate(dataset: Dataset): Metrics {
  const confusion = { legitimo: empty(), suspeito: empty() };
  const rows = new Map<string, ScenarioRow>();
  const falsePositiveIds: string[] = [];
  let easyLegit = 0;
  let easyFalsePositives = 0;
  let detectableSuspicious = 0;
  let detectableCaught = 0;

  for (const sample of dataset.samples) {
    const { label } = classify({ timezone: sample.timezone, start: sample.start, views: sample.views, mode: sample.mode });
    confusion[sample.label][label]++;
    const row =
      rows.get(sample.scenario) ??
      { scenario: sample.scenario, truth: sample.label, difficulty: sample.difficulty, detectable: sample.detectable, n: 0, predicted: empty() };
    row.n++;
    row.predicted[label]++;
    rows.set(sample.scenario, row);

    if (sample.label === "legitimo") {
      if (sample.difficulty === "easy") easyLegit++;
      if (label === "suspeito") {
        falsePositiveIds.push(sample.id);
        if (sample.difficulty === "easy") easyFalsePositives++;
      }
    } else if (sample.detectable) {
      detectableSuspicious++;
      if (label === "suspeito") detectableCaught++;
    }
  }

  const legitTotal = sum(confusion.legitimo);
  const suspiciousTotal = sum(confusion.suspeito);
  return {
    seed: dataset.seed,
    samples: dataset.samples.length,
    legit_total: legitTotal,
    suspicious_total: suspiciousTotal,
    confusion,
    false_positives: confusion.legitimo.suspeito,
    false_negatives: confusion.suspeito.legitimo,
    inconclusive_on_legit: confusion.legitimo.inconclusivo,
    inconclusive_on_suspicious: confusion.suspeito.inconclusivo,
    easy_legit_total: easyLegit,
    easy_false_positives: easyFalsePositives,
    detectable_suspicious_total: detectableSuspicious,
    detectable_caught: detectableCaught,
    scenarios: [...rows.values()],
    false_positive_ids: falsePositiveIds,
  };
}

function sum(c: Counts): number {
  return c.legitimo + c.suspeito + c.inconclusivo;
}

export const percent = (n: number, d: number) => `${((100 * n) / d).toFixed(1).replace(".", ",")}%`;
