// The world of the event (sw-architecture.md 14.4, MAP-05, MAP-09, MAP-10): the admin imports a world
// package as a whole, reads the worlds, and rolls back. Players load the active world and its maps,
// tilesets and avatar sprites; sign-in and the closed-platform gate apply as for every /api route.
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import {
  publicWorldSchema,
  WORLD_LIMITS,
  worldRefusalSchema,
  worldStatusSchema,
} from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { NoPreviousWorld, WorldRefused } from "../world/service.ts";
import type { WorldService } from "../world/service.ts";
import { requireRole, signedIn } from "./auth.ts";

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
        world.rollback(actor(request));
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

  // What a player's browser loads: the active world, or null while none is imported (MAP-05).
  app.get(
    "/api/world",
    { schema: { querystring: noQuery, response: { 200: publicWorldSchema.nullable() } } },
    () => world.publicWorld(),
  );

  // The files of a world: maps, tileset images and avatar sprites, by the import id (the version).
  // A world changes its import id with every import, so the files are cached for a year (MAP-10).
  // Each folder has its own route, so the route table names every address the app serves.
  const file = async (
    request: FastifyRequest<{ Params: { importId: string; file: string } }>,
    folder: string,
    reply: FastifyReply,
  ) => {
    const path = `${folder}/${request.params.file}`;
    const bytes = world.file(request.params.importId, path);
    if (bytes === undefined) return reply.status(404).send();
    const extension = request.params.file.split(".").pop() ?? "";
    return reply
      .type(CONTENT_TYPES[extension] ?? "application/octet-stream")
      .header("cache-control", "public, max-age=31536000, immutable")
      .send(bytes);
  };
  const fileParams = z.object({ importId: z.string(), file: z.string() });
  for (const folder of ["maps", "tilesets", "avatar"]) {
    app.get<{ Params: { importId: string; file: string } }>(
      `/api/world/:importId/${folder}/:file`,
      { schema: { params: fileParams, querystring: noQuery } },
      (request, reply) => file(request, folder, reply),
    );
  }

  return Promise.resolve();
};

export const worldRoutes = fp(worldPlugin, { name: "world" });
