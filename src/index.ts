import { serve } from "@hono/node-server";
import { createApp } from "./http/app.ts";

const port = Number(process.env["PORT"] ?? 3000);
serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`views-classifier em http://localhost:${info.port}`);
});
