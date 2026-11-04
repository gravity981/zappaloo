// System endpoints: health and version (sw-architecture.md 23.6).
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { healthResponseSchema, versionResponseSchema } from "@zappaloo/shared";
import type { VersionResponse } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";

export interface SystemRoutesOptions {
  version: VersionResponse;
  database: Database;
}

const noQuery = z.strictObject({});

export const systemRoutes: FastifyPluginCallbackZod<SystemRoutesOptions> = (app, options, done) => {
  app.get(
    "/api/version",
    { schema: { querystring: noQuery, response: { 200: versionResponseSchema } } },
    () => options.version,
  );

  app.get(
    "/api/health",
    { schema: { querystring: noQuery, response: { 200: healthResponseSchema } } },
    () => {
      // Throws (and so answers 500) if the database is not usable.
      options.database.sqlite.prepare("SELECT 1").get();
      return { status: "ok" as const, version: options.version.version };
    },
  );
  done();
};
