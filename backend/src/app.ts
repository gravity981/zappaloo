// Assembles the Fastify application. Separate from server.ts so that tests can
// build the app and call it with app.inject() without opening a port.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyServerOptions } from "fastify";
import type { VersionResponse } from "@zappaloo/shared";
import type { Database } from "./database/database.ts";
import type { EventService } from "./event/service.ts";
import { routeTable } from "./api/access.ts";
import { adminRoutes } from "./api/admin.ts";
import { authRoutes } from "./api/auth.ts";
import { contentRoutes } from "./api/content.ts";
import { websiteRoutes } from "./api/website.ts";
import { WebsiteService } from "./website/service.ts";
import { ContentService } from "./content/service.ts";
import type { AuthOptions } from "./api/auth.ts";
import { invitationRoutes } from "./api/invitations.ts";
import { eventApiRoutes } from "./api/event.ts";
import { footerRoutes } from "./api/footer.ts";
import { eventRoutes } from "./api/events.ts";
import { noIndex } from "./api/no-index.ts";
import { platformRoutes } from "./api/platform.ts";
import { pwaRoutes } from "./api/pwa.ts";
import { rsvpRoutes } from "./api/rsvp.ts";
import { systemRoutes } from "./api/system.ts";
import { waitingRoutes } from "./api/waiting.ts";
import { sendError, validation } from "./api/validation.ts";
import { AppIcons } from "./pwa/app-icons.ts";

export interface AppOptions {
  database: Database;
  /** The installation's event, with its feature toggles and settings. */
  event: EventService;
  /** Accounts, sessions and their settings (sw-architecture.md 7.1.1). */
  auth: AuthOptions;
  /** Use X-Forwarded-For for the client address (Caddy is the only way in). */
  trustProxy?: boolean;
  version: VersionResponse;
  /** `$DATA_DIR/events`: the event's own files, here its app icons (19.2, 19.5). */
  eventsDir: string;
  /** Built frontend to serve; omitted in dev, where Vite serves the frontend. */
  frontendDir?: string | undefined;
  logger?: FastifyServerOptions["logger"];
}

/**
 * Paths whose last part is a secret: invitation codes (INV-02) and one-time link tokens. They
 * are replaced in the request log, which would otherwise keep them in the container logs.
 */
const SECRET_PATHS = /^(\/(?:api\/invitations|invite|set-password|verify-email)\/)[^/?#]+/;

export function redactUrl(url: string): string {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Not decodable: Fastify refuses it before any route runs; log it as it came.
  }
  return decoded.replace(SECRET_PATHS, "$1[redacted]");
}

/** Fastify's request serializer, with the secrets taken out of the URL. */
function serializeRequest(request: FastifyRequest) {
  return {
    method: request.method,
    url: redactUrl(request.url),
    host: request.host,
    remoteAddress: request.ip,
  };
}

function withRedaction(logger: AppOptions["logger"]): FastifyServerOptions["logger"] {
  if (!logger) return false;
  return { ...(logger === true ? {} : logger), serializers: { req: serializeRequest } };
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: withRedaction(options.logger),
    trustProxy: options.trustProxy ?? false,
  });

  await app.register(validation);
  await app.register(noIndex);
  await app.register(routeTable);
  // The auth plugin comes first: its hook decides who may call what (ACS-09).
  await app.register(authRoutes, options.auth);
  await app.register(systemRoutes, { database: options.database, version: options.version });
  await app.register(eventRoutes);
  await app.register(adminRoutes, options.auth);
  await app.register(invitationRoutes, options.auth);
  await app.register(rsvpRoutes, options.auth);
  await app.register(waitingRoutes, options.auth);
  await app.register(platformRoutes, options.auth);
  await app.register(footerRoutes, options.auth);
  await app.register(contentRoutes, {
    content: new ContentService(options.database, options.event, options.eventsDir),
  });
  await app.register(websiteRoutes, {
    website: new WebsiteService(options.database, options.event),
  });
  await app.register(eventApiRoutes, { event: options.event, footer: options.auth.footer });
  await app.register(pwaRoutes, {
    event: options.event,
    icons: new AppIcons(options.eventsDir),
  });

  const frontendDir = options.frontendDir && resolve(options.frontendDir);
  if (frontendDir) {
    if (!existsSync(join(frontendDir, "index.html"))) {
      throw new Error(
        `FRONTEND_DIR ${frontendDir} contains no index.html (build the frontend first)`,
      );
    }
    // Files are looked up per request, so a rebuilt frontend is served without a restart.
    await app.register(fastifyStatic, { root: frontendDir });
  }

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    // Page navigations to client-side routes get index.html; the router shows its own 404.
    // Anything else that is missing (a script, an image, an API route) gets a real 404.
    const isNavigation = request.headers.accept?.includes("text/html") ?? false;
    if (frontendDir && request.method === "GET" && isNavigation && !path.startsWith("/api/")) {
      return reply.type("text/html; charset=utf-8").sendFile("index.html");
    }
    return sendError(reply, 404, {
      code: "not_found",
      message: `No route for ${request.method} ${path}`,
    });
  });

  return app;
}
