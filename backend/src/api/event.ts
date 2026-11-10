// The event of the installation (sw-architecture.md 19.3.1): `GET /api/event`
// and the guard every feature route uses to be unavailable when its feature is
// switched off (CFG-03).
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { eventResponseSchema } from "@zappaloo/shared";
import type { FeatureName } from "@zappaloo/shared";
import type { EventService } from "../event/service.ts";
import { sendError } from "./validation.ts";

export interface EventApiOptions {
  event: EventService;
}

export const eventApiRoutes: FastifyPluginCallbackZod<EventApiOptions> = (app, options, done) => {
  app.get(
    "/api/event",
    { schema: { querystring: z.strictObject({}), response: { 200: eventResponseSchema } } },
    () => options.event.get(),
  );
  done();
};

/**
 * `preHandler` for the routes of a feature: answers 404 `feature_disabled` while
 * the feature is switched off. The state is read on every request, so a change
 * at runtime applies at once.
 */
export function requireFeature(event: EventService, name: FeatureName) {
  return async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> => {
    if (event.isFeatureEnabled(name)) return undefined;
    // Returning the reply ends the request here: the handler is not called.
    return sendError(reply, 404, {
      code: "feature_disabled",
      message: `The feature "${name}" is not enabled for this event.`,
    });
  };
}
