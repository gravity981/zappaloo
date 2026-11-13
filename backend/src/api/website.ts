// The start page's computed parts (sw-architecture.md 5.6, WEB-11): `GET /api/website`, signed in.
import fp from "fastify-plugin";
import { z } from "zod";
import { websiteResponseSchema } from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { WebsiteService } from "../website/service.ts";
import { signedIn } from "./auth.ts";

interface WebsiteOptions {
  website: WebsiteService;
}

const websitePlugin: FastifyPluginAsyncZod<WebsiteOptions> = (app, { website }) => {
  app.get(
    "/api/website",
    {
      schema: {
        querystring: z.strictObject({}),
        response: { 200: websiteResponseSchema },
      },
    },
    (request) => {
      signedIn(request);
      return website.website();
    },
  );
  return Promise.resolve();
};

export const websiteRoutes = fp(websitePlugin, { name: "website" });
