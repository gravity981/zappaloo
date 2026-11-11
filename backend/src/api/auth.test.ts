import { afterEach, describe, expect, it } from "vitest";
import type { Role } from "@zappaloo/shared";
import { sessions as sessionsTable } from "../database/schema.ts";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { LINK_VALIDITY_MS } from "../auth/accounts.ts";
import { SESSION_COOKIE } from "./auth.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const PASSWORD = "correct-horse-battery";

async function setup(options: Parameters<typeof createTestApp>[0] = {}): Promise<TestContext> {
  context = await createTestApp(options);
  return context;
}

/** An account whose password is already set. */
async function makeUser(
  ctx: TestContext,
  username: string,
  roles: Role[] = ["vip"],
  password = PASSWORD,
) {
  const user = ctx.auth.accounts.createUser({ username, roles }, "cli");
  const link = ctx.auth.accounts.createLink(user.id, "setup", "cli");
  await ctx.auth.accounts.useLink(link.token, password);
  return user;
}

interface SignedIn {
  cookie: string;
  csrf: string;
}

async function login(ctx: TestContext, username: string, password = PASSWORD): Promise<SignedIn> {
  const response = await ctx.app.inject({
    method: "POST",
    url: "/api/session",
    payload: { username, password },
  });
  expect(response.statusCode, response.body).toBe(200);
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error("no session cookie");
  return {
    cookie: `${SESSION_COOKIE}=${cookie.value}`,
    csrf: response.json<{ csrfToken: string }>().csrfToken,
  };
}

const asUser = (who: SignedIn, write = false): Record<string, string> => ({
  cookie: who.cookie,
  ...(write ? { "x-csrf-token": who.csrf } : {}),
});

describe("login and logout", () => {
  it("[ACC-01] signs in, shows the user in the session, and signs out", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna", ["vip"]);

    const anonymous = await ctx.app.inject("/api/session");
    expect(anonymous.json()).toEqual({ user: null, csrfToken: null });

    const anna = await login(ctx, "Anna"); // the login name is not case-sensitive
    const session = await ctx.app.inject({ url: "/api/session", headers: asUser(anna) });
    expect(session.json()).toMatchObject({
      user: { username: "anna", displayName: "anna", email: null, roles: ["vip"] },
      csrfToken: anna.csrf,
    });

    const out = await ctx.app.inject({
      method: "DELETE",
      url: "/api/session",
      headers: asUser(anna, true),
    });
    expect(out.statusCode).toBe(204);
    const after = await ctx.app.inject({ url: "/api/session", headers: asUser(anna) });
    expect(after.json()).toEqual({ user: null, csrfToken: null });
    expect(ctx.database.db.select().from(sessionsTable).all()).toEqual([]);
  });

  it("[ACC-01] refuses wrong credentials without revealing whether the username exists", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const wrongPassword = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "anna", password: "wrong-password" },
    });
    const unknownUser = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "nobody", password: "wrong-password" },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(unknownUser.json()).toEqual(wrongPassword.json());
    expect(wrongPassword.json()).toMatchObject({ error: { code: "invalid_credentials" } });
    expect(wrongPassword.cookies).toEqual([]);
  });

  it("[ACC-01] an account without a password cannot sign in", async () => {
    const ctx = await setup();
    ctx.auth.accounts.createUser({ username: "new", roles: [] }, "cli");
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "new", password: "anything-at-all" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("[ACC-05] the session cookie is HttpOnly, SameSite=Lax and signed; a forged or tampered cookie is no session", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "anna", password: PASSWORD },
    });
    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    expect(cookie?.secure).toBeUndefined(); // plain HTTP in tests; Secure in staging and prod
    expect(cookie?.expires?.getTime()).toBeGreaterThan(Date.now() + 360 * 24 * 3600 * 1000);

    const value = cookie?.value ?? "";
    const [token] = decodeURIComponent(value).split(".");
    for (const forged of [
      `${SESSION_COOKIE}=${token ?? ""}`,
      `${SESSION_COOKIE}=${value}x`,
      `${SESSION_COOKIE}=garbage`,
    ]) {
      const result = await ctx.app.inject({ url: "/api/session", headers: { cookie: forged } });
      expect(result.json()).toEqual({ user: null, csrfToken: null });
    }
  });

  it("[ACC-05] the cookie is Secure when the installation runs over HTTPS", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const secure = await (
      await import("../test-support.ts")
    ).createTestApp({
      auth: { ...ctx.auth, secureCookies: true },
    });
    try {
      const response = await secure.app.inject({
        method: "POST",
        url: "/api/session",
        payload: { username: "anna", password: PASSWORD },
      });
      expect(response.cookies.find((c) => c.name === SESSION_COOKIE)?.secure).toBe(true);
    } finally {
      await secure.close();
    }
  });
});

describe("CSRF protection", () => {
  it("[SEC-01] a state-changing request with a session needs the session's CSRF token", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    const patch = (headers: Record<string, string>) =>
      ctx.app.inject({
        method: "PATCH",
        url: "/api/profile",
        headers,
        payload: { displayName: "Anna M." },
      });

    const wrongHeaders: Record<string, string>[] = [
      { cookie: anna.cookie },
      { cookie: anna.cookie, "x-csrf-token": "wrong" },
    ];
    for (const headers of wrongHeaders) {
      const refused = await patch(headers);
      expect(refused.statusCode).toBe(403);
      expect(refused.json()).toMatchObject({ error: { code: "csrf_failed" } });
    }
    expect((await patch(asUser(anna, true))).statusCode).toBe(200);
    // Reading needs no token.
    expect((await ctx.app.inject({ url: "/api/profile", headers: asUser(anna) })).statusCode).toBe(
      200,
    );
  });

  it("[SEC-01] a request from another origin is refused, also login; the site's own origin is fine", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const login = (origin: string) =>
      ctx.app.inject({
        method: "POST",
        url: "/api/session",
        headers: { host: "zappaloo.example", origin },
        payload: { username: "anna", password: PASSWORD },
      });
    for (const origin of ["https://evil.example", "http://zappaloo.example.evil.example", "null"]) {
      const refused = await login(origin);
      expect(refused.statusCode, origin).toBe(403);
      expect(refused.json()).toMatchObject({ error: { code: "csrf_failed" } });
    }
    expect((await login("https://zappaloo.example")).statusCode).toBe(200);
  });
});

describe("rate limiting", () => {
  it("[SEC-02] blocks a username after 5 failed logins, even with the right password, until the window ends", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const attempt = (password: string) =>
      ctx.app.inject({
        method: "POST",
        url: "/api/session",
        payload: { username: "anna", password },
      });

    for (let i = 0; i < 5; i++) expect((await attempt("wrong-password")).statusCode).toBe(401);
    const blocked = await attempt(PASSWORD);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: { code: "rate_limited" } });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    // Another user is not affected.
    await makeUser(ctx, "ben");
    expect((await login(ctx, "ben")).cookie).toContain(SESSION_COOKIE);
  });

  it("[SEC-02] a successful login clears the failed attempts of the username", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const attempt = (password: string) =>
      ctx.app.inject({
        method: "POST",
        url: "/api/session",
        payload: { username: "anna", password },
      });
    for (let i = 0; i < 4; i++) await attempt("wrong-password");
    expect((await attempt(PASSWORD)).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) expect((await attempt("wrong-password")).statusCode).toBe(401);
  });

  it("[SEC-02] limits login attempts per client address", async () => {
    const ctx = await setup();
    const attempt = (username: string) =>
      ctx.app.inject({
        method: "POST",
        url: "/api/session",
        payload: { username, password: "wrong-password" },
      });
    // 20 attempts on different usernames pass the limit of the address (and fail as 401)...
    for (let i = 0; i < 20; i++) expect((await attempt(`user${String(i)}`)).statusCode).toBe(401);
    // ...the 21st is refused.
    expect((await attempt("user99")).statusCode).toBe(429);
  });

  it("[SEC-02] limits setting a password with a link per client address", async () => {
    const ctx = await setup();
    const attempt = () =>
      ctx.app.inject({
        method: "POST",
        url: "/api/password/set",
        payload: { token: "x".repeat(43), newPassword: PASSWORD },
      });
    for (let i = 0; i < 10; i++) expect((await attempt()).statusCode).toBe(400);
    expect((await attempt()).statusCode).toBe(429);
    // Confirming an email address has its own counter.
    const verify = await ctx.app.inject({
      method: "POST",
      url: "/api/email/verify",
      payload: { token: "x".repeat(43) },
    });
    expect(verify.statusCode).toBe(400);
  });

  it("[SEC-02] successful logins from one address are not limited: guests share the venue's Wi-Fi", async () => {
    const ctx = await setup();
    for (let i = 0; i < 25; i++) {
      await makeUser(ctx, `guest${String(i)}`);
      expect((await login(ctx, `guest${String(i)}`)).cookie).toContain(SESSION_COOKIE);
    }
    // 25 password hashes: CPU-bound, slow while the whole suite runs in parallel.
  }, 30_000);

  it("[SEC-02] takes the client address from X-Forwarded-For only with TRUST_PROXY", async () => {
    const attempt = (ctx: TestContext, ip: string) =>
      ctx.app.inject({
        method: "POST",
        url: "/api/session",
        headers: { "x-forwarded-for": ip },
        payload: { username: `u${ip.replace(/\D/g, "")}`, password: "wrong-password" },
      });
    // Without it a forged header changes nothing: all attempts come from the same address.
    const direct = await setup();
    for (let i = 0; i < 20; i++) await attempt(direct, `10.0.0.${String(i)}`);
    expect((await attempt(direct, "10.0.1.1")).statusCode).toBe(429);
    await direct.close();

    // Behind Caddy each client has its own counter.
    const proxied = await setup({ trustProxy: true });
    for (let i = 0; i < 20; i++) await attempt(proxied, "10.0.0.1");
    expect((await attempt(proxied, "10.0.0.1")).statusCode).toBe(429);
    expect((await attempt(proxied, "10.0.0.2")).statusCode).toBe(401);
  });
});

describe("profile", () => {
  it("[ACC-04] shows and changes the display name and email; the username stays; a new address is unverified", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");

    expect((await ctx.app.inject({ url: "/api/profile" })).statusCode).toBe(401);
    const changed = await ctx.app.inject({
      method: "PATCH",
      url: "/api/profile",
      headers: asUser(anna, true),
      payload: { displayName: "  Anna Muster ", email: "anna@example.org" },
    });
    expect(changed.json()).toMatchObject({
      username: "anna",
      displayName: "Anna Muster",
      email: "anna@example.org",
      emailStatus: "unverified",
    });
    // The database says the same, and the address can be removed.
    expect(ctx.auth.accounts.findUser("anna")?.displayName).toBe("Anna Muster");
    const removed = await ctx.app.inject({
      method: "PATCH",
      url: "/api/profile",
      headers: asUser(anna, true),
      payload: { email: null },
    });
    expect(removed.json()).toMatchObject({ displayName: "Anna Muster", email: null });
  });

  it("[ACC-04] refuses invalid values and changes of the username or roles", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    for (const payload of [
      { displayName: "" },
      { displayName: "x".repeat(101) },
      { email: "not-an-email" },
      { username: "other" },
      { roles: ["admin"] },
    ]) {
      const response = await ctx.app.inject({
        method: "PATCH",
        url: "/api/profile",
        headers: asUser(anna, true),
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });
});

describe("passwords", () => {
  it("[ACC-06] changes the password with the current one, ends the other sessions and keeps this one", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const phone = await login(ctx, "anna");
    const laptop = await login(ctx, "anna");
    const change = (currentPassword: string, newPassword: string) =>
      ctx.app.inject({
        method: "POST",
        url: "/api/profile/password",
        headers: asUser(laptop, true),
        payload: { currentPassword, newPassword },
      });

    expect((await change("wrong-password", "another-long-password")).statusCode).toBe(400);
    expect((await change(PASSWORD, "short")).statusCode).toBe(400); // policy: 10-128 characters
    expect((await change(PASSWORD, "another-long-password")).statusCode).toBe(204);

    const active = async (who: SignedIn) =>
      (await ctx.app.inject({ url: "/api/session", headers: asUser(who) })).json<{
        user: unknown;
      }>().user !== null;
    expect(await active(laptop)).toBe(true);
    expect(await active(phone)).toBe(false);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/api/session",
          payload: { username: "anna", password: PASSWORD },
        })
      ).statusCode,
    ).toBe(401);
    expect((await login(ctx, "anna", "another-long-password")).cookie).toContain(SESSION_COOKIE);
  });

  it("[SEC-02] limits wrong current passwords when changing the password", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    const change = () =>
      ctx.app.inject({
        method: "POST",
        url: "/api/profile/password",
        headers: asUser(anna, true),
        payload: { currentPassword: "wrong-password", newPassword: "another-long-password" },
      });
    for (let i = 0; i < 5; i++) expect((await change()).statusCode).toBe(400);
    expect((await change()).statusCode).toBe(429);
  });
});

describe("password rules", () => {
  it("[ACC-06] a password must not be the username, whichever way it is set", async () => {
    const ctx = await setup();
    const user = ctx.auth.accounts.createUser({ username: "anna.mueller1", roles: ["vip"] }, "cli");
    const link = ctx.auth.accounts.createLink(user.id, "setup", "cli");
    const viaLink = await ctx.app.inject({
      method: "POST",
      url: "/api/password/set",
      payload: { token: link.token, newPassword: "Anna.Mueller1" },
    });
    expect(viaLink.statusCode).toBe(400);
    expect(viaLink.json()).toMatchObject({ error: { code: "password_is_username" } });
    // The link was not used up by the refused password.
    await ctx.auth.accounts.useLink(link.token, PASSWORD);

    const anna = await login(ctx, "anna.mueller1");
    const change = await ctx.app.inject({
      method: "POST",
      url: "/api/profile/password",
      headers: asUser(anna, true),
      payload: { currentPassword: PASSWORD, newPassword: "anna.mueller1" },
    });
    expect(change.statusCode).toBe(400);
    expect(change.json()).toMatchObject({ error: { code: "password_is_username" } });
  });

  it("[ACC-01][ACC-06] an unknown user and an account without a password cost the same hashing work", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna");
    ctx.auth.accounts.createUser({ username: "nopass", roles: ["vip"] }, "cli");
    const time = async (username: string) => {
      const start = performance.now();
      expect(await ctx.auth.accounts.verifyLogin(username, "wrong-password")).toBeUndefined();
      return performance.now() - start;
    };
    await time("anna"); // warm-up: the dummy hash is made once
    await time("nobody");
    const [known, unknown, withoutPassword] = [
      await time("anna"),
      await time("nobody"),
      await time("nopass"),
    ];
    // A lookup without hashing takes well under a millisecond; argon2id takes tens.
    expect(unknown).toBeGreaterThan(known / 3);
    expect(withoutPassword).toBeGreaterThan(known / 3);
  });
});

describe("one-time links", () => {
  const setPassword = (ctx: TestContext, token: string, newPassword = PASSWORD) =>
    ctx.app.inject({ method: "POST", url: "/api/password/set", payload: { token, newPassword } });

  it("[ACC-14] a setup link sets the password once", async () => {
    const ctx = await setup();
    const user = ctx.auth.accounts.createUser({ username: "anna", roles: ["vip"] }, "cli");
    const { token, expiresAt } = ctx.auth.accounts.createLink(user.id, "setup", "cli");
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(LINK_VALIDITY_MS - 5000);

    expect((await setPassword(ctx, "x".repeat(43))).statusCode).toBe(400); // unknown
    expect((await setPassword(ctx, token, "short")).statusCode).toBe(400); // policy
    expect((await setPassword(ctx, token)).statusCode).toBe(204);
    const again = await setPassword(ctx, token, "another-long-password");
    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({ error: { code: "invalid_link" } });
    expect((await login(ctx, "anna")).cookie).toContain(SESSION_COOKIE);
  });

  it("[ACC-14] a link expires after 24 hours", async () => {
    let now = new Date("2026-11-10T10:00:00Z");
    const ctx = await setup();
    const { AccountService } = await import("../auth/accounts.ts");
    const accounts = new AccountService(ctx.database, ctx.event, () => now);
    const user = accounts.createUser({ username: "anna", roles: [] }, "cli");
    const { token } = accounts.createLink(user.id, "setup", "cli");
    now = new Date(now.getTime() + LINK_VALIDITY_MS + 1);
    await expect(accounts.useLink(token, PASSWORD)).rejects.toThrow(/expired/);
  });

  it("[ACC-15] a reset link sets a new password and ends all sessions of the user", async () => {
    const ctx = await setup();
    const user = await makeUser(ctx, "anna");
    const anna = await login(ctx, "anna");
    const { token } = ctx.auth.accounts.createLink(user.id, "reset", "cli");
    expect((await setPassword(ctx, token, "brand-new-password")).statusCode).toBe(204);
    expect((await ctx.app.inject({ url: "/api/session", headers: asUser(anna) })).json()).toEqual({
      user: null,
      csrfToken: null,
    });
    expect((await login(ctx, "anna", "brand-new-password")).cookie).toContain(SESSION_COOKIE);
  });

  it("[ACC-15][ACC-10][ACC-03] using a link, changing the password or the email voids every other open link", async () => {
    const ctx = await setup();
    const anna = await makeUser(ctx, "anna");
    const { accounts } = ctx.auth;
    const set = (token: string) =>
      ctx.app.inject({
        method: "POST",
        url: "/api/password/set",
        payload: { token, newPassword: "another-password-1" },
      });

    // Two reset links: using one voids the other.
    const first = accounts.createLink(anna.id, "reset", "cli");
    const second = accounts.createLink(anna.id, "reset", "cli");
    expect((await set(first.token)).statusCode).toBe(204);
    expect((await set(second.token)).statusCode).toBe(400);

    // Changing the password voids an open link.
    const open = accounts.createLink(anna.id, "reset", "cli");
    const who = await login(ctx, "anna", "another-password-1");
    const changed = await ctx.app.inject({
      method: "POST",
      url: "/api/profile/password",
      headers: asUser(who, true),
      payload: { currentPassword: "another-password-1", newPassword: PASSWORD },
    });
    expect(changed.statusCode).toBe(204);
    expect((await set(open.token)).statusCode).toBe(400);

    // Changing the email address voids an open link (it may have gone to the old address).
    const mailed = accounts.createLink(anna.id, "reset", "cli");
    const email = await ctx.app.inject({
      method: "PATCH",
      url: "/api/profile",
      headers: asUser(who, true),
      payload: { email: "new@example.org" },
    });
    expect(email.statusCode).toBe(200);
    expect((await set(mailed.token)).statusCode).toBe(400);

    // Changing only the display name keeps it.
    const kept = accounts.createLink(anna.id, "reset", "cli");
    accounts.updateProfile(anna.id, { displayName: "Anna M." });
    expect((await set(kept.token)).statusCode).toBe(204);
  });

  it("[ACC-14] stores only a hash of the link's token", async () => {
    const ctx = await setup();
    const user = ctx.auth.accounts.createUser({ username: "anna", roles: [] }, "cli");
    const { token } = ctx.auth.accounts.createLink(user.id, "setup", "cli");
    const rows = ctx.database.sqlite.prepare("SELECT * FROM one_time_links").all();
    expect(JSON.stringify(rows)).not.toContain(token);
  });
});

describe("accounts created by an admin", () => {
  const create = (ctx: TestContext, who: SignedIn | undefined, payload: unknown) =>
    ctx.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: who ? asUser(who, true) : {},
      payload: payload as object,
    });

  it("[ACC-08] an admin creates an account and gets its setup link; others are refused", async () => {
    const ctx = await setup();
    await makeUser(ctx, "boss", ["admin"]);
    await makeUser(ctx, "guest", ["vip", "staff"]);
    const boss = await login(ctx, "boss");

    expect((await create(ctx, undefined, { username: "ben" })).statusCode).toBe(401);
    expect((await create(ctx, await login(ctx, "guest"), { username: "ben" })).statusCode).toBe(
      403,
    );
    expect(ctx.auth.accounts.findUser("ben")).toBeUndefined();

    const created = await create(ctx, boss, {
      username: "Ben",
      displayName: "Ben B.",
      roles: ["vip", "staff"],
    });
    expect(created.statusCode, created.body).toBe(201);
    const body = created.json<{
      user: { username: string; roles: string[]; displayName: string };
      setupUrl: string;
    }>();
    expect(body.user).toMatchObject({
      username: "ben",
      displayName: "Ben B.",
      roles: ["staff", "vip"],
    });
    expect(body.setupUrl).toMatch(/^http:\/\/localhost:5173\/set-password\/[\w-]{43}$/);

    // The owner sets the password with the link and signs in.
    const token = body.setupUrl.split("/").pop() ?? "";
    const set = await ctx.app.inject({
      method: "POST",
      url: "/api/password/set",
      payload: { token, newPassword: PASSWORD },
    });
    expect(set.statusCode).toBe(204);
    await login(ctx, "ben");
  });

  it("[ACC-08] refuses a taken or invalid username, and records the creation in the audit log", async () => {
    const ctx = await setup();
    const boss = await makeUser(ctx, "boss", ["admin"]);
    const signedIn = await login(ctx, "boss");
    expect((await create(ctx, signedIn, { username: "ben" })).statusCode).toBe(201);
    const taken = await create(ctx, signedIn, { username: "BEN" });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ error: { code: "username_taken" } });
    for (const username of ["ab", "has space", "ümlaut", "x".repeat(33)]) {
      expect((await create(ctx, signedIn, { username })).statusCode, username).toBe(400);
    }
    expect((await create(ctx, signedIn, { username: "cy", roles: ["king"] })).statusCode).toBe(400);

    const entries = ctx.event
      .auditEntries()
      .filter((e) => e.action === "user.create" && e.actor === `user:${String(boss.id)}`);
    // Ids only, no username: the log outlives a deleted account (ACC-12).
    const ben = ctx.auth.accounts.findUser("ben");
    expect(entries.map((e) => e.details)).toEqual([{ userId: ben?.id, roles: [] }]);
    expect(ctx.event.auditEntries().some((e) => e.action === "link.create")).toBe(true);
  });
});
