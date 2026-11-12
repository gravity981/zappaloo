import { afterEach, describe, expect, it } from "vitest";
import type { IssuedInvitation, Role } from "@zappaloo/shared";
import {
  InvitationService,
  markRedeemed,
  newInvitationCode,
  normalizeCode,
} from "../auth/invitations.ts";
import { hashToken } from "../auth/tokens.ts";
import { invitations as invitationsTable, memberships } from "../database/schema.ts";
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

async function makeUser(ctx: TestContext, username: string, roles: Role[]) {
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
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error("no session cookie");
  return {
    cookie: `${SESSION_COOKIE}=${cookie.value}`,
    csrf: response.json<{ csrfToken: string }>().csrfToken,
  };
}

const as = (who: SignedIn) => ({ cookie: who.cookie, "x-csrf-token": who.csrf });

async function admin(ctx: TestContext): Promise<SignedIn> {
  await makeUser(ctx, "root", ["admin"]);
  return login(ctx, "root");
}

async function createInvitations(
  ctx: TestContext,
  root: SignedIn,
  names: string[],
  expiresAt?: string,
): Promise<IssuedInvitation[]> {
  const response = await ctx.app.inject({
    method: "POST",
    url: "/api/admin/invitations",
    headers: as(root),
    payload: { guests: names.map((name) => ({ name })), ...(expiresAt ? { expiresAt } : {}) },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ invitations: IssuedInvitation[] }>().invitations;
}

const register = (ctx: TestContext, code: string, username: string, extra = {}) =>
  ctx.app.inject({
    method: "POST",
    url: `/api/invitations/${code}/register`,
    payload: { username, password: PASSWORD, ...extra },
  });

const preview = (ctx: TestContext, code: string) =>
  ctx.app.inject({ url: `/api/invitations/${code}` });

describe("creating invitations", () => {
  it("[INV-01] an admin creates a personal invitation per guest with a unique code and link", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const created = await createInvitations(ctx, root, ["Anna Muster", "Ben Beispiel", "Cleo"]);

    expect(created.map((i) => i.guestName)).toEqual(["Anna Muster", "Ben Beispiel", "Cleo"]);
    expect(new Set(created.map((i) => i.code)).size).toBe(3);
    for (const invitation of created) {
      expect(invitation.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(invitation.url).toBe(
        `http://localhost:5173/invite/${invitation.code.replaceAll("-", "")}`,
      );
      expect(invitation.status).toBe("active");
    }
    // The code works as typed (with dashes, any case) and as the link.
    expect((await preview(ctx, created[0]?.code.toLowerCase() ?? "")).json()).toEqual({
      guestName: "Anna Muster",
    });
    expect((await preview(ctx, created[0]?.url.split("/").at(-1) ?? "")).statusCode).toBe(200);
  });

  it("[INV-01] only an admin creates invitations", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna", ["vip", "staff"]);
    const anna = await login(ctx, "anna");
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/invitations",
      headers: as(anna),
      payload: { guests: [{ name: "X" }] },
    });
    expect(response.statusCode).toBe(403);
    expect(
      (await ctx.app.inject({ url: "/api/admin/invitations", headers: { cookie: anna.cookie } }))
        .statusCode,
    ).toBe(403);
  });

  it("[INV-01] codes are random and use an alphabet without look-alikes", () => {
    const codes = new Set(Array.from({ length: 500 }, () => newInvitationCode()));
    expect(codes.size).toBe(500);
    for (const code of codes) expect(code).not.toMatch(/[01OI]/);
    expect(normalizeCode("k7q mx4")).toBe("K7QMX4");
    expect(normalizeCode("K7QM")).toBeUndefined();
    expect(normalizeCode("K7QMX0")).toBeUndefined();
  });

  it("[INV-02][INV-14] stores only a hash; the plain code is in the creating response only", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [created] = await createInvitations(ctx, root, ["Anna"]);
    const plain = created?.code.replaceAll("-", "") ?? "";

    const rows = ctx.database.db.select().from(invitationsTable).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.codeHash).toBe(hashToken(plain));
    expect(JSON.stringify(rows)).not.toContain(plain);
    expect(JSON.stringify(rows)).not.toContain(created?.code ?? "");
    expect(JSON.stringify(ctx.event.auditEntries())).not.toContain(plain);

    const list = await ctx.app.inject({
      url: "/api/admin/invitations",
      headers: { cookie: root.cookie },
    });
    expect(list.body).not.toContain(plain);
    expect(list.json<{ invitations: object[] }>().invitations[0]).not.toHaveProperty("code");
  });
});

describe("redeeming a code", () => {
  it("[INV-03][INV-10] a code is redeemed exactly once and stays recorded as redeemed", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna Muster"]);
    const code = invitation?.code ?? "";

    const first = await register(ctx, code, "anna");
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({
      user: { username: "anna", displayName: "Anna Muster", roles: ["vip"] },
    });
    const second = await register(ctx, code, "anna2");
    expect(second.statusCode).toBe(410);
    expect(second.json()).toMatchObject({ error: { code: "invitation_redeemed" } });
    expect(ctx.auth.accounts.findUser("anna2")).toBeUndefined();

    const list = await ctx.app.inject({
      url: "/api/admin/invitations",
      headers: { cookie: root.cookie },
    });
    expect(
      list.json<{ invitations: { status: string; redeemedBy: number | null }[] }>().invitations[0],
    ).toMatchObject({
      status: "redeemed",
      redeemedBy: ctx.auth.accounts.findUser("anna")?.id,
    });
    // The new guest can sign in with the password chosen at redemption.
    await expect(login(ctx, "anna")).resolves.toBeDefined();
  });

  it("[INV-08] concurrent redemptions of one code: exactly one wins", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    const code = invitation?.code ?? "";

    const results = await Promise.all(
      ["a1", "a2", "a3", "a4", "a5"].map((name) => register(ctx, code, `user-${name}`)),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 410, 410, 410, 410]);
    expect(
      ctx.auth.accounts.listUsers().filter((u) => (u.username ?? "").startsWith("user-")),
    ).toHaveLength(1);
  });

  it("[INV-07][ACC-06] registering refuses a password equal to the username; the code stays unused", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    const response = await register(ctx, invitation?.code ?? "", "anna.muster", {
      password: "Anna.Muster",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "password_is_username" } });
    expect((await register(ctx, invitation?.code ?? "", "anna.muster")).statusCode).toBe(201);
  });

  it("[INV-08] a failed registration does not consume the code", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    await makeUser(ctx, "taken", ["vip"]);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    const code = invitation?.code ?? "";

    const clash = await register(ctx, code, "taken");
    expect(clash.statusCode).toBe(409);
    expect(clash.json()).toMatchObject({ error: { code: "username_taken" } });
    expect((await preview(ctx, code)).statusCode).toBe(200);
    expect((await register(ctx, code, "anna")).statusCode).toBe(201);
  });

  it("[INV-07][ACC-07] a signed-in user without vip redeems the code and keeps the account", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const helper = await makeUser(ctx, "helper", ["staff"]);
    const [invitation] = await createInvitations(ctx, root, ["Helper Hans"]);
    const usersBefore = ctx.auth.accounts.listUsers().length;
    const session = await login(ctx, "helper");

    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${invitation?.code ?? ""}/redeem`,
      headers: as(session),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      user: { id: helper.id, username: "helper", roles: ["staff", "vip"] },
    });
    // The inactive account of the invitation is merged into the signed-in one and gone.
    expect(ctx.auth.accounts.listUsers()).toHaveLength(usersBefore - 1);
    expect(ctx.auth.invitations.list()[0]).toMatchObject({
      status: "redeemed",
      redeemedBy: helper.id,
      userId: helper.id,
    });
    const row = ctx.database.db
      .select()
      .from(memberships)
      .all()
      .find((m) => m.userId === helper.id);
    expect(row).toMatchObject({
      vipAssignment: "invitation_code",
      vipInvitationId: invitation?.id,
    });
  });

  it("[INV-07] needs a signed-in user, and a VIP cannot use up a code", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    await makeUser(ctx, "anna", ["vip"]);
    const [invitation] = await createInvitations(ctx, root, ["Someone"]);
    const code = invitation?.code ?? "";

    const anonymous = await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${code}/redeem`,
    });
    expect(anonymous.statusCode).toBe(401);
    const anna = await login(ctx, "anna");
    const again = await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${code}/redeem`,
      headers: as(anna),
    });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: { code: "already_vip" } });
    expect((await preview(ctx, code)).statusCode).toBe(200); // not consumed
  });

  it("[INV-08] redemption by an existing account is atomic as well", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    await makeUser(ctx, "h1", ["staff"]);
    await makeUser(ctx, "h2", ["staff"]);
    const [invitation] = await createInvitations(ctx, root, ["Helper"]);
    const code = invitation?.code ?? "";
    const [one, two] = [await login(ctx, "h1"), await login(ctx, "h2")];
    const results = await Promise.all(
      [one, two].map((who) =>
        ctx.app.inject({
          method: "POST",
          url: `/api/invitations/${code}/redeem`,
          headers: as(who),
        }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 410]);
    const vips = ctx.auth.accounts.listUsers().filter((u) => u.roles.includes("vip"));
    expect(vips).toHaveLength(1);
  });

  it("[INV-12] rejects unknown and malformed codes, validated on the server", async () => {
    const ctx = await setup();
    for (const code of ["nonsense", "AAAAAA", "K7QMX0"]) {
      const response = await preview(ctx, code);
      expect(response.statusCode, code).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: "invalid_invitation" } });
    }
    const bad = await register(ctx, "AAAAAA", "anna");
    expect(bad.statusCode).toBe(404);
    const weak = await ctx.app.inject({
      method: "POST",
      url: "/api/invitations/AAAAAA/register",
      payload: { username: "x", password: "short" },
    });
    expect(weak.statusCode).toBe(400);
  });

  it("[INV-12][SEC-02] rate-limits redemption attempts per address", async () => {
    const ctx = await setup();
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push((await preview(ctx, "AAAAAA")).statusCode);
    expect(codes.slice(0, 20).every((c) => c === 404)).toBe(true);
    expect(codes[20]).toBe(429);
  });

  it("[INV-12][SEC-02] 100 failed attempts per hour across all addresses block redemption for everyone", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    const code = invitation?.code ?? "";
    const from = (n: number, path: string) =>
      ctx.app.inject({
        url: `/api/invitations/${path}`,
        remoteAddress: `10.0.${String(Math.floor(n / 250))}.${String(n % 250)}`,
      });

    // A guesser with many addresses stays below the limit per address ...
    for (let n = 0; n < 100; n++) expect((await from(n, "AAAAAA")).statusCode).toBe(404);
    // ... but the 101st failure anywhere is refused, and so is a valid code.
    const blocked = await from(500, "AAAAAA");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect((await from(501, code)).statusCode).toBe(429);
    const register = await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${code}/register`,
      remoteAddress: "10.9.9.9",
      payload: { username: "anna", password: PASSWORD },
    });
    expect(register.statusCode).toBe(429);
  });

  it("[INV-12][SEC-02] successful lookups from one address are not limited: guests share the venue's Wi-Fi", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    for (let n = 0; n < 30; n++) {
      expect((await preview(ctx, invitation?.code ?? "")).statusCode).toBe(200);
    }
    // Failures from the address still count.
    for (let n = 0; n < 20; n++) expect((await preview(ctx, "AAAAAA")).statusCode).toBe(404);
    expect((await preview(ctx, invitation?.code ?? "")).statusCode).toBe(429);
  });

  it("[INV-08] the update itself refuses a code that is no longer active, whatever checked it before", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    const id = invitation?.id ?? 0;
    const user = ctx.auth.accounts.createUser({ username: "anna", roles: [] }, "cli");
    markRedeemed(ctx.database.db, id, user.id, new Date());
    // A second transaction that had seen the code as active loses at the update.
    expect(() => {
      markRedeemed(ctx.database.db, id, user.id, new Date());
    }).toThrow(expect.objectContaining({ code: "invitation_redeemed" }));
  });

  it("[INV-01][INV-12] a new code that is already taken is drawn again, so the batch succeeds", async () => {
    const ctx = await setup();
    const drawn = ["AAAAAA", "AAAAAA", "AAAAAA", "BBBBBB"];
    const service = new InvitationService(
      ctx.database,
      ctx.event,
      ctx.auth.accounts,
      () => new Date(),
      () => drawn.shift() ?? newInvitationCode(),
    );
    const issued = service.create([{ name: "Anna" }, { name: "Ben" }], undefined, "cli");
    expect(issued.map((i) => i.code)).toEqual(["AAAAAA", "BBBBBB"]);
  });

  it("[INV-12] successful lookups do not count against the global limit", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    for (let n = 0; n < 150; n++) {
      const response = await ctx.app.inject({
        url: `/api/invitations/${invitation?.code ?? ""}`,
        remoteAddress: `10.1.${String(Math.floor(n / 250))}.${String(n % 250)}`,
      });
      expect(response.statusCode).toBe(200);
    }
  });

  it("[INV-12] the database refuses two invitations with the same code", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    await createInvitations(ctx, root, ["Anna"]);
    const [row] = ctx.database.db.select().from(invitationsTable).all();
    expect(() =>
      ctx.database.db
        .insert(invitationsTable)
        .values({
          eventId: ctx.event.eventId,
          guestName: "Twin",
          codeHash: row?.codeHash ?? "",
          createdAt: new Date(),
        })
        .run(),
    ).toThrow(/UNIQUE/);
  });
});

describe("expiry, revocation and replacement", () => {
  it("[INV-04][INV-06] an expired code cannot be redeemed and shows the status expired", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const soon = new Date(Date.now() + 60_000).toISOString();
    const [invitation] = await createInvitations(ctx, root, ["Anna"], soon);
    expect(invitation?.expiresAt).toBe(soon);
    expect((await preview(ctx, invitation?.code ?? "")).statusCode).toBe(200);

    // The same database, a service whose clock is a day later.
    const later = new InvitationService(
      ctx.database,
      ctx.event,
      ctx.auth.accounts,
      () => new Date(Date.now() + 86_400_000),
    );
    expect(later.list()[0]?.status).toBe("expired");
    expect(() => later.preview(invitation?.code ?? "")).toThrow(/expired/);
    await expect(
      later.redeemWithNewAccount(invitation?.code ?? "", { username: "anna", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "invitation_expired" });
    expect(ctx.auth.accounts.findUser("anna")).toBeUndefined();
  });

  it("[INV-04] an expiry date in the past is refused, when creating and when regenerating", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const past = new Date(Date.now() - 1000).toISOString();
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/invitations",
      headers: as(root),
      payload: { guests: [{ name: "Anna" }], expiresAt: past },
    });
    expect(response.statusCode).toBe(400);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    const regenerate = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/invitations/${String(invitation?.id)}/regenerate`,
      headers: as(root),
      payload: { expiresAt: past },
    });
    expect(regenerate.statusCode).toBe(400);
    expect(ctx.auth.invitations.list().map((i) => i.status)).toEqual(["active"]);
  });

  it("[INV-05][INV-06] an expired code cannot be revoked, but it can be regenerated", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const soon = new Date(Date.now() + 60_000).toISOString();
    const [invitation] = await createInvitations(ctx, root, ["Anna"], soon);
    const later = new InvitationService(
      ctx.database,
      ctx.event,
      ctx.auth.accounts,
      () => new Date(Date.now() + 86_400_000),
    );
    expect(() => later.revoke(invitation?.id ?? 0, "cli")).toThrow(
      expect.objectContaining({ code: "not_revocable" }),
    );
    const fresh = later.regenerate(invitation?.id ?? 0, undefined, "cli");
    expect(fresh.invitation.status).toBe("active");
    expect(later.list().map((i) => i.status)).toEqual(["active", "replaced"]);
  });

  it("[INV-05][INV-06] an admin revokes a code; it can no longer be redeemed", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    const revoke = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/invitations/${String(invitation?.id)}/revoke`,
      headers: as(root),
    });
    expect(revoke.statusCode, revoke.body).toBe(200);
    // The guest never registered, so revoking the only code removes the guest (INV-20).
    expect(revoke.json()).toMatchObject({ status: "revoked", guestRemoved: true });
    const attempt = await register(ctx, invitation?.code ?? "", "anna");
    expect(attempt.statusCode).toBe(404);
    expect(attempt.json()).toMatchObject({ error: { code: "invalid_invitation" } });
    const again = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/invitations/${String(invitation?.id)}/revoke`,
      headers: as(root),
    });
    expect(again.statusCode).toBe(404);
  });

  it("[INV-05][INV-06] regenerating replaces the code: the old one is invalid, the new one works", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [old] = await createInvitations(ctx, root, ["Anna Muster"]);
    const regenerate = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/invitations/${String(old?.id)}/regenerate`,
      headers: as(root),
    });
    expect(regenerate.statusCode, regenerate.body).toBe(201);
    const fresh = regenerate.json<IssuedInvitation>();
    expect(fresh).toMatchObject({ guestName: "Anna Muster", status: "active" });
    expect(fresh.code).not.toBe(old?.code);

    const replaced = await register(ctx, old?.code ?? "", "anna");
    expect(replaced.statusCode).toBe(410);
    expect(replaced.json()).toMatchObject({ error: { code: "invitation_replaced" } });
    expect((await register(ctx, fresh.code, "anna")).statusCode).toBe(201);

    const statuses = ctx.auth.invitations.list().map((i) => i.status);
    expect(statuses).toEqual(["redeemed", "replaced"]);
    // A redeemed or replaced code cannot be regenerated again.
    const twice = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/invitations/${String(old?.id)}/regenerate`,
      headers: as(root),
    });
    expect(twice.statusCode).toBe(409);
    const missing = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/invitations/9999/regenerate",
      headers: as(root),
    });
    expect(missing.statusCode).toBe(404);
  });

  it("[INV-06] every code has exactly one of the five statuses", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const past = new Date(Date.now() + 60_000).toISOString();
    const made = await createInvitations(ctx, root, ["a1", "a2", "a3", "a4"]);
    const [redeemed, revoked, replaced] = made;
    await register(ctx, redeemed?.code ?? "", "one");
    ctx.auth.invitations.revoke(revoked?.id ?? 0, "cli");
    ctx.auth.invitations.regenerate(replaced?.id ?? 0, undefined, "cli");
    await createInvitations(ctx, root, ["soon"], past);
    const later = new InvitationService(
      ctx.database,
      ctx.event,
      ctx.auth.accounts,
      () => new Date(Date.now() + 86_400_000),
    );
    expect(
      later
        .list()
        .map((i) => i.status)
        .sort(),
      // A revoked code of a guest who never registered is gone with the guest (INV-20).
    ).toEqual(["active", "active", "expired", "redeemed", "replaced"].sort());
  });

  it("[INV-09] vip stays after the code expires, is revoked or replaced", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    await register(ctx, invitation?.code ?? "", "anna");

    // The code is redeemed; later changes to it do not touch the account's role.
    expect(() => ctx.auth.invitations.revoke(invitation?.id ?? 0, "cli")).toThrow(
      /cannot be revoked/,
    );
    expect(() => ctx.auth.invitations.regenerate(invitation?.id ?? 0, undefined, "cli")).toThrow();
    expect(ctx.auth.accounts.findUser("anna")?.roles).toEqual(["vip"]);
    const later = new InvitationService(
      ctx.database,
      ctx.event,
      ctx.auth.accounts,
      () => new Date(Date.now() + 10 * 365 * 86_400_000),
    );
    expect(later.list()[0]?.status).toBe("redeemed");
    expect(ctx.auth.accounts.findUser("anna")?.roles).toEqual(["vip"]);
  });

  it("[INV-10] a deleted account leaves its code recorded as redeemed", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    const registered = await register(ctx, invitation?.code ?? "", "anna");
    const id = registered.json<{ user: { id: number } }>().user.id;
    await makeUser(ctx, "second", ["admin"]);
    await ctx.auth.accounts.deleteAccount(id, PASSWORD);
    // The guest-list entry stays (7.1.2): the code is still redeemed by the same, now inactive, account.
    expect(ctx.auth.invitations.list()[0]).toMatchObject({ status: "redeemed", redeemedBy: id });
    expect((await register(ctx, invitation?.code ?? "", "anna")).statusCode).toBe(410);
  });
});

describe("assigning vip without a code", () => {
  it("[INV-11] an admin promotes a user directly; method audit-logged, no code created or consumed", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const helper = await makeUser(ctx, "helper", ["staff"]);
    const [pending] = await createInvitations(ctx, root, ["Pending"]);

    const response = await ctx.app.inject({
      method: "PUT",
      url: `/api/admin/users/${String(helper.id)}/roles`,
      headers: as(root),
      payload: { roles: ["staff", "vip"] },
    });
    expect(response.statusCode, response.body).toBe(200);

    const list = await ctx.app.inject({
      url: "/api/admin/users",
      headers: { cookie: root.cookie },
    });
    const users = list.json<{ users: { username: string; vipAssignment: string | null }[] }>()
      .users;
    expect(users.find((u) => u.username === "helper")?.vipAssignment).toBe("admin_promotion");
    expect(users.find((u) => u.username === "root")?.vipAssignment).toBeNull();
    expect(ctx.auth.invitations.list()).toHaveLength(1); // nothing created
    expect(ctx.auth.invitations.list()[0]).toMatchObject({ id: pending?.id, status: "active" }); // nothing consumed
    const entry = ctx.event.auditEntries().find((e) => e.action === "user.roles");
    expect(entry?.details).toMatchObject({ vipAssignment: "admin_promotion" });
  });

  it("[INV-11] the assignment method tells a code from a promotion, and goes when vip is revoked", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    await register(ctx, invitation?.code ?? "", "anna");
    const promoted = await makeUser(ctx, "ben", ["vip"]); // as created by an admin
    const method = (name: string) =>
      ctx.auth.accounts.listUsers().find((u) => u.username === name)?.vipAssignment;
    expect(method("anna")).toBe("invitation_code");
    expect(method("ben")).toBe("admin_promotion");

    ctx.auth.accounts.setRoles(promoted.id, [], "cli");
    expect(method("ben")).toBeNull();
  });
});

describe("an account per invitation (ACC-17, INV-20; 7.1.2)", () => {
  interface AdminUserBody {
    id: number;
    username: string | null;
    status: string;
    displayName: string;
    roles: string[];
    invitedProgramItemIds: number[];
  }

  async function users(ctx: TestContext, root: SignedIn) {
    const response = await ctx.app.inject({ url: "/api/admin/users", headers: as(root) });
    return response.json<{ users: AdminUserBody[] }>().users;
  }

  const items = (ctx: TestContext) => {
    const made = ["Trauung", "Dinner"].map((name, i) =>
      ctx.auth.rsvp.createProgramItem(
        { name, startsAt: `2027-06-12T${String(12 + i * 4)}:00:00.000Z`, hasMeal: i === 1 },
        "cli",
      ),
    );
    return made.map((item) => item.id);
  };

  it("[ACC-17] creating an invitation creates an inactive account on the guest list, with its program items", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [trauung] = items(ctx);
    const [anna] = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/admin/invitations",
        headers: as(root),
        payload: { guests: [{ name: "Anna Muster" }], programItemIds: [trauung] },
      })
    ).json<{ invitations: IssuedInvitation[] }>().invitations;

    const account = (await users(ctx, root)).find((u) => u.displayName === "Anna Muster");
    expect(account).toMatchObject({
      username: null,
      status: "inactive",
      roles: ["vip"],
      invitedProgramItemIds: [trauung],
    });
    expect(anna).toMatchObject({ userId: account?.id, programItemIds: [trauung] });
    // The guest is in the RSVP overview as "ohne Antwort"; nobody can sign in or be reminded.
    const overview = ctx.auth.rsvp.overview();
    expect(overview.guests.find((g) => g.userId === account?.id)).toMatchObject({
      name: "Anna Muster",
      status: "none",
      verifiedEmail: false,
    });
    expect(overview.total).toBe(1);
    expect(ctx.auth.rsvp.reminderRecipients()).toEqual([]);
    // Its roles are locked until the guest registers.
    const locked = await ctx.app.inject({
      method: "PUT",
      url: `/api/admin/users/${String(account?.id)}/roles`,
      headers: as(root),
      payload: { roles: ["vip", "staff"] },
    });
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toMatchObject({ error: { code: "roles_locked" } });
  });

  it("[ACC-17] registering activates the same account; the program items of the invitation and the account panel are one list", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [trauung, dinner] = items(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna Muster"]);
    const before = (await users(ctx, root)).find((u) => u.displayName === "Anna Muster");

    // The admin changes the program items on the invitation row: the account has them.
    const changed = await ctx.app.inject({
      method: "PUT",
      url: `/api/admin/invitations/${String(invitation?.id)}/program-items`,
      headers: as(root),
      payload: { programItemIds: [dinner] },
    });
    expect(changed.json()).toMatchObject({ programItemIds: [dinner] });
    expect(
      (await users(ctx, root)).find((u) => u.id === before?.id)?.invitedProgramItemIds,
    ).toEqual([dinner]);

    const registered = await register(ctx, invitation?.code ?? "", "anna", {
      displayName: "Anna M.",
      email: "anna@example.org",
    });
    expect(registered.statusCode, registered.body).toBe(201);
    expect(registered.json()).toMatchObject({
      user: { id: before?.id, username: "anna", displayName: "Anna M.", roles: ["vip"] },
    });
    const after = (await users(ctx, root)).find((u) => u.id === before?.id);
    expect(after).toMatchObject({
      username: "anna",
      status: "active",
      invitedProgramItemIds: [dinner],
    });
    expect(ctx.auth.invitations.list()[0]).toMatchObject({
      status: "redeemed",
      redeemedBy: before?.id,
      userId: before?.id,
    });
    expect(trauung).toBeDefined();
    // Now the guest signs in, and the audit log names the method.
    await login(ctx, "anna");
    expect(ctx.event.auditEntries().find((e) => e.action === "invitation.redeem")?.details).toEqual(
      { invitationId: invitation?.id, userId: before?.id, method: "register" },
    );
  });

  it("[ACC-17] a taken username leaves the code and the inactive account as they were", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    const taken = await register(ctx, invitation?.code ?? "", "root");
    expect(taken.statusCode).toBe(409);
    expect(ctx.auth.invitations.list()[0]?.status).toBe("active");
    expect((await users(ctx, root)).find((u) => u.displayName === "Anna")?.status).toBe("inactive");
    expect((await register(ctx, invitation?.code ?? "", "anna")).statusCode).toBe(201);
  });

  it("[ACC-17] a regenerated code belongs to the same account; the old one is dead", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna"]);
    const fresh = ctx.auth.invitations.regenerate(invitation?.id ?? 0, undefined, "cli");
    expect(fresh.invitation.userId).toBe(invitation?.userId);
    expect((await register(ctx, invitation?.code ?? "", "anna")).statusCode).toBe(410);
    const registered = await register(ctx, fresh.code, "anna");
    expect(registered.statusCode).toBe(201);
    expect(registered.json()).toMatchObject({ user: { id: invitation?.userId } });
    const row = ctx.database.db
      .select()
      .from(memberships)
      .all()
      .find((m) => m.userId === invitation?.userId);
    expect(row?.vipInvitationId).toBe(fresh.invitation.id);
  });

  it("[INV-20] revoking the last open code of a never-activated account removes the guest with their RSVP and companions", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const everything = items(ctx);
    const [keep, drop] = await createInvitations(ctx, root, ["Bleibt", "Geht"]);
    const list = ctx.auth.invitations.list();
    expect(list.find((i) => i.id === drop?.id)?.removesGuest).toBe(true);
    // The admin answered for the guest (e.g. by phone), and added a companion.
    const attendance = everything.map((programItemId) => ({ programItemId, attending: false }));
    ctx.auth.rsvp.answer(drop?.userId ?? 0, { attendance }, "cli", true);
    ctx.auth.rsvp.requestCompanion(drop?.userId ?? 0, { name: "Begleitung", attendance }, "cli");

    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/invitations/${String(drop?.id)}/revoke`,
      headers: as(root),
    });
    expect(response.json()).toMatchObject({ status: "revoked", guestRemoved: true });
    const names = (await users(ctx, root)).map((u) => u.displayName);
    expect(names).toContain("Bleibt");
    expect(names).not.toContain("Geht");
    expect(ctx.auth.rsvp.overview().total).toBe(1);
    expect(ctx.auth.invitations.list().map((i) => i.id)).toEqual([keep?.id]);
    const count = (table: string) =>
      (ctx.database.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect(count("rsvp_answers")).toBe(0);
    expect(count("rsvp_attendance")).toBe(0);
    expect(count("companions")).toBe(0);
    // The audit entry has ids only.
    const audit = ctx.event.auditEntries().find((e) => e.action === "invitation.revoke");
    expect(audit?.details).toEqual({ invitationId: drop?.id, guestRemoved: true });
    expect(JSON.stringify(ctx.event.auditEntries())).not.toContain("Geht");
  });

  it("[ACC-07][INV-07] a signed-in account without vip takes over the invited person's program items, RSVP, companions and groups", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const [trauung, dinner] = items(ctx);
    const helper = await makeUser(ctx, "helper", ["staff"]);
    const [invitation] = await createInvitations(ctx, root, ["Helper Hans"]);
    const invited = invitation?.userId ?? 0;
    // What the admin entered for the invited person before the card was redeemed.
    ctx.auth.rsvp.answer(
      invited,
      {
        attendance: [
          { programItemId: trauung ?? 0, attending: true },
          { programItemId: dinner ?? 0, attending: true },
        ],
        menuId: undefined,
      },
      "cli",
      true,
    );
    const group = ctx.auth.groups.create("Familie", "cli");
    ctx.auth.groups.addMember(group.id, invited, "cli");

    const session = await login(ctx, "helper");
    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${invitation?.code ?? ""}/redeem`,
      headers: as(session),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      user: { id: helper.id, username: "helper", roles: ["staff", "vip"] },
    });
    // The signed-in account is the guest now; the invited person's account is gone.
    expect(ctx.auth.rsvp.invitedProgramItemIds(helper.id)).toEqual([trauung, dinner]);
    expect(ctx.auth.rsvp.state(helper.id).answer?.attendingItemIds).toEqual([trauung, dinner]);
    expect(ctx.auth.groups.list()[0]?.memberIds).toEqual([helper.id]);
    const names = (await users(ctx, root)).map((u) => u.id);
    expect(names).not.toContain(invited);
    expect(ctx.event.auditEntries().find((e) => e.action === "invitation.redeem")?.details).toEqual(
      { invitationId: invitation?.id, userId: helper.id, method: "merge", mergedUserId: invited },
    );
  });

  it("[ACC-07] an account that already has vip gets 409 and the code stays usable", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    await makeUser(ctx, "anna", ["vip"]);
    const [invitation] = await createInvitations(ctx, root, ["Someone"]);
    const session = await login(ctx, "anna");
    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${invitation?.code ?? ""}/redeem`,
      headers: as(session),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "already_vip" } });
    expect(ctx.auth.invitations.list()[0]?.status).toBe("active");
    expect((await users(ctx, root)).filter((u) => u.status === "inactive")).toHaveLength(1);
  });

  it("[ACC-17][ACC-12] a guest who deletes their account stays on the guest list as an inactive account", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const everything = items(ctx);
    const [invitation] = await createInvitations(ctx, root, ["Anna Muster"]);
    await register(ctx, invitation?.code ?? "", "anna", { email: "anna@example.org" });
    const userId = invitation?.userId ?? 0;
    ctx.auth.rsvp.answer(
      userId,
      { attendance: everything.map((programItemId) => ({ programItemId, attending: true })) },
      "cli",
      true,
    );
    const session = await login(ctx, "anna");
    const removed = await ctx.app.inject({
      method: "DELETE",
      url: "/api/profile",
      headers: as(session),
      payload: { password: PASSWORD },
    });
    expect(removed.statusCode).toBe(204);

    const account = (await users(ctx, root)).find((u) => u.id === userId);
    expect(account).toMatchObject({
      username: null,
      status: "inactive",
      displayName: "Anna Muster",
      roles: ["vip"],
    });
    // Login, address and sessions are gone; the entry and its RSVP stay; the code stays redeemed.
    const login2 = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "anna", password: PASSWORD },
    });
    expect(login2.statusCode).toBe(401);
    expect(
      (await ctx.app.inject({ url: "/api/session", headers: { cookie: session.cookie } })).json(),
    ).toMatchObject({ user: null });
    expect(ctx.auth.rsvp.overview().guests[0]).toMatchObject({
      name: "Anna Muster",
      status: "attending",
    });
    expect(ctx.auth.invitations.list()[0]).toMatchObject({ status: "redeemed", userId });
    // An inactive account is not a guest who can be uninvited by revoking: the code is redeemed.
    expect(ctx.auth.invitations.list()[0]?.removesGuest).toBe(false);
  });

  it("[ACC-17] an account an admin creates is inactive until its setup link is used, and cannot sign in before", async () => {
    const ctx = await setup();
    const root = await admin(ctx);
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: as(root),
      payload: { username: "helper", roles: ["staff"] },
    });
    expect(created.statusCode).toBe(201);
    expect((await users(ctx, root)).find((u) => u.username === "helper")?.status).toBe("inactive");
    const token = created.json<{ setupUrl: string }>().setupUrl.split("/").at(-1);
    const early = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "helper", password: PASSWORD },
    });
    expect(early.statusCode).toBe(401);
    const set = await ctx.app.inject({
      method: "POST",
      url: "/api/password/set",
      payload: { token, newPassword: PASSWORD },
    });
    expect(set.statusCode).toBe(204);
    expect((await users(ctx, root)).find((u) => u.username === "helper")?.status).toBe("active");
    await login(ctx, "helper");
  });
});
