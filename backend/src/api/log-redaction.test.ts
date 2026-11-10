import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { redactUrl } from "../app.ts";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

describe("secrets in URLs", () => {
  it("[INV-02] invitation codes and link tokens are replaced in the request log", () => {
    expect(redactUrl("/api/invitations/K7QMX4")).toBe("/api/invitations/[redacted]");
    expect(redactUrl("/api/invitations/K7QMX4/register")).toBe(
      "/api/invitations/[redacted]/register",
    );
    expect(redactUrl("/invite/K7QMX4?x=1")).toBe("/invite/[redacted]?x=1");
    expect(redactUrl("/set-password/abc123")).toBe("/set-password/[redacted]");
    expect(redactUrl("/verify-email/abc123")).toBe("/verify-email/[redacted]");
    expect(redactUrl("/%69nvite/K7QMX4")).toBe("/invite/[redacted]");
    expect(redactUrl("/api/admin/invitations")).toBe("/api/admin/invitations");
  });

  it("[INV-02] the server log never contains the plain code", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    context = await createTestApp({ logger: { level: "info", stream } });
    await context.app.inject("/api/invitations/K7QMX4");
    await context.app.inject({
      method: "POST",
      url: "/api/invitations/K7QMX4/register",
      payload: {},
    });
    const log = lines.join("");
    expect(log).toContain("/api/invitations/[redacted]");
    expect(log).not.toContain("K7QMX4");
  });

  it("[INV-14] pages send no secret path to other sites in the Referer header", async () => {
    context = await createTestApp();
    const response = await context.app.inject("/api/session");
    expect(response.headers["referrer-policy"]).toBe("same-origin");
  });
});
