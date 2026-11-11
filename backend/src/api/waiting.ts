// The waiting page of a closed platform and its settings (ACS-10 – ACS-13; sw-architecture.md
// 10.4).
import { createReadStream } from "node:fs";
import fp from "fastify-plugin";
import { z } from "zod";
import {
  doorResponseSchema,
  waitingConfigSchema,
  waitingPageSchema,
  waitingUpdateSchema,
} from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { requireRole, signedIn } from "./auth.ts";
import type { AuthOptions } from "./auth.ts";
import { sendError } from "./validation.ts";

const noQuery = z.strictObject({});
const doorFileParams = z.strictObject({ file: z.enum(["sheet", "glimpse"]) });

const waitingPlugin: FastifyPluginAsyncZod<AuthOptions> = (app, { waiting }) => {
  const admin = { preHandler: requireRole("admin") };

  // What the waiting page shows to this guest.
  app.get(
    "/api/waiting",
    { schema: { querystring: noQuery, response: { 200: waitingPageSchema } } },
    (request) => {
      const { user } = signedIn(request);
      return waiting.page(user.id, user.roles.includes("vip"));
    },
  );

  app.get(
    "/api/waiting/door",
    {
      schema: {
        querystring: noQuery.extend({ v: z.string().optional() }).strict(),
        response: { 200: doorResponseSchema },
      },
    },
    () => waiting.door(),
  );

  // The files of an event's own door scene; the page asks with the version of the scene, so a
  // replaced file is loaded again.
  app.get(
    "/api/waiting/door/:file",
    {
      schema: {
        querystring: z.strictObject({ v: z.string().optional() }),
        params: doorFileParams,
      },
    },
    async (request, reply) => {
      const path = waiting.doorFile(request.params.file);
      if (!path) {
        return sendError(reply, 404, {
          code: "not_found",
          message: "This scene has no such file.",
        });
      }
      return reply
        .type("image/png")
        .header("cache-control", "private, max-age=86400")
        .send(createReadStream(path));
    },
  );

  app.get(
    "/api/admin/waiting",
    { ...admin, schema: { querystring: noQuery, response: { 200: waitingConfigSchema } } },
    () => waiting.config(),
  );

  app.patch(
    "/api/admin/waiting",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: waitingUpdateSchema,
        response: { 200: waitingConfigSchema },
      },
    },
    (request) => waiting.update(request.body, `user:${String(signedIn(request).user.id)}`),
  );

  return Promise.resolve();
};

export const waitingRoutes = fp(waitingPlugin, { name: "waiting" });
