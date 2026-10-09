import { RULES } from "./rules.ts";
import type { ClassifyInput, Mode } from "./types.ts";

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const HOUR_MS = 3_600_000;
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export class InputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface PurgeEvent {
  /** Index of the hour whose closing snapshot is lower than the previous one. */
  index: number;
  percent: number;
  removed: number;
}

export interface Series {
  /** New views per hour, never negative. Index i covers [start + i h, start + i+1 h). */
  x: number[];
  mode: Mode;
  timezone: string;
  startMs: number;
  localHour: number[];
  /** "dd/mm" in the audience's time zone. */
  localDate: string[];
  purges: PurgeEvent[];
  /** "12/03 às 03h" */
  when(i: number): string;
}

export function normalize(input: ClassifyInput): Series {
  const mode = input.mode ?? "increment";
  if (mode !== "increment" && mode !== "cumulative") {
    throw new InputError("invalid_mode", 'mode deve ser "increment" ou "cumulative".');
  }
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hourCycle: "h23",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
    });
  } catch {
    throw new InputError("invalid_timezone", `Fuso horário desconhecido: "${timezone}". Use um nome IANA, ex.: America/Sao_Paulo.`);
  }
  if (typeof input.start !== "string" || !ISO_WITH_OFFSET.test(input.start) || Number.isNaN(Date.parse(input.start))) {
    throw new InputError("invalid_start", 'start deve ser um instante ISO-8601 com fuso, ex.: "2025-03-10T00:00:00-03:00".');
  }
  const startMs = Date.parse(input.start);

  const raw = input.views;
  if (!Array.isArray(raw)) throw new InputError("invalid_views", "views deve ser uma lista de números.");
  if (raw.length > RULES.maxHours + 1) {
    throw new InputError("too_long", `views aceita no máximo ${RULES.maxHours} horas (90 dias).`);
  }
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new InputError("invalid_views", `views[${i}] deve ser um número finito e não negativo.`);
    }
  }

  const purges: PurgeEvent[] = [];
  let x: number[];
  if (mode === "increment") {
    x = raw.slice();
  } else {
    x = [];
    for (let i = 1; i < raw.length; i++) {
      const delta = raw[i]! - raw[i - 1]!;
      x.push(Math.max(0, delta));
      if (delta < 0 && raw[i - 1]! > 0) {
        purges.push({ index: i - 1, percent: (-delta / raw[i - 1]!) * 100, removed: -delta });
      }
    }
  }

  const localHour: number[] = [];
  const localDate: string[] = [];
  for (let i = 0; i < x.length; i++) {
    const parts = formatter.formatToParts(new Date(startMs + i * HOUR_MS));
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    localHour.push(Number(get("hour")));
    localDate.push(`${get("day")}/${get("month")}`);
  }

  return {
    x,
    mode,
    timezone,
    startMs,
    localHour,
    localDate,
    purges,
    when: (i) => `${localDate[i]} às ${String(localHour[i]).padStart(2, "0")}h`,
  };
}
