import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateDataset, HOLDOUT_SEED, serializeDataset, TUNING_SEED } from "../src/dataset/generate.ts";
import { evaluate } from "../src/evaluation/metrics.ts";
import { extractBlock, renderConsole, renderReadmeBlock, replaceBlock } from "../src/evaluation/report.ts";
import { RULE_VERSION } from "../src/rules.ts";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const dataset = generateDataset(TUNING_SEED);
writeFileSync(root("data/dataset.json"), serializeDataset(dataset));

const tuning = evaluate(dataset);
const holdout = evaluate(generateDataset(HOLDOUT_SEED));
writeFileSync(root("data/metrics.json"), `${JSON.stringify({ rule_version: RULE_VERSION, tuning, holdout }, null, 2)}\n`);

console.log(renderConsole(tuning, "Conjunto de ajuste"));
console.log(`\n${renderConsole(holdout, "Conjunto de controle")}\n`);

const block = renderReadmeBlock(tuning, holdout);
const readmePath = root("README.md");
if (process.argv.includes("--write-readme")) {
  writeFileSync(readmePath, replaceBlock(readFileSync(readmePath, "utf8"), block));
  console.log("README.md: bloco de métricas atualizado.");
} else if (existsSync(readmePath) && extractBlock(readFileSync(readmePath, "utf8")) !== block) {
  console.log("AVISO: o bloco de métricas do README difere do medido. Rode: npm run evaluate -- --write-readme");
}
console.log("data/dataset.json e data/metrics.json gravados.");
