import { afterEach, describe, expect, it } from "vitest";
import type { Role } from "@zappaloo/shared";
import { AccountService, LINK_VALIDITY_MS } from "../auth/accounts.ts";
import { users } from "../database/schema.ts";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { SESSION_COOKIE } from "./auth.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const PASSWORD = "correct-horse-battery";

async function setup(): Promise<TestContext> {
  context = await createTestApp();
  return context;
}

async function makeUser(ctx: TestContext, username: string, roles: Role[] = ["vip"]) {
  const user = ctx.auth.accounts.createUser({ username, roles }, "cli");
  const link = ctx.auth.accounts.createLink(user.id, "setup", "cli");
  await ctx.auth.accounts.useLink(link.token, PASSWORD);
  return user;
}

interface SignedIn {
  cookie: string;
  csrf: string;
}

async function login(ctx: TestContext, username: string): Promise<SignedIn> {
  const response = await ctx.app.inject({
    method: "POST",
    url: "/api/session",
    payload: { username, password: PASSWORD },
  });
  expect(response.statusCode, response.body).toBe(200);
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error("no session cookie");
  return {
    cookie: `${SESSION_COOKIE}=${cookie.value}`,
    csrf: response.json<{ csrfToken: string }>().csrfToken,
  };
}

const as = (who: SignedIn) => ({ cookie: who.cookie, "x-csrf-token": who.csrf });

/** The token of the last link in the newest mail. */
function tokenOfLastMail(ctx: TestContext, path: string): string {
  const mail = ctx.mailer.sent.at(-1);
  const match = mail && new RegExp(`${path}/([\\w-]+)`).exec(mail.text);
  if (!match?.[1]) throw new Error(`no ${path} link in the last mail`);
  return match[1];
}

async function setEmail(ctx: TestContext, who: SignedIn, email: string | null) {
  const response = await ctx.app.inject({
    method: "PATCH",
    url: "/api/profile",
    headers: as(who),
    payload: { email },
  });
  expect(response.statusCode, response.body).toBe(200);
}

async function verifyAddress(ctx: TestContext, who: SignedIn, email: string) {
  await setEmail(ctx, who, email);
  const sent = await ctx.app.inject({
    method: "POST",
    url: "/api/profile/email/verify",
    headers: as(who),
  });
  expect(sent.statusCode).toBe(204);
  const done = await ctx.app.inject({
    method: "POST",
    url: "/api/email/verify",
    payload: { token: tokenOfLastMail(ctx, "verify-email") },
  });
  expect(done.statusCode).toBe(204);
}

describe("email verification", () => {
  it("[ACC-09] an account works without a verified address; verifying is voluntary", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    await setEmail(ctx, anna, "anna@example.org");
    const profile = await ctx.app.inject({ url: "/api/profile", headers: { cookie: anna.cookie } });
    expect(profile.json()).toMatchObject({ email: "anna@example.org", emailStatus: "unverified" });
    expect(ctx.mailer.sent).toEqual([]);
  });

  it("[ACC-09][ACC-11] mails a link that confirms the address once", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    await verifyAddress(ctx, anna, "anna@example.org");

    expect(ctx.mailer.sent).toHaveLength(1);
    expect(ctx.mailer.sent[0]?.to).toBe("anna@example.org");
    const profile = await ctx.app.inject({ url: "/api/profile", headers: { cookie: anna.cookie } });
    expect(profile.json()).toMatchObject({ emailStatus: "verified" });

    const again = await ctx.app.inject({
      method: "POST",
      url: "/api/email/verify",
      payload: { token: tokenOfLastMail(ctx, "verify-email") },
    });
    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({ error: { code: "invalid_link" } });
  });

  it("[ACC-09] a link does not verify an address that was changed after it was sent", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    await setEmail(ctx, anna, "typo@example.org");
    await ctx.app.inject({ method: "POST", url: "/api/profile/email/verify", headers: as(anna) });
    const token = tokenOfLastMail(ctx, "verify-email");
    await setEmail(ctx, anna, "anna@example.org");

    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/email/verify",
      payload: { token },
    });
    expect(response.statusCode).toBe(400);
    const profile = await ctx.app.inject({ url: "/api/profile", headers: { cookie: anna.cookie } });
    expect(profile.json()).toMatchObject({ email: "anna@example.org", emailStatus: "unverified" });
  });

  it("[ACC-09] a changed address is unverified again", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    await verifyAddress(ctx, anna, "anna@example.org");
    await setEmail(ctx, anna, "other@example.org");
    const profile = await ctx.app.inject({ url: "/api/profile", headers: { cookie: anna.cookie } });
    expect(profile.json()).toMatchObject({ emailStatus: "unverified" });
  });

  it("[ACC-09] an expired link is refused", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    await setEmail(ctx, anna, "anna@example.org");
    await ctx.app.inject({ method: "POST", url: "/api/profile/email/verify", headers: as(anna) });
    const token = tokenOfLastMail(ctx, "verify-email");

    const accounts = new AccountService(
      ctx.database,
      ctx.event,
      () => new Date(Date.now() + LINK_VALIDITY_MS + 1000),
    );
    expect(() => accounts.verifyEmail(token)).toThrow(/expired/);
  });

  it("[ACC-09] answers without an address, without mail server and when sending fails", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    const none = await ctx.app.inject({
      method: "POST",
      url: "/api/profile/email/verify",
      headers: as(anna),
    });
    expect(none.statusCode).toBe(409);

    await setEmail(ctx, anna, "anna@example.org");
    ctx.mailer.failWith = new Error("smtp down");
    const failed = await ctx.app.inject({
      method: "POST",
      url: "/api/profile/email/verify",
      headers: as(anna),
    });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toMatchObject({ error: { code: "mail_failed" } });
  });

  it("[ACC-09] a verification link cannot be used to set a password", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    await setEmail(ctx, anna, "anna@example.org");
    await ctx.app.inject({ method: "POST", url: "/api/profile/email/verify", headers: as(anna) });
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/password/set",
      payload: {
        token: tokenOfLastMail(ctx, "verify-email"),
        newPassword: "another-long-password",
      },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("password reset by email", () => {
  const forgot = (ctx: TestContext, identifier: string) =>
    ctx.app.inject({ method: "POST", url: "/api/password/forgot", payload: { identifier } });

  it("[ACC-03][ACC-11] mails a reset link to a verified address; the link sets the password once", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    await verifyAddress(ctx, anna, "anna@example.org");
    ctx.mailer.sent.length = 0;

    for (const identifier of ["anna", "Anna@Example.org"]) {
      const response = await forgot(ctx, identifier);
      expect(response.statusCode).toBe(204);
    }
    await new Promise((resolve) => setImmediate(resolve));
    expect(ctx.mailer.sent.map((m) => m.to)).toEqual(["anna@example.org", "anna@example.org"]);

    const set = await ctx.app.inject({
      method: "POST",
      url: "/api/password/set",
      payload: { token: tokenOfLastMail(ctx, "set-password"), newPassword: "brand-new-password" },
    });
    expect(set.statusCode).toBe(204);
    const signedOut = await ctx.app.inject({
      url: "/api/session",
      headers: { cookie: anna.cookie },
    });
    expect(signedOut.json()).toMatchObject({ user: null });
    const relogin = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "anna", password: "brand-new-password" },
    });
    expect(relogin.statusCode).toBe(200);
  });

  it("[ACC-03] sends nothing for unverified addresses and unknown names, with the same answer", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    await makeUser(ctx, "ben");
    const anna = await login(ctx, "anna");
    await setEmail(ctx, anna, "anna@example.org"); // not verified
    const ben = await login(ctx, "ben");
    await verifyAddress(ctx, ben, "ben@example.org");
    ctx.mailer.sent.length = 0;

    const answers = await Promise.all(
      ["anna", "anna@example.org", "nobody", "nobody@example.org"].map((id) => forgot(ctx, id)),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(answers.map((a) => a.statusCode)).toEqual([204, 204, 204, 204]);
    expect(answers.map((a) => a.body)).toEqual(["", "", "", ""]);
    expect(ctx.mailer.sent).toEqual([]);
    const verified = await forgot(ctx, "ben");
    expect(verified.statusCode).toBe(204);
  });

  it("[ACC-03] no longer resets after the verified address was changed", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    await verifyAddress(ctx, anna, "anna@example.org");
    await setEmail(ctx, anna, "typo@example.org");
    ctx.mailer.sent.length = 0;
    await forgot(ctx, "anna");
    await forgot(ctx, "typo@example.org");
    expect(ctx.mailer.sent).toEqual([]);
  });

  it("[ACC-03][SEC-02] limits requests per address and the mails per account", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    await verifyAddress(ctx, anna, "anna@example.org");
    ctx.mailer.sent.length = 0;

    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await forgot(ctx, "anna")).statusCode);
    await new Promise((resolve) => setImmediate(resolve));
    expect(codes.at(-1)).toBe(429);
    expect(codes.slice(0, 10).every((c) => c === 204)).toBe(true);
    expect(ctx.mailer.sent).toHaveLength(3);
  });

  it("[ACC-03] links an admin hands out do not use up the mails; the request is logged as anonymous", async () => {
    const ctx = await setup();
    const anna = await makeUser(ctx, "anna");
    const session = await login(ctx, "anna");
    await verifyAddress(ctx, session, "anna@example.org");
    for (let i = 0; i < 3; i++) ctx.auth.accounts.createLink(anna.id, "reset", "cli");
    ctx.mailer.sent.length = 0;
    await forgot(ctx, "anna");
    await new Promise((resolve) => setImmediate(resolve));
    expect(ctx.mailer.sent).toHaveLength(1);
    const entry = ctx.event.auditEntries().find((e) => e.action === "link.create");
    expect(entry).toMatchObject({
      actor: "anonymous",
      details: { userId: anna.id, purpose: "reset" },
    });
  });

  it("[ACC-03] still answers 204 when the mail cannot be sent", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    await verifyAddress(ctx, anna, "anna@example.org");
    ctx.mailer.failWith = new Error("smtp down");
    expect((await forgot(ctx, "anna")).statusCode).toBe(204);
  });
});

describe("admin reset link", () => {
  it("[ACC-10] an admin creates a one-time reset link for a user", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const anna = await makeUser(ctx, "anna");
    const annaSession = await login(ctx, "anna");
    const root = await login(ctx, "root");

    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/users/${String(anna.id)}/reset-link`,
      headers: as(root),
    });
    expect(response.statusCode, response.body).toBe(201);
    const { resetUrl } = response.json<{ resetUrl: string }>();
    expect(resetUrl).toMatch(/^http:\/\/localhost:5173\/set-password\/[\w-]+$/);

    const token = resetUrl.split("/").at(-1);
    const set = await ctx.app.inject({
      method: "POST",
      url: "/api/password/set",
      payload: { token, newPassword: "handed-over-password" },
    });
    expect(set.statusCode).toBe(204);
    const again = await ctx.app.inject({
      method: "POST",
      url: "/api/password/set",
      payload: { token, newPassword: "handed-over-again" },
    });
    expect(again.statusCode).toBe(400);
    const old = await ctx.app.inject({
      url: "/api/session",
      headers: { cookie: annaSession.cookie },
    });
    expect(old.json()).toMatchObject({ user: null });
    expect(
      ctx.event
        .auditEntries()
        .some((e) => e.action === "link.create" && e.details.purpose === "reset"),
    ).toBe(true);
  });

  it("[ACC-10] needs the admin role and an existing user", async () => {
    const ctx = await setup();
    const anna = await makeUser(ctx, "anna");
    await makeUser(ctx, "root", ["admin"]);
    const annaSession = await login(ctx, "anna");
    const root = await login(ctx, "root");

    const forbidden = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/users/${String(anna.id)}/reset-link`,
      headers: as(annaSession),
    });
    expect(forbidden.statusCode).toBe(403);
    const missing = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/users/9999/reset-link",
      headers: as(root),
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe("deleting the own account", () => {
  const remove = (ctx: TestContext, who: SignedIn, password: string) =>
    ctx.app.inject({
      method: "DELETE",
      url: "/api/profile",
      headers: as(who),
      payload: { password },
    });

  it("[ACC-12] deletes the account with its membership, sessions and links after the password", async () => {
    const ctx = await setup();
    // Not a guest: an account without `vip` has no guest-list entry and goes completely.
    const anna = await makeUser(ctx, "anna", ["staff"]);
    await makeUser(ctx, "root", ["admin"]);
    const session = await login(ctx, "anna");
    ctx.auth.accounts.createLink(anna.id, "reset", "cli");

    const wrong = await remove(ctx, session, "not-the-password");
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toMatchObject({ error: { code: "invalid_password" } });
    expect(ctx.auth.accounts.findUser("anna")).toBeDefined();

    const response = await remove(ctx, session, PASSWORD);
    expect(response.statusCode).toBe(204);
    expect(ctx.auth.accounts.findUser("anna")).toBeUndefined();
    expect(
      ctx.database.db
        .select()
        .from(users)
        .all()
        .map((u) => u.username),
    ).toEqual(["root"]);
    const after = await ctx.app.inject({
      url: "/api/session",
      headers: { cookie: session.cookie },
    });
    expect(after.json()).toMatchObject({ user: null });
    const login2 = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "anna", password: PASSWORD },
    });
    expect(login2.statusCode).toBe(401);
    const audit = ctx.event.auditEntries().find((e) => e.action === "user.delete");
    expect(audit).toMatchObject({ actor: `user:${String(anna.id)}`, details: { userId: anna.id } });
    // The log keeps only the id: no entry names the deleted account.
    expect(JSON.stringify(ctx.event.auditEntries())).not.toContain("anna");
  });

  it("[ACC-12] a guest who registered with an invitation leaves only ids in the log", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const [issued] = ctx.auth.invitations.create([{ name: "Zora Zimmermann" }], undefined, "cli");
    if (!issued) throw new Error("no invitation");
    const user = await ctx.auth.invitations.redeemWithNewAccount(issued.code, {
      username: "zora",
      password: PASSWORD,
    });
    const redeemed = ctx.event.auditEntries().find((e) => e.action === "invitation.redeem");
    expect(redeemed).toMatchObject({
      actor: `user:${String(user.id)}`,
      details: { userId: user.id, method: "register" },
    });
    const session = await login(ctx, "zora");
    expect((await remove(ctx, session, PASSWORD)).statusCode).toBe(204);
    const log = JSON.stringify(ctx.event.auditEntries());
    expect(log).not.toContain("zora");
    expect(log).not.toContain("Zimmermann");
  });

  it("[ACC-12] the last admin cannot delete the account, another admin can", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const root = await login(ctx, "root");
    const refused = await remove(ctx, root, PASSWORD);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: "last_admin" } });

    await makeUser(ctx, "second", ["admin"]);
    expect((await remove(ctx, root, PASSWORD)).statusCode).toBe(204);
  });

  it("[ACC-12] needs a signed-in user", async () => {
    const ctx = await setup();
    const response = await ctx.app.inject({
      method: "DELETE",
      url: "/api/profile",
      payload: { password: PASSWORD },
    });
    expect(response.statusCode).toBe(401);
  });
});
