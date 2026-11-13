// The content base: reading it, editing pages, the start page text and places, and the images
// (CNT-04 – CNT-07, ROLE-06, ROLE-07; sw-architecture.md 6.2). Reading needs a signed-in user, and
// while the platform is closed only staff and admins get in (ACS-10): the routes are not on the
// list of routes open while closed. Editing needs the admin role or staff with `editWebsiteContent`.
import { readFile } from "node:fs/promises";
import fp from "fastify-plugin";
import { z } from "zod";
import {
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  contentImageSchema,
  contentResponseSchema,
  imagesQuerySchema,
  imagesResponseSchema,
  orderRequestSchema,
  pageRequestSchema,
  placeRequestSchema,
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
    const statuses = {
      slug_taken: 409,
      order_mismatch: 409,
      page_not_found: 404,
      place_not_found: 404,
      place_in_use: 409,
      image_not_found: 404,
      image_in_use: 409,
      alt_required: 400,
      image_type: 415,
      image_too_large: 413,
    } as const;
    return sendError(reply, statuses[error.code], { code: error.code, message: error.message });
  }
  throw error;
}

const contentPlugin: FastifyPluginAsyncZod<ContentOptions> = (app, { content }) => {
  const editor = { preHandler: requireContentEditor };
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;
  const response = { 200: contentResponseSchema };

  // Images are sent as their own bytes, with the image type as Content-Type (CNT-06). The limit
  // is the upload limit; a larger body is answered with 413 before it is read.
  app.addContentTypeParser(
    [...IMAGE_TYPES],
    { parseAs: "buffer", bodyLimit: IMAGE_MAX_BYTES },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.get("/api/content", { schema: { querystring: noQuery, response } }, () => content.get());

  app.put(
    "/api/content/start",
    {
      ...editor,
      schema: { querystring: noQuery, body: startRequestSchema, response },
    },
    async (request, reply) => {
      try {
        content.setStart(request.body, actor(request));
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
        await content.deletePage(request.params.id, actor(request));
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

  app.post(
    "/api/content/places",
    {
      ...editor,
      schema: { querystring: noQuery, body: placeRequestSchema, response },
    },
    async (request, reply) => {
      try {
        content.createPlace(request.body, actor(request));
        return await reply.send(content.get());
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.put(
    "/api/content/places/:id",
    {
      ...editor,
      schema: {
        querystring: noQuery,
        params: pageParams,
        body: placeRequestSchema,
        response,
      },
    },
    async (request, reply) => {
      try {
        content.updatePlace(request.params.id, request.body, actor(request));
        return await reply.send(content.get());
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.delete(
    "/api/content/places/:id",
    {
      ...editor,
      schema: { querystring: noQuery, params: pageParams, body: noBody, response },
    },
    async (request, reply) => {
      try {
        await content.deletePlace(request.params.id, actor(request));
        return await reply.send(content.get());
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.get(
    "/api/content/images",
    {
      ...editor,
      schema: {
        querystring: imagesQuerySchema,
        response: { 200: imagesResponseSchema },
      },
    },
    async (request, reply) => {
      return await reply.send({ images: content.images(request.query.item) });
    },
  );

  app.post(
    "/api/content/images",
    {
      ...editor,
      schema: {
        querystring: imagesQuerySchema,
        body: z.instanceof(Buffer),
        response: { 200: z.object({ image: contentImageSchema }) },
      },
    },
    async (request, reply) => {
      try {
        const image = await content.saveImage(request.body, request.query.item, actor(request));
        return await reply.send({ image });
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.delete(
    "/api/content/images/:id",
    {
      ...editor,
      schema: { querystring: noQuery, params: pageParams, body: noBody },
    },
    async (request, reply) => {
      try {
        await content.deleteImage(request.params.id, actor(request));
        return await reply.status(204).send();
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // Served to signed-in users only (CNT-06); the browser may keep the file, nobody else may.
  app.get(
    "/api/content/images/:id",
    {
      schema: { querystring: noQuery, params: pageParams },
    },
    async (request, reply) => {
      try {
        const stored = content.image(request.params.id);
        const bytes = await readFile(stored.path);
        return await reply
          .header("Content-Type", stored.mime)
          .header("Cache-Control", "private, max-age=86400")
          .header("X-Content-Type-Options", "nosniff")
          .send(bytes);
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  return Promise.resolve();
};

export const contentRoutes = fp(contentPlugin, { name: "content" });
