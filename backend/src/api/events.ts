// Server-Sent Events (sw-architecture.md 17.1). For now only a heartbeat, so the
// deployment test can check that events pass through the proxy one by one (OPS-02).
import { PassThrough } from "node:stream";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { PUBLIC } from "./access.ts";

export const pingQuerySchema = z.strictObject({
  count: z.coerce.number().int().min(1).max(10).default(3),
  intervalMs: z.coerce.number().int().min(50).max(2000).default(500),
});

/** One event in the text/event-stream format. */
export function formatEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const eventRoutes: FastifyPluginCallbackZod = (app, _options, done) => {
  app.get(
    "/api/events/ping",
    { config: PUBLIC, schema: { querystring: pingQuerySchema } },
    (request, reply) => {
      const { count, intervalMs } = request.query;
      const stream = new PassThrough();
      // A comment first, so headers and the connection reach the client immediately.
      stream.write(": connected\n\n");

      let sent = 0;
      const timer = setInterval(() => {
        sent += 1;
        stream.write(formatEvent("ping", { n: sent, of: count }));
        if (sent >= count) {
          clearInterval(timer);
          stream.end();
        }
      }, intervalMs);
      request.raw.on("close", () => {
        clearInterval(timer);
      });

      return reply
        .header("Content-Type", "text/event-stream; charset=utf-8")
        .header("Cache-Control", "no-cache")
        .send(stream);
    },
  );
  done();
};
