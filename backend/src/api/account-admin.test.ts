// Blocking, deleting and creating accounts as an admin, and cleaning up invitations
// (ACC-18, ACC-19, ACC-20, INV-21; sw-architecture.md 7.1.2).
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { IssuedInvitation, Role } from "@zappaloo/shared";
import { invitations as invitationsTable } from "../database/schema.ts";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { SESSION_COOKIE } from "./auth.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const PASSWORD = "correct-horse-battery";

interface SignedIn {
  cookie: string;
  csrf: string;
  id: number;
}

async function makeUser(ctx: TestContext, username: string, roles: Role[]): Promise<SignedIn> {
  const user = ctx.auth.accounts.createUser({ username, roles }, "cli");
  const link = ctx.auth.accounts.createLink(user.id, "setup", "cli");
  await ctx.auth.accounts.useLink(link.token, PASSWORD);
  return { ...(await login(ctx, username)), id: user.id };
}

async function login(ctx: TestContext, username: string, password = PASSWORD) {
  const response = await ctx.app.inject({
    method: "POST",
    url: "/api/session",
    payload: { username, password },
  });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error(`no session cookie: ${response.body}`);
  return {
    cookie: `${SESSION_COOKIE}=${cookie.value}`,
    csrf: response.json<{ csrfToken: string }>().csrfToken,
  };
}

const as = (who: { cookie: string; csrf: string }) => ({
  cookie: who.cookie,
  "x-csrf-token": who.csrf,
});

async function setup() {
  const ctx = await createTestApp();
  context = ctx;
  const root = await makeUser(ctx, "root", ["admin"]);
  const call = async (
    who: { cookie: string; csrf: string },
    method: "POST" | "PUT" | "DELETE",
    url: string,
    payload?: object,
  ) => {
    const response = await ctx.app.inject({
      method,
      url,
      headers: as(who),
      ...(payload === undefined ? {} : { payload }),
    });
    return { status: response.statusCode, body: response.body ? response.json<unknown>() : null };
  };
  const items = ["Trauung", "Dinner"].map(
    (name, i) =>
      ctx.auth.rsvp.createProgramItem(
        { name, startsAt: `2027-06-12T${String(12 + i * 4)}:00:00.000Z`, hasMeal: false },
        "cli",
      ).id,
  );
  const count = (table: string) =>
    (ctx.database.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  const status = (id: number) =>
    (
      ctx.database.sqlite.prepare("SELECT status FROM users WHERE id = ?").get(id) as
        { status: string } | undefined
    )?.status;
  return { ctx, root, call, items, count, status };
}

const ERROR = (body: unknown) => (body as { error: { code: string } }).error.code;

describe("blocking an account (ACC-18)", () => {
  it("[ACC-18] a blocked account cannot sign in and gets the answer of a wrong password; its sessions and open links end", async () => {
    const { ctx, root, call } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    const link = ctx.auth.accounts.createLink(anna.id, "reset", "cli");
    const group = ctx.auth.groups.create("Familie", "cli");
    ctx.auth.groups.addMember(group.id, anna.id, "cli");

    expect((await call(root, "POST", `/api/admin/users/${String(anna.id)}/block`)).status).toBe(
      204,
    );
    // The session is gone, the open reset link is dead.
    const session = await ctx.app.inject({ url: "/api/session", headers: { cookie: anna.cookie } });
    expect(session.json()).toMatchObject({ user: null });
    await expect(ctx.auth.accounts.useLink(link.token, "another-long-password")).rejects.toThrow(
      /link/,
    );
    // Sign-in: the same answer as for a wrong password, so nobody learns the state.
    const blocked = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "anna", password: PASSWORD },
    });
    const wrong = await ctx.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "anna", password: "not-the-password" },
    });
    expect(blocked.statusCode).toBe(401);
    expect(blocked.json()).toEqual(wrong.json());
    // Roles, groups and the guest list entry stay.
    const listed = ctx.auth.accounts.listUsers().find((u) => u.id === anna.id);
    expect(listed).toMatchObject({ status: "blocked", roles: ["vip"] });
    expect(ctx.auth.groups.list()[0]?.memberIds).toEqual([anna.id]);
    expect(ctx.auth.rsvp.overview().total).toBe(1);
    // Unblocking: active again with the old password.
    expect((await call(root, "POST", `/api/admin/users/${String(anna.id)}/unblock`)).status).toBe(
      204,
    );
    await login(ctx, "anna");
    const audit = ctx.event
      .auditEntries()
      .filter((e) => e.action === "user.block" || e.action === "user.unblock")
      .map((e) => [e.action, e.actor, e.details]);
    expect(audit).toEqual([
      ["user.unblock", `user:${String(root.id)}`, { userId: anna.id }],
      ["user.block", `user:${String(root.id)}`, { userId: anna.id }],
    ]);
  });

  it("[ACC-18] only an active account is blocked, only a blocked one unblocked, never one's own, and only by admins", async () => {
    const { ctx, root, call } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    const ben = await makeUser(ctx, "ben", ["staff"]);
    const [invitation] = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/admin/invitations",
        headers: as(root),
        payload: { guests: [{ name: "Inaktiv" }] },
      })
    ).json<{ invitations: IssuedInvitation[] }>().invitations;

    const block = (id: number, who = root) =>
      call(who, "POST", `/api/admin/users/${String(id)}/block`);
    const unblock = (id: number) => call(root, "POST", `/api/admin/users/${String(id)}/unblock`);
    // An inactive account is uninvited by revoking its invitation instead.
    const inactive = await block(invitation?.userId ?? 0);
    expect(inactive.status).toBe(409);
    expect(ERROR(inactive.body)).toBe("not_active");
    const own = await block(root.id);
    expect(own.status).toBe(409);
    expect(ERROR(own.body)).toBe("own_account");
    expect((await unblock(anna.id)).status).toBe(409);
    expect((await block(9999)).status).toBe(404);
    expect((await block(anna.id, ben)).status).toBe(403);
    expect(ctx.auth.accounts.listUsers().find((u) => u.id === anna.id)?.status).toBe("active");
  });
});

describe("deleting an account (ACC-19)", () => {
  it("[ACC-19] an admin deletes an account in any state with its RSVP, companions and all its invitations", async () => {
    const { ctx, root, call, items, count, status } = await setup();
    const attendance = items.map((programItemId) => ({ programItemId, attending: true }));
    const created = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/admin/invitations",
        headers: as(root),
        payload: { guests: [{ name: "Inaktiv" }, { name: "Aktiv" }, { name: "Gesperrt" }] },
      })
    ).json<{ invitations: IssuedInvitation[] }>().invitations;
    const [inactive, active, blocked] = created;
    // One of them registers and is blocked; each has an RSVP with a companion entered.
    for (const [invitation, username] of [
      [active, "aktiv"],
      [blocked, "gesperrt"],
    ] as const) {
      await ctx.app.inject({
        method: "POST",
        url: `/api/invitations/${invitation?.code ?? ""}/register`,
        payload: { username, password: PASSWORD },
      });
    }
    await call(root, "POST", `/api/admin/users/${String(blocked?.userId)}/block`);
    for (const invitation of created) {
      const userId = invitation.userId ?? 0;
      ctx.auth.rsvp.answer(userId, { attendance }, "cli", true);
      ctx.auth.rsvp.requestCompanion(
        userId,
        { name: "Begleitung", personType: "adult", attendance },
        "cli",
      );
    }
    // The inactive guest also has a replaced code.
    ctx.auth.invitations.regenerate(inactive?.id ?? 0, undefined, "cli");
    expect(count("companions")).toBe(3);
    expect(count("invitations")).toBe(4);

    for (const invitation of created) {
      const id = invitation.userId ?? 0;
      const deleted = await call(root, "DELETE", `/api/admin/users/${String(id)}`);
      expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);
      expect(status(id)).toBeUndefined();
    }
    for (const table of [
      "invitations",
      "companions",
      "companion_attendance",
      "rsvp_answers",
      "rsvp_attendance",
      "membership_program_items",
    ]) {
      expect(count(table), table).toBe(0);
    }
    expect(ctx.auth.rsvp.overview().total).toBe(0);
    // The log keeps ids only.
    const entries = ctx.event.auditEntries().filter((e) => e.action === "user.admin_delete");
    expect(entries).toHaveLength(3);
    expect(entries[0]?.details).toEqual({ userId: blocked?.userId });
    expect(JSON.stringify(ctx.event.auditEntries())).not.toContain("Gesperrt");
  });

  it("[ACC-19] not one's own account, not for a stranger's id, and only for admins", async () => {
    const { ctx, root, call, status } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    const own = await call(root, "DELETE", `/api/admin/users/${String(root.id)}`);
    expect(own.status).toBe(409);
    expect(ERROR(own.body)).toBe("own_account");
    expect((await call(root, "DELETE", "/api/admin/users/9999")).status).toBe(404);
    expect((await call(anna, "DELETE", `/api/admin/users/${String(root.id)}`)).status).toBe(403);
    expect(status(root.id)).toBe("active");
    // Another admin can be deleted while one is left.
    const second = await makeUser(ctx, "second", ["admin"]);
    expect((await call(root, "DELETE", `/api/admin/users/${String(second.id)}`)).status).toBe(204);
  });
});

describe("what a blocked account no longer gets (ACC-18)", () => {
  it("[ACC-18] a blocked account gets no reset mail, no link from an admin and no reminder, and a leftover session counts for nothing", async () => {
    const { ctx, root, call } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    ctx.auth.accounts.updateProfile(anna.id, { email: "anna@example.org" });
    ctx.auth.accounts.verifyEmail(ctx.auth.accounts.createVerification(anna.id).link.token);
    const forgot = () =>
      ctx.app.inject({
        method: "POST",
        url: "/api/password/forgot",
        payload: { identifier: "anna" },
      });
    const resetLink = () => call(root, "POST", `/api/admin/users/${String(anna.id)}/reset-link`);
    expect(ctx.auth.rsvp.reminderRecipients().map((r) => r.userId)).toEqual([anna.id]);
    expect(ctx.auth.accounts.getSessionUser(anna.id)?.username).toBe("anna");

    await call(root, "POST", `/api/admin/users/${String(anna.id)}/block`);
    // The answer of "Passwort vergessen" is the same, but no mail leaves.
    expect((await forgot()).statusCode).toBe(204);
    expect(ctx.mailer.sent).toHaveLength(0);
    const refused = await resetLink();
    expect(refused.status).toBe(409);
    expect(ERROR(refused.body)).toBe("not_active");
    expect(ctx.auth.rsvp.reminderRecipients()).toEqual([]);
    expect(ctx.auth.rsvp.overview().reminderCount).toBe(0);
    // Blocking deletes the sessions. A session that is left over anyway has no user.
    expect(ctx.auth.accounts.getSessionUser(anna.id)).toBeUndefined();

    await call(root, "POST", `/api/admin/users/${String(anna.id)}/unblock`);
    expect((await forgot()).statusCode).toBe(204);
    expect(ctx.mailer.sent).toHaveLength(1);
    expect((await resetLink()).status).toBe(201);
    expect(ctx.auth.rsvp.reminderRecipients().map((r) => r.userId)).toEqual([anna.id]);
  });
});

describe("guests whose card was replaced before stage 3.9 (ACC-19, INV-20)", () => {
  it("[ACC-19][INV-20] the guest can be deleted and uninvited although an older replaced code points to their code", async () => {
    const { ctx, root, call, count } = await setup();
    const created = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/admin/invitations",
        headers: as(root),
        payload: { guests: [{ name: "Eva" }, { name: "Udo" }] },
      })
    ).json<{ invitations: IssuedInvitation[] }>().invitations;
    const [eva, udo] = created;
    // What the migration leaves of a code that was replaced before the update: no account, and
    // `replaced_by` names the code that is in use.
    const legacy = ctx.database.sqlite.prepare(
      "INSERT INTO invitations (event_id, guest_name, code_hash, status, created_at, replaced_by, user_id) VALUES (?, ?, ?, 'replaced', 1, ?, NULL)",
    );
    for (const invitation of created) {
      legacy.run(
        ctx.event.eventId,
        invitation.guestName,
        `old-${String(invitation.id)}`,
        invitation.id,
      );
    }
    expect(count("invitations")).toBe(4);

    const deleted = await call(root, "DELETE", `/api/admin/users/${String(eva?.userId)}`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);
    const revoked = await call(root, "POST", `/api/admin/invitations/${String(udo?.id)}/revoke`);
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(200);
    expect(revoked.body).toMatchObject({ guestRemoved: true });
    // The old codes stay for "Aufräumen" and point nowhere.
    expect(ctx.auth.invitations.list().map((i) => i.status)).toEqual(["replaced", "replaced"]);
    expect((await call(root, "POST", "/api/admin/invitations/cleanup")).body).toEqual({
      deleted: 2,
    });
    expect(ctx.database.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

describe("accounts an admin creates (ACC-20)", () => {
  it("[ACC-20] an inactive account an admin created gets a new setup link, an invited guest without a username gets none", async () => {
    const { ctx, root, call, items } = await setup();
    await call(root, "POST", "/api/admin/users", {
      username: "oma",
      roles: ["vip"],
      programItemIds: items,
    });
    const oma = ctx.auth.accounts.findUser("oma");
    const issued = await call(root, "POST", `/api/admin/users/${String(oma?.id)}/reset-link`);
    expect(issued.status, JSON.stringify(issued.body)).toBe(201);
    const token = (issued.body as { resetUrl: string }).resetUrl.split("/").pop() ?? "";
    expect(ctx.auth.accounts.previewLink(token)).toEqual({ purpose: "setup", username: "oma" });
    await ctx.auth.accounts.useLink(token, PASSWORD);
    expect(ctx.auth.accounts.listUsers().find((u) => u.id === oma?.id)?.status).toBe("active");

    const invited = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/admin/invitations",
        headers: as(root),
        payload: { guests: [{ name: "Lukas" }] },
      })
    ).json<{ invitations: IssuedInvitation[] }>().invitations[0];
    const refused = await call(
      root,
      "POST",
      `/api/admin/users/${String(invited?.userId)}/reset-link`,
    );
    expect(refused.status).toBe(409);
    expect(ERROR(refused.body)).toBe("not_active");
    expect((await call(root, "POST", "/api/admin/users/9999/reset-link")).status).toBe(404);
  });

  it("[ACC-20] a new guest needs program items in the same form; the account is inactive until its setup link is used", async () => {
    const { ctx, root, call, items } = await setup();
    const create = (payload: object) => call(root, "POST", "/api/admin/users", payload);
    for (const body of [
      { username: "oma", roles: ["vip"] },
      { username: "oma", roles: ["vip"], programItemIds: [] },
    ]) {
      const refused = await create(body);
      expect(refused.status).toBe(400);
      expect(ERROR(refused.body)).toBe("program_items_required");
    }
    expect(ctx.auth.accounts.findUser("oma")).toBeUndefined();
    const unknown = await create({ username: "oma", roles: ["vip"], programItemIds: [999] });
    expect(unknown.status).toBe(404);
    expect(ctx.auth.accounts.findUser("oma")).toBeUndefined();

    const [first] = items;
    const made = await create({ username: "oma", roles: ["vip"], programItemIds: [first] });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const listed = ctx.auth.accounts.listUsers().find((u) => u.username === "oma");
    expect(listed).toMatchObject({
      status: "inactive",
      roles: ["vip"],
      invitedProgramItemIds: [first],
    });
    // Roles without vip need no program items.
    expect((await create({ username: "helper", roles: ["staff"] })).status).toBe(201);
    // The CLI keeps inviting to all program items.
    const cli = ctx.auth.accounts.createUserWithSetupLink(
      { username: "cli", roles: ["vip"] },
      "cli",
    );
    expect(ctx.auth.rsvp.invitedProgramItemIds(cli.user.id)).toEqual(items);
  });
});

describe("cleaning up invitations (INV-21)", () => {
  it("[INV-21] deletes revoked and replaced invitations and keeps active, expired and redeemed ones", async () => {
    const { ctx, root, call, count } = await setup();
    const created = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/admin/invitations",
        headers: as(root),
        payload: {
          guests: ["Aktiv", "Eingelöst", "Ersetzt", "Widerrufen"].map((name) => ({ name })),
        },
      })
    ).json<{ invitations: IssuedInvitation[] }>().invitations;
    const [active, redeemed, replaced, revoked] = created;
    await ctx.app.inject({
      method: "POST",
      url: `/api/invitations/${redeemed?.code ?? ""}/register`,
      payload: { username: "erika", password: PASSWORD },
    });
    ctx.auth.invitations.regenerate(replaced?.id ?? 0, undefined, "cli");
    // A revoked code of an account that stays (old data): set directly.
    ctx.database.db
      .update(invitationsTable)
      .set({ status: "revoked" })
      .where(eq(invitationsTable.id, revoked?.id ?? 0))
      .run();
    expect(count("invitations")).toBe(5);

    expect((await call(root, "POST", "/api/admin/invitations/cleanup")).body).toEqual({
      deleted: 2,
    });
    const left = ctx.auth.invitations.list().map((i) => [i.guestName, i.status]);
    expect(left.sort()).toEqual(
      [
        ["Aktiv", "active"],
        ["Eingelöst", "redeemed"],
        ["Ersetzt", "active"],
      ].sort(),
    );
    expect(active?.id).toBeDefined();
    expect(
      ctx.event.auditEntries().find((e) => e.action === "invitation.cleanup")?.details,
    ).toEqual({ count: 2 });
    // Nothing left to clean: the second run deletes nothing; guests who are not admins are refused.
    expect((await call(root, "POST", "/api/admin/invitations/cleanup")).body).toEqual({
      deleted: 0,
    });
    const anna = await makeUser(ctx, "anna", ["vip"]);
    expect((await call(anna, "POST", "/api/admin/invitations/cleanup")).status).toBe(403);
  });
});
