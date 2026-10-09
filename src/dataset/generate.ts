import { Rng } from "./prng.ts";
import { SCENARIOS, type Sample } from "./scenarios.ts";

export const GENERATOR_VERSION = 1;
/** Seed of the committed dataset, used while the thresholds were being chosen. */
export const TUNING_SEED = 2025;
/** Seed never looked at while choosing thresholds. */
export const HOLDOUT_SEED = 31337;
export const SAMPLES_PER_SCENARIO = 40;

export interface Dataset {
  generator_version: number;
  seed: number;
  samples_per_scenario: number;
  samples: Sample[];
}

/** One independent stream per sample: appending a scenario never shifts the others (inserting or reordering one does). */
function sampleSeed(seed: number, scenarioIndex: number, i: number): number {
  return Math.imul(Math.imul(seed, 7919) + scenarioIndex, 1_000_003) + i;
}

export function generateDataset(seed: number, perScenario = SAMPLES_PER_SCENARIO): Dataset {
  const samples: Sample[] = [];
  SCENARIOS.forEach((scenario, s) => {
    for (let i = 0; i < perScenario; i++) {
      const built = scenario.build(new Rng(sampleSeed(seed, s, i)));
      samples.push({
        id: `${scenario.id}-${String(i + 1).padStart(2, "0")}`,
        scenario: scenario.id,
        label: scenario.label,
        difficulty: scenario.difficulty,
        detectable: scenario.detectable,
        mode: built.mode,
        timezone: "America/Sao_Paulo",
        start: built.start,
        views: built.views,
      });
    }
  });
  return { generator_version: GENERATOR_VERSION, seed, samples_per_scenario: perScenario, samples };
}

/** One sample per line keeps the file diffable. */
export function serializeDataset(d: Dataset): string {
  const head = JSON.stringify({ generator_version: d.generator_version, seed: d.seed, samples_per_scenario: d.samples_per_scenario });
  return `${head.slice(0, -1)},"samples":[\n${d.samples.map((s) => JSON.stringify(s)).join(",\n")}\n]}\n`;
}
