// The dialogues of the game world (sw-architecture.md 6.2, 14.4; CNT-02, CNT-08): admins edit them in Erlebniswelt ›
// Dialoge; a signed-in guest reads the one a clickable object shows, and its portrait. A portrait is sent as its own
// bytes with its image type as Content-Type, a body parser that the content routes register for the whole app (CNT-06).
import fp from "fastify-plugin";
import { z } from "zod";
import {
  dialogueDetailSchema,
  dialogueGuestSchema,
  dialogueRequestSchema,
  dialogueUseSchema,
  dialoguesResponseSchema,
} from "@zappaloo/shared";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { DialogueError } from "../dialogue/service.ts";
import type { DialogueService } from "../dialogue/service.ts";
import type { WorldService } from "../world/service.ts";
import { requireRole, requireUser, signedIn } from "./auth.ts";
import { worldGuestAccess } from "./world-access.ts";

const noQuery = z.strictObject({});
const noBody = z.null().optional();
const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  /** For `dialogue_in_use`: the objects that show the dialogue. */
  used: z.array(dialogueUseSchema).optional(),
});
const idParams = z.strictObject({ id: z.string().min(1).max(40) });

const STATUS = {
  dialogue_not_found: 404,
  dialogue_in_use: 409,
  portrait_too_large: 413,
  portrait_type: 415,
  portrait_invalid: 422,
} as const;

interface DialogueOptions {
  dialogue: DialogueService;
  world: WorldService;
}

const dialoguePlugin: FastifyPluginAsyncZod<DialogueOptions> = (app, { dialogue, world }) => {
  const admin = { preHandler: requireRole("admin") };
  const access = worldGuestAccess(world);
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;

  /** A refused change as the error body with its status; anything else is not ours to answer. */
  const fail = async (reply: FastifyReply, error: unknown) => {
    if (error instanceof DialogueError) {
      return await reply.status(STATUS[error.code] as 404).send({
        error: { code: error.code, message: error.message },
        ...(error.used.length > 0 ? { used: error.used } : {}),
      });
    }
    throw error;
  };

  app.get(
    "/api/admin/dialogues",
    { ...admin, schema: { querystring: noQuery, response: { 200: dialoguesResponseSchema } } },
    () => ({ dialogues: dialogue.list() }),
  );

  app.get(
    "/api/admin/dialogues/:id",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: idParams,
        response: { 200: dialogueDetailSchema, 404: errorBody },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(dialogue.get(request.params.id));
      } catch (error) {
        return await fail(reply, error);
      }
    },
  );

  app.post(
    "/api/admin/dialogues",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: dialogueRequestSchema,
        response: { 201: dialogueDetailSchema },
      },
    },
    async (request, reply) => {
      try {
        return await reply.status(201).send(dialogue.create(request.body, actor(request)));
      } catch (error) {
        return await fail(reply, error);
      }
    },
  );

  app.put(
    "/api/admin/dialogues/:id",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: dialogueRequestSchema,
        response: { 200: dialogueDetailSchema, 404: errorBody },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(dialogue.update(request.params.id, request.body, actor(request)));
      } catch (error) {
        return await fail(reply, error);
      }
    },
  );

  app.delete(
    "/api/admin/dialogues/:id",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: noBody,
        response: { 204: z.null(), 404: errorBody, 409: errorBody },
      },
    },
    async (request, reply) => {
      try {
        dialogue.delete(request.params.id, actor(request));
        return await reply.status(204).send(null);
      } catch (error) {
        return await fail(reply, error);
      }
    },
  );

  app.put(
    "/api/admin/dialogues/:id/portrait",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: z.instanceof(Buffer),
        response: {
          200: dialogueDetailSchema,
          404: errorBody,
          413: errorBody,
          415: errorBody,
          422: errorBody,
        },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(
          await dialogue.setPortrait(request.params.id, request.body, actor(request)),
        );
      } catch (error) {
        return await fail(reply, error);
      }
    },
  );

  app.delete(
    "/api/admin/dialogues/:id/portrait",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        params: idParams,
        body: noBody,
        response: { 200: dialogueDetailSchema, 404: errorBody },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(dialogue.deletePortrait(request.params.id, actor(request)));
      } catch (error) {
        return await fail(reply, error);
      }
    },
  );

  // What the game shows when an object with the action `dialog` is activated (CNT-02).
  app.get(
    "/api/dialogues/:id",
    {
      preHandler: [requireUser, access],
      schema: {
        querystring: noQuery,
        params: idParams,
        response: { 200: dialogueGuestSchema, 404: errorBody },
      },
    },
    async (request, reply) => {
      try {
        return await reply.send(dialogue.forGuest(request.params.id));
      } catch (error) {
        return await fail(reply, error);
      }
    },
  );

  // The portrait; the version in the address lets the browser keep it (and a new one is a new address).
  app.get(
    "/api/dialogues/:id/portrait",
    {
      preHandler: [requireUser, access],
      schema: {
        querystring: z.strictObject({ v: z.string().max(20).optional() }),
        params: idParams,
      },
    },
    async (request, reply) => {
      const portrait = dialogue.portrait(request.params.id);
      if (portrait === undefined) {
        return await reply
          .status(404)
          .send({ error: { code: "no_portrait", message: "no portrait" } });
      }
      return await reply
        .header("content-type", portrait.mime)
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "private, max-age=31536000, immutable")
        .send(portrait.bytes);
    },
  );

  return Promise.resolve();
};

export const dialogueRoutes = fp(dialoguePlugin, { name: "dialogues" });
