import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { apiErrorSchema } from "@zappaloo/shared";
import { createTestApp } from "../test-support.ts";
import { PUBLIC } from "./access.ts";
import type { TestContext } from "../test-support.ts";
import { assertInputSchemas, MissingSchemaError } from "./validation.ts";

let ctx: TestContext | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

/** A route like the ones later stages add: params, query and body, all with schemas. */
function addExampleRoute(app: FastifyInstance): void {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/example/:id",
    {
      config: PUBLIC, // this file tests validation, not sign-in
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        querystring: z.strictObject({ dryRun: z.enum(["true", "false"]).optional() }),
        body: z.strictObject({ name: z.string().min(1).max(50), guests: z.number().int().min(0) }),
      },
    },
    (request) => ({ id: request.params.id, name: request.body.name }),
  );
}

describe("API input validation", () => {
  it("[SEC-03] accepts valid input", async () => {
    ctx = await createTestApp();
    addExampleRoute(ctx.app);
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/example/7?dryRun=true",
      payload: { name: "Anna", guests: 2 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: 7, name: "Anna" });
  });

  it("[SEC-03] rejects an invalid body with 400 and names the invalid fields", async () => {
    ctx = await createTestApp();
    addExampleRoute(ctx.app);
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/example/7",
      payload: { name: "", guests: 1.5, admin: true },
    });
    expect(response.statusCode).toBe(400);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.issues?.every((issue) => issue.location === "body")).toBe(true);
    const paths = body.error.issues?.map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(["name", "guests"]));
    // Unknown fields are rejected too (strict schema).
    expect(body.error.issues?.some((issue) => issue.message.includes("admin"))).toBe(true);
  });

  it("[SEC-03] rejects invalid path parameters and query strings", async () => {
    ctx = await createTestApp();
    addExampleRoute(ctx.app);
    const badParam = await ctx.app.inject({
      method: "POST",
      url: "/api/example/abc",
      payload: { name: "Anna", guests: 2 },
    });
    expect(badParam.statusCode).toBe(400);
    expect(apiErrorSchema.parse(badParam.json()).error.issues?.[0]?.location).toBe("params");

    const badQuery = await ctx.app.inject({
      method: "POST",
      url: "/api/example/7?dryRun=maybe",
      payload: { name: "Anna", guests: 2 },
    });
    expect(badQuery.statusCode).toBe(400);
    expect(apiErrorSchema.parse(badQuery.json()).error.issues?.[0]?.location).toBe("querystring");
  });

  it("[SEC-03] rejects malformed JSON and a missing body", async () => {
    ctx = await createTestApp();
    addExampleRoute(ctx.app);
    const malformed = await ctx.app.inject({
      method: "POST",
      url: "/api/example/7",
      headers: { "content-type": "application/json" },
      payload: '{"name": "Anna",',
    });
    expect(malformed.statusCode).toBe(400);
    expect(apiErrorSchema.safeParse(malformed.json()).success).toBe(true);

    const missing = await ctx.app.inject({ method: "POST", url: "/api/example/7" });
    expect(missing.statusCode).toBe(400);
    expect(apiErrorSchema.parse(missing.json()).error.code).toBe("validation_failed");
  });

  it("[SEC-03] rejects unknown query parameters on the system endpoints", async () => {
    ctx = await createTestApp();
    for (const url of ["/api/health?debug=1", "/api/version?x=y"]) {
      const response = await ctx.app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(400);
    }
  });

  it("[SEC-03] refuses to start when an API route lacks a schema for one of its inputs", async () => {
    ctx = await createTestApp();
    expect(() => {
      ctx?.app.post("/api/unchecked", { schema: { querystring: z.object({}) } }, () => "ok");
    }).toThrow(MissingSchemaError);
  });
});

describe("assertInputSchemas", () => {
  const q = z.object({});

  it("[SEC-03] requires query, params and body schemas where the route has these inputs", () => {
    expect(() => {
      assertInputSchemas({ url: "/api/a", method: "GET", schema: {} });
    }).toThrow(/missing: querystring/);
    expect(() => {
      assertInputSchemas({ url: "/api/a/:id", method: "GET", schema: { querystring: q } });
    }).toThrow(/missing: params/);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      expect(() => {
        assertInputSchemas({ url: "/api/a", method, schema: { querystring: q } });
      }).toThrow(/missing: body/);
    }
  });

  it("[SEC-03] accepts complete schemas and ignores routes outside /api", () => {
    expect(() => {
      assertInputSchemas({
        url: "/api/a/:id",
        method: ["GET", "POST"],
        schema: { querystring: q, params: q, body: q },
      });
    }).not.toThrow();
    expect(() => {
      assertInputSchemas({ url: "/robots.txt", method: "GET", schema: {} });
    }).not.toThrow();
  });
});
