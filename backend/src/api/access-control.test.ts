import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { accessConditionSchema } from "@zappaloo/shared";
import type { AccessCondition, Role } from "@zappaloo/shared";
import { AccessService } from "../auth/access.ts";
import { createTestApp, signIn, tempDir } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { requireAccess } from "./access.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

async function setup(): Promise<TestContext> {
  context = await createTestApp();
  // The routes of these tests stand for features of the open platform (ACS-10 closes them for
  // guests while it is closed; see closed-platform.test.ts).
  context.event.setSetting("platformOpen", true, "cli");
  return context;
}

/** A route that only the users who meet `condition` can open. */
function protect(ctx: TestContext, path: string, condition: AccessCondition): void {
  ctx.app.get(
    path,
    {
      preHandler: requireAccess(ctx.auth.access, condition),
      schema: { querystring: z.strictObject({}) },
    },
    () => ({ ok: true }),
  );
}

describe("sign-in is required everywhere (ACS-09, ACS-07)", () => {
  // The routes anyone may call. Adding to this list is a deliberate decision (ACS-09): the
  // privacy notice (SEC-09) is on the list; upload links and screen links add their routes in their own steps.
  const PUBLIC_ROUTES = [
    "GET /api/events/ping",
    "GET /api/health",
    "GET /api/invitations/:code",
    "GET /api/privacy",
    "GET /api/session",
    "GET /api/version",
    "POST /api/email/verify",
    "POST /api/invitations/:code/register",
    "POST /api/password/forgot",
    "POST /api/password/set",
    "POST /api/session",
  ];

  it("[ACS-09] only login, password reset, invitation redemption and the system routes are public", async () => {
    const ctx = await setup();
    await ctx.app.ready();
    const publicRoutes = ctx.app.routeTable
      .filter((route) => route.public && route.method !== "HEAD")
      .map((route) => `${route.method} ${route.url}`)
      .sort();
    expect(publicRoutes).toEqual(PUBLIC_ROUTES);
  });

  it("[ACS-07][ACS-09] every other API route refuses a request without a session", async () => {
    const ctx = await setup();
    await ctx.app.ready();
    const protectedRoutes = ctx.app.routeTable.filter(
      (route) => !route.public && route.url.startsWith("/api/") && route.method !== "HEAD",
    );
    expect(protectedRoutes.length).toBeGreaterThan(20);
    for (const route of protectedRoutes) {
      const url = route.url.replace(/:\w+/g, "1");
      const response = await ctx.app.inject({ method: route.method as "GET", url });
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(401);
      expect(response.json(), `${route.method} ${route.url}`).toMatchObject({
        error: { code: "unauthorized" },
      });
    }
  });

  it("[ACS-07][ACS-09][SEC-01] percent-encoded paths reach the same checks as the plain ones", async () => {
    const ctx = await setup();
    await ctx.app.ready();
    const protectedRoutes = ctx.app.routeTable.filter(
      (route) => !route.public && route.url.startsWith("/api/") && route.method !== "HEAD",
    );
    for (const route of protectedRoutes) {
      const plain = route.url.replace(/:\w+/g, "1");
      // The router decodes the path: "/%61pi/..." is "/api/...".
      for (const url of [
        plain.replace(/^\/api\//, "/%61pi/"),
        plain.replace(/^\/api\//, "/ap%69/"),
      ]) {
        const response = await ctx.app.inject({ method: route.method as "GET", url });
        expect(response.statusCode, `${route.method} ${url}`).toBe(401);
      }
    }

    // CSRF: a signed-in admin's request without the token is refused under any spelling.
    const admin = await signIn(ctx, "boss", ["admin"]);
    for (const url of ["/api/admin/groups", "/%61pi/admin/groups", "/api/%61dmin/groups"]) {
      const response = await ctx.app.inject({
        method: "POST",
        url,
        headers: { cookie: admin.cookie, origin: "https://evil.example" },
        payload: { name: "Forged" },
      });
      expect(response.statusCode, url).toBe(403);
      expect(response.json(), url).toMatchObject({ error: { code: "csrf_failed" } });
    }
    expect(ctx.auth.groups.list()).toEqual([]);
  });

  it("[ACS-09] unknown API paths are refused also while the built frontend is served", async () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir.path, "index.html"), "<!doctype html><title>app</title>");
      context = await createTestApp({ frontendDir: dir.path });
      for (const url of ["/api/does-not-exist", "/%61pi/does-not-exist"]) {
        const response = await context.app.inject({ url, headers: { accept: "text/html" } });
        expect(response.statusCode, url).toBe(401);
      }
      // A path that cannot be decoded is refused before any route runs.
      expect((await context.app.inject("/api/%zz")).statusCode).toBe(400);
      // Pages are served to everyone: they hold no event data.
      expect(
        (await context.app.inject({ url: "/login", headers: { accept: "text/html" } })).statusCode,
      ).toBe(200);
    } finally {
      dir.remove();
    }
  });

  it("[ACS-09] unknown API paths and a bad cookie are refused as well", async () => {
    const ctx = await setup();
    expect((await ctx.app.inject("/api/does-not-exist")).statusCode).toBe(401);
    const forged = await ctx.app.inject({
      url: "/api/event",
      headers: { cookie: "zappaloo_session=forged.value" },
    });
    expect(forged.statusCode).toBe(401);
  });

  it("[ACS-09] the public routes work without a session", async () => {
    const ctx = await setup();
    for (const url of ["/api/health", "/api/version", "/api/session"]) {
      expect((await ctx.app.inject(url)).statusCode, url).toBe(200);
    }
    const forgot = await ctx.app.inject({
      method: "POST",
      url: "/api/password/forgot",
      payload: { identifier: "nobody" },
    });
    expect(forgot.statusCode).toBe(204);
    expect((await ctx.app.inject("/api/invitations/AAAAAA")).statusCode).toBe(404); // not 401
  });

  it("[ACS-09] a signed-in user reaches the event, an ended session does not", async () => {
    const ctx = await setup();
    const who = await signIn(ctx);
    expect((await ctx.app.inject({ url: "/api/event", headers: who })).statusCode).toBe(200);
    await ctx.app.inject({ method: "DELETE", url: "/api/session", headers: who });
    expect((await ctx.app.inject({ url: "/api/event", headers: who })).statusCode).toBe(401);
  });
});

describe("access conditions", () => {
  function user(ctx: TestContext, name: string, roles: Role[]) {
    return ctx.auth.accounts.createUser({ username: name, roles }, "cli");
  }

  it("[ACS-05] a role condition needs exactly that role", async () => {
    const ctx = await setup();
    const vip = user(ctx, "vip1", ["vip"]);
    const admin = user(ctx, "adm", ["admin"]);
    const { access } = ctx.auth;
    expect(access.check(vip, { type: "role", role: "vip" })).toBe(true);
    expect(access.check(vip, { type: "role", role: "staff" })).toBe(false);
    // No role implies another (ROLE-08).
    expect(access.check(admin, { type: "role", role: "vip" })).toBe(false);
    expect(access.check(admin, { type: "role", role: "admin" })).toBe(true);
  });

  it("[ACS-05][GRP-02] a group condition follows the membership, by group name", async () => {
    const ctx = await setup();
    const anna = user(ctx, "anna", ["vip"]);
    const group = ctx.auth.groups.create("Best Men", "cli");
    const condition: AccessCondition = { type: "group", group: "best men" };
    expect(ctx.auth.access.check(anna, condition)).toBe(false);
    ctx.auth.groups.addMember(group.id, anna.id, "cli");
    expect(ctx.auth.access.check(anna, condition)).toBe(true);
    ctx.auth.groups.removeMember(group.id, anna.id, "cli");
    expect(ctx.auth.access.check(anna, condition)).toBe(false);
  });

  it("[ACS-05] a time condition opens at the start and closes at the end", async () => {
    const ctx = await setup();
    const anna = user(ctx, "anna", ["vip"]);
    const at = (iso: string) =>
      new AccessService(ctx.database, ctx.event, ctx.auth.groups, () => new Date(iso));
    const window: AccessCondition = {
      type: "time",
      from: "2027-06-12T10:00:00.000Z",
      until: "2027-06-12T22:00:00.000Z",
    };
    expect(at("2027-06-12T09:59:59.000Z").check(anna, window)).toBe(false);
    expect(at("2027-06-12T10:00:00.000Z").check(anna, window)).toBe(true);
    expect(at("2027-06-12T21:59:59.000Z").check(anna, window)).toBe(true);
    expect(at("2027-06-12T22:00:00.000Z").check(anna, window)).toBe(false);
    const open: AccessCondition = { type: "time", from: "2027-01-01T00:00:00.000Z" };
    expect(at("2030-01-01T00:00:00.000Z").check(anna, open)).toBe(true);
  });

  it("[ACS-05] a release condition is true while an admin has the key released", async () => {
    const ctx = await setup();
    const anna = user(ctx, "anna", ["vip"]);
    const condition: AccessCondition = { type: "release", key: "cellar" };
    expect(ctx.auth.access.check(anna, condition)).toBe(false);
    ctx.auth.access.release("cellar", "cli");
    ctx.auth.access.release("cellar", "cli"); // twice changes nothing
    expect(ctx.auth.access.check(anna, condition)).toBe(true);
    ctx.auth.access.withdraw("cellar", "cli");
    expect(ctx.auth.access.check(anna, condition)).toBe(false);
  });

  it("[ACS-05] a feature condition follows the feature toggle", async () => {
    const ctx = await setup();
    const anna = user(ctx, "anna", ["vip"]);
    const condition: AccessCondition = { type: "feature", feature: "minigames" };
    expect(ctx.auth.access.check(anna, condition)).toBe(true);
    ctx.event.setFeature("minigames", false, "cli");
    expect(ctx.auth.access.check(anna, condition)).toBe(false);
  });

  it("[ACS-06] conditions in a list are combined with AND, explicit alternatives with OR", async () => {
    const ctx = await setup();
    const anna = user(ctx, "anna", ["vip"]);
    const helper = user(ctx, "helper", ["staff"]);
    const vipRole: AccessCondition = { type: "role", role: "vip" };
    const staffRole: AccessCondition = { type: "role", role: "staff" };
    const released: AccessCondition = { type: "release", key: "area" };
    const { access } = ctx.auth;

    const both: AccessCondition = { all: [vipRole, released] };
    expect(access.check(anna, both)).toBe(false); // vip, but not released
    ctx.auth.access.release("area", "cli");
    expect(access.check(anna, both)).toBe(true);
    expect(access.check(helper, both)).toBe(false); // released, but not vip

    const either: AccessCondition = { any: [vipRole, staffRole] };
    expect(access.check(anna, either)).toBe(true);
    expect(access.check(helper, either)).toBe(true);
    expect(access.check(user(ctx, "adm", ["admin"]), either)).toBe(false);

    // Nested: (vip OR staff) AND released AND a time window that has begun.
    const nested: AccessCondition = {
      all: [either, released, { type: "time", from: "2020-01-01T00:00:00.000Z" }],
    };
    expect(access.check(helper, nested)).toBe(true);
    ctx.auth.access.withdraw("area", "cli");
    expect(access.check(helper, nested)).toBe(false);
  });

  it("[ACS-06] an empty AND means signed in is enough, an empty OR lets nobody in", async () => {
    const ctx = await setup();
    const anna = user(ctx, "anna", []);
    expect(ctx.auth.access.check(anna, { all: [] })).toBe(true);
    expect(ctx.auth.access.check(anna, { any: [] })).toBe(false);
  });

  it("[ACS-05][ACS-06] conditions are validated as data: known leaves, a time needs a bound, limited nesting", () => {
    const valid: unknown[] = [
      { type: "role", role: "vip" },
      { all: [{ type: "group", group: "Family" }, { any: [{ type: "release", key: "a-b_1" }] }] },
      { type: "time", until: "2027-01-01T00:00:00.000Z" },
      { type: "feature", feature: "gallery" },
    ];
    for (const condition of valid)
      expect(accessConditionSchema.safeParse(condition).success).toBe(true);

    const invalid: unknown[] = [
      { type: "role", role: "visitor" },
      { type: "magic" },
      { type: "time" },
      { type: "time", from: "tomorrow" },
      { type: "release", key: "Has Space" },
      { type: "feature", feature: "nope" },
      { all: [{ type: "role", role: "vip" }], any: [] },
      { type: "role", role: "vip", extra: 1 },
    ];
    for (const condition of invalid)
      expect(accessConditionSchema.safeParse(condition).success).toBe(false);

    let deep: AccessCondition = { type: "role", role: "vip" };
    for (let i = 0; i < 4; i++) deep = { all: [deep] };
    expect(accessConditionSchema.safeParse(deep).success).toBe(true);
    expect(accessConditionSchema.safeParse({ all: [deep] }).success).toBe(false);
  });
});

describe("enforcement on the server", () => {
  it("[ACS-07] a protected route is closed to others and opens and closes with the state, at once", async () => {
    const ctx = await setup();
    const condition: AccessCondition = {
      all: [
        { type: "role", role: "vip" },
        { type: "release", key: "garden" },
      ],
    };
    protect(ctx, "/api/garden", condition);
    const anna = await signIn(ctx, "anna", ["vip"]);
    const helper = await signIn(ctx, "helper", ["staff"]);
    const get = (who: { cookie: string }) =>
      ctx.app.inject({ url: "/api/garden", headers: { cookie: who.cookie } });

    expect((await ctx.app.inject("/api/garden")).statusCode).toBe(401);
    expect((await get(anna)).statusCode).toBe(403); // not released yet
    ctx.auth.access.release("garden", "cli");
    expect((await get(anna)).statusCode).toBe(200);
    expect((await get(helper)).statusCode).toBe(403);

    // Revoking the role takes effect on the very next request of the same session.
    const annaId = ctx.auth.accounts.findUser("anna")?.id ?? 0;
    ctx.auth.accounts.setRoles(annaId, [], "cli");
    expect((await get(anna)).statusCode).toBe(403);
    ctx.auth.accounts.setRoles(annaId, ["vip"], "cli");
    expect((await get(anna)).statusCode).toBe(200);
    ctx.auth.access.withdraw("garden", "cli");
    expect((await get(anna)).statusCode).toBe(403);
  });

  it("[ACS-05] an admin releases and withdraws a key through the API, audit-logged; others cannot", async () => {
    const ctx = await setup();
    const admin = await signIn(ctx, "root", ["admin"]);
    const vip = await signIn(ctx, "anna", ["vip"]);

    expect(
      (await ctx.app.inject({ method: "PUT", url: "/api/admin/releases/cellar", headers: vip }))
        .statusCode,
    ).toBe(403);
    expect((await ctx.app.inject({ url: "/api/admin/releases", headers: vip })).statusCode).toBe(
      403,
    );

    const put = await ctx.app.inject({
      method: "PUT",
      url: "/api/admin/releases/cellar",
      headers: admin,
    });
    expect(put.statusCode).toBe(204);
    expect(ctx.auth.access.isReleased("cellar")).toBe(true);
    const list = await ctx.app.inject({ url: "/api/admin/releases", headers: admin });
    expect(list.json<{ releases: { key: string }[] }>().releases.map((r) => r.key)).toEqual([
      "cellar",
    ]);

    const bad = await ctx.app.inject({
      method: "PUT",
      url: "/api/admin/releases/Not%20Valid",
      headers: admin,
    });
    expect(bad.statusCode).toBe(400);

    const del = await ctx.app.inject({
      method: "DELETE",
      url: "/api/admin/releases/cellar",
      headers: admin,
    });
    expect(del.statusCode).toBe(204);
    expect(ctx.auth.access.isReleased("cellar")).toBe(false);
    const actions = ctx.event.auditEntries().filter((e) => e.action.startsWith("release."));
    expect(actions.map((e) => e.action).sort()).toEqual(["release.set", "release.withdraw"]);
    expect(actions[0]?.actor).toMatch(/^user:/);
  });
});
