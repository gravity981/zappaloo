// Access control on the server (ACS-05 – ACS-07, ACS-09; sw-architecture.md 10, 11).
//
// Every route under /api needs a signed-in user unless it says `config: { public: true }`.
// The rule is central (a hook in the auth plugin), so a route added later cannot forget the
// check; making a route public is a deliberate line in the route and in the list a test pins.
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { AccessCondition } from "@zappaloo/shared";
import type { AccessService } from "../auth/access.ts";
import { sendError } from "./validation.ts";

declare module "fastify" {
  interface FastifyContextConfig {
    /** Reachable without sign-in (ACS-09). Everything else under /api needs a session. */
    public?: boolean;
  }
  interface FastifyInstance {
    /** Every route that was registered, with whether it is public (for tests and audits). */
    routeTable: RouteEntry[];
  }
}

export interface RouteEntry {
  method: string;
  url: string;
  public: boolean;
}

/** The route marker: no sign-in needed (ACS-09). */
export const PUBLIC = { public: true } as const;

/** True for API requests that need a signed-in user: all of /api except public routes. */
export function needsSignIn(request: FastifyRequest): boolean {
  return request.url.startsWith("/api/") && request.routeOptions.config.public !== true;
}

/** Records the routes registered after it; register it first. */
export const routeTable = fp(
  (app) => {
    app.decorate("routeTable", [] as RouteEntry[]);
    app.addHook("onRoute", (route) => {
      for (const method of [route.method].flat()) {
        app.routeTable.push({ method, url: route.url, public: route.config?.public === true });
      }
    });
    return Promise.resolve();
  },
  { name: "route-table" },
);

/**
 * `preHandler`: 403 unless the signed-in user meets the condition (ACS-05, ACS-06). Evaluated
 * on every request, so a revoked role or a withdrawn release applies at once (11.1).
 */
export function requireAccess(access: AccessService, condition: AccessCondition) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> => {
    if (!request.auth) {
      return sendError(reply, 401, { code: "unauthorized", message: "Sign in first." });
    }
    if (access.check(request.auth.user, condition)) return undefined;
    return sendError(reply, 403, {
      code: "forbidden",
      message: "You do not have access to this.",
    });
  };
}
