import type { Mode } from "../types.ts";
import { Rng } from "./prng.ts";

export type TruthLabel = "legitimo" | "suspeito";

export interface Sample {
  id: string;
  scenario: string;
  /** Ground truth: what the generator built, not what the classifier says. */
  label: TruthLabel;
  difficulty: "easy" | "hard";
  /** false = built to look like the legitimate case; the criterion does not claim to catch it. */
  detectable: boolean;
  mode: Mode;
  timezone: "America/Sao_Paulo";
  start: string;
  views: number[];
}

export interface Scenario {
  id: string;
  label: TruthLabel;
  difficulty: "easy" | "hard";
  detectable: boolean;
  description: string;
  build(rng: Rng): { hours: number; start: string; mode: Mode; views: number[] };
}

// Typical weekly-average shape of a Brazilian audience, by local hour (00h..23h).
const HOURLY_SHAPE = [
  0.55, 0.4, 0.3, 0.25, 0.25, 0.3, 0.45, 0.65, 0.8, 0.9, 1.0, 1.05, 1.1, 1.0, 0.95, 1.0, 1.05, 1.15, 1.3, 1.5, 1.6, 1.5, 1.2, 0.85,
];
const SHAPE_MEAN = HOURLY_SHAPE.reduce((a, b) => a + b, 0) / 24;
const HOLIDAYS = ["2025-04-18", "2025-04-21", "2025-05-01", "2025-06-19", "2025-09-07", "2025-10-12", "2025-11-02", "2025-11-15", "2025-12-25"];
const DAY_MS = 86_400_000;
const BASE_DAY = Date.UTC(2025, 0, 6);

/** Time axis starting at local midnight in São Paulo (UTC-3, no DST since 2019). */
class Frame {
  readonly start: string;
  private readonly midnightUtc: number;

  constructor(
    readonly hours: number,
    dayIndex: number,
  ) {
    this.midnightUtc = BASE_DAY + dayIndex * DAY_MS;
    this.start = `${new Date(this.midnightUtc).toISOString().slice(0, 10)}T00:00:00-03:00`;
  }

  hourOfDay(i: number): number {
    return i % 24;
  }

  dayOfWeek(i: number): number {
    return new Date(this.midnightUtc + Math.floor(i / 24) * DAY_MS).getUTCDay();
  }

  isHoliday(i: number): boolean {
    return HOLIDAYS.includes(new Date(this.midnightUtc + Math.floor(i / 24) * DAY_MS).toISOString().slice(0, 10));
  }
}

function randomFrame(rng: Rng, minHours = 96, maxHours = 216): Frame {
  return new Frame(rng.int(minHours, maxHours), rng.int(0, 330));
}

function circadian(hour: number, strength: number, shift = 0): number {
  const shape = HOURLY_SHAPE[(hour - shift + 48) % 24]! / SHAPE_MEAN;
  return Math.max(0.05, 1 + strength * (shape - 1));
}

interface Organic {
  level: number;
  strength: number;
  sigma: number;
  /** Relative change from first to last hour. */
  trend?: number;
  shift?: number;
  weekend?: number;
  holiday?: number;
}

/** Expected organic views per hour, before noise. */
function organicMeans(f: Frame, o: Organic): number[] {
  return Array.from({ length: f.hours }, (_, i) => {
    const dow = f.dayOfWeek(i);
    const calendar = f.isHoliday(i) ? (o.holiday ?? 1) : dow === 0 || dow === 6 ? (o.weekend ?? 1) : 1;
    return o.level * circadian(f.hourOfDay(i), o.strength, o.shift ?? 0) * (1 + (o.trend ?? 0) * (i / f.hours)) * calendar;
  });
}

function noisy(rng: Rng, mean: number, sigma: number): number {
  if (mean < 30) return rng.poisson(mean);
  const z = rng.normal();
  return Math.max(0, Math.round(mean * Math.exp(sigma * z - (sigma * sigma) / 2) + Math.sqrt(mean) * rng.normal()));
}

function toCounts(rng: Rng, means: number[], sigma: number, injected?: number[]): number[] {
  return means.map((m, i) => noisy(rng, m, sigma) + Math.round(injected?.[i] ?? 0));
}

function typicalOrganic(rng: Rng, sigma = rng.uniform(0.08, 0.25)): Organic {
  return {
    level: rng.logUniform(80, 20_000),
    strength: rng.uniform(0.5, 1.1),
    sigma,
    trend: rng.uniform(-0.3, 0.5),
  };
}

/** Rise over `rise` hours to the peak, then exponential decay with the given half-life. */
function decayingBurst(length: number, at: number, peak: number, rise: number, halfLife: number): number[] {
  const out = new Array<number>(length).fill(0);
  for (let t = 0; at + t < length; t++) {
    out[at + t] = t < rise ? (peak * (t + 1)) / (rise + 1) : peak * 2 ** (-(t - rise) / halfLife);
  }
  return out;
}

/** A pulse that holds a level, with optional one- or two-hour shoulder, then stops. */
function rectangularBurst(length: number, at: number, duration: number, level: number, jitter: number, rng: Rng, shoulder: number[]): number[] {
  const out = new Array<number>(length).fill(0);
  for (let t = 0; t < duration && at + t < length; t++) out[at + t] = level * (1 + rng.uniform(-jitter, jitter));
  shoulder.forEach((share, k) => {
    if (at + duration + k < length) out[at + duration + k] = level * share;
  });
  return out;
}

const steady = (rng: Rng) => {
  const f = randomFrame(rng);
  const o = typicalOrganic(rng);
  return { f, o, views: toCounts(rng, organicMeans(f, o), o.sigma) };
};

function asIncrements(f: Frame, views: number[]) {
  return { hours: f.hours, start: f.start, mode: "increment" as const, views };
}

/** Running total; at `dropAt` the platform removes `dropShare` of it, so that hour's snapshot is lower than the previous one. */
function asCumulative(rng: Rng, f: Frame, increments: number[], dropAt: number | null, dropShare: number) {
  let total = rng.int(1_000, 50_000);
  const views = [total];
  increments.forEach((v, i) => {
    total = dropAt === i ? Math.round(total * (1 - dropShare)) : total + v;
    views.push(total);
  });
  return { hours: f.hours, start: f.start, mode: "cumulative" as const, views };
}

export const SCENARIOS: Scenario[] = [
  {
    id: "legit_steady",
    label: "legitimo",
    difficulty: "easy",
    detectable: true,
    description: "Audiência estável com ciclo diário, ruído e tendência suave.",
    build(rng) {
      const { f, views } = steady(rng);
      return asIncrements(f, views);
    },
  },
  {
    id: "legit_viral",
    label: "legitimo",
    difficulty: "easy",
    detectable: true,
    description: "Subida rápida (0 a 3 h) e decaimento exponencial de meia-vida 5 a 20 h; 40% com segunda onda.",
    build(rng) {
      const f = randomFrame(rng);
      const o = typicalOrganic(rng, rng.uniform(0.08, 0.2));
      const at = rng.int(18, f.hours - 30);
      let burst = decayingBurst(f.hours, at, o.level * rng.uniform(10, 60), rng.int(0, 3), rng.uniform(5, 20));
      if (rng.chance(0.4)) {
        const second = at + rng.int(24, 72);
        if (second < f.hours - 12) {
          const wave = decayingBurst(f.hours, second, o.level * rng.uniform(10, 60) * rng.uniform(0.15, 0.5), rng.int(0, 2), rng.uniform(4, 12));
          burst = burst.map((v, i) => v + wave[i]!);
        }
      }
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma, burst));
    },
  },
  {
    id: "legit_weekend",
    label: "legitimo",
    difficulty: "easy",
    detectable: true,
    description: "Fim de semana 1,3 a 2,2× e feriado 1,5 a 3× sobre o patamar de dias úteis.",
    build(rng) {
      const nearHoliday = Math.round((Date.parse(rng.pick(HOLIDAYS)) - BASE_DAY) / DAY_MS) - rng.int(1, 5);
      const f = new Frame(rng.int(168, 216), rng.chance(0.5) ? nearHoliday : rng.int(0, 330));
      const o = { ...typicalOrganic(rng), weekend: rng.uniform(1.3, 2.2), holiday: rng.uniform(1.5, 3) };
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma));
    },
  },
  {
    id: "legit_sparse",
    label: "legitimo",
    difficulty: "easy",
    detectable: true,
    description: "Criador pequeno: 0,4 a 4 views/h, muitas horas em zero, às vezes um pico de até 20 views.",
    build(rng) {
      const f = randomFrame(rng);
      const o: Organic = { level: rng.logUniform(0.4, 4), strength: rng.uniform(0.6, 1.1), sigma: 0.2 };
      const injected = new Array<number>(f.hours).fill(0);
      if (rng.chance(0.5)) injected[rng.int(0, f.hours - 1)] = rng.int(5, 20);
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma, injected));
    },
  },
  {
    id: "legit_cumulative",
    label: "legitimo",
    difficulty: "hard",
    detectable: true,
    description: "Série enviada como acumulado; metade tem um pequeno ajuste para baixo (0,2% a 2%) da plataforma.",
    build(rng) {
      const { f, views } = steady(rng);
      const adjust = rng.chance(0.5);
      return asCumulative(rng, f, views, adjust ? rng.int(24, f.hours - 6) : null, rng.uniform(0.002, 0.02));
    },
  },
  {
    id: "legit_night_audience",
    label: "legitimo",
    difficulty: "hard",
    detectable: true,
    description: "Audiência em outro fuso (ciclo deslocado 9 a 13 h) avaliada com o fuso de São Paulo.",
    build(rng) {
      const f = randomFrame(rng);
      const o = { ...typicalOrganic(rng), shift: rng.int(9, 13) };
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma));
    },
  },
  {
    id: "legit_unlisted",
    label: "legitimo",
    difficulty: "hard",
    detectable: true,
    description: "Vídeo orgânico que o criador ocultou: as views vão a zero de uma hora para outra.",
    build(rng) {
      const f = randomFrame(rng);
      const o = { ...typicalOrganic(rng), level: rng.logUniform(150, 5_000) };
      const cut = rng.int(48, f.hours - 12);
      const views = toCounts(rng, organicMeans(f, o), o.sigma).map((v, i) => (i >= cut ? rng.int(0, 1) : v));
      return asIncrements(f, views);
    },
  },
  {
    id: "legit_rounded_source",
    label: "legitimo",
    difficulty: "hard",
    detectable: true,
    description: "Orgânico, mas a fonte arredonda cada hora para múltiplos de 100.",
    build(rng) {
      const f = randomFrame(rng);
      const o = { ...typicalOrganic(rng), level: rng.logUniform(800, 30_000) };
      const views = toCounts(rng, organicMeans(f, o), o.sigma).map((v) => Math.round(v / 100) * 100);
      return asIncrements(f, views);
    },
  },
  {
    id: "legit_large_smooth",
    label: "legitimo",
    difficulty: "hard",
    detectable: true,
    description: "Canal grande com ruído de 1% a 4% e ciclo diário fraco: parece mecânico sem ser.",
    build(rng) {
      const f = randomFrame(rng);
      const o: Organic = { level: rng.logUniform(20_000, 200_000), strength: rng.uniform(0.15, 0.6), sigma: rng.uniform(0.01, 0.04), trend: rng.uniform(-0.1, 0.1) };
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma));
    },
  },
  {
    id: "legit_flash_pulse",
    label: "legitimo",
    difficulty: "hard",
    detectable: true,
    description: "Pico legítimo curto (link em TV ao vivo, notificação): 10 a 40×, meia-vida de 0,6 a 3 h.",
    build(rng) {
      const f = randomFrame(rng);
      const o = typicalOrganic(rng, rng.uniform(0.08, 0.2));
      const burst = decayingBurst(f.hours, rng.int(18, f.hours - 30), o.level * rng.uniform(10, 40), 0, rng.uniform(0.6, 3));
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma, burst));
    },
  },
  {
    id: "bought_pulse",
    label: "suspeito",
    difficulty: "easy",
    detectable: true,
    description: "Pulso retangular de 1 a 6 h, 10 a 80× o patamar, ±8% de jitter, 30% de madrugada; 40% com ombro de 1 h e 15% com ombro de 2 h.",
    build(rng) {
      const f = randomFrame(rng);
      const o = typicalOrganic(rng, rng.uniform(0.08, 0.2));
      const days = Math.floor((f.hours - 24) / 24);
      const at = rng.chance(0.3) ? rng.int(1, Math.max(1, days)) * 24 + rng.int(2, 3) : rng.int(12, f.hours - 12);
      const roll = rng.float();
      const shoulder = roll < 0.15 ? [rng.uniform(0.3, 0.45), rng.uniform(0.1, 0.2)] : roll < 0.55 ? [rng.uniform(0.2, 0.35)] : [];
      const burst = rectangularBurst(f.hours, at, rng.int(1, 6), o.level * rng.uniform(10, 80), 0.08, rng, shoulder);
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma, burst));
    },
  },
  {
    id: "night_bot",
    label: "suspeito",
    difficulty: "hard",
    detectable: true,
    description: "2 a 6 madrugadas seguidas com 4 h (02h a 05h) de entrega constante de 5 a 16× o patamar.",
    build(rng) {
      const f = randomFrame(rng);
      const o = typicalOrganic(rng, rng.uniform(0.08, 0.2));
      const nights = rng.int(2, 6);
      const firstNight = rng.int(0, Math.max(0, Math.floor(f.hours / 24) - nights - 1));
      const burst = new Array<number>(f.hours).fill(0);
      const level = o.level * rng.uniform(5, 16);
      for (let n = 0; n < nights; n++) {
        for (let h = 2; h <= 5; h++) {
          const i = (firstNight + n) * 24 + h;
          if (i < f.hours) burst[i] = level * (1 + rng.uniform(-0.05, 0.05));
        }
      }
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma, burst));
    },
  },
  {
    id: "bot_drip",
    label: "suspeito",
    difficulty: "easy",
    detectable: true,
    description: "Entrega constante de 24 a 96 h sobre uma base orgânica pequena; 20% sem views orgânicas e com valor exato repetido.",
    build(rng) {
      const f = randomFrame(rng);
      const exact = rng.chance(0.2);
      const o: Organic = { level: exact ? 0 : rng.logUniform(30, 300), strength: 1, sigma: 0.15 };
      const duration = rng.int(24, 96);
      const at = rng.int(0, f.hours - duration);
      const rate = exact ? rng.logUniform(400, 5_000) : o.level * rng.logUniform(8, 80);
      const jitter = exact ? 0 : rng.uniform(0.003, 0.03);
      const drip = new Array<number>(f.hours).fill(0);
      for (let t = 0; t < duration; t++) drip[at + t] = exact ? Math.round(rate / 50) * 50 : rate * (1 + rng.uniform(-jitter, jitter));
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma, drip));
    },
  },
  {
    id: "bot_stopped",
    label: "suspeito",
    difficulty: "easy",
    detectable: true,
    description: "Entrega constante de 14 a 60 h que termina de uma vez; quase não há views orgânicas antes ou depois.",
    build(rng) {
      const f = randomFrame(rng);
      const o: Organic = { level: rng.logUniform(0.5, 6), strength: 1, sigma: 0.15 };
      const duration = rng.int(14, 60);
      const at = rng.int(6, f.hours - duration - 12);
      const rate = rng.logUniform(600, 5_000);
      const drip = new Array<number>(f.hours).fill(0);
      for (let t = 0; t < duration; t++) drip[at + t] = rate * (1 + rng.uniform(-0.02, 0.02));
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma, drip));
    },
  },
  {
    id: "purge_drop",
    label: "suspeito",
    difficulty: "easy",
    detectable: true,
    description: "Acumulado que cai 4% a 35% de uma vez (a plataforma removeu views), com pulso comprado em metade dos casos.",
    build(rng) {
      const f = randomFrame(rng);
      const o = typicalOrganic(rng, rng.uniform(0.08, 0.2));
      const burst = rng.chance(0.5) ? rectangularBurst(f.hours, rng.int(6, Math.floor(f.hours / 2)), rng.int(2, 6), o.level * rng.uniform(10, 60), 0.08, rng, []) : undefined;
      const increments = toCounts(rng, organicMeans(f, o), o.sigma, burst);
      return asCumulative(rng, f, increments, rng.int(Math.floor(f.hours * 0.4), f.hours - 6), rng.uniform(0.04, 0.35));
    },
  },
  {
    id: "bought_disguised_tail",
    label: "suspeito",
    difficulty: "hard",
    detectable: false,
    description: "Compra feita com decaimento de meia-vida 4 a 14 h: igual a um pico orgânico. Fora do alcance do critério.",
    build(rng) {
      const f = randomFrame(rng);
      const o = typicalOrganic(rng, rng.uniform(0.08, 0.2));
      const burst = decayingBurst(f.hours, rng.int(18, f.hours - 30), o.level * rng.uniform(10, 50), rng.int(0, 2), rng.uniform(4, 14));
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma, burst));
    },
  },
  {
    id: "bought_slow_drip",
    label: "suspeito",
    difficulty: "hard",
    detectable: false,
    description: "Compra diluída por 3 a 7 dias, 0,5 a 2× o patamar, seguindo o ciclo diário. Fora do alcance do critério.",
    build(rng) {
      const f = randomFrame(rng, 168, 216);
      const o = typicalOrganic(rng, rng.uniform(0.1, 0.2));
      const duration = rng.int(72, 168);
      const at = rng.int(0, f.hours - duration);
      const share = rng.uniform(0.5, 2);
      const drip = new Array<number>(f.hours).fill(0);
      for (let t = 0; t < duration; t++) {
        drip[at + t] = o.level * share * circadian(f.hourOfDay(at + t), o.strength) * (1 + 0.12 * rng.normal());
      }
      return asIncrements(f, toCounts(rng, organicMeans(f, o), o.sigma, drip));
    },
  },
];
