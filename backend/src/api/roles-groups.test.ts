import { afterEach, describe, expect, it } from "vitest";
import type { Capability, Role } from "@zappaloo/shared";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { requireCapability, requireRole, SESSION_COOKIE } from "./auth.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const PASSWORD = "correct-horse-battery";

async function setup(): Promise<TestContext> {
  context = await createTestApp();
  // Routes that only a role or a capability may reach, to check the guards (ROLE-05, ROLE-06, ROLE-08).
  context.app.get("/test/vip", { preHandler: requireRole("vip") }, () => ({ ok: true }));
  context.app.get("/test/staff", { preHandler: requireRole("staff") }, () => ({ ok: true }));
  context.app.get("/test/edit", { preHandler: requireCapability("editWebsiteContent") }, () => ({
    ok: true,
  }));
  context.app.get(
    "/test/moderate",
    { preHandler: requireCapability("moderateContributions") },
    () => ({
      ok: true,
    }),
  );
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
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error("no session cookie");
  return {
    cookie: `${SESSION_COOKIE}=${cookie.value}`,
    csrf: response.json<{ csrfToken: string }>().csrfToken,
  };
}

const as = (who: SignedIn) => ({ cookie: who.cookie, "x-csrf-token": who.csrf });

async function status(ctx: TestContext, who: SignedIn, url: string): Promise<number> {
  return (await ctx.app.inject({ url, headers: { cookie: who.cookie } })).statusCode;
}

const putRoles = (ctx: TestContext, admin: SignedIn, id: number, roles: Role[]) =>
  ctx.app.inject({
    method: "PUT",
    url: `/api/admin/users/${String(id)}/roles`,
    headers: as(admin),
    payload: { roles },
  });

const putCapabilities = (ctx: TestContext, admin: SignedIn, id: number, caps: Capability[]) =>
  ctx.app.inject({
    method: "PUT",
    url: `/api/admin/users/${String(id)}/capabilities`,
    headers: as(admin),
    payload: { capabilities: caps },
  });

describe("roles", () => {
  it("[ROLE-01] knows exactly the roles vip, staff and admin and combines them freely", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const anna = await makeUser(ctx, "anna", []);
    const root = await login(ctx, "root");

    const response = await putRoles(ctx, root, anna.id, ["admin", "vip", "staff"]);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ roles: ["admin", "staff", "vip"] });

    const unknown = await ctx.app.inject({
      method: "PUT",
      url: `/api/admin/users/${String(anna.id)}/roles`,
      headers: as(root),
      payload: { roles: ["visitor"] },
    });
    expect(unknown.statusCode).toBe(400);
  });

  it("[ROLE-07] only an admin lists users and changes roles", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const anna = await makeUser(ctx, "anna", ["vip", "staff"]);
    const root = await login(ctx, "root");
    const annaSession = await login(ctx, "anna");

    expect((await putRoles(ctx, annaSession, anna.id, ["admin"])).statusCode).toBe(403);
    expect(await status(ctx, annaSession, "/api/admin/users")).toBe(403);
    expect(await status(ctx, { cookie: "", csrf: "" }, "/api/admin/users")).toBe(401);

    const list = await ctx.app.inject({
      url: "/api/admin/users",
      headers: { cookie: root.cookie },
    });
    expect(list.json<{ users: { username: string }[] }>().users.map((u) => u.username)).toEqual([
      "anna",
      "root",
    ]);
  });

  it("[ROLE-03][ROLE-04] a user has vip until an admin revokes it", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const anna = await makeUser(ctx, "anna", ["vip"]);
    const root = await login(ctx, "root");
    const annaSession = await login(ctx, "anna");
    expect(await status(ctx, annaSession, "/test/vip")).toBe(200);

    // Other changes leave vip as it is.
    await putRoles(ctx, root, anna.id, ["vip", "staff"]);
    await login(ctx, "anna");
    expect(await status(ctx, annaSession, "/test/vip")).toBe(200);

    await putRoles(ctx, root, anna.id, ["staff"]);
    expect(await status(ctx, annaSession, "/test/vip")).toBe(403);
  });

  it("[ROLE-05][ROLE-08] staff does not imply vip, and admin implies neither vip nor staff", async () => {
    const ctx = await setup();
    await makeUser(ctx, "helper", ["staff"]);
    await makeUser(ctx, "tech", ["admin"]);
    const helper = await login(ctx, "helper");
    const tech = await login(ctx, "tech");

    expect(await status(ctx, helper, "/test/staff")).toBe(200);
    expect(await status(ctx, helper, "/test/vip")).toBe(403);
    expect(await status(ctx, tech, "/test/staff")).toBe(403);
    expect(await status(ctx, tech, "/test/vip")).toBe(403);
    expect(await status(ctx, tech, "/test/edit")).toBe(403);
  });

  it("[ROLE-09] revoking one role leaves the other roles unchanged", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const anna = await makeUser(ctx, "anna", ["vip", "staff", "admin"]);
    const root = await login(ctx, "root");

    for (const [after, expected] of [
      [
        ["staff", "admin"],
        ["admin", "staff"],
      ],
      [["admin"], ["admin"]],
    ] as const) {
      const response = await putRoles(ctx, root, anna.id, [...after]);
      expect(response.json()).toMatchObject({ roles: expected });
    }
    const audit = ctx.event.auditEntries().find((e) => e.action === "user.roles");
    expect(audit).toMatchObject({ actor: expect.stringMatching(/^user:/) as string });
  });

  it("[ROLE-09] the last admin keeps the admin role, with another admin it can be revoked", async () => {
    const ctx = await setup();
    const root = await makeUser(ctx, "root", ["admin", "vip"]);
    const session = await login(ctx, "root");
    const refused = await putRoles(ctx, session, root.id, ["vip"]);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: "last_admin" } });

    await makeUser(ctx, "second", ["admin"]);
    expect((await putRoles(ctx, session, root.id, ["vip"])).statusCode).toBe(200);
  });
});

describe("staff capabilities", () => {
  it("[ROLE-06] an admin switches the fixed capabilities on per staff member; only those can use them", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const writer = await makeUser(ctx, "writer", ["staff"]);
    await makeUser(ctx, "other", ["staff"]);
    const root = await login(ctx, "root");
    const writerSession = await login(ctx, "writer");
    const other = await login(ctx, "other");

    expect(await status(ctx, writerSession, "/test/edit")).toBe(403);
    const response = await putCapabilities(ctx, root, writer.id, ["editWebsiteContent"]);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ capabilities: ["editWebsiteContent"] });

    expect(await status(ctx, writerSession, "/test/edit")).toBe(200);
    expect(await status(ctx, writerSession, "/test/moderate")).toBe(403);
    expect(await status(ctx, other, "/test/edit")).toBe(403);

    await putCapabilities(ctx, root, writer.id, ["moderateContributions"]);
    expect(await status(ctx, writerSession, "/test/edit")).toBe(403);
    expect(await status(ctx, writerSession, "/test/moderate")).toBe(200);
  });

  it("[ROLE-06] there are no other capabilities, and only staff have them", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const writer = await makeUser(ctx, "writer", ["staff"]);
    const guest = await makeUser(ctx, "guest", ["vip"]);
    const root = await login(ctx, "root");

    const custom = await ctx.app.inject({
      method: "PUT",
      url: `/api/admin/users/${String(writer.id)}/capabilities`,
      headers: as(root),
      payload: { capabilities: ["deleteEverything"] },
    });
    expect(custom.statusCode).toBe(400);
    const notStaff = await putCapabilities(ctx, root, guest.id, ["editWebsiteContent"]);
    expect(notStaff.statusCode).toBe(409);
    expect(notStaff.json()).toMatchObject({ error: { code: "not_staff" } });
    const unknown = await putCapabilities(ctx, root, 9999, []);
    expect(unknown.statusCode).toBe(404);
  });

  it("[ROLE-06] revoking staff also switches the capabilities off", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const writer = await makeUser(ctx, "writer", ["staff"]);
    const root = await login(ctx, "root");
    await putCapabilities(ctx, root, writer.id, ["editWebsiteContent"]);

    await putRoles(ctx, root, writer.id, ["vip"]);
    expect(ctx.auth.accounts.getUser(writer.id)?.capabilities).toEqual([]);
    // Staff again: the capability does not come back by itself.
    await putRoles(ctx, root, writer.id, ["vip", "staff"]);
    expect(ctx.auth.accounts.getUser(writer.id)?.capabilities).toEqual([]);
  });

  it("[ROLE-06] the session shows the capabilities of the user", async () => {
    const ctx = await setup();
    const writer = await makeUser(ctx, "writer", ["staff"]);
    ctx.auth.accounts.setCapabilities(writer.id, ["editWebsiteContent"], "cli");
    const session = await login(ctx, "writer");
    const response = await ctx.app.inject({
      url: "/api/session",
      headers: { cookie: session.cookie },
    });
    expect(response.json()).toMatchObject({ user: { capabilities: ["editWebsiteContent"] } });
  });
});

describe("guest groups", () => {
  const request = (
    ctx: TestContext,
    admin: SignedIn,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: as(admin),
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });

  it("[GRP-01] an admin creates, renames and deletes groups; names are unique", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const root = await login(ctx, "root");

    const created = await request(ctx, root, "POST", "/api/admin/groups", { name: "Family" });
    expect(created.statusCode, created.body).toBe(201);
    const { id } = created.json<{ id: number }>();
    const twin = await request(ctx, root, "POST", "/api/admin/groups", { name: "family" });
    expect(twin.statusCode).toBe(409);
    await request(ctx, root, "POST", "/api/admin/groups", { name: "Friends" });

    expect(
      (await request(ctx, root, "PATCH", `/api/admin/groups/${String(id)}`, { name: "Friends" }))
        .statusCode,
    ).toBe(409);
    expect(
      (await request(ctx, root, "PATCH", `/api/admin/groups/${String(id)}`, { name: "Relatives" }))
        .statusCode,
    ).toBe(204);

    const list = await ctx.app.inject({
      url: "/api/admin/groups",
      headers: { cookie: root.cookie },
    });
    expect(list.json<{ groups: { name: string }[] }>().groups.map((g) => g.name)).toEqual([
      "Friends",
      "Relatives",
    ]);
    expect((await request(ctx, root, "DELETE", `/api/admin/groups/${String(id)}`)).statusCode).toBe(
      204,
    );
    expect((await request(ctx, root, "DELETE", `/api/admin/groups/${String(id)}`)).statusCode).toBe(
      404,
    );
    expect(ctx.event.auditEntries().map((e) => e.action)).toEqual(
      expect.arrayContaining(["group.create", "group.rename", "group.delete"]),
    );
  });

  it("[GRP-01] an admin manages the members; groups are independent of roles", async () => {
    const ctx = await setup();
    await makeUser(ctx, "root", ["admin"]);
    const anna = await makeUser(ctx, "anna", ["vip"]);
    const helper = await makeUser(ctx, "helper", ["staff"]); // no vip: can still be in a group
    const root = await login(ctx, "root");
    const group = (await request(ctx, root, "POST", "/api/admin/groups", { name: "Team" })).json<{
      id: number;
    }>();
    const base = `/api/admin/groups/${String(group.id)}/members`;

    for (const user of [anna, helper, anna]) {
      expect((await request(ctx, root, "PUT", `${base}/${String(user.id)}`)).statusCode).toBe(204);
    }
    expect((await request(ctx, root, "PUT", `${base}/9999`)).statusCode).toBe(404);
    expect(ctx.auth.groups.list()).toEqual([
      { id: group.id, name: "Team", memberIds: [anna.id, helper.id] },
    ]);
    const users = await ctx.app.inject({
      url: "/api/admin/users",
      headers: { cookie: root.cookie },
    });
    expect(
      users
        .json<{ users: { username: string; groups: { name: string }[] }[] }>()
        .users.find((u) => u.username === "anna")?.groups,
    ).toEqual([{ id: group.id, name: "Team" }]);

    expect((await request(ctx, root, "DELETE", `${base}/${String(anna.id)}`)).statusCode).toBe(204);
    expect(ctx.auth.groups.list()[0]?.memberIds).toEqual([helper.id]);
    // Changing roles does not touch the membership.
    ctx.auth.accounts.setRoles(helper.id, ["vip"], "cli");
    expect(ctx.auth.groups.list()[0]?.memberIds).toEqual([helper.id]);
  });

  it("[GRP-01] only an admin manages groups", async () => {
    const ctx = await setup();
    await makeUser(ctx, "anna", ["vip", "staff"]);
    const anna = await login(ctx, "anna");
    expect(
      (await request(ctx, anna, "POST", "/api/admin/groups", { name: "Mine" })).statusCode,
    ).toBe(403);
    expect(
      (await ctx.app.inject({ url: "/api/admin/groups", headers: { cookie: anna.cookie } }))
        .statusCode,
    ).toBe(403);
  });

  it("[GRP-02] membership can be asked for by group name, and goes with the group and the account", async () => {
    const ctx = await setup();
    // Not guests (no `vip`): their accounts go completely when they are deleted.
    const anna = await makeUser(ctx, "anna", ["staff"]);
    const ben = await makeUser(ctx, "ben", ["staff"]);
    await makeUser(ctx, "root", ["admin"]);
    const group = ctx.auth.groups.create("Best Men", "cli");
    ctx.auth.groups.addMember(group.id, anna.id, "cli");

    expect(ctx.auth.groups.isInGroup(anna.id, "best men")).toBe(true);
    expect(ctx.auth.groups.isInGroup(ben.id, "Best Men")).toBe(false);
    expect(ctx.auth.groups.isInGroup(anna.id, "Family")).toBe(false);

    await ctx.auth.accounts.deleteAccount(anna.id, PASSWORD);
    expect(ctx.auth.groups.list()[0]?.memberIds).toEqual([]);
    ctx.auth.groups.addMember(group.id, ben.id, "cli");
    ctx.auth.groups.delete(group.id, "cli");
    expect(ctx.auth.groups.isInGroup(ben.id, "Best Men")).toBe(false);
  });
});
