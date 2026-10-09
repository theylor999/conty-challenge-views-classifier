import { type Metrics, percent } from "./metrics.ts";

export const README_START = "<!-- metrics:start -->";
export const README_END = "<!-- metrics:end -->";

function table(header: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}

const scenarioTable = (m: Metrics) =>
  table(
    ["cenário", "verdade", "n", "legitimo", "suspeito", "inconclusivo"],
    m.scenarios.map((r) => [
      `\`${r.scenario}\`${r.difficulty === "hard" ? " (difícil)" : ""}${r.detectable ? "" : " (fora do alcance)"}`,
      r.truth,
      String(r.n),
      String(r.predicted.legitimo),
      String(r.predicted.suspeito),
      String(r.predicted.inconclusivo),
    ]),
  );

const confusionTable = (m: Metrics) =>
  table(
    ["verdade \\ classificador", "legitimo", "suspeito", "inconclusivo"],
    (["legitimo", "suspeito"] as const).map((t) => [t, String(m.confusion[t].legitimo), String(m.confusion[t].suspeito), String(m.confusion[t].inconclusivo)]),
  );

const headline = (m: Metrics) =>
  `Falsos positivos: **${m.false_positives} de ${m.legit_total} séries legítimas = ${percent(m.false_positives, m.legit_total)}**`;

/** Text that goes between the README markers. Both README and test use this exact function. */
export function renderReadmeBlock(tuning: Metrics, holdout: Metrics): string {
  return [
    `Conjunto de ajuste: semente ${tuning.seed}, ${tuning.samples} séries (${tuning.legit_total} legítimas, ${tuning.suspicious_total} suspeitas), arquivo \`data/dataset.json\`.`,
    "",
    `- ${headline(tuning)}.`,
    `- Falsos positivos só nos cenários fáceis: ${tuning.easy_false_positives} de ${tuning.easy_legit_total} = ${percent(tuning.easy_false_positives, tuning.easy_legit_total)}.`,
    `- Legítimas que o classificador deixou como inconclusivo: ${tuning.inconclusive_on_legit} de ${tuning.legit_total} = ${percent(tuning.inconclusive_on_legit, tuning.legit_total)}.`,
    `- Suspeitas classificadas como legítimo (falso negativo): ${tuning.false_negatives} de ${tuning.suspicious_total} = ${percent(tuning.false_negatives, tuning.suspicious_total)}.`,
    `- Suspeitas pegas, contando as fora do alcance: ${tuning.confusion.suspeito.suspeito} de ${tuning.suspicious_total} = ${percent(tuning.confusion.suspeito.suspeito, tuning.suspicious_total)}.`,
    `- Suspeitas dentro do alcance do critério que foram pegas: ${tuning.detectable_caught} de ${tuning.detectable_suspicious_total} = ${percent(tuning.detectable_caught, tuning.detectable_suspicious_total)}.`,
    "",
    confusionTable(tuning),
    "",
    scenarioTable(tuning),
    "",
    `Conjunto de controle: semente ${holdout.seed}, mesma receita, não usada para escolher nenhum limite. ${headline(holdout)}; falsos negativos ${holdout.false_negatives} de ${holdout.suspicious_total} = ${percent(holdout.false_negatives, holdout.suspicious_total)}; suspeitas dentro do alcance pegas ${holdout.detectable_caught} de ${holdout.detectable_suspicious_total} = ${percent(holdout.detectable_caught, holdout.detectable_suspicious_total)}.`,
  ].join("\n");
}

export function renderConsole(m: Metrics, title: string): string {
  const lines = [
    `== ${title} (semente ${m.seed}, ${m.samples} séries) ==`,
    headline(m),
    `Falsos negativos: ${m.false_negatives}/${m.suspicious_total} = ${percent(m.false_negatives, m.suspicious_total)}`,
    `Inconclusivo: ${m.inconclusive_on_legit} legítimas + ${m.inconclusive_on_suspicious} suspeitas = ${percent(m.inconclusive_on_legit + m.inconclusive_on_suspicious, m.samples)} do total`,
    "",
    confusionTable(m),
    "",
    scenarioTable(m),
  ];
  if (m.false_positive_ids.length > 0) lines.push("", `Falsos positivos: ${m.false_positive_ids.join(", ")}`);
  return lines.join("\n");
}

export function extractBlock(readme: string): string | null {
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  if (start === -1 || end === -1 || end < start) return null;
  return readme.slice(start + README_START.length, end).trim();
}

export function replaceBlock(readme: string, block: string): string {
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  if (start === -1 || end === -1 || end < start) throw new Error("README sem os marcadores de métricas.");
  return `${readme.slice(0, start + README_START.length)}\n${block}\n${readme.slice(end)}`;
}
