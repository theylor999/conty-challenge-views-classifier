import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addAt, diurnalBase, series, viralBurst } from "../test/helpers.ts";

const out = (name: string, body: unknown) => writeFileSync(fileURLToPath(new URL(`../examples/${name}.json`, import.meta.url)), `${JSON.stringify(body)}\n`);

const base = () => diurnalBase(168, 1000, 21);
const PEAK_AT = 3 * 24 + 21;

out("organic-viral", series(addAt(base(), PEAK_AT, viralBurst(20_000, 7, 80))));
out("bought-pulse", series(addAt(base(), PEAK_AT, [20_000, 20_000, 20_000])));
out("partial-decay", series(addAt(base(), PEAK_AT, viralBurst(20_000, 1.2, 20))));
