import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

async function setup() {
  context = await createTestApp();
  return context;
}

const lookup = (ctx: TestContext, token: string) =>
  ctx.app.inject({ url: `/api/password/link/${token}` });

describe("what a password link is for (ACC-14, ACC-15, ACC-10)", () => {
  it("[ACC-14] a setup link says it is for a new account and names the username, without a sign-in", async () => {
    const ctx = await setup();
    const { user, link } = ctx.auth.accounts.createUserWithSetupLink(
      { username: "erika.huber", roles: ["vip"] },
      "cli",
    );
    const response = await lookup(ctx, link.token);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ purpose: "setup", username: "erika.huber" });
    // Looking it up does not use it up.
    expect((await lookup(ctx, link.token)).statusCode).toBe(200);
    expect(ctx.auth.accounts.getUser(user.id)?.username).toBe("erika.huber");
  });

  it("[ACC-15][ACC-10] a reset link says so", async () => {
    const ctx = await setup();
    const user = ctx.auth.accounts.createUser({ username: "anna", roles: ["vip"] }, "cli");
    const link = ctx.auth.accounts.createLink(user.id, "reset", "cli");
    expect((await lookup(ctx, link.token)).json()).toEqual({ purpose: "reset", username: "anna" });
  });

  it("[ACC-14] a used, expired, unknown or verification link is refused with the same answer", async () => {
    const ctx = await setup();
    const user = ctx.auth.accounts.createUser({ username: "anna", roles: ["vip"] }, "cli");
    const used = ctx.auth.accounts.createLink(user.id, "setup", "cli");
    await ctx.auth.accounts.useLink(used.token, "correct-horse-battery");
    const expired = ctx.auth.accounts.createLink(user.id, "reset", "cli");
    ctx.database.sqlite
      .prepare("UPDATE one_time_links SET expires_at = ? WHERE purpose = 'reset'")
      .run(Date.now() - 1000);
    ctx.auth.accounts.updateProfile(user.id, { email: "anna@example.ch" });
    const verify = ctx.auth.accounts.createVerification(user.id).link;
    const bodies: unknown[] = [];
    for (const token of [used.token, expired.token, verify.token, "nicht-vorhanden-0123456789"]) {
      const response = await lookup(ctx, token);
      expect(response.statusCode, token).toBe(400);
      bodies.push(response.json());
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(bodies[0]).toMatchObject({ error: { code: "invalid_link" } });
  });

  it("[ACC-14] dead lookups count against the limit of setting a password, and nothing but the purpose and name is given away", async () => {
    const ctx = await setup();
    for (let i = 0; i < 10; i += 1) {
      expect((await lookup(ctx, `falsch-falsch-${String(i)}-0123456789`)).statusCode).toBe(400);
    }
    expect((await lookup(ctx, "noch-eins-0123456789")).statusCode).toBe(429);
    const set = await ctx.app.inject({
      method: "POST",
      url: "/api/password/set",
      payload: { token: "noch-eins-0123456789", newPassword: "correct-horse-battery" },
    });
    expect(set.statusCode).toBe(429);
  });

  it("[ACC-14] a malformed token is a validation error, not a lookup", async () => {
    const ctx = await setup();
    expect((await lookup(ctx, "kurz")).statusCode).toBe(400);
  });
});
