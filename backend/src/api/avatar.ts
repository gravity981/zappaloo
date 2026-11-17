// The avatar editor's API (sw-architecture.md 7.3, AVA-01, AVA-02): the user and their approved companions with the
// figures each may choose, and the choice of a figure. Signed-in users only; the closed-platform gate applies as
// for every route.
import fp from "fastify-plugin";
import { z } from "zod";
import { avatarRequestSchema, avatarResponseSchema } from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AvatarError } from "../world/avatar.ts";
import type { AvatarService } from "../world/avatar.ts";
import type { WorldService } from "../world/service.ts";
import { requireUser, signedIn } from "./auth.ts";
import { worldGuestAccess } from "./world-access.ts";

const noQuery = z.strictObject({});
const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

interface AvatarOptions {
  avatar: AvatarService;
  world: WorldService;
}

const avatarPlugin: FastifyPluginAsyncZod<AvatarOptions> = (app, { avatar, world }) => {
  const access = worldGuestAccess(world);
  app.get(
    "/api/avatar",
    {
      preHandler: [requireUser, access],
      schema: { querystring: noQuery, response: { 200: avatarResponseSchema } },
    },
    (request) => avatar.persons(signedIn(request).user),
  );

  app.put(
    "/api/avatar/:person",
    {
      preHandler: [requireUser, access],
      schema: {
        querystring: noQuery,
        params: z.strictObject({ person: z.string().max(20) }),
        body: avatarRequestSchema,
        response: { 200: avatarResponseSchema, 403: errorBody, 404: errorBody, 422: errorBody },
      },
    },
    async (request, reply) => {
      const { user } = signedIn(request);
      try {
        avatar.choose(user, request.params.person, request.body.figure);
      } catch (error) {
        if (error instanceof AvatarError) {
          const status = (
            {
              figure_not_allowed: 403,
              person_not_found: 404,
              figure_not_found: 422,
              no_world: 422,
            } as const
          )[error.code];
          return reply.status(status).send({ error: { code: error.code, message: error.message } });
        }
        throw error;
      }
      return await reply.send(avatar.persons(user));
    },
  );

  return Promise.resolve();
};

export const avatarRoutes = fp(avatarPlugin, { name: "avatar" });
