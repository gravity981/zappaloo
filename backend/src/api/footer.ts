// The footer's license text, and the admin's copyright line (LIC-02, LIC-03; sw-architecture.md
// 19.6). The line itself is read with `GET /api/site` (public).
import fp from "fastify-plugin";
import { z } from "zod";
import { footerConfigSchema, footerUpdateSchema, licenseResponseSchema } from "@zappaloo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { PUBLIC } from "./access.ts";
import { requireRole, signedIn } from "./auth.ts";
import type { AuthOptions } from "./auth.ts";

const noQuery = z.strictObject({});

const footerPlugin: FastifyPluginAsyncZod<AuthOptions> = (app, { footer }) => {
  // Public: the page /license is reachable from every footer, also without sign-in.
  app.get(
    "/api/license",
    { config: PUBLIC, schema: { querystring: noQuery, response: { 200: licenseResponseSchema } } },
    () => ({ text: footer.license() }),
  );

  const admin = { preHandler: requireRole("admin") };

  app.get(
    "/api/admin/footer",
    { ...admin, schema: { querystring: noQuery, response: { 200: footerConfigSchema } } },
    () => footer.config(),
  );

  app.put(
    "/api/admin/footer",
    {
      ...admin,
      schema: {
        querystring: noQuery,
        body: footerUpdateSchema,
        response: { 200: footerConfigSchema },
      },
    },
    (request) => footer.set(request.body.copyright, `user:${String(signedIn(request).user.id)}`),
  );

  return Promise.resolve();
};

export const footerRoutes = fp(footerPlugin, { name: "footer" });
