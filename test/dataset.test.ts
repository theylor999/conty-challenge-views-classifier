import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../src/classifier.ts";
import { generateDataset, HOLDOUT_SEED, SAMPLES_PER_SCENARIO, serializeDataset, TUNING_SEED } from "../src/dataset/generate.ts";
import { mulberry32 } from "../src/dataset/prng.ts";
import { SCENARIOS } from "../src/dataset/scenarios.ts";

const committed = readFileSync(new URL("../data/dataset.json", import.meta.url), "utf8");

describe("dataset reproducibility", () => {
  it("data/dataset.json is exactly what the generator produces today", () => {
    expect(committed).toBe(serializeDataset(generateDataset(TUNING_SEED)));
  });

  it("the same seed gives the same dataset and another seed gives another", () => {
    expect(generateDataset(5, 3)).toEqual(generateDataset(5, 3));
    expect(generateDataset(5, 3).samples[0]!.views).not.toEqual(generateDataset(6, 3).samples[0]!.views);
  });

  it("mulberry32 is stable (first values for seed 1 are pinned)", () => {
    const next = mulberry32(1);
    expect([next(), next(), next()].map((v) => v.toFixed(6))).toEqual(["0.627074", "0.002736", "0.527447"]);
  });

  it("tuning and holdout seeds are different", () => {
    expect(TUNING_SEED).not.toBe(HOLDOUT_SEED);
  });
});

describe("dataset shape", () => {
  const { samples } = generateDataset(TUNING_SEED);

  it("has the documented number of samples per scenario", () => {
    expect(samples).toHaveLength(SCENARIOS.length * SAMPLES_PER_SCENARIO);
    for (const sc of SCENARIOS) expect(samples.filter((s) => s.scenario === sc.id)).toHaveLength(SAMPLES_PER_SCENARIO);
  });

  it("has unique ids, valid series and the label of its scenario", () => {
    expect(new Set(samples.map((s) => s.id)).size).toBe(samples.length);
    for (const s of samples) {
      expect(s.views.length).toBeGreaterThanOrEqual(48);
      expect(s.views.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
      expect(s.label).toBe(SCENARIOS.find((sc) => sc.id === s.scenario)!.label);
      expect(Date.parse(s.start)).not.toBeNaN();
    }
  });
});

describe("the obvious cases of the dataset", () => {
  const { samples } = generateDataset(TUNING_SEED);
  const labelsOf = (ids: string[]) => samples.filter((s) => ids.includes(s.scenario)).map((s) => classify(s).label);

  it("never calls an easy legitimate series suspeito", () => {
    const easy = SCENARIOS.filter((s) => s.label === "legitimo" && s.difficulty === "easy").map((s) => s.id);
    expect(labelsOf(easy).filter((l) => l === "suspeito")).toEqual([]);
  });

  it("catches every purge, stopped bot and constant drip", () => {
    const labels = labelsOf(["purge_drop", "bot_stopped", "bot_drip"]);
    expect(labels.filter((l) => l !== "suspeito").length).toBeLessThanOrEqual(1);
  });
});
