// Opening and closing the platform, and the privacy notice (ACS-10, ACS-14, SEC-09;
// sw-architecture.md 10.4, 24).
import fp from "fastify-plugin";
import { z } from "zod";
import {
  openPlatformRequestSchema,
  openPlatformResponseSchema,
  platformStatusSchema,
  privacyConfigSchema,
  privacyResponseSchema,
  privacyUpdateSchema,
} from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { OPEN_PLATFORM_PER_ADMIN } from "../auth/rate-limit.ts";
import { PlatformError } from "../event/platform.ts";
import { PUBLIC } from "./access.ts";
import { rateLimited, requireRole, signedIn } from "./auth.ts";
import type { AuthOptions } from "./auth.ts";
import { sendError } from "./validation.ts";

const noQuery = z.strictObject({});
const noBody = z.null().optional();

const platformPlugin: FastifyPluginAsyncZod<AuthOptions> = (app, { platform, limiter }) => {
  const admin = { preHandler: requireRole("admin") };
  const actor = (request: Parameters<typeof signedIn>[0]) =>
    `user:${String(signedIn(request).user.id)}`;

  app.get(
    "/api/admin/platform",
    { ...admin, schema: { querystring: noQuery, response: { 200: platformStatusSchema } } },
    () => platform.status(),
  );

  app.post(
    "/api/admin/platform/open",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: openPlatformRequestSchema,
        response: { 200: openPlatformResponseSchema },
      },
    },
    async (request, reply) => {
      if (request.body.sendEmail) {
        const wait = limiter.hit(
          `open-platform:${String(signedIn(request).user.id)}`,
          OPEN_PLATFORM_PER_ADMIN,
        );
        if (wait !== undefined) return rateLimited(reply, wait);
      }
      try {
        const result = await platform.open(request.body.sendEmail, actor(request), (error) => {
          request.log.error({ err: error }, "sending a door-open email failed");
        });
        return await reply.send(result);
      } catch (error) {
        if (error instanceof PlatformError) {
          const status = error.code === "mail_unavailable" ? 503 : 409;
          return sendError(reply, status, { code: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/admin/platform/close",
    { ...admin, schema: { querystring: noQuery, body: noBody } },
    async (request, reply) => {
      try {
        platform.close(actor(request));
        return await reply.status(204).send();
      } catch (error) {
        if (error instanceof PlatformError) {
          return sendError(reply, 409, { code: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  // The privacy notice is public: reachable from every page, also without sign-in (SEC-09).
  app.get(
    "/api/privacy",
    {
      config: PUBLIC,
      schema: { querystring: noQuery, response: { 200: privacyResponseSchema } },
    },
    () => platform.privacy(),
  );

  app.get(
    "/api/admin/privacy",
    { ...admin, schema: { querystring: noQuery, response: { 200: privacyConfigSchema } } },
    () => platform.privacyConfig(),
  );

  app.put(
    "/api/admin/privacy",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: privacyUpdateSchema,
        response: { 200: privacyConfigSchema },
      },
    },
    (request) => platform.setPrivacy(request.body.markdown, actor(request)),
  );

  return Promise.resolve();
};

export const platformRoutes = fp(platformPlugin, { name: "platform" });
