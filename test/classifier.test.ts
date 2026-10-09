import { describe, expect, it } from "vitest";
import { classify, InputError } from "../src/classifier.ts";
import { RULE_VERSION } from "../src/rules.ts";
import { addAt, cumulative, diurnalBase, series, signal, viralBurst } from "./helpers.ts";

const week = (level = 1000, seed = 1) => diurnalBase(168, level, seed);

describe("series that cannot be judged", () => {
  it("is inconclusive under 48 hours and says why", () => {
    const r = classify(series(diurnalBase(24, 1000)));
    expect(r.label).toBe("inconclusivo");
    expect(r.reason).toContain("48 h");
    expect(r.rule_version).toBe(RULE_VERSION);
  });

  it("is inconclusive when the series is all zeros", () => {
    const r = classify(series(new Array(72).fill(0)));
    expect(r.label).toBe("inconclusivo");
    expect(r.reason).toContain("0 views");
  });
});

describe("obvious legitimate series", () => {
  it("steady audience with a daily cycle is legitimo, with no signal triggered", () => {
    const r = classify(series(week()));
    expect(r.label).toBe("legitimo");
    expect(r.signals.every((s) => !s.triggered)).toBe(true);
    expect(r.reason).toMatch(/Nenhum dos 7 sinais/);
  });

  it("a small weekend bump is not a spike", () => {
    const views = week().map((v, i) => (Math.floor(i / 24) >= 5 ? Math.round(v * 1.8) : v));
    expect(classify(series(views)).label).toBe("legitimo");
  });

  it("organic viral spike with a long decay is legitimo", () => {
    const views = addAt(week(), 60, viralBurst(30_000, 8, 100));
    const r = classify(series(views));
    expect(r.label).toBe("legitimo");
    const spike = signal(r.signals, "spike_shape");
    expect(spike.severity).toBe("none");
    expect(spike.value).toBeGreaterThanOrEqual(5);
    expect(spike.explanation).toContain("cauda de pico orgânico");
  });

  it("a creator with a handful of views per hour is not accused of anything", () => {
    const views = diurnalBase(168, 3, 4, 0.3);
    expect(classify(series(views)).label).toBe("legitimo");
  });
});

describe("obvious suspicious series", () => {
  it("a rectangular pulse that stops cold is suspeito, and the reason gives the hour", () => {
    const views = addAt(week(), 3 * 24 + 3, [18_000, 18_400, 18_200]);
    const r = classify(series(views));
    expect(r.label).toBe("suspeito");
    const spike = signal(r.signals, "spike_shape");
    expect(spike.severity).toBe("strong");
    expect(r.reason).toContain("13/03 às 03h");
    expect(r.reason).toContain("sem cauda de decaimento");
    expect(r.reason).toContain("madrugada");
  });

  it("a constant drip is suspeito through regularity", () => {
    const rate = Array.from({ length: 36 }, (_, t) => 2000 + ((t * 7) % 21) - 10);
    const views = addAt(diurnalBase(120, 60, 2), 30, rate);
    const r = classify(series(views));
    expect(r.label).toBe("suspeito");
    expect(signal(r.signals, "mechanical_regularity").severity).toBe("strong");
  });

  it("the exact same value many hours in a row is suspeito", () => {
    const views = [...diurnalBase(48, 300, 3), ...new Array(30).fill(1500), ...diurnalBase(48, 300, 5)];
    const r = classify(series(views));
    expect(r.label).toBe("suspeito");
    expect(signal(r.signals, "repeated_values").severity).toBe("strong");
    expect(r.reason).toContain("1.500");
  });

  it("four nights of bot delivery from 02h to 05h are suspeito", () => {
    const night = [12_000, 12_400, 11_900, 12_100];
    let views = week(800);
    for (let d = 1; d <= 4; d++) views = addAt(views, d * 24 + 2, night);
    expect(classify(series(views)).label).toBe("suspeito");
  });

  it("a drop of the running total is suspeito and the reason says how much", () => {
    const total = cumulative(week(1000));
    const purged = total.map((v, i) => (i > 100 ? v - Math.round(v * 0.12) : v));
    const r = classify(series(purged, { mode: "cumulative" }));
    expect(r.label).toBe("suspeito");
    expect(signal(r.signals, "purge_drop").severity).toBe("strong");
    expect(r.reason).toContain("caiu");
  });

  it("cumulative and increment inputs of the same data agree", () => {
    const views = addAt(week(), 70, [9000, 9100, 9050]);
    const a = classify(series(views));
    const b = classify(series(cumulative(views), { mode: "cumulative" }));
    expect(b.label).toBe(a.label);
    expect(signal(b.signals, "spike_shape").value).toBe(signal(a.signals, "spike_shape").value);
  });
});

describe("when it prefers not to accuse", () => {
  it("a big spike with a short but real tail is inconclusivo, not suspeito", () => {
    const views = addAt(week(), 60, viralBurst(20_000, 1.2, 20));
    const r = classify(series(views));
    expect(r.label).toBe("inconclusivo");
    const spike = signal(r.signals, "spike_shape");
    expect(spike.severity).toBe("moderate");
    expect(r.reason).toContain("Um único sinal moderado não basta");
  });

  it("a spike at the very end of the series cannot be judged", () => {
    const views = addAt(week(), 166, [20_000, 20_000]);
    const r = classify(series(views));
    expect(r.label).toBe("inconclusivo");
    expect(signal(r.signals, "spike_shape").severity).toBe("undetermined");
    expect(r.reason).toContain("não dá para saber");
  });

  it("views that go to zero for a normal video are inconclusivo, not suspeito", () => {
    const views = [...week(), ...new Array(30).fill(0)];
    const r = classify(series(views));
    expect(r.label).toBe("inconclusivo");
    expect(signal(r.signals, "drop_to_zero").severity).toBe("moderate");
  });

  it("hourly counts rounded to hundreds by the source are inconclusivo", () => {
    const views = week(5000).map((v) => Math.round(v / 100) * 100);
    const r = classify(series(views));
    expect(r.label).toBe("inconclusivo");
    expect(signal(r.signals, "round_numbers").triggered).toBe(true);
  });

  it("an audience in another time zone is inconclusivo in São Paulo time, legitimo in its own", () => {
    const tokyoAudience = diurnalBase(168, 1000, 9, 0.1, 12);
    expect(classify(series(tokyoAudience)).label).toBe("inconclusivo");
    expect(classify(series(tokyoAudience, { timezone: "Asia/Tokyo" })).label).toBe("legitimo");
  });
});

describe("input validation", () => {
  const bad = (input: unknown) => () => classify(input as never);

  it("rejects negative hourly views", () => {
    expect(bad(series([5, -1, 3]))).toThrow(InputError);
  });

  it("rejects non-numbers and non-finite values", () => {
    expect(bad(series([1, "2", 3] as never))).toThrow(/views\[1\]/);
    expect(bad(series([1, Number.NaN, 3]))).toThrow(InputError);
  });

  it("rejects an unknown time zone and a start without offset", () => {
    expect(bad(series(week(), { timezone: "Mars/Olympus" }))).toThrow(/Fuso/);
    expect(bad({ start: "2025-03-10", views: week() })).toThrow(/start/);
  });

  it("rejects series longer than 90 days", () => {
    expect(bad(series(new Array(24 * 90 + 2).fill(10)))).toThrow(/90 dias/);
  });

  it("accepts negative steps in cumulative mode and reports them", () => {
    const r = classify(series([5000, 5200, 5100, 4000, ...new Array(60).fill(4100)], { mode: "cumulative" }));
    expect(signal(r.signals, "purge_drop").value).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  it("gives the same answer twice and does not touch the input", () => {
    const views = addAt(week(), 60, [9000, 9100]);
    const copy = [...views];
    expect(classify(series(views))).toEqual(classify(series(views)));
    expect(views).toEqual(copy);
  });
});
