// A guest who is already signed in opens the link of an email (confirm the address, set a
// password, forgot the password): the page has no CSRF token for a public route, and the request
// must still work (SEC-01, ACC-09, ACC-10). Found on prod: "Sitzung abgelaufen".
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

/** A signed-in guest; the headers carry the session cookie only, as a page without a token would. */
async function guestWithCookie(ctx: TestContext) {
  const headers = await signIn(ctx, "gast", ["vip"]);
  const session = await ctx.app.inject({
    url: "/api/session",
    headers: { cookie: headers.cookie },
  });
  const user = session.json<{ user: { id: number } }>().user;
  return { cookie: { cookie: headers.cookie }, withToken: headers, user };
}

describe("public routes for a signed-in visitor (SEC-01)", () => {
  it("[SEC-01][ACC-09] confirming the email address works with a session cookie and no CSRF token", async () => {
    context = await createTestApp();
    const ctx = context;
    const { cookie, user } = await guestWithCookie(ctx);
    ctx.auth.accounts.updateProfile(user.id, { email: "gast@example.ch" });
    const { link } = ctx.auth.accounts.createVerification(user.id);
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/email/verify",
      headers: cookie,
      payload: { token: link.token },
    });
    expect(response.statusCode).toBe(204);
    expect(ctx.auth.accounts.getUser(user.id)?.emailStatus).toBe("verified");
  });

  it("[SEC-01][ACC-10] setting a password with a link works with a session cookie and no CSRF token", async () => {
    context = await createTestApp();
    const ctx = context;
    const { cookie, user } = await guestWithCookie(ctx);
    const { token } = ctx.auth.accounts.createLink(user.id, "reset", "cli");
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/password/set",
      headers: cookie,
      payload: { token, newPassword: "a-brand-new-password" },
    });
    expect(response.statusCode).toBe(204);
  });

  it("[SEC-01][ACC-03] asking for a reset link works with a session cookie and no CSRF token", async () => {
    context = await createTestApp();
    const ctx = context;
    const { cookie } = await guestWithCookie(ctx);
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/password/forgot",
      headers: cookie,
      payload: { identifier: "gast" },
    });
    expect(response.statusCode).toBeLessThan(300);
  });

  it("[SEC-01] a wrong link still answers as for a visitor without a session, not as csrf_failed", async () => {
    context = await createTestApp();
    const ctx = context;
    const { cookie } = await guestWithCookie(ctx);
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/email/verify",
      headers: cookie,
      payload: { token: "x".repeat(43) },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "invalid_link" } });
  });

  it("[SEC-01] a request from another origin is still refused on a public route, with or without a session", async () => {
    context = await createTestApp();
    const ctx = context;
    const { cookie } = await guestWithCookie(ctx);
    for (const headers of [
      { host: "zappaloo.example", origin: "https://evil.example" },
      { ...cookie, host: "zappaloo.example", origin: "https://evil.example" },
    ]) {
      const response = await ctx.app.inject({
        method: "POST",
        url: "/api/email/verify",
        headers,
        payload: { token: "x".repeat(43) },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: "csrf_failed" } });
    }
  });

  it("[SEC-01] a route that relies on the session still needs the CSRF token", async () => {
    context = await createTestApp();
    const ctx = context;
    const { cookie, withToken } = await guestWithCookie(ctx);
    const patch = (headers: Record<string, string>) =>
      ctx.app.inject({
        method: "PATCH",
        url: "/api/profile",
        headers,
        payload: { displayName: "Gast G." },
      });
    const refused = await patch(cookie);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ error: { code: "csrf_failed" } });
    expect((await patch(withToken)).statusCode).toBe(200);
  });
});
