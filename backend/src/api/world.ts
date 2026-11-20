// The world of the event (sw-architecture.md 14.4, MAP-05, MAP-09, MAP-10): the admin imports a world
// package as a whole, reads the worlds, and rolls back. Players load the active world and its maps,
// tilesets and avatar sprites; sign-in and the closed-platform gate apply as for every /api route.
import fp from "fastify-plugin";
import { z } from "zod";
import {
  publicWorldSchema,
  WORLD_LIMITS,
  worldActionRequestSchema,
  worldGuestAccessRequestSchema,
  worldIndicatorRequestSchema,
  worldObjectsSchema,
  worldRefusalSchema,
  worldStatusSchema,
  worldWelcomeRequestSchema,
} from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { NoPreviousWorld, WorldObjectError, WorldRefused } from "../world/service.ts";
import type { WorldService } from "../world/service.ts";
import { requireRole, signedIn } from "./auth.ts";
import { worldGuestAccess } from "./world-access.ts";

const noQuery = z.strictObject({});
const noBody = z.null().optional();

/** The media type of a world package: a gzip-compressed tar archive (14.4). */
export const WORLD_MEDIA_TYPE = "application/vnd.zappaloo.world";

const CONTENT_TYPES: Record<string, string> = {
  json: "application/json; charset=utf-8",
  png: "image/png",
};

interface WorldOptions {
  world: WorldService;
}

const worldPlugin: FastifyPluginAsyncZod<WorldOptions> = (app, { world }) => {
  const admin = { preHandler: requireRole("admin") };
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;

  // A package is sent as its own bytes; a larger body is answered with 413 before it is read.
  app.addContentTypeParser(
    WORLD_MEDIA_TYPE,
    { parseAs: "buffer", bodyLimit: WORLD_LIMITS.archiveBytes },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.get(
    "/api/admin/world",
    { ...admin, schema: { querystring: noQuery, response: { 200: worldStatusSchema } } },
    () => world.status(),
  );

  app.post(
    "/api/admin/world",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: z.instanceof(Buffer),
        response: { 200: worldStatusSchema, 422: worldRefusalSchema },
      },
    },
    async (request, reply) => {
      try {
        await world.importPackage(request.body, actor(request));
        return await reply.send(world.status());
      } catch (error) {
        if (error instanceof WorldRefused) {
          return reply.status(422).send({
            error: {
              code: "world_refused",
              message: "the package was refused; the active world is unchanged",
            },
            findings: error.findings,
          });
        }
        throw error;
      }
    },
  );

  // The switch for guests (MAP-19): off hides the world from guests, and the active package stays.
  app.put(
    "/api/admin/world/guest-access",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: worldGuestAccessRequestSchema,
        response: { 200: worldStatusSchema },
      },
    },
    (request) => {
      world.setGuestAccess(request.body.enabled, actor(request));
      return world.status();
    },
  );

  // The welcome dialogue that opens once on the first entry (GAME-17); null picks none.
  app.put(
    "/api/admin/world/welcome-dialogue",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: worldWelcomeRequestSchema,
        response: { 200: worldStatusSchema, 422: worldRefusalSchema.pick({ error: true }) },
      },
    },
    async (request, reply) => {
      try {
        world.setWelcomeDialogue(request.body.dialogue, actor(request));
      } catch (error) {
        if (error instanceof WorldObjectError) {
          return reply.status(422).send({ error: { code: error.code, message: error.message } });
        }
        throw error;
      }
      return await reply.send(world.status());
    },
  );

  app.post(
    "/api/admin/world/rollback",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: noBody,
        response: { 200: worldStatusSchema, 409: worldRefusalSchema.pick({ error: true }) },
      },
    },
    async (request, reply) => {
      try {
        await world.rollback(actor(request));
      } catch (error) {
        if (error instanceof NoPreviousWorld) {
          return reply.status(409).send({
            error: {
              code: "no_previous_world",
              message: "there is no previous world to return to",
            },
          });
        }
        throw error;
      }
      return reply.send(world.status());
    },
  );

  // The clickable objects and portals of every map with their actions, and the assignment of an action to a
  // clickable object (MAP-15). An assignment is live at once; null returns the object to its preset.
  app.get(
    "/api/admin/world/objects",
    { ...admin, schema: { querystring: noQuery, response: { 200: worldObjectsSchema } } },
    () => world.objects(),
  );

  app.put(
    "/api/admin/world/objects/:map/:object",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: z.strictObject({ map: z.string().max(60), object: z.string().max(60) }),
        body: worldActionRequestSchema,
        response: {
          200: worldObjectsSchema,
          404: worldRefusalSchema.pick({ error: true }),
          422: worldRefusalSchema.pick({ error: true }),
        },
      },
    },
    async (request, reply) => {
      try {
        world.setAction(
          request.params.map,
          request.params.object,
          request.body.action,
          actor(request),
        );
      } catch (error) {
        if (error instanceof WorldObjectError) {
          const status = error.code === "target_not_found" ? 422 : 404;
          return reply.status(status).send({ error: { code: error.code, message: error.message } });
        }
        throw error;
      }
      return await reply.send(world.objects());
    },
  );

  // Whether a clickable object or an NPC shows its edge indicator and label in the game; live at once.
  app.put(
    "/api/admin/world/objects/:map/:object/indicator",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: z.strictObject({ map: z.string().max(60), object: z.string().max(60) }),
        body: worldIndicatorRequestSchema,
        response: { 200: worldObjectsSchema, 404: worldRefusalSchema.pick({ error: true }) },
      },
    },
    async (request, reply) => {
      try {
        world.setIndicator(
          request.params.map,
          request.params.object,
          request.body.showIndicator,
          actor(request),
        );
      } catch (error) {
        if (error instanceof WorldObjectError) {
          return reply.status(404).send({ error: { code: error.code, message: error.message } });
        }
        throw error;
      }
      return await reply.send(world.objects());
    },
  );

  // What a player's browser loads: the active world, or null while none is imported (MAP-05).
  app.get(
    "/api/world",
    {
      preHandler: worldGuestAccess(world),
      schema: { querystring: noQuery, response: { 200: publicWorldSchema.nullable() } },
    },
    () => world.publicWorld(),
  );

  // The files of a world: maps, tileset images, and the figures' metadata and frames, by the import id (the
  // version). A world changes its import id with every import, so the files are cached for a year (MAP-10).
  const fileParams = z.object({ importId: z.string(), "*": z.string() });
  app.get<{ Params: { importId: string; "*": string } }>(
    "/api/world/:importId/*",
    { preHandler: worldGuestAccess(world), schema: { params: fileParams, querystring: noQuery } },
    (request, reply) => {
      const path = request.params["*"];
      const bytes = world.file(request.params.importId, path);
      if (bytes === undefined) return reply.status(404).send();
      const extension = path.split(".").pop() ?? "";
      return reply
        .type(CONTENT_TYPES[extension] ?? "application/octet-stream")
        .header("cache-control", "public, max-age=31536000, immutable")
        .header("X-Content-Type-Options", "nosniff")
        .send(bytes);
    },
  );

  return Promise.resolve();
};

export const worldRoutes = fp(worldPlugin, { name: "world" });
