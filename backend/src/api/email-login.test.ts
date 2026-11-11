import { afterEach, describe, expect, it } from "vitest";
import type { User } from "@zappaloo/shared";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { SESSION_COOKIE } from "./auth.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const PASSWORD = "correct-horse-battery";

async function setup() {
  context = await createTestApp();
  return context;
}

/** An account with a password; its address is set and, unless told otherwise, verified. */
async function account(
  ctx: TestContext,
  username: string,
  email: string | null,
  verified = true,
): Promise<User> {
  const user = ctx.auth.accounts.createUser({ username, roles: ["vip"] }, "cli");
  const link = ctx.auth.accounts.createLink(user.id, "setup", "cli");
  await ctx.auth.accounts.useLink(link.token, PASSWORD);
  if (email !== null) {
    ctx.auth.accounts.updateProfile(user.id, { email });
    if (verified) verify(ctx, user.id);
  }
  return user;
}

/** Verifies the user's current address through the real link, as the guest would. */
function verify(ctx: TestContext, userId: number): void {
  const { link } = ctx.auth.accounts.createVerification(userId);
  ctx.auth.accounts.verifyEmail(link.token);
}

const login = (ctx: TestContext, identifier: string, password = PASSWORD) =>
  ctx.app.inject({
    method: "POST",
    url: "/api/session",
    payload: { username: identifier, password },
  });

describe("sign-in by email (ACC-16)", () => {
  it("[ACC-16] a verified email address signs in like the username, in any case", async () => {
    const ctx = await setup();
    const anna = await account(ctx, "anna", "Anna.Muster@Example.ch");
    for (const identifier of [
      "anna",
      "Anna",
      "anna.muster@example.ch",
      "ANNA.MUSTER@EXAMPLE.CH",
      "  Anna.Muster@Example.ch  ",
    ]) {
      const response = await login(ctx, identifier);
      expect(response.statusCode, identifier).toBe(200);
      expect(response.json<{ user: User }>().user.id).toBe(anna.id);
      expect(response.cookies.some((c) => c.name === SESSION_COOKIE)).toBe(true);
    }
  });

  it("[ACC-16] an unverified address never signs anyone in, and the answer is the same as for an unknown one", async () => {
    const ctx = await setup();
    await account(ctx, "ben", "ben@example.ch", false);
    const unverified = await login(ctx, "ben@example.ch");
    const unknown = await login(ctx, "niemand@example.ch");
    const wrong = await login(ctx, "ben@example.ch", "falsches-passwort-123");
    for (const response of [unverified, unknown, wrong]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: "invalid_credentials", message: expect.any(String) as string },
      });
    }
    // The username of the same account still works.
    expect((await login(ctx, "ben")).statusCode).toBe(200);
  });

  it("[ACC-16] a wrong password by email is refused like by username, and counts against the identifier", async () => {
    const ctx = await setup();
    await account(ctx, "anna", "anna@example.ch");
    for (let i = 0; i < 5; i += 1) {
      expect((await login(ctx, "anna@example.ch", "falsch-falsch-falsch")).statusCode).toBe(401);
    }
    // Five failures lock this identifier for a while, even with the right password.
    expect((await login(ctx, "anna@example.ch")).statusCode).toBe(429);
  });

  it("[ACC-16] a changed address no longer signs in until it is verified; removing it frees the sign-in", async () => {
    const ctx = await setup();
    const anna = await account(ctx, "anna", "anna@example.ch");
    expect((await login(ctx, "anna@example.ch")).statusCode).toBe(200);
    ctx.auth.accounts.updateProfile(anna.id, { email: "neu@example.ch" });
    expect((await login(ctx, "anna@example.ch")).statusCode).toBe(401);
    expect((await login(ctx, "neu@example.ch")).statusCode).toBe(401); // not verified yet
    verify(ctx, anna.id);
    expect((await login(ctx, "neu@example.ch")).statusCode).toBe(200);
    ctx.auth.accounts.updateProfile(anna.id, { email: null });
    expect((await login(ctx, "neu@example.ch")).statusCode).toBe(401);
  });

  it("[ACC-16] a username never looks like an address, so the two cannot be mixed up", async () => {
    const ctx = await setup();
    const admin = ctx.auth.accounts.createUser({ username: "root", roles: ["admin"] }, "cli");
    const link = ctx.auth.accounts.createLink(admin.id, "setup", "cli");
    await ctx.auth.accounts.useLink(link.token, PASSWORD);
    const session = await login(ctx, "root");
    const cookie = session.cookies.find((c) => c.name === SESSION_COOKIE);
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: {
        cookie: `${SESSION_COOKIE}=${cookie?.value ?? ""}`,
        "x-csrf-token": session.json<{ csrfToken: string }>().csrfToken,
      },
      payload: { username: "anna@example.ch", roles: [] },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("one account per verified address (ACC-16)", () => {
  it("[ACC-16] verifying an address another account has verified fails with 409 email_taken, and the link stays usable", async () => {
    const ctx = await setup();
    const anna = await account(ctx, "anna", "gemeinsam@example.ch");
    const ben = await account(ctx, "ben", "Gemeinsam@Example.ch", false);
    const { link } = ctx.auth.accounts.createVerification(ben.id);

    const refused = await ctx.app.inject({
      method: "POST",
      url: "/api/email/verify",
      payload: { token: link.token },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: "email_taken" } });
    // Ben's address stays unverified, so it signs nobody in; Anna keeps hers.
    expect(ctx.auth.accounts.getUser(ben.id)?.emailStatus).toBe("unverified");
    expect((await login(ctx, "gemeinsam@example.ch")).json<{ user: User }>().user.id).toBe(anna.id);

    // The link was not used up: once the address is free, it works.
    ctx.auth.accounts.updateProfile(anna.id, { email: null });
    const again = await ctx.app.inject({
      method: "POST",
      url: "/api/email/verify",
      payload: { token: link.token },
    });
    expect(again.statusCode).toBe(204);
    expect((await login(ctx, "gemeinsam@example.ch")).json<{ user: User }>().user.id).toBe(ben.id);
  });

  it("[ACC-16] unverified addresses may repeat; only a verified one is unique", async () => {
    const ctx = await setup();
    await account(ctx, "anna", "gleich@example.ch", false);
    await account(ctx, "ben", "gleich@example.ch", false);
    await account(ctx, "cleo", "gleich@example.ch", true);
    expect((await login(ctx, "gleich@example.ch")).statusCode).toBe(200);
  });

  it("[ACC-16] the database refuses a second verified account with the same address, whatever the code does", async () => {
    const ctx = await setup();
    await account(ctx, "anna", "gemeinsam@example.ch");
    const ben = await account(ctx, "ben", "Gemeinsam@Example.ch", false);
    expect(() =>
      ctx.database.sqlite
        .prepare("UPDATE users SET email_status = 'verified' WHERE id = ?")
        .run(ben.id),
    ).toThrow(/UNIQUE/);
  });

  it("[ACC-16] deleting the account frees the address for others", async () => {
    const ctx = await setup();
    const anna = await account(ctx, "anna", "frei@example.ch");
    const ben = await account(ctx, "ben", "frei@example.ch", false);
    await ctx.auth.accounts.deleteAccount(anna.id, PASSWORD);
    verify(ctx, ben.id);
    expect((await login(ctx, "frei@example.ch")).json<{ user: User }>().user.id).toBe(ben.id);
  });

  it("[ACC-16] a forgotten password can be reset by the verified address, as before", async () => {
    const ctx = await setup();
    await account(ctx, "anna", "anna@example.ch");
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/password/forgot",
      payload: { identifier: "ANNA@example.ch" },
    });
    expect(response.statusCode).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ctx.mailer.sent.map((m) => m.to)).toEqual(["anna@example.ch"]);
  });
});
