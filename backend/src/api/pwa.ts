// The web app manifest and the app icons (PWA-01, PWA-02; sw-architecture.md 19.5). Both sit
// outside /api, so they need no sign-in and answer while the platform is closed: the browser
// fetches them without credentials when a guest adds the site to the home screen.
import fp from "fastify-plugin";
import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { EventService } from "../event/service.ts";
import { ICON_NAMES } from "../pwa/app-icons.ts";
import type { AppIcons } from "../pwa/app-icons.ts";

export interface PwaOptions {
  event: EventService;
  icons: AppIcons;
}

const noQuery = z.strictObject({});
const iconParams = z.strictObject({ file: z.enum(ICON_NAMES) });

const pwaPlugin: FastifyPluginAsyncZod<PwaOptions> = (app, { event, icons }) => {
  app.get("/manifest.webmanifest", { schema: { querystring: noQuery } }, (_request, reply) =>
    reply
      .type("application/manifest+json; charset=utf-8")
      // Name and icons follow a change of the event at once.
      .header("cache-control", "no-cache")
      .send(icons.manifest(event.get())),
  );

  // The query `v` is the icon's version (the manifest asks with it); it is not checked.
  app.get(
    "/app-icons/:file",
    { schema: { params: iconParams, querystring: z.looseObject({ v: z.string().optional() }) } },
    (request, reply) =>
      reply
        .type("image/png")
        .header("cache-control", "public, max-age=3600")
        .send(icons.icon(event.eventId, request.params.file).bytes),
  );

  return Promise.resolve();
};

export const pwaRoutes = fp(pwaPlugin, { name: "pwa" });
