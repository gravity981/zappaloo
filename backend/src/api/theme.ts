// The theme of the event (sw-architecture.md 19.7, THM-01, THM-03, THM-05): the admin imports a
// package as a whole, reads the active theme, and returns to the default. Admins only.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fp from "fastify-plugin";
import { z } from "zod";
import { THEME_LIMITS, themeRefusalSchema, themeStatusSchema } from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { fontFileNames } from "../theme/site.ts";
import { ThemeRefused } from "../theme/service.ts";
import type { ThemeService } from "../theme/service.ts";
import { requireRole, signedIn } from "./auth.ts";

const noQuery = z.strictObject({});
const noBody = z.null().optional();

interface ThemeOptions {
  theme: ThemeService;
}

const themePlugin: FastifyPluginAsyncZod<ThemeOptions> = (app, { theme }) => {
  const admin = { preHandler: requireRole("admin") };
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;

  // A package is sent as its own bytes (THM-01); a larger body is answered with 413 before it is read.
  app.addContentTypeParser(
    "application/gzip",
    { parseAs: "buffer", bodyLimit: THEME_LIMITS.archiveBytes },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.get(
    "/api/admin/theme",
    { ...admin, schema: { querystring: noQuery, response: { 200: themeStatusSchema } } },
    () => theme.status(),
  );

  app.post(
    "/api/admin/theme",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: z.instanceof(Buffer),
        response: { 200: themeStatusSchema, 422: themeRefusalSchema },
      },
    },
    async (request, reply) => {
      try {
        await theme.importPackage(request.body, actor(request));
        return await reply.send(theme.status());
      } catch (error) {
        if (error instanceof ThemeRefused) {
          return reply.status(422).send({
            error: {
              code: "theme_refused",
              message: "the package was refused; the active theme is unchanged",
            },
            findings: error.findings,
          });
        }
        throw error;
      }
    },
  );

  app.delete(
    "/api/admin/theme",
    { ...admin, schema: { querystring: noQuery, body: noBody } },
    async (request, reply) => {
      await theme.reset(actor(request));
      return reply.status(204).send();
    },
  );

  // The font files of the active theme (19.7). They sit outside /api and need no sign-in, like the
  // app icons; only a file the active theme names is served, so the name cannot reach other files.
  app.get(
    "/theme/fonts/:file",
    {
      schema: {
        params: z.strictObject({ file: z.string() }),
        querystring: z.looseObject({ v: z.string().optional() }),
      },
    },
    async (request, reply) => {
      const active = theme.active();
      const { file } = request.params;
      if (active === undefined || !fontFileNames(active).has(file)) {
        return reply.status(404).send();
      }
      const bytes = await readFile(join(theme.directory, active.importId, "fonts", file));
      return await reply
        .type("font/woff2")
        // The URL carries the import's version, so a cached file is never used for a new theme.
        .header("cache-control", "public, max-age=31536000, immutable")
        .send(bytes);
    },
  );

  return Promise.resolve();
};

export const themeRoutes = fp(themePlugin, { name: "theme" });
