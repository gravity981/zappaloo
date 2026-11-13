// The content base: reading it and editing pages and the start page text (CNT-04, CNT-05,
// ROLE-06, ROLE-07; sw-architecture.md 6.2). Reading needs a signed-in user, and while the
// platform is closed only staff and admins get in (ACS-10): the route is not on the list of
// routes open while closed. Editing needs the admin role or staff with `editWebsiteContent`.
import fp from "fastify-plugin";
import { z } from "zod";
import {
  contentResponseSchema,
  orderRequestSchema,
  pageRequestSchema,
  startRequestSchema,
} from "@zappaloo/shared";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { ContentError } from "../content/service.ts";
import type { ContentService } from "../content/service.ts";
import { requireContentEditor, signedIn } from "./auth.ts";
import { sendError } from "./validation.ts";

const noQuery = z.strictObject({});
const noBody = z.null().optional();
const pageParams = z.strictObject({ id: z.coerce.number().int().positive() });

interface ContentOptions {
  content: ContentService;
}

/** Answers the content errors with their code; rethrows anything else. */
function fail(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ContentError) {
    const statuses = { slug_taken: 409, order_mismatch: 409, page_not_found: 404 } as const;
    return sendError(reply, statuses[error.code], { code: error.code, message: error.message });
  }
  throw error;
}

const contentPlugin: FastifyPluginAsyncZod<ContentOptions> = (app, { content }) => {
  const editor = { preHandler: requireContentEditor };
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;
  const response = { 200: contentResponseSchema };

  app.get("/api/content", { schema: { querystring: noQuery, response } }, () => content.get());

  app.put(
    "/api/content/start",
    {
      ...editor,
      schema: { querystring: noQuery, body: startRequestSchema, response },
    },
    async (request, reply) => {
      try {
        content.setStart(request.body.markdown, actor(request));
        return await reply.send(content.get());
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.post(
    "/api/content/pages",
    {
      ...editor,
      schema: { querystring: noQuery, body: pageRequestSchema, response },
    },
    async (request, reply) => {
      try {
        content.createPage(request.body, actor(request));
        return await reply.send(content.get());
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.put(
    "/api/content/pages/:id",
    {
      ...editor,
      schema: {
        querystring: noQuery,
        params: pageParams,
        body: pageRequestSchema,
        response,
      },
    },
    async (request, reply) => {
      try {
        content.updatePage(request.params.id, request.body, actor(request));
        return await reply.send(content.get());
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.delete(
    "/api/content/pages/:id",
    {
      ...editor,
      schema: { querystring: noQuery, params: pageParams, body: noBody, response },
    },
    async (request, reply) => {
      try {
        content.deletePage(request.params.id, actor(request));
        return await reply.send(content.get());
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.put(
    "/api/content/order",
    {
      ...editor,
      schema: { querystring: noQuery, body: orderRequestSchema, response },
    },
    async (request, reply) => {
      try {
        content.reorder(request.body, actor(request));
        return await reply.send(content.get());
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  return Promise.resolve();
};

export const contentRoutes = fp(contentPlugin, { name: "content" });
