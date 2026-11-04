import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createTestApp, tempDir } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { X_ROBOTS_TAG } from "./no-index.ts";

let ctx: TestContext | undefined;
const cleanups: (() => void)[] = [];
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

function fakeFrontend(): string {
  const dir = tempDir("zappaloo-frontend-");
  cleanups.push(dir.remove);
  mkdirSync(join(dir.path, "assets"));
  writeFileSync(join(dir.path, "index.html"), "<!doctype html><title>Zappaloo</title>");
  writeFileSync(join(dir.path, "assets", "app.js"), "console.log(1)");
  return dir.path;
}

describe("no search engine indexing", () => {
  it("[SEC-10] robots.txt disallows all crawlers", async () => {
    ctx = await createTestApp();
    const response = await ctx.app.inject({ method: "GET", url: "/robots.txt" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/plain/);
    expect(response.body).toBe("User-agent: *\nDisallow: /\n");
  });

  it("[SEC-10] every response carries X-Robots-Tag noindex: API, errors, pages and assets", async () => {
    ctx = await createTestApp({ frontendDir: fakeFrontend() });
    ctx.app.get("/api/broken", { schema: { querystring: z.object({}) } }, () => {
      throw new Error("boom");
    });

    const requests = [
      { url: "/api/health", status: 200 },
      { url: "/api/version", status: 200 },
      { url: "/api/health?unknown=1", status: 400 },
      { url: "/api/does-not-exist", status: 404 },
      { url: "/api/broken", status: 500 },
      { url: "/robots.txt", status: 200 },
      { url: "/", status: 200, html: true },
      { url: "/some/client/route", status: 200, html: true },
      { url: "/assets/missing.js", status: 404 },
      { url: "/assets/app.js", status: 200 },
    ];
    for (const { url, status, html } of requests) {
      const headers = html ? { accept: "text/html" } : {};
      const response = await ctx.app.inject({ method: "GET", url, headers });
      expect(response.statusCode, url).toBe(status);
      expect(response.headers["x-robots-tag"], url).toBe(X_ROBOTS_TAG);
      expect(X_ROBOTS_TAG).toContain("noindex");
    }
  });
});
