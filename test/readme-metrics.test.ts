import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateDataset, HOLDOUT_SEED, TUNING_SEED } from "../src/dataset/generate.ts";
import { evaluate } from "../src/evaluation/metrics.ts";
import { extractBlock, renderReadmeBlock, replaceBlock } from "../src/evaluation/report.ts";
import { RULE_VERSION } from "../src/rules.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const tuning = evaluate(generateDataset(TUNING_SEED));
const holdout = evaluate(generateDataset(HOLDOUT_SEED));
const measured = renderReadmeBlock(tuning, holdout);

describe("README metrics are the measured ones", () => {
  it("the block between the markers equals a fresh measurement", () => {
    const block = extractBlock(read("README.md"));
    expect(block, "README sem bloco de métricas").not.toBeNull();
    expect(block).toBe(measured);
  });

  it("data/metrics.json equals a fresh measurement", () => {
    expect(JSON.parse(read("data/metrics.json"))).toEqual(JSON.parse(JSON.stringify({ rule_version: RULE_VERSION, tuning, holdout })));
  });

  it("the headline false positive rate is in the README block", () => {
    const pct = ((100 * tuning.false_positives) / tuning.legit_total).toFixed(1).replace(".", ",");
    expect(extractBlock(read("README.md"))).toContain(`${tuning.false_positives} de ${tuning.legit_total} séries legítimas = ${pct}%`);
  });
});

describe("the check can fail", () => {
  it("a README with another false positive count is detected", () => {
    const tampered = replaceBlock(read("README.md"), measured.replace(`**${tuning.false_positives} de`, `**${tuning.false_positives + 1} de`));
    expect(extractBlock(tampered)).not.toBe(measured);
  });

  it("a README with another percentage is detected", () => {
    const tampered = measured.replace(/= \d+,\d%/, "= 99,9%");
    expect(tampered).not.toBe(measured);
    expect(extractBlock(replaceBlock(read("README.md"), tampered))).not.toBe(measured);
  });

  it("a missing block is reported as null, not as a match", () => {
    expect(extractBlock("sem marcadores")).toBeNull();
  });
});
