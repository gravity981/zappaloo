// Schema validation of all API inputs (SEC-03).
//
// - Every route under /api must declare Zod schemas for all its inputs:
//   query string always, path parameters when the URL has any, and a body for
//   methods that carry one. A route without them fails at startup.
// - Invalid input is rejected with 400 and a uniform error body (shared ApiError).
import type { FastifyError, FastifyInstance, FastifyReply, RouteOptions } from "fastify";
import fp from "fastify-plugin";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { ApiError } from "@zappaloo/shared";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class MissingSchemaError extends Error {
  override name = "MissingSchemaError";
}

/** Throws if an /api route does not declare a schema for each of its inputs. */
export function assertInputSchemas(route: Pick<RouteOptions, "url" | "method" | "schema">): void {
  if (!route.url.startsWith("/api/") && route.url !== "/api") return;
  const methods = [route.method].flat();
  const where = `${methods.join(",")} ${route.url}`;
  const schema = route.schema ?? {};
  const missing: string[] = [];

  if (!schema.querystring) missing.push("querystring");
  if (route.url.includes(":") && !schema.params) missing.push("params");
  if (methods.some((m) => METHODS_WITH_BODY.has(m)) && !schema.body) missing.push("body");

  if (missing.length > 0) {
    throw new MissingSchemaError(
      `${where}: every API input needs a schema (SEC-03); missing: ${missing.join(", ")}`,
    );
  }
}

export function sendError(
  reply: FastifyReply,
  status: number,
  error: ApiError["error"],
): FastifyReply {
  return reply
    .status(status)
    .type("application/json")
    .send({ error } satisfies ApiError);
}

function validationPlugin(app: FastifyInstance): void {
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook("onRoute", assertInputSchemas);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendError(reply, 400, {
        code: "validation_failed",
        message: "The request contains invalid input.",
        issues: error.validation.map((issue) => ({
          location: error.validationContext ?? "request",
          path: issue.instancePath.replace(/^\//, "").replaceAll("/", "."),
          message: issue.message ?? "invalid",
        })),
      });
    }
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return sendError(reply, status, {
        code: error.code.toLowerCase(),
        message: error.message,
      });
    }
    request.log.error(error);
    return sendError(reply, 500, { code: "internal_error", message: "Internal server error." });
  });
}

export const validation = fp(validationPlugin, { name: "validation" });
