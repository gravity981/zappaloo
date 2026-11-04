// The whole site is excluded from search engine indexing (SEC-10):
// robots.txt disallows everything, and every response carries X-Robots-Tag.
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

export const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";
export const X_ROBOTS_TAG = "noindex, nofollow, noarchive";

function noIndexPlugin(app: FastifyInstance): void {
  // onSend runs for every response, including errors and 404s.
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Robots-Tag", X_ROBOTS_TAG);
    return payload;
  });

  app.get("/robots.txt", async (_request, reply) =>
    reply.type("text/plain; charset=utf-8").send(ROBOTS_TXT),
  );
}

export const noIndex = fp(noIndexPlugin, { name: "no-index" });
