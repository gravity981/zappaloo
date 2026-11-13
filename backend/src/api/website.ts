// The start page's and the programme's computed parts (sw-architecture.md 5.5, 5.6; WEB-07,
// WEB-09, WEB-10): `GET /api/website` and `GET /api/programme`, signed in.
import fp from "fastify-plugin";
import { z } from "zod";
import { programmeResponseSchema, websiteResponseSchema } from "@zappaloo/shared";
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
    (request) => website.website(signedIn(request).user.id),
  );
  // The program items the guest is invited to (WEB-09); none for a user who is not a guest.
  app.get(
    "/api/programme",
    {
      schema: {
        querystring: z.strictObject({}),
        response: { 200: programmeResponseSchema },
      },
    },
    (request) => website.programme(signedIn(request).user.id),
  );
  return Promise.resolve();
};

export const websiteRoutes = fp(websitePlugin, { name: "website" });
