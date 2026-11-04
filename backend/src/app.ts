// Assembles the Fastify application. Separate from server.ts so that tests can
// build the app and call it with app.inject() without opening a port.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import type { VersionResponse } from "@zappaloo/shared";
import type { Database } from "./database/database.ts";
import { noIndex } from "./api/no-index.ts";
import { systemRoutes } from "./api/system.ts";
import { sendError, validation } from "./api/validation.ts";

export interface AppOptions {
  database: Database;
  version: VersionResponse;
  /** Built frontend to serve; omitted in dev, where Vite serves the frontend. */
  frontendDir?: string | undefined;
  logger?: FastifyServerOptions["logger"];
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(validation);
  await app.register(noIndex);
  await app.register(systemRoutes, { database: options.database, version: options.version });

  const frontendDir = options.frontendDir && resolve(options.frontendDir);
  if (frontendDir) {
    if (!existsSync(join(frontendDir, "index.html"))) {
      throw new Error(
        `FRONTEND_DIR ${frontendDir} contains no index.html (build the frontend first)`,
      );
    }
    await app.register(fastifyStatic, { root: frontendDir, wildcard: false });
  }

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    // Client-side routes of the single-page app get index.html; the router shows its own 404.
    if (frontendDir && request.method === "GET" && !path.startsWith("/api/")) {
      return reply.type("text/html; charset=utf-8").sendFile("index.html");
    }
    return sendError(reply, 404, {
      code: "not_found",
      message: `No route for ${request.method} ${path}`,
    });
  });

  return app;
}
