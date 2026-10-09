import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { classify, InputError } from "../classifier.ts";
import { RULE_VERSION, RULES } from "../rules.ts";
import type { ClassifyInput } from "../types.ts";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok", rule_version: RULE_VERSION }));

  app.get("/rules", (c) => c.json({ rule_version: RULE_VERSION, rules: RULES }));

  app.post(
    "/classify",
    bodyLimit({
      maxSize: 512 * 1024,
      onError: (c) => c.json({ error: { code: "payload_too_large", message: "Corpo acima de 512 KB." } }, 413),
    }),
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: { code: "invalid_json", message: "O corpo precisa ser um JSON válido." } }, 400);
      }
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return c.json({ error: { code: "invalid_body", message: "O corpo precisa ser um objeto com start e views." } }, 400);
      }
      try {
        return c.json(classify(body as ClassifyInput));
      } catch (error) {
        if (error instanceof InputError) return c.json({ error: { code: error.code, message: error.message } }, 400);
        throw error;
      }
    },
  );

  app.onError((_error, c) => c.json({ error: { code: "internal_error", message: "Erro inesperado." } }, 500));

  return app;
}
