import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { formatEvent } from "./events.ts";

let ctx: TestContext | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

describe("Server-Sent Events", () => {
  it("[OPS-02] the heartbeat stream sends events in the text/event-stream format, then ends", async () => {
    ctx = await createTestApp();
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/events/ping?count=3&intervalMs=50",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.headers["x-robots-tag"]).toContain("noindex");
    expect(response.body).toBe(
      ": connected\n\n" +
        formatEvent("ping", { n: 1, of: 3 }) +
        formatEvent("ping", { n: 2, of: 3 }) +
        formatEvent("ping", { n: 3, of: 3 }),
    );
  });

  it("[SEC-03] the heartbeat stream validates its query", async () => {
    ctx = await createTestApp();
    for (const query of ["count=0", "count=11", "intervalMs=10", "other=1"]) {
      const response = await ctx.app.inject({ method: "GET", url: `/api/events/ping?${query}` });
      expect(response.statusCode, query).toBe(400);
    }
  });
});
