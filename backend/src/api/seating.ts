// The seating plan and the table finder (sw-architecture.md 3.6; PRES-05 – PRES-07, PRES-12): the admin places the
// attending persons on the tables of the world and sets when guests see the plan; a guest looks up their table and
// their tablemates. While the platform is closed this stays closed to guests (the server gate of ACS-10 lists only
// the routes a restricted guest may call).
import fp from "fastify-plugin";
import { z } from "zod";
import {
  adminSeatingResponseSchema,
  seatingAssignRequestSchema,
  seatingGuestResponseSchema,
  seatingVisibilityRequestSchema,
} from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { SeatingError } from "../seating/service.ts";
import type { SeatingService } from "../seating/service.ts";
import { requireRole, requireUser, signedIn } from "./auth.ts";

const noQuery = z.strictObject({});
const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const STATUS = { person_not_found: 404, table_not_found: 404, table_full: 409 } as const;

interface SeatingOptions {
  seating: SeatingService;
}

const seatingPlugin: FastifyPluginAsyncZod<SeatingOptions> = (app, { seating }) => {
  const admin = { preHandler: requireRole("admin") };
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;

  app.get(
    "/api/seating",
    {
      preHandler: requireUser,
      schema: { querystring: noQuery, response: { 200: seatingGuestResponseSchema } },
    },
    (request) => seating.forGuest(signedIn(request).user),
  );

  // The photo of a tablemate; the version in the address lets the browser keep it (as for the guests of the game).
  app.get(
    "/api/seating/photo/:key",
    {
      preHandler: requireUser,
      schema: {
        querystring: z.strictObject({ v: z.string().max(20).optional() }),
        params: z.strictObject({ key: z.string().max(12) }),
      },
    },
    async (request, reply) => {
      const photo = seating.photoOf(signedIn(request).user, request.params.key);
      if (photo === undefined) {
        return await reply.status(404).send({ error: { code: "no_photo", message: "no photo" } });
      }
      return await reply
        .header("content-type", photo.mime)
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "private, max-age=31536000, immutable")
        .send(photo.bytes);
    },
  );

  app.get(
    "/api/admin/seating",
    { ...admin, schema: { querystring: noQuery, response: { 200: adminSeatingResponseSchema } } },
    () => seating.admin(),
  );

  app.put(
    "/api/admin/seating/assignments/:key",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: z.strictObject({ key: z.string().max(12) }),
        body: seatingAssignRequestSchema,
        response: { 200: adminSeatingResponseSchema, 404: errorBody, 409: errorBody },
      },
    },
    async (request, reply) => {
      try {
        seating.assign(request.params.key, request.body.table, actor(request));
      } catch (error) {
        if (error instanceof SeatingError) {
          return await reply
            .status(STATUS[error.code] as 404)
            .send({ error: { code: error.code, message: error.message } });
        }
        throw error;
      }
      return await reply.send(seating.admin());
    },
  );

  app.put(
    "/api/admin/seating/visibility",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: seatingVisibilityRequestSchema,
        response: { 200: adminSeatingResponseSchema },
      },
    },
    async (request, reply) => {
      const { visibleFrom } = request.body;
      seating.setVisibleFrom(visibleFrom === null ? null : new Date(visibleFrom), actor(request));
      return await reply.send(seating.admin());
    },
  );

  return Promise.resolve();
};

export const seatingRoutes = fp(seatingPlugin, { name: "seating" });
