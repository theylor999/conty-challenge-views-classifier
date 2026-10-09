import { describe, expect, it } from "vitest";
import { createApp } from "../src/http/app.ts";
import { addAt, diurnalBase, series } from "./helpers.ts";

const app = createApp();
const post = (body: unknown) =>
  app.request("/classify", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("HTTP API", () => {
  it("GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  it("GET /rules exposes the thresholds", async () => {
    const body = (await (await app.request("/rules")).json()) as { rules: { spike: { riseRatio: number } } };
    expect(body.rules.spike.riseRatio).toBe(8);
  });

  it("POST /classify returns label, reason, signals and rule_version", async () => {
    const res = await post(series(addAt(diurnalBase(168, 1000, 21), 80, [20_000, 20_000])));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { label: string; reason: string; signals: { id: string }[]; rule_version: string };
    expect(body.label).toBe("suspeito");
    expect(body.reason.length).toBeGreaterThan(20);
    expect(body.signals.map((s) => s.id)).toContain("spike_shape");
    expect(body.rule_version).toBeTruthy();
  });

  it("answers 200 with inconclusivo for a short series", async () => {
    const res = await post(series(diurnalBase(10, 100)));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { label: string }).label).toBe("inconclusivo");
  });

  it("answers 400 with a code for invalid input", async () => {
    const res = await post(series([1, -5, 3]));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "invalid_views" } });
  });

  it("answers 400 for broken JSON and for a non-object body", async () => {
    expect((await post("{nope")).status).toBe(400);
    expect((await post([1, 2, 3])).status).toBe(400);
  });

  it("answers 413 for a huge body", async () => {
    const res = await post({ start: "2025-03-10T00:00:00-03:00", views: new Array(200_000).fill(1000) });
    expect(res.status).toBe(413);
  });
});
