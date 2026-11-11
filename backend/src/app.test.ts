import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, signIn, tempDir } from "./test-support.ts";
import type { TestContext } from "./test-support.ts";

let ctx: TestContext | undefined;
const cleanups: (() => void)[] = [];
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

function frontend(): string {
  const dir = tempDir("zappaloo-frontend-");
  cleanups.push(dir.remove);
  mkdirSync(join(dir.path, "assets"));
  writeFileSync(join(dir.path, "index.html"), "<!doctype html><div id=root></div>");
  return dir.path;
}

const html = { accept: "text/html,application/xhtml+xml" };

describe("serving the built frontend", () => {
  it("answers page navigations to client-side routes with index.html", async () => {
    ctx = await createTestApp({ frontendDir: frontend() });
    const response = await ctx.app.inject({ method: "GET", url: "/game", headers: html });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/html/);
    expect(response.body).toContain("<div id=root>");
  });

  it("answers a missing script with 404, not with index.html", async () => {
    ctx = await createTestApp({ frontendDir: frontend() });
    const response = await ctx.app.inject({ method: "GET", url: "/assets/index-old.js" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
  });

  it("serves files that were added after startup (rebuilt frontend)", async () => {
    const dir = frontend();
    ctx = await createTestApp({ frontendDir: dir });
    await ctx.app.ready();
    writeFileSync(join(dir, "assets", "index-new.js"), "export {};");
    const response = await ctx.app.inject({ method: "GET", url: "/assets/index-new.js" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/javascript/);
  });

  it("keeps API 404s as JSON, even for browsers", async () => {
    ctx = await createTestApp({ frontendDir: frontend() });
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/nope",
      headers: { ...html, ...(await signIn(ctx)) },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("refuses to start without a built frontend in FRONTEND_DIR", async () => {
    const empty = tempDir();
    cleanups.push(empty.remove);
    await expect(createTestApp({ frontendDir: empty.path })).rejects.toThrow(/no index.html/);
  });
});
