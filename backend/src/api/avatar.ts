// The avatar editor's API (sw-architecture.md 7.3, AVA-01, AVA-02): the user and their approved companions with the
// figures each may choose, and the choice of a figure. Signed-in users only; the closed-platform gate applies as
// for every route.
import fp from "fastify-plugin";
import { z } from "zod";
import {
  avatarRequestSchema,
  avatarResponseSchema,
  guestFiguresResponseSchema,
} from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AvatarError } from "../world/avatar.ts";
import type { AvatarService } from "../world/avatar.ts";
import type { ProfileService } from "../profile/service.ts";
import type { WorldService } from "../world/service.ts";
import { requireUser, signedIn } from "./auth.ts";
import { worldGuestAccess } from "./world-access.ts";

const noQuery = z.strictObject({});
const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

interface AvatarOptions {
  avatar: AvatarService;
  profile: ProfileService;
  world: WorldService;
}

const avatarPlugin: FastifyPluginAsyncZod<AvatarOptions> = (app, { avatar, profile, world }) => {
  const access = worldGuestAccess(world);
  app.get(
    "/api/avatar",
    {
      preHandler: [requireUser, access],
      schema: { querystring: noQuery, response: { 200: avatarResponseSchema } },
    },
    (request) => avatar.persons(signedIn(request).user),
  );

  // The figures of the attending guests that wander the maps (PRES-01, PRES-04): signed-in users only.
  app.get(
    "/api/world/guests",
    {
      preHandler: [requireUser, access],
      schema: { querystring: noQuery, response: { 200: guestFiguresResponseSchema } },
    },
    (request) => {
      const cards = profile.cards();
      return {
        guests: avatar.guests(signedIn(request).user).map((guest) => ({
          ...guest,
          greeting: cards.get(guest.id)?.greeting ?? null,
          badge: cards.get(guest.id)?.badge ?? null,
          line: cards.get(guest.id)?.line ?? null,
          photo: cards.get(guest.id)?.photo ?? null,
        })),
      };
    },
  );

  // The photo of an attending guest for the speech bubble (PRES-10); the version in the address lets it be cached.
  app.get(
    "/api/world/guests/:key/photo",
    {
      preHandler: [requireUser, access],
      schema: {
        querystring: z.strictObject({ v: z.string().max(20).optional() }),
        params: z.strictObject({ key: z.string().max(12) }),
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const photo = avatar.guests(signedIn(request).user).some((guest) => guest.id === key)
        ? profile.photoByKey(key)
        : undefined;
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
