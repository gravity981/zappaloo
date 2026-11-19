// The profiles of the guests (sw-architecture.md 3.6; PRES-09, PRES-13 – PRES-15): a guest edits the photo, greeting
// and "How I know the couple" of themselves and their approved companions; the admin edits the relation list and
// removes a photo or a line (PRES-14). A photo is sent as its own bytes with its image type as Content-Type, a
// body parser that the content routes register for the whole app (CNT-06).
import fp from "fastify-plugin";
import { z } from "zod";
import {
  adminProfilesResponseSchema,
  PROFILE_REMOVABLE,
  profilePeopleResponseSchema,
  profileRequestSchema,
  relationsRequestSchema,
  relationsResponseSchema,
} from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { PhotoError } from "../profile/photo.ts";
import { ProfileError } from "../profile/service.ts";
import type { ProfileService } from "../profile/service.ts";
import { requireRole, requireUser, signedIn } from "./auth.ts";

const noQuery = z.strictObject({});
const noBody = z.null().optional();
/** A picture is asked for with its version (`?v=`), so a changed photo has a new address and may be cached. */
const versionQuery = z.strictObject({ v: z.string().max(20).optional() });
const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const personParam = z.strictObject({ person: z.string().max(20) });

const STATUS = {
  person_not_found: 404,
  relation_not_found: 422,
  relation_duplicate: 422,
  no_photo: 404,
  photo_too_large: 413,
  photo_type: 415,
  photo_invalid: 422,
} as const;

interface ProfileOptions {
  profile: ProfileService;
}

const profilePlugin: FastifyPluginAsyncZod<ProfileOptions> = (app, { profile }) => {
  const admin = { preHandler: requireRole("admin") };
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;
  const answer = (error: unknown) => {
    if (error instanceof ProfileError || error instanceof PhotoError) {
      return {
        status: STATUS[error.code],
        body: { error: { code: error.code, message: error.message } },
      };
    }
    throw error;
  };

  app.get(
    "/api/profile/people",
    {
      preHandler: requireUser,
      schema: { querystring: noQuery, response: { 200: profilePeopleResponseSchema } },
    },
    (request) => ({
      persons: profile.persons(signedIn(request).user),
      relations: profile.relations(),
    }),
  );

  app.put(
    "/api/profile/people/:person",
    {
      preHandler: requireUser,
      schema: {
        querystring: noQuery,
        params: personParam,
        body: profileRequestSchema,
        response: { 200: profilePeopleResponseSchema, 404: errorBody, 422: errorBody },
      },
    },
    async (request, reply) => {
      const { user } = signedIn(request);
      try {
        profile.save(user, request.params.person, request.body);
      } catch (error) {
        const { status, body } = answer(error);
        return await reply.status(status as 404).send(body);
      }
      return await reply.send({ persons: profile.persons(user), relations: profile.relations() });
    },
  );

  app.put(
    "/api/profile/people/:person/photo",
    {
      preHandler: requireUser,
      schema: {
        querystring: noQuery,
        params: personParam,
        body: z.instanceof(Buffer),
        response: {
          200: profilePeopleResponseSchema,
          404: errorBody,
          413: errorBody,
          415: errorBody,
          422: errorBody,
        },
      },
    },
    async (request, reply) => {
      const { user } = signedIn(request);
      try {
        await profile.savePhoto(user, request.params.person, request.body);
      } catch (error) {
        const { status, body } = answer(error);
        return await reply.status(status as 404).send(body);
      }
      return await reply.send({ persons: profile.persons(user), relations: profile.relations() });
    },
  );

  app.delete(
    "/api/profile/people/:person/photo",
    {
      preHandler: requireUser,
      schema: {
        querystring: noQuery,
        body: noBody,
        params: personParam,
        response: { 200: profilePeopleResponseSchema, 404: errorBody },
      },
    },
    async (request, reply) => {
      const { user } = signedIn(request);
      try {
        profile.deletePhoto(user, request.params.person);
      } catch (error) {
        const { status, body } = answer(error);
        return await reply.status(status as 404).send(body);
      }
      return await reply.send({ persons: profile.persons(user), relations: profile.relations() });
    },
  );

  // The photo of one of the user's own persons; the pictures of other guests come with the speech bubble.
  app.get(
    "/api/profile/people/:person/photo",
    {
      preHandler: requireUser,
      schema: { querystring: versionQuery, params: personParam },
    },
    async (request, reply) => {
      let photo;
      try {
        photo = profile.photo(signedIn(request).user, request.params.person);
      } catch (error) {
        const { status, body } = answer(error);
        return await reply.status(status as 404).send(body);
      }
      if (photo === undefined) {
        return await reply.status(404).send({ error: { code: "no_photo", message: "no photo" } });
      }
      // The address carries the version, so a changed photo is a new address and may be cached.
      return await reply
        .header("content-type", photo.mime)
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "private, max-age=31536000, immutable")
        .send(photo.bytes);
    },
  );

  app.get(
    "/api/admin/profile/relations",
    { ...admin, schema: { querystring: noQuery, response: { 200: relationsResponseSchema } } },
    () => ({ relations: profile.relations() }),
  );

  app.put(
    "/api/admin/profile/relations",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: relationsRequestSchema,
        response: { 200: relationsResponseSchema, 422: errorBody },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send({
          relations: profile.setRelations(request.body.relations, actor(request)),
        });
      } catch (error) {
        const { status, body } = answer(error);
        return await reply.status(status as 422).send(body);
      }
    },
  );

  app.get(
    "/api/admin/profiles/:user",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: z.strictObject({ user: z.coerce.number().int().positive() }),
        response: { 200: adminProfilesResponseSchema, 404: errorBody },
      },
    },
    async (request, reply) => {
      const persons = profile.personsOf(request.params.user);
      if (persons === undefined) {
        return await reply
          .status(404)
          .send({ error: { code: "person_not_found", message: "there is no such user" } });
      }
      return await reply.send({ persons });
    },
  );

  app.get(
    "/api/admin/profiles/:key/photo",
    {
      ...admin,
      schema: {
        querystring: versionQuery,
        params: z.strictObject({ key: z.string().max(12) }),
      },
    },
    async (request, reply) => {
      const photo = profile.photoByKey(request.params.key);
      if (photo === undefined) {
        return await reply.status(404).send({ error: { code: "no_photo", message: "no photo" } });
      }
      return await reply
        .header("content-type", photo.mime)
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "private, no-cache")
        .send(photo.bytes);
    },
  );

  app.delete(
    "/api/admin/profiles/:key/:part",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: noBody,
        params: z.strictObject({ key: z.string().max(12), part: z.enum(PROFILE_REMOVABLE) }),
        response: { 204: z.null(), 404: errorBody },
      },
    },
    async (request, reply) => {
      try {
        profile.remove(request.params.key, request.params.part, actor(request));
      } catch (error) {
        const { status, body } = answer(error);
        return await reply.status(status as 404).send(body);
      }
      return await reply.status(204).send(null);
    },
  );

  return Promise.resolve();
};

export const profileRoutes = fp(profilePlugin, { name: "profile" });
